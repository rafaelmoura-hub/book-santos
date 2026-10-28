-- Notas: somente o proprietário. Suporte: somente solicitante e mestre.
begin;
create table if not exists public.book_notes(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.book_profiles(id) on delete cascade,
 title text not null check(length(title) between 1 and 120),body text not null default '' check(length(body)<=20000),
 version bigint not null default 1,updated_at timestamptz not null default now()
);
create index if not exists book_notes_owner on public.book_notes(owner_id,updated_at desc);
alter table public.book_notes enable row level security;
revoke all on public.book_notes from anon,authenticated;
grant select on public.book_notes to authenticated;
drop policy if exists book_notes_private on public.book_notes;
create policy book_notes_private on public.book_notes for select to authenticated using(owner_id=auth.uid() and public.book_is_admin());
create or replace function public.book_save_note(note_id uuid,note_title text,note_body text,expected_version bigint,remove_note boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_notes;
begin
 if not public.book_is_admin() then raise sqlstate '42501' using message='Acesso negado.'; end if;
 if note_id is null or expected_version is null or expected_version<0 or coalesce(length(trim(note_title)),0) not between 1 and 120 or note_body is null or length(note_body)>20000 then raise sqlstate '22023' using message='Nota inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-notes:'||auth.uid()::text,0));
 select * into previous from public.book_notes where id=note_id for update;
 if previous.id is not null and previous.owner_id<>auth.uid() then raise sqlstate '42501' using message='Nota privada.'; end if;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='A nota foi alterada. Atualize antes de salvar.'; end if;
 if remove_note then delete from public.book_notes where id=note_id and owner_id=auth.uid();
 else
 if previous.id is null and (select count(*) from public.book_notes where owner_id=auth.uid())>=200 then raise sqlstate '22023' using message='Limite de 200 notas atingido.'; end if;
 insert into public.book_notes(id,owner_id,title,body) values(note_id,auth.uid(),trim(note_title),note_body)
 on conflict(id) do update set title=excluded.title,body=excluded.body,version=book_notes.version+1,updated_at=now();
 end if;
end $$;
create table if not exists public.book_support_tickets(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.book_profiles(id),
 owner_name text not null,subject text not null check(length(subject) between 1 and 120),status text not null default 'Aberto' check(status in ('Aberto','Fechado')),
 version bigint not null default 1,updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create table if not exists public.book_support_messages(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.book_support_tickets(id) on delete cascade,
 author_id uuid not null references public.book_profiles(id),author_name text not null,master boolean not null,
 body text not null check(length(body) between 1 and 4000),created_at timestamptz not null default now()
);
create index if not exists book_support_owner on public.book_support_tickets(owner_id,updated_at desc);
create index if not exists book_support_thread on public.book_support_messages(ticket_id,created_at);
alter table public.book_support_tickets enable row level security;
alter table public.book_support_messages enable row level security;
revoke all on public.book_support_tickets,public.book_support_messages from anon,authenticated;
grant select on public.book_support_tickets,public.book_support_messages to authenticated;
drop policy if exists book_support_ticket_access on public.book_support_tickets;
create policy book_support_ticket_access on public.book_support_tickets for select to authenticated using(public.book_is_admin() and (owner_id=auth.uid() or public.book_is_master()));
-- Check the requesting identity explicitly; never authorize messages by existence alone.
create or replace function public.book_can_support(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_profiles p join public.book_support_tickets t on t.id=target
 where p.id=auth.uid() and p.funcao='adm' and (t.owner_id=p.id or p.mestre));
$$;
revoke all on function public.book_can_support(uuid) from public,anon;
grant execute on function public.book_can_support(uuid) to authenticated;
drop policy if exists book_support_message_access on public.book_support_messages;
create policy book_support_message_access on public.book_support_messages for select to authenticated using(public.book_can_support(ticket_id));
create or replace function public.book_support_send(ticket_id uuid,subject text,body text,expected_version bigint,new_status text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.book_profiles; previous public.book_support_tickets;
begin
 select * into actor from public.book_profiles where id=auth.uid();
 if actor.funcao is distinct from 'adm' then raise sqlstate '42501' using message='Acesso negado.'; end if;
 if ticket_id is null or expected_version is null or expected_version<0 or body is null or length(body)>4000 or (new_status is not null and (not actor.mestre or new_status not in ('Aberto','Fechado'))) then raise sqlstate '22023' using message='Chamado de suporte inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-support:'||ticket_id::text,0));
 select * into previous from public.book_support_tickets where id=ticket_id for update;
 if previous.id is not null and previous.owner_id<>actor.id and not actor.mestre then raise sqlstate '42501' using message='Conversa privada.'; end if;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='A conversa mudou. Atualize antes de enviar.'; end if;
 if previous.id is null then
 if coalesce(length(trim(subject)),0) not between 1 and 120 or nullif(trim(body),'') is null then raise sqlstate '22023' using message='Informe assunto e mensagem.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-support-owner:'||actor.id::text,0));
 if (select count(*) from public.book_support_tickets where owner_id=actor.id and created_at>now()-interval '1 day')>=20 then raise sqlstate '22023' using message='Limite diário de chamados atingido.'; end if;
 insert into public.book_support_tickets(id,owner_id,owner_name,subject) values(ticket_id,actor.id,actor.nome,trim(subject));
 else
 if previous.status='Fechado' and not actor.mestre then raise sqlstate '22023' using message='Este chamado está fechado. Abra um novo chamado.'; end if;
 update public.book_support_tickets set status=coalesce(new_status,status),version=version+1,updated_at=now() where id=ticket_id;
 end if;
 if nullif(trim(body),'') is not null then
 if (select count(*) from public.book_support_messages m where m.ticket_id=book_support_send.ticket_id)>=1000 then raise sqlstate '22023' using message='Limite de mensagens atingido.'; end if;
 insert into public.book_support_messages(ticket_id,author_id,author_name,master,body) values(ticket_id,actor.id,actor.nome,actor.mestre,trim(body));
 elsif new_status is null then raise sqlstate '22023' using message='Escreva uma mensagem.';
 end if;
end $$;
revoke all on function public.book_save_note(uuid,text,text,bigint,boolean),public.book_support_send(uuid,text,text,bigint,text) from public,anon;
grant execute on function public.book_save_note(uuid,text,text,bigint,boolean),public.book_support_send(uuid,text,text,bigint,text) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 11; $$;
commit;
