-- Rotina observada na demonstração: novos processos e aprimoramento dos existentes.
begin;
alter table public.book_profiles alter column tabs set default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes','reservas','onboarding','projetos','compras','danos'];
update public.book_profiles set tabs=tabs||array['reservas','onboarding','projetos','compras','danos'],version=version+1 where funcao='adm' and tabs @> array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes'] and not tabs && array['reservas','onboarding','projetos','compras','danos'];
create or replace function public.book_manage_user(target_id uuid,display_name text,role_name text,hotels text[],expected_version bigint,selected_tabs text[] default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes','reservas','onboarding','projetos','compras','danos'])
returns void language plpgsql security definer set search_path='' as $$
declare previous_tabs text[];
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre gerencia usuários.'; end if;
 if selected_tabs is null or cardinality(selected_tabs)>15 or exists(select 1 from unnest(selected_tabs) t where t is null or t not in ('chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes','reservas','onboarding','projetos','compras','danos')) then raise sqlstate '22023' using message='Abas inválidas.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-user:'||target_id::text,0));
 select tabs into previous_tabs from public.book_profiles where id=target_id;
 perform public.book_manage_user_v9(target_id,display_name,role_name,hotels,expected_version);
 update public.book_profiles set tabs=case when role_name='adm' then selected_tabs else '{}'::text[] end where id=target_id;
 insert into public.book_user_audit(actor_id,user_id,old_data,new_data) values(auth.uid(),target_id,jsonb_build_object('tabs',previous_tabs),jsonb_build_object('tabs',selected_tabs));
end $$;
create or replace function public.book_process_phases(kind text)
returns text[] language sql immutable set search_path='' as $$ select case kind
 when 'reservas' then array['Novas reservas','Coleta de dados','Conferência','Pronta para check-in','Autorizada','Cancelada']
 when 'onboarding' then array['Boas-vindas','Coleta de dados','Checagem','Ativação','Criação do anúncio','Acompanhamento','Concluído','Desistência']
 when 'projetos' then array['Backlog','Planejamento','Execução','Em espera','Concluído','Arquivado']
 when 'compras' then array['Solicitada','Cotação','Aprovação','Comprada','Recebida','Cancelada']
 when 'danos' then array['Comunicação','Aguardando','Reposição','Arquivado']
 when 'desempenho' then array['Avaliação','Reunião com gestão','Feedback','Plano de ação','Concluído'] else '{}'::text[] end; $$;
create or replace function public.book_process_can(kind text,site text)
returns boolean language sql stable security definer set search_path='' as $$ select
 kind in ('reservas','onboarding','projetos','compras','danos','desempenho') and public.book_can_tab(case when kind='desempenho' then 'avaliacoes' else kind end)
 and ((site is null and kind in ('projetos','desempenho')) or (site is not null and public.book_can_hotel(site))); $$;
create table if not exists public.book_processes(
 id uuid primary key,kind text not null check(kind in ('reservas','onboarding','projetos','compras','danos','desempenho')),
 owner_id uuid not null references public.book_profiles(id),hotel text,apartment text,phase text not null,
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=131072),
 service_id text,stock_receipt jsonb,version bigint not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(phase=any(public.book_process_phases(kind)))
);
create index if not exists book_process_kind_time on public.book_processes(kind,created_at desc,id desc);
create index if not exists book_process_hotel on public.book_processes(hotel,apartment);
create unique index if not exists book_reservation_code on public.book_processes((data->>'canal'),(data->>'codigo')) where kind='reservas' and coalesce(data->>'codigo','')<>'' and phase<>'Cancelada';
alter table public.book_processes enable row level security;
revoke all on public.book_processes from anon,authenticated;grant select on public.book_processes to authenticated;
drop policy if exists book_process_access on public.book_processes;
create policy book_process_access on public.book_processes for select to authenticated using(public.book_process_can(kind,hotel));
create or replace function public.book_flow_can(source text,record_id text,writing boolean default false)
returns boolean language sql stable security definer set search_path='' as $$ select case
 when source='process' then exists(select 1 from public.book_processes p where p.id::text=record_id and public.book_process_can(p.kind,p.hotel))
 when source='feedbacks' then public.book_can_tab('feedbacks') and exists(select 1 from public.book_feedbacks f where f.id::text=record_id and public.book_can_hotel(f.hotel))
 when source in ('ordensServico','vistorias') then public.book_can_collection(source,writing) and exists(select 1 from public.book_records r where r.collection=source and r.id=record_id and public.book_can_hotel(r.hotel)) else false end; $$;
create table if not exists public.book_flow_meta(
 source text not null check(source in ('ordensServico','vistorias','feedbacks')),record_id text not null,
 phase text not null,data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<=16000),
 version bigint not null default 1,updated_at timestamptz not null default now(),primary key(source,record_id)
);
create table if not exists public.book_flow_events(
 id bigint generated always as identity primary key,source text not null,record_id text not null,
 actor_id uuid not null,actor_name text not null,action text not null,body text not null default '' check(length(body)<=2000),
 previous jsonb,current jsonb,created_at timestamptz not null default now()
);
create index if not exists book_flow_event_record on public.book_flow_events(source,record_id,id desc);
alter table public.book_flow_meta enable row level security;alter table public.book_flow_events enable row level security;
revoke all on public.book_flow_meta,public.book_flow_events from anon,authenticated;
grant select on public.book_flow_meta,public.book_flow_events to authenticated;
drop policy if exists book_flow_meta_access on public.book_flow_meta;
create policy book_flow_meta_access on public.book_flow_meta for select to authenticated using(public.book_flow_can(source,record_id));
drop policy if exists book_flow_event_access on public.book_flow_events;
create policy book_flow_event_access on public.book_flow_events for select to authenticated using(public.book_flow_can(source,record_id));
do $$ begin
 if to_regprocedure('public.book_can_read_file_v13(text)') is null then alter function public.book_can_read_file(text) rename to book_can_read_file_v13; end if;
 if to_regprocedure('public.book_file_in_use_v13(text)') is null then alter function public.book_file_in_use(text) rename to book_file_in_use_v13; end if;
end $$;
revoke all on function public.book_can_read_file_v13(text),public.book_file_in_use_v13(text) from public,anon,authenticated;
create or replace function public.book_can_read_file(filename text)
returns boolean language sql stable security definer set search_path='' as $$ select public.book_can_read_file_v13(filename) or exists(select 1 from public.book_processes p where public.book_process_can(p.kind,p.hotel) and exists(select 1 from jsonb_array_elements(p.data->'anexos') a where a->>'dados'='/api/files/'||filename)); $$;
create or replace function public.book_file_in_use(filename text)
returns boolean language sql stable security definer set search_path='' as $$ select public.book_file_in_use_v13(filename) or exists(select 1 from public.book_processes p,jsonb_array_elements(p.data->'anexos') a where a->>'dados'='/api/files/'||filename); $$;
drop policy if exists book_scoped_files on storage.objects;
create policy book_scoped_files on storage.objects as restrictive for select to authenticated using(bucket_id<>'book-attachments' or public.book_can_read_file(name));
drop policy if exists book_cleanup_files on storage.objects;
create policy book_cleanup_files on storage.objects for delete to authenticated using(bucket_id='book-attachments' and (storage.foldername(name))[1]=auth.uid()::text and not public.book_file_in_use(name));
drop policy if exists book_scoped_uploads on storage.objects;
create policy book_scoped_uploads on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'book-attachments' or exists(select 1 from public.book_profiles p where p.id=auth.uid() and (p.funcao='cliente' or p.mestre or p.tabs && array['chamados','chat','os','vistorias','feedbacks','reservas','onboarding','projetos','compras','danos'])));
create or replace function public.book_process_save(process_id uuid,process_kind text,expected_version bigint,site text,unit text,new_phase text,document jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_processes; actor public.book_profiles; item jsonb; k text; v jsonb; required_fields text[]; allowed_fields text[]; choices text[];
begin
 if not public.book_process_can(process_kind,site) then raise sqlstate '42501' using message='Sem acesso a este processo.'; end if;
 if process_id is null or expected_version is null or expected_version<0 or new_phase is null or not new_phase=any(public.book_process_phases(process_kind)) or jsonb_typeof(document) is distinct from 'object' or coalesce(length(trim(document->>'titulo')),0) not between 1 and 160 or document->>'observacoes' is null or length(document->>'observacoes')>8000 or document->>'prioridade' is null or document->>'prioridade' not in ('Normal','Alta','Urgente') or jsonb_typeof(document->'checks') is distinct from 'object' or jsonb_typeof(document->'anexos') is distinct from 'array' or jsonb_array_length(document->'anexos')>20 then raise sqlstate '22023' using message='Processo incompleto.'; end if;
 if site is not null and not exists(select 1 from public.book_apartments where hotel=site and apartment=unit) or site is null and (unit is not null or jsonb_array_length(document->'anexos')>0) then raise sqlstate '22023' using message='Selecione um apartamento do catálogo para este processo e seus anexos.'; end if;
 if nullif(document->>'prazo','') is not null then
  if document->>'prazo' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise sqlstate '22023' using message='Prazo inválido.'; end if;perform (document->>'prazo')::date;
 end if;
 if nullif(document->>'responsavel','') is not null and not exists(select 1 from public.book_profiles p where p.id::text=document->>'responsavel' and p.funcao='adm' and (p.mestre or site is null or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and public.book_hotel_name(a.hotel)=public.book_hotel_name(site))) and (p.mestre or (case when process_kind='desempenho' then 'avaliacoes' else process_kind end)=any(p.tabs))) then raise sqlstate '22023' using message='Responsável sem acesso ao processo.'; end if;
 required_fields:=case process_kind when 'reservas' then array['cliente','canal','checkin','checkout','hospedes'] when 'onboarding' then array['cliente'] when 'projetos' then array['categoria'] when 'compras' then array['itens','quantidade'] when 'danos' then array['item','quantidade','origem'] when 'desempenho' then array['funcionario','inicio','fim'] end;
 if exists(select 1 from unnest(required_fields) field where nullif(trim(document->>field),'') is null) then raise sqlstate '22023' using message='Preencha os campos obrigatórios do processo.'; end if;
 allowed_fields:=array['titulo','observacoes','prioridade','responsavel','prazo','anexos','checks']||case process_kind
 when 'reservas' then array['cliente','canal','codigo','checkin','checkout','hospedes','contato','nomeContrato']
 when 'onboarding' then array['cliente','email','telefone','tipoPessoa','pets','capacidade','enxoval','peculiaridades','pendencias']
 when 'projetos' then array['categoria','inicio','conclusao','custoPrevisto','custoReal','resultados']
 when 'compras' then array['itens','quantidade','servicoId','fornecedor','valorEstimado','valorFinal','pagador']
 when 'danos' then array['item','quantidade','hospede','canal','codigo','origem','cobrar','cobranca','valor']
 when 'desempenho' then array['funcionario','inicio','fim','pontosFortes','melhorias','plano','reuniao'] end;
 for k,v in select * from jsonb_each(document) loop
  if not k=any(allowed_fields) or k not in ('anexos','checks','responsavel') and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>case when k='observacoes' then 8000 else 4000 end) then raise sqlstate '22023' using message='Campo de processo inválido.'; end if;
  if k in ('checkin','checkout','inicio','fim','conclusao','reuniao') and nullif(v#>>'{}','') is not null then
   if (v#>>'{}') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise sqlstate '22023' using message='Data inválida.'; end if;perform (v#>>'{}')::date;
  end if;
  if k in ('quantidade','capacidade','hospedes') and nullif(v#>>'{}','') is not null and ((v#>>'{}')::numeric<=0 or (v#>>'{}')::numeric>10000) then raise sqlstate '22023' using message='Quantidade inválida.'; end if;
  if k in ('custoPrevisto','custoReal','valorEstimado','valorFinal','valor') and nullif(v#>>'{}','') is not null then perform public.book_money(v,true); end if;
  if k in ('capacidade','hospedes') and nullif(v#>>'{}','') is not null and (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) then raise sqlstate '22023' using message='Informe um número inteiro de hóspedes.'; end if;
  choices:=case k when 'canal' then array['Site','Airbnb','Booking','Direta','Outro'] when 'categoria' then array['Operação','Manutenção','Tecnologia','Melhorias','Outro'] when 'origem' then array['Vistoria','Governança','Hóspede','Atendimento','Outro'] when 'tipoPessoa' then array['Pessoa física','Pessoa jurídica'] when 'pets' then array['Não informado','Sim','Não'] when 'cobrar' then array['A avaliar','Sim','Não'] when 'cobranca' then array['Não definida','Cobrando','Assumido pelo hóspede','Negado pelo hóspede','Encerrada'] when 'pagador' then array['A definir','BOOK TESK','Proprietário','Hóspede','Airbnb','Fundo de danos','Governança','Compartilhado'] else null end;
  if choices is not null and nullif(v#>>'{}','') is not null and not (v#>>'{}')=any(choices) then raise sqlstate '22023' using message='Opção de cadastro inválida.'; end if;
 end loop;
 if exists(select 1 from jsonb_each(document->'checks') where jsonb_typeof(value)<>'boolean' or length(key)>120) or (select count(*) from jsonb_each(document->'checks'))>20 then raise sqlstate '22023' using message='Checklist inválido.'; end if;
 if process_kind='reservas' then
  if (document->>'checkout')::date<=(document->>'checkin')::date or document->>'canal' not in ('Site','Airbnb','Booking','Direta','Outro') then raise sqlstate '22023' using message='Período ou canal inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('book-reservation:'||site||':'||unit,0));
  if new_phase<>'Cancelada' and exists(select 1 from public.book_processes p where p.kind='reservas' and p.id<>process_id and p.hotel=site and p.apartment=unit and p.phase<>'Cancelada' and (p.data->>'checkin')::date<(document->>'checkout')::date and (p.data->>'checkout')::date>(document->>'checkin')::date) then raise sqlstate 'PT409' using message='Já existe reserva neste apartamento e período. Confira antes de confirmar.'; end if;
  if new_phase in ('Pronta para check-in','Autorizada') and not coalesce((document#>>'{checks,Documentos conferidos}')::boolean,false) then raise sqlstate '22023' using message='Confira os documentos antes de autorizar o check-in.'; end if;
 end if;
 if process_kind='desempenho' and ((document->>'fim')::date<(document->>'inicio')::date or not exists(select 1 from public.book_profiles where id::text=document->>'funcionario' and funcao='adm')) then raise sqlstate '22023' using message='Funcionário ou período inválido.'; end if;
 if process_kind='compras' and nullif(document->>'servicoId','') is not null and (document->>'servicoId' !~ '^[0-9]{1,16}$' or not public.book_flow_can('ordensServico',document->>'servicoId') or not exists(select 1 from public.book_records where collection='ordensServico' and id=document->>'servicoId' and public.book_hotel_name(hotel)=public.book_hotel_name(site) and data->>'apartamento'=unit)) then raise sqlstate '42501' using message='Card de serviço indisponível ou de outro apartamento.'; end if;
 if process_kind='projetos' and nullif(document->>'inicio','') is not null and nullif(document->>'conclusao','') is not null and (document->>'conclusao')::date<(document->>'inicio')::date then raise sqlstate '22023' using message='Conclusão anterior ao início.'; end if;
 for item in select value from jsonb_array_elements(document->'anexos') loop
  if item->>'nome' is null or length(item->>'nome')>200 or item->>'dados' is null or left(item->>'dados',11)<>'/api/files/' or split_part(substr(item->>'dados',12),'/',2)<>site or not public.book_can_read_file(substr(item->>'dados',12)) or not exists(select 1 from storage.objects where bucket_id='book-attachments' and name=substr(item->>'dados',12)) then raise sqlstate '42501' using message='Anexo indisponível.'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('book-process:'||process_id::text,0));
 select * into previous from public.book_processes where id=process_id for update;
 if previous.id is not null and (previous.kind<>process_kind or previous.hotel is distinct from site or previous.apartment is distinct from unit) then raise sqlstate '22023' using message='Tipo e apartamento do processo não podem ser alterados.'; end if;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='Processo alterado por outra pessoa. Atualize.'; end if;
 select * into actor from public.book_profiles where id=auth.uid();
 insert into public.book_processes(id,kind,owner_id,hotel,apartment,phase,data) values(process_id,process_kind,actor.id,site,unit,new_phase,document)
 on conflict(id) do update set phase=excluded.phase,data=excluded.data,version=book_processes.version+1,updated_at=now();
 insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,previous,current) values('process',process_id::text,actor.id,actor.nome,case when previous.id is null then 'Criado' when previous.phase<>new_phase then 'Etapa alterada' else 'Atualizado' end,case when previous.id is null then null else jsonb_build_object('phase',previous.phase,'data',previous.data) end,jsonb_build_object('phase',new_phase,'data',document));
end $$;
create or replace function public.book_process_page(process_kind text,page_offset integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_can_tab(case when process_kind='desempenho' then 'avaliacoes' else process_kind end) then raise sqlstate '42501' using message='Sem acesso ao processo.'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 or jsonb_typeof(filters) is distinct from 'object' or length(coalesce(filters->>'search',''))>200 then raise sqlstate '22023' using message='Filtro inválido.'; end if;
 with selected as materialized(select p.* from public.book_processes p where p.kind=process_kind
 and (coalesce(filters->>'search','')='' or p.data->>'titulo' ilike '%'||(filters->>'search')||'%' or p.data->>'cliente' ilike '%'||(filters->>'search')||'%' or p.apartment ilike '%'||(filters->>'search')||'%')
 and (coalesce(filters->>'phase','')='' or p.phase=filters->>'phase')
 and (coalesce(filters->>'assignee','')='' or p.data->>'responsavel'=filters->>'assignee')
 and (coalesce(filters->>'hotel','')='' or p.hotel=filters->>'hotel')
 and (coalesce(filters->>'period','all')='all' or
  filters->>'period'='today' and nullif(p.data->>'prazo','')::date=today or
  filters->>'period'='week' and nullif(p.data->>'prazo','')::date>=date_trunc('week',today)::date and nullif(p.data->>'prazo','')::date<date_trunc('week',today)::date+7 or
  filters->>'period'='late' and nullif(p.data->>'prazo','')::date<today and not p.phase in ('Autorizada','Cancelada','Concluído','Desistência','Arquivado','Recebida'))
 ), page as(select * from selected order by created_at desc,id desc limit 50 offset page_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc,id desc) from page p),'[]'),'total',(select count(*) from selected),'counts',coalesce((select jsonb_object_agg(phase,n) from (select phase,count(*) n from selected group by phase) g),'{}')) into result;
 return result;
end $$;
create or replace function public.book_flow_details(source_name text,target_id text,before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; doc jsonb; base_version bigint;
begin
 if not public.book_flow_can(source_name,target_id) then raise sqlstate '42501' using message='Registro indisponível.'; end if;
 if source_name='process' then select to_jsonb(p),p.version into doc,base_version from public.book_processes p where p.id::text=target_id;
 elsif source_name='feedbacks' then select to_jsonb(f),f.version into doc,base_version from public.book_feedbacks f where f.id::text=target_id;
 else select to_jsonb(r),r.version into doc,base_version from public.book_records r where r.collection=source_name and r.id=target_id;
 end if;
 select jsonb_build_object('record',doc,'recordVersion',base_version,'meta',(select to_jsonb(m) from public.book_flow_meta m where m.source=source_name and m.record_id=target_id),
 'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('id',e.id::text) order by e.id desc) from (select * from public.book_flow_events where source=source_name and record_id=target_id and (before_id is null or id<before_id) order by id desc limit 51) e),'[]')) into result;
 return result;
end $$;
create or replace function public.book_flow_comment(source_name text,target_id text,message_body text)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.book_profiles;
begin
 if not public.book_flow_can(source_name,target_id,true) then raise sqlstate '42501' using message='Sem acesso para comentar.'; end if;
 if coalesce(length(trim(message_body)),0) not between 1 and 2000 then raise sqlstate '22023' using message='Comentário inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-flow-comment:'||auth.uid()::text,0));
 if (select count(*) from public.book_flow_events where actor_id=auth.uid() and action='Comentário' and created_at>now()-interval '1 minute')>=20 then raise sqlstate '22023' using message='Aguarde antes de comentar novamente.'; end if;
 select * into actor from public.book_profiles where id=auth.uid();
 insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,body) values(source_name,target_id,actor.id,actor.nome,'Comentário',trim(message_body));
end $$;
create or replace function public.book_flow_save(source_name text,target_id text,expected_version bigint,expected_record_version bigint,new_phase text,document jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_flow_meta; actor public.book_profiles; record_data jsonb; updated_data jsonb; assigned_login text; actual_version bigint; key text; value jsonb;
begin
 if source_name not in ('ordensServico','vistorias','feedbacks') or not public.book_flow_can(source_name,target_id,true) then raise sqlstate '42501' using message='Sem acesso para alterar esta etapa.'; end if;
 if expected_version is null or expected_version<0 or expected_record_version is null or jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>16000 then raise sqlstate '22023' using message='Acompanhamento inválido.'; end if;
 if new_phase is null or not new_phase=any(case source_name when 'ordensServico' then array['Novo','Preventivos periódicos','Aguardando proprietário','Em andamento','Pendente fornecedor','Conferência','Resolvido','Recusa proprietário'] when 'vistorias' then array['Registrada','Em revisão','Concluída'] else array['Feedback','Em andamento','Concluído'] end) then raise sqlstate '22023' using message='Etapa inválida.'; end if;
 for key,value in select * from jsonb_each(document) loop
  if key not in ('origem','prestador','motivo','respostaCliente','resolvidoPor','responsavel','prazo','proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado') or (key in ('proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado') and jsonb_typeof(value)<>'boolean') or (key not in ('proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado') and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>2000)) then raise sqlstate '22023' using message='Campo de acompanhamento inválido.'; end if;
 end loop;
 if source_name='ordensServico' then perform pg_advisory_xact_lock(72491001); end if;
 perform pg_advisory_xact_lock(hashtextextended('book-flow:'||source_name||':'||target_id,0));
 if source_name='feedbacks' then select data,version into record_data,actual_version from public.book_feedbacks where id::text=target_id for update;
 else select data,version into record_data,actual_version from public.book_records where collection=source_name and id=target_id for update;end if;
 if actual_version<>expected_record_version then raise sqlstate 'PT409' using message='O registro mudou. Atualize antes de salvar.'; end if;
 if source_name='ordensServico' and ((new_phase='Resolvido' and record_data->>'status'<>'Finalizada') or (record_data->>'status'='Finalizada' and new_phase<>'Resolvido')) then raise sqlstate '22023' using message='Use o fechamento ou a reabertura do card para alterar a conclusão do serviço.'; end if;
 if new_phase='Recusa proprietário' and coalesce(length(trim(document->>'motivo')),0)<3 then raise sqlstate '22023' using message='Informe o motivo da recusa.'; end if;
 if source_name='feedbacks' and new_phase='Concluído' and (coalesce(length(trim(document->>'respostaCliente')),0)<3 or not exists(select 1 from public.book_profiles p where p.id::text=document->>'resolvidoPor' and p.funcao='adm' and (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and public.book_hotel_name(a.hotel)=public.book_hotel_name(record_data->>'hotel'))))) then raise sqlstate '22023' using message='Informe resposta ao cliente e administrador que resolveu.'; end if;
 select * into previous from public.book_flow_meta where source=source_name and record_id=target_id for update;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='O acompanhamento mudou. Atualize a tela.'; end if;
 if source_name='ordensServico' then
  updated_data:=record_data;
  if document ? 'responsavel' then
   assigned_login:='';
   if nullif(document->>'responsavel','') is not null then
    select login into assigned_login from public.book_profiles p where p.id::text=document->>'responsavel' and p.funcao='adm' and (p.mestre or 'os'=any(p.tabs)) and (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and public.book_hotel_name(a.hotel)=public.book_hotel_name(record_data->>'hotel')));
    if assigned_login is null then raise sqlstate '22023' using message='Responsável sem acesso ao serviço.'; end if;
   end if;
   updated_data:=updated_data||jsonb_build_object('responsavelLogin',assigned_login);
  end if;
  if document ? 'prazo' then
   if nullif(document->>'prazo','') is not null then
    if document->>'prazo' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise sqlstate '22023' using message='Prazo inválido.'; end if;perform (document->>'prazo')::date;
   end if;
   updated_data:=updated_data||jsonb_build_object('vencimento',document->>'prazo');
  end if;
  if new_phase in ('Em andamento','Pendente fornecedor','Conferência') and record_data->>'status'='Aberta' then updated_data:=updated_data||jsonb_build_object('status','Em andamento');end if;
  if updated_data is distinct from record_data then perform public.book_commit(jsonb_build_array(jsonb_build_object('collection',source_name,'id',target_id,'version',actual_version,'data',updated_data)));end if;
 end if;
 select * into actor from public.book_profiles where id=auth.uid();
 insert into public.book_flow_meta(source,record_id,phase,data) values(source_name,target_id,new_phase,document) on conflict(source,record_id) do update set phase=excluded.phase,data=excluded.data,version=book_flow_meta.version+1,updated_at=now();
 insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,previous,current) values(source_name,target_id,actor.id,actor.nome,'Acompanhamento atualizado',case when previous.source is null then null else to_jsonb(previous) end,jsonb_build_object('phase',new_phase,'data',document));
end $$;
create table if not exists public.book_inspection_services(
 inspection_id text primary key,service_id text not null,created_at timestamptz not null default now()
);
alter table public.book_inspection_services enable row level security;revoke all on public.book_inspection_services from anon,authenticated;
create or replace function public.book_process_service(source_name text,target_id text,expected_version bigint,record_id text)
returns text language plpgsql security definer set search_path='' as $$
declare p public.book_processes; r public.book_records; doc jsonb; actor public.book_profiles; existing text; title text; description text;
begin
 if not public.book_can_tab('os') or source_name not in ('process','vistorias') or not public.book_flow_can(source_name,target_id,true) then raise sqlstate '42501' using message='Sem permissão para criar serviço.'; end if;
 perform pg_advisory_xact_lock(72491001);
 perform pg_advisory_xact_lock(hashtextextended('book-process:'||target_id,0));
 if source_name='process' then
  select * into p from public.book_processes where id::text=target_id for update;
  if p.hotel is null then raise sqlstate '22023' using message='Um serviço exige condomínio e apartamento.'; end if;
  if p.service_id is not null then return p.service_id; end if;
  if p.kind='compras' and nullif(p.data->>'servicoId','') is not null then return p.data->>'servicoId'; end if;
  if p.version<>expected_version then raise sqlstate 'PT409' using message='Processo alterado. Atualize.'; end if;
  doc:=jsonb_build_object('hotel',p.hotel,'apartamento',p.apartment,'titulo',p.data->>'titulo','descricao',coalesce(nullif(p.data->>'observacoes',''),p.data->>'titulo'),'anexos',p.data->'anexos','processId',p.id,'origem',p.kind);
 else
  select service_id into existing from public.book_inspection_services where inspection_id=target_id;
  if existing is not null then return existing; end if;
  select * into r from public.book_records where collection='vistorias' and id=target_id for update;
  if r.version<>expected_version then raise sqlstate 'PT409' using message='Vistoria alterada. Atualize.'; end if;
  select string_agg(g.key||' / '||i.key,E'\n') into description from jsonb_each(r.data->'checklist') g cross join lateral jsonb_each_text(g.value) i where i.value='Com problema';
  doc:=jsonb_build_object('hotel',r.data->>'hotel','apartamento',r.data->>'apartamento','titulo','Pendências da vistoria # '||target_id,'descricao',coalesce(description,'Revisar observações da vistoria')||E'\n'||coalesce(r.data->>'observacoes',''),'anexos',coalesce(r.data->'fotos','[]'),'vistoriaId',target_id,'origem','Vistoria');
 end if;
 if record_id is null or record_id!~'^[0-9]{1,16}$' or expected_version is null then raise sqlstate '22023' using message='Identificador inválido.'; end if;
 doc:=doc||jsonb_build_object('id',record_id,'status','Aberta','prioridade','Normal','data',to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'));
 perform public.book_commit(jsonb_build_array(jsonb_build_object('collection','ordensServico','id',record_id,'version',0,'data',doc)));
 if source_name='process' then update public.book_processes set service_id=record_id,version=version+1,updated_at=now() where id::text=target_id;
 else insert into public.book_inspection_services(inspection_id,service_id) values(target_id,record_id);end if;
 select * into actor from public.book_profiles where id=auth.uid();
 insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,current) values(source_name,target_id,actor.id,actor.nome,'Serviço vinculado',jsonb_build_object('service_id',record_id));
 return record_id;
end $$;
create or replace function public.book_purchase_receive(process_id uuid,expected_version bigint,stock_version bigint,material_id text,quantity numeric)
returns void language plpgsql security definer set search_path='' as $$
declare p public.book_processes; stock public.book_records; doc jsonb; item jsonb; i integer:=0; found_item boolean:=false;
begin
 if not public.book_can_tab('compras') or not public.book_can_tab('estoque') then raise sqlstate '42501' using message='Exige acesso a Compras e Estoque.'; end if;
 if quantity is null or quantity<=0 or quantity>10000 or scale(quantity)>2 then raise sqlstate '22023' using message='Quantidade inválida.'; end if;
 perform pg_advisory_xact_lock(72491001);
 perform pg_advisory_xact_lock(hashtextextended('book-process:'||process_id::text,0));
 select * into p from public.book_processes where id=process_id and kind='compras' for update;
 if p.id is null or not public.book_process_can(p.kind,p.hotel) then raise sqlstate '42501' using message='Compra indisponível.'; end if;
 if p.stock_receipt is not null then return; end if;
 if expected_version is null or p.version<>expected_version then raise sqlstate 'PT409' using message='Compra alterada. Atualize.'; end if;
 if p.phase not in ('Comprada','Recebida') then raise sqlstate '22023' using message='Marque a compra como Comprada antes do recebimento.'; end if;
 select * into stock from public.book_records where collection='estoqueBookSantos' and id='singleton' for update;
 if stock_version is null or coalesce(stock.version,0)<>stock_version then raise sqlstate 'PT409' using message='Estoque alterado. Atualize.'; end if;
 doc:=stock.data;
 for item in select value from jsonb_array_elements(doc->'itens') loop
  if item->>'id'=material_id then doc:=jsonb_set(doc,array['itens',i::text,'quantidade'],to_jsonb((item->>'quantidade')::numeric+quantity));found_item:=true;end if;i:=i+1;
 end loop;
 if not found_item then raise sqlstate '22023' using message='Material não encontrado. Cadastre-o no estoque.'; end if;
 perform public.book_commit(jsonb_build_array(jsonb_build_object('collection','estoqueBookSantos','id','singleton','version',stock.version,'data',doc)));
 update public.book_processes set phase='Recebida',stock_receipt=jsonb_build_object('material_id',material_id,'quantity',quantity,'actor',auth.uid(),'at',now()),version=version+1,updated_at=now() where id=process_id;
 insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,current) values('process',process_id::text,auth.uid(),(select nome from public.book_profiles where id=auth.uid()),'Recebimento no estoque',jsonb_build_object('material_id',material_id,'quantity',quantity));
end $$;
-- The master backup includes all shared processes, events and source links.
do $$ begin if to_regprocedure('public.book_backup_v13(text[])') is null then alter function public.book_backup(text[]) rename to book_backup_v13; end if;end $$;
revoke all on function public.book_backup_v13(text[]) from public,anon,authenticated;
create or replace function public.book_backup(selected text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre faz backup.'; end if;
 result:=public.book_backup_v13(selected);
 if 'colaboracao'=any(selected) then result:=result||jsonb_build_object('processes',coalesce((select jsonb_agg(to_jsonb(p)) from public.book_processes p),'[]'),'flow_meta',coalesce((select jsonb_agg(to_jsonb(m)) from public.book_flow_meta m),'[]'),'flow_events',coalesce((select jsonb_agg(to_jsonb(e)) from public.book_flow_events e),'[]'),'inspection_services',coalesce((select jsonb_agg(to_jsonb(l)) from public.book_inspection_services l),'[]'));end if;
 return result;
end $$;
-- New permissions also allow finding administrators for assignment, not clients.
create or replace function public.book_can_read_profile(target uuid)
returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.book_profiles actor where actor.id=auth.uid() and (actor.id=target or actor.mestre or (actor.funcao='adm' and (exists(select 1 from public.book_profiles p where p.id=target and p.funcao='adm' and actor.tabs && array['os','vistorias','dashboard','chamados','chat','avaliacoes','reservas','onboarding','projetos','compras','danos']) or exists(select 1 from public.book_records r where r.owner_id=target and r.collection<>'estoqueBookSantos' and public.book_can_hotel(r.hotel) and public.book_can_collection(r.collection)))))); $$;
revoke all on function public.book_process_phases(text),public.book_process_can(text,text),public.book_flow_can(text,text,boolean),public.book_can_read_file(text),public.book_file_in_use(text),public.book_process_save(uuid,text,bigint,text,text,text,jsonb),public.book_process_page(text,integer,jsonb),public.book_flow_details(text,text,bigint),public.book_flow_comment(text,text,text),public.book_flow_save(text,text,bigint,bigint,text,jsonb),public.book_process_service(text,text,bigint,text),public.book_purchase_receive(uuid,bigint,bigint,text,numeric),public.book_backup(text[]) from public,anon;
grant execute on function public.book_process_phases(text),public.book_process_can(text,text),public.book_flow_can(text,text,boolean),public.book_can_read_file(text),public.book_file_in_use(text),public.book_process_save(uuid,text,bigint,text,text,text,jsonb),public.book_process_page(text,integer,jsonb),public.book_flow_details(text,text,bigint),public.book_flow_comment(text,text,text),public.book_flow_save(text,text,bigint,bigint,text,jsonb),public.book_process_service(text,text,bigint,text),public.book_purchase_receive(uuid,bigint,bigint,text,numeric),public.book_backup(text[]) to authenticated;
create or replace function public.book_routine_date(value text)
returns date language plpgsql immutable set search_path='' as $$
begin
 if value is null or value !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then return null; end if;
 return value::date;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;
revoke all on function public.book_routine_date(text) from public,anon;
grant execute on function public.book_routine_date(text) to authenticated;
create or replace function public.book_service_page(page_offset integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem acesso aos cards.'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 or jsonb_typeof(filters) is distinct from 'object' or length(coalesce(filters->>'search',''))>200 then raise sqlstate '22023' using message='Filtro inválido.'; end if;
 with source as materialized(select r.id,r.data,r.version,coalesce(m.version,0) meta_version,coalesce(m.data,'{}') meta_data,
 case when r.data->>'status'='Finalizada' then 'Resolvido' else coalesce(nullif(case when m.phase='Resolvido' then null else m.phase end,''),case when r.data->>'status'='Em andamento' then 'Em andamento' else 'Novo' end) end phase
 from public.book_records r left join public.book_flow_meta m on m.source=r.collection and m.record_id=r.id where r.collection='ordensServico'),
 selected as materialized(select * from source where
 (coalesce(filters->>'search','')='' or data->>'titulo' ilike '%'||(filters->>'search')||'%' or data->>'apartamento' ilike '%'||(filters->>'search')||'%')
 and (coalesce(filters->>'phase','')='' or phase=filters->>'phase') and (coalesce(filters->>'hotel','')='' or public.book_hotel_name(data->>'hotel')=filters->>'hotel')
 and (coalesce(filters->>'assignee','')='' or data->>'responsavelLogin'=(select login from public.book_profiles where id::text=filters->>'assignee'))
 and (coalesce(filters->>'period','all')='all' or filters->>'period'='today' and public.book_routine_date(data->>'vencimento')=today or filters->>'period'='week' and public.book_routine_date(data->>'vencimento')>=date_trunc('week',today)::date and public.book_routine_date(data->>'vencimento')<date_trunc('week',today)::date+7 or filters->>'period'='late' and public.book_routine_date(data->>'vencimento')<today and phase not in ('Resolvido','Recusa proprietário'))
 ), page as(select * from selected order by id desc limit 50 offset page_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by id desc) from page p),'[]'),'total',(select count(*) from selected),'counts',coalesce((select jsonb_object_agg(phase,n) from (select phase,count(*) n from selected group by phase) g),'{}')) into result;
 return result;
end $$;
revoke all on function public.book_service_page(integer,jsonb) from public,anon;
grant execute on function public.book_service_page(integer,jsonb) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 14; $$;
commit;
