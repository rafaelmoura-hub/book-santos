-- Suporte, lembretes privados, feedbacks e conversa da equipe.
begin;
alter table public.book_profiles alter column tabs set default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes'];
-- Só contas que já tinham todas as abas recebem as novas automaticamente.
update public.book_profiles set tabs=tabs||array['feedbacks','avaliacoes'],version=version+1
 where funcao='adm' and tabs @> array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard'] and not tabs && array['feedbacks','avaliacoes'];
create or replace function public.book_manage_user(target_id uuid,display_name text,role_name text,hotels text[],expected_version bigint,selected_tabs text[] default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes'])
returns void language plpgsql security definer set search_path='' as $$
declare previous_tabs text[];
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre gerencia usuários.'; end if;
 if selected_tabs is null or cardinality(selected_tabs)>10 or exists(select 1 from unnest(selected_tabs) t where t is null or t not in ('chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes')) then raise sqlstate '22023' using message='Abas inválidas.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-user:'||target_id::text,0));
 select tabs into previous_tabs from public.book_profiles where id=target_id;
 perform public.book_manage_user_v9(target_id,display_name,role_name,hotels,expected_version);
 update public.book_profiles set tabs=case when role_name='adm' then selected_tabs else '{}'::text[] end where id=target_id;
 insert into public.book_user_audit(actor_id,user_id,old_data,new_data) values(auth.uid(),target_id,jsonb_build_object('tabs',previous_tabs),jsonb_build_object('tabs',case when role_name='adm' then selected_tabs else '{}'::text[] end));
end $$;

create table if not exists public.book_support_reads(
 user_id uuid not null references public.book_profiles(id) on delete cascade,
 ticket_id uuid not null references public.book_support_tickets(id) on delete cascade,
 seen_at timestamptz not null,primary key(user_id,ticket_id)
);
alter table public.book_support_reads enable row level security;
revoke all on public.book_support_reads from anon,authenticated;
grant select on public.book_support_reads to authenticated;
drop policy if exists book_own_support_reads on public.book_support_reads;
create policy book_own_support_reads on public.book_support_reads for select to authenticated using(user_id=auth.uid() and public.book_is_admin());
create or replace function public.book_support_read(target_ticket uuid,seen_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare maximum timestamptz;
begin
 if not public.book_can_support(target_ticket) then raise sqlstate '42501' using message='Conversa privada.'; end if;
 select max(created_at) into maximum from public.book_support_messages where ticket_id=target_ticket and created_at<=book_support_read.seen_at;
 if maximum is not null then
 insert into public.book_support_reads(user_id,ticket_id,seen_at) values(auth.uid(),target_ticket,maximum)
 on conflict(user_id,ticket_id) do update set seen_at=greatest(book_support_reads.seen_at,excluded.seen_at);
 end if;
end $$;
create or replace function public.book_support_summary()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre.'; end if;
 return (select jsonb_build_object('total',count(*),'open',count(*) filter(where status='Aberto'),'closed',count(*) filter(where status='Fechado')) from public.book_support_tickets);
end $$;
create or replace function public.book_notifications()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.book_profiles where id=auth.uid()) then raise sqlstate '42501' using message='Perfil não autorizado.'; end if;
 with chat as (
 select m,r.id ticket from public.book_records r cross join lateral jsonb_array_elements(coalesce(r.data->'mensagens','[]')) m
 where r.collection='conversasSuporte' and
 ((public.book_is_admin() and m->>'autorTipo'='cliente' and coalesce((m->>'lidoAdmin')::boolean,false)=false)
 or (not public.book_is_admin() and m->>'autorTipo'='admin' and coalesce((m->>'lidoCliente')::boolean,false)=false))
 ), support as (
 select m.id,m.body,m.created_at,t.subject,t.id ticket from public.book_support_messages m join public.book_support_tickets t on t.id=m.ticket_id
 left join public.book_support_reads seen on seen.ticket_id=t.id and seen.user_id=auth.uid()
 where m.author_id<>auth.uid() and m.created_at>coalesce(seen.seen_at,'-infinity'::timestamptz)
 ) select jsonb_build_object(
 'chat',jsonb_build_object('count',(select count(*) from chat),'latest',(select jsonb_build_object('id',ticket||':'||(m->>'id'),'body',m->>'texto','ticket',ticket) from chat order by m->>'criadaEm' desc limit 1)),
 'support',jsonb_build_object('count',(select count(*) from support),'latest',(select jsonb_build_object('id',id,'body',subject||': '||body,'ticket',ticket) from support order by created_at desc,id desc limit 1))
 ) into result;
 return result;
end $$;

create table if not exists public.book_reminders(
 note_id uuid primary key references public.book_notes(id) on delete cascade,
 owner_id uuid not null references public.book_profiles(id) on delete cascade,
 due_at timestamptz not null,repeat text not null check(repeat in ('once','daily')),
 enabled boolean not null default true,version bigint not null default 1,last_delivered_at timestamptz
);
create index if not exists book_reminders_due on public.book_reminders(owner_id,due_at) where enabled;
alter table public.book_reminders enable row level security;
revoke all on public.book_reminders from anon,authenticated;
grant select on public.book_reminders to authenticated;
drop policy if exists book_private_reminders on public.book_reminders;
create policy book_private_reminders on public.book_reminders for select to authenticated using(owner_id=auth.uid() and public.book_is_admin());
create or replace function public.book_save_reminder(target_note uuid,expected_version bigint,next_due timestamptz,repeat_mode text,is_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_reminders;
begin
 if not public.book_is_admin() or not exists(select 1 from public.book_notes where id=target_note and owner_id=auth.uid()) then raise sqlstate '42501' using message='Nota privada.'; end if;
 if expected_version is null or expected_version<0 or next_due is null or not isfinite(next_due) or next_due>now()+interval '10 years' or repeat_mode is null or repeat_mode not in ('once','daily') or is_enabled is null then raise sqlstate '22023' using message='Lembrete inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-reminder:'||target_note::text,0));
 select * into previous from public.book_reminders where note_id=target_note for update;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='O lembrete mudou. Atualize a nota.'; end if;
 insert into public.book_reminders(note_id,owner_id,due_at,repeat,enabled) values(target_note,auth.uid(),next_due,repeat_mode,is_enabled)
 on conflict(note_id) do update set due_at=excluded.due_at,repeat=excluded.repeat,enabled=excluded.enabled,version=book_reminders.version+1;
end $$;
create or replace function public.book_due_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.book_reminders; result jsonb:='[]';
begin
 if not public.book_is_admin() then raise sqlstate '42501' using message='Acesso negado.'; end if;
 for r in select * from public.book_reminders where owner_id=auth.uid() and enabled and due_at<=now() order by due_at limit 20 loop
  result:=result||jsonb_build_array(jsonb_build_object('id',r.note_id,'due',r.due_at,'title',(select title from public.book_notes where id=r.note_id and owner_id=auth.uid())));
 end loop;
 return result;
end $$;
create or replace function public.book_ack_reminder(target_note uuid,delivered_due timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare r public.book_reminders; next_time timestamptz;
begin
 if not public.book_is_admin() then raise sqlstate '42501' using message='Acesso negado.'; end if;
 select * into r from public.book_reminders where note_id=target_note and owner_id=auth.uid() for update;
 if r.note_id is null or not r.enabled or r.due_at>now() or delivered_due is null or r.due_at<>delivered_due then return; end if;
 next_time:=(date_trunc('day',now() at time zone 'America/Sao_Paulo')+(r.due_at at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo';
 if next_time<=now() then next_time:=((next_time at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo'; end if;
 update public.book_reminders set enabled=(r.repeat='daily'),due_at=case when r.repeat='daily' then next_time else due_at end,last_delivered_at=now(),version=version+1 where note_id=r.note_id;
end $$;
revoke all on function public.book_ack_reminder(uuid,timestamptz) from public,anon;
grant execute on function public.book_ack_reminder(uuid,timestamptz) to authenticated;

create table if not exists public.book_feedbacks(
 id uuid primary key,owner_id uuid not null references public.book_profiles(id),hotel text not null,
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=131072),
 service_id text,version bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists book_feedbacks_hotel on public.book_feedbacks(hotel,created_at desc);
alter table public.book_feedbacks enable row level security;
revoke all on public.book_feedbacks from anon,authenticated;
grant select on public.book_feedbacks to authenticated;
drop policy if exists book_feedback_access on public.book_feedbacks;
create policy book_feedback_access on public.book_feedbacks for select to authenticated using(public.book_can_tab('feedbacks') and public.book_can_hotel(hotel));
do $$ begin
 if to_regprocedure('public.book_can_read_file_v12(text)') is null then alter function public.book_can_read_file(text) rename to book_can_read_file_v12; end if;
 if to_regprocedure('public.book_file_in_use_v12(text)') is null then alter function public.book_file_in_use(text) rename to book_file_in_use_v12; end if;
end $$;
revoke all on function public.book_can_read_file_v12(text),public.book_file_in_use_v12(text) from public,anon,authenticated;
create or replace function public.book_can_read_file(filename text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.book_can_read_file_v12(filename) or (public.book_can_tab('feedbacks') and exists(select 1 from public.book_feedbacks f where public.book_can_hotel(f.hotel) and exists(select 1 from jsonb_array_elements(f.data->'anexos') a where a->>'dados'='/api/files/'||filename)));
$$;
-- Rebind the policy: a function rename preserves its OID.
drop policy if exists book_scoped_files on storage.objects;
create policy book_scoped_files on storage.objects as restrictive for select to authenticated using(bucket_id<>'book-attachments' or public.book_can_read_file(name));
create or replace function public.book_file_in_use(filename text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.book_file_in_use_v12(filename) or exists(select 1 from public.book_feedbacks f,jsonb_array_elements(f.data->'anexos') a where a->>'dados'='/api/files/'||filename);
$$;
drop policy if exists book_cleanup_files on storage.objects;
create policy book_cleanup_files on storage.objects for delete to authenticated using(bucket_id='book-attachments' and (storage.foldername(name))[1]=auth.uid()::text and not public.book_file_in_use(name));
drop policy if exists book_scoped_uploads on storage.objects;
create policy book_scoped_uploads on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'book-attachments' or exists(select 1 from public.book_profiles p where p.id=auth.uid() and (p.funcao='cliente' or public.book_can_tab('feedbacks') or public.book_can_collection('chamados',true) or public.book_can_collection('ordensServico',true) or public.book_can_collection('vistorias',true) or public.book_can_collection('conversasSuporte',true))));
create or replace function public.book_save_feedback(feedback_id uuid,expected_version bigint,document jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_feedbacks; a jsonb; filename text;
begin
 if not public.book_can_tab('feedbacks') or not public.book_can_hotel(document->>'hotel') then raise sqlstate '42501' using message='Sem acesso ao feedback.'; end if;
 if feedback_id is null or expected_version is null or expected_version<0 or jsonb_typeof(document) is distinct from 'object' or coalesce(length(trim(document->>'assunto')),0) not between 1 and 120 or document->>'grau' is null or document->>'grau' not in ('Crítico','Razoável','Irrelevante') or document->>'observacoes' is null or length(document->>'observacoes')>8000 or jsonb_typeof(document->'anexos') is distinct from 'array' or jsonb_array_length(document->'anexos')>20 or not exists(select 1 from public.book_apartments where hotel=document->>'hotel' and apartment=document->>'apartamento') then raise sqlstate '22023' using message='Feedback incompleto ou apartamento inválido.'; end if;
 for a in select value from jsonb_array_elements(document->'anexos') loop
  filename:=substr(a->>'dados',12);
  if a->>'nome' is null or length(a->>'nome')>200 or a->>'dados' is null or left(a->>'dados',11)<>'/api/files/' or split_part(filename,'/',2)<>document->>'hotel' or not public.book_can_read_file(filename) or not exists(select 1 from storage.objects where bucket_id='book-attachments' and name=filename) then raise sqlstate '42501' using message='Anexo indisponível.'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('book-feedback:'||feedback_id::text,0));
 select * into previous from public.book_feedbacks where id=feedback_id for update;
 if previous.id is not null and previous.hotel<>document->>'hotel' then raise sqlstate '22023' using message='O condomínio do feedback não pode ser alterado.'; end if;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='Feedback alterado. Atualize a lista.'; end if;
 insert into public.book_feedbacks(id,owner_id,hotel,data) values(feedback_id,auth.uid(),document->>'hotel',document)
 on conflict(id) do update set data=excluded.data,version=book_feedbacks.version+1,updated_at=now();
 insert into public.book_audit(actor_id,collection,record_id,old_data,new_data) values(auth.uid(),'feedbacks',feedback_id::text,previous.data,document);
end $$;
create or replace function public.book_feedback_service(feedback_id uuid,expected_version bigint,record_id text)
returns text language plpgsql security definer set search_path='' as $$
declare previous public.book_feedbacks; document jsonb;
begin
 if not public.book_can_tab('feedbacks') or not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem permissão para criar card.'; end if;
 perform pg_advisory_xact_lock(72491001);
 perform pg_advisory_xact_lock(hashtextextended('book-feedback:'||feedback_id::text,0));
 select * into previous from public.book_feedbacks where id=feedback_id for update;
 if previous.id is null or not public.book_can_hotel(previous.hotel) then raise sqlstate '42501' using message='Feedback indisponível.'; end if;
 if previous.service_id is not null then return previous.service_id; end if;
 if expected_version is null or previous.version<>expected_version then raise sqlstate 'PT409' using message='Feedback alterado. Atualize a lista.'; end if;
 if record_id is null or record_id!~'^[0-9]{1,16}$' then raise sqlstate '22023' using message='Identificador inválido.'; end if;
 document:=jsonb_build_object('id',record_id,'hotel',previous.hotel,'apartamento',previous.data->>'apartamento','titulo',previous.data->>'assunto','descricao',previous.data->>'observacoes','status','Aberta','prioridade',case when previous.data->>'grau'='Crítico' then 'Urgente' else 'Normal' end,'data',to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'anexos',previous.data->'anexos','feedbackId',previous.id);
 perform public.book_commit(jsonb_build_array(jsonb_build_object('collection','ordensServico','id',record_id,'version',0,'data',document)));
 update public.book_feedbacks set service_id=record_id,version=version+1,updated_at=now() where id=feedback_id;
 insert into public.book_audit(actor_id,collection,record_id,old_data,new_data) values(auth.uid(),'feedbacks',feedback_id::text,jsonb_build_object('service_id',null),jsonb_build_object('service_id',record_id));
 return record_id;
end $$;

create table if not exists public.book_team_messages(
 id uuid primary key,author_id uuid not null references public.book_profiles(id),author_name text not null,
 target_id uuid references public.book_profiles(id),target_name text,
 body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now()
);
create index if not exists book_team_time on public.book_team_messages(created_at desc,id desc);
alter table public.book_team_messages enable row level security;
revoke all on public.book_team_messages from anon,authenticated;
grant select on public.book_team_messages to authenticated;
drop policy if exists book_team_access on public.book_team_messages;
create policy book_team_access on public.book_team_messages for select to authenticated using(public.book_can_tab('avaliacoes'));
create or replace function public.book_team_send(message_id uuid,message_body text,target_user uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.book_profiles; target public.book_profiles;
begin
 if not public.book_can_tab('avaliacoes') then raise sqlstate '42501' using message='Sem acesso às avaliações.'; end if;
 if message_id is null or coalesce(length(trim(message_body)),0) not between 1 and 2000 then raise sqlstate '22023' using message='Comentário inválido.'; end if;
 select * into actor from public.book_profiles where id=auth.uid();
 select * into target from public.book_profiles where id=target_user and funcao='adm';
 if target_user is not null and target.id is null then raise sqlstate '22023' using message='Funcionário inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-team:'||actor.id::text,0));
 if exists(select 1 from public.book_team_messages where id=message_id and author_id=actor.id and body=trim(message_body) and target_id is not distinct from target_user) then return; end if;
 if (select count(*) from public.book_team_messages where author_id=actor.id and created_at>now()-interval '1 minute')>=20 then raise sqlstate '22023' using message='Aguarde antes de comentar novamente.'; end if;
 insert into public.book_team_messages(id,author_id,author_name,target_id,target_name,body) values(message_id,actor.id,actor.nome,target.id,target.nome,trim(message_body));
end $$;
create or replace function public.book_can_read_profile(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_profiles actor where actor.id=auth.uid() and
 (actor.id=target or actor.mestre or (actor.funcao='adm' and
 (exists(select 1 from public.book_profiles p where p.id=target and p.funcao='adm' and
   (public.book_can_tab('os') or public.book_can_tab('vistorias') or public.book_can_tab('dashboard') or public.book_can_tab('chamados') or public.book_can_tab('chat') or public.book_can_tab('avaliacoes')))
 or exists(select 1 from public.book_records r where r.owner_id=target and r.collection<>'estoqueBookSantos' and public.book_can_hotel(r.hotel) and public.book_can_collection(r.collection))))));
$$;
do $$ begin
 if to_regprocedure('public.book_backup_v12(text[])') is null then alter function public.book_backup(text[]) rename to book_backup_v12; end if;
end $$;
revoke all on function public.book_backup_v12(text[]) from public,anon,authenticated;
create or replace function public.book_backup(selected text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; legacy text[];
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre faz backup.'; end if;
 if selected is null or cardinality(selected) not between 1 and 9 or exists(select 1 from unnest(selected) s where s is null or s not in ('chamados','ordensServico','vistorias','estoqueBookSantos','conversasSuporte','cadastros','auditoria','anexos','colaboracao')) then raise sqlstate '22023' using message='Opções de backup inválidas.'; end if;
 legacy:=array(select s from unnest(selected) s where s<>'colaboracao');
 if cardinality(legacy)=0 then legacy:=array['anexos']; end if;
 result:=public.book_backup_v12(legacy);
 if 'colaboracao'=any(selected) then
  result:=result||jsonb_build_object(
   'feedbacks',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.book_feedbacks f),'[]'),
   'evaluations',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.book_team_messages m),'[]'),
   'support',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.book_support_tickets t),'[]'),
   'support_messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.book_support_messages m),'[]'),
   'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.book_notes n where n.owner_id=auth.uid()),'[]'),
   'reminders',coalesce((select jsonb_agg(to_jsonb(r) order by r.note_id) from public.book_reminders r where r.owner_id=auth.uid()),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.book_backup(text[]) from public,anon;
grant execute on function public.book_backup(text[]) to authenticated;
revoke all on function public.book_support_read(uuid,timestamptz),public.book_support_summary(),public.book_notifications(),public.book_save_reminder(uuid,bigint,timestamptz,text,boolean),public.book_due_reminders(),public.book_can_read_file(text),public.book_file_in_use(text),public.book_save_feedback(uuid,bigint,jsonb),public.book_feedback_service(uuid,bigint,text),public.book_team_send(uuid,text,uuid) from public,anon;
grant execute on function public.book_support_read(uuid,timestamptz),public.book_support_summary(),public.book_notifications(),public.book_save_reminder(uuid,bigint,timestamptz,text,boolean),public.book_due_reminders(),public.book_can_read_file(text),public.book_file_in_use(text),public.book_save_feedback(uuid,bigint,jsonb),public.book_feedback_service(uuid,bigint,text),public.book_team_send(uuid,text,uuid) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 13; $$;
commit;
