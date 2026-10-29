-- Interface operacional simplificada. Preserva processos antigos e seus históricos.
begin;
do $$ begin
 if to_regclass('public.book_condominiums') is null then raise exception 'Aplique antes a migração 202610290016_onboarding_catalog.sql.'; end if;
end $$;
create or replace function public.book_can_tab(tab_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select tab_name not in ('reservas','projetos','compras') and exists(
 select 1 from public.book_profiles where id=auth.uid() and funcao='adm' and (mestre or tab_name=any(tabs)));
$$;
alter table public.book_profiles alter column tabs set default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes','onboarding','danos'];
update public.book_profiles set tabs=array_remove(array_remove(array_remove(tabs,'reservas'),'projetos'),'compras'),version=version+1
 where tabs && array['reservas','projetos','compras'];

create or replace function public.book_process_can(kind text,site text)
returns boolean language sql stable security definer set search_path='' as $$
 select kind in ('danos','desempenho') and public.book_can_tab(case when kind='desempenho' then 'avaliacoes' else kind end)
 and ((site is null and kind='desempenho') or (site is not null and public.book_can_hotel(site)));
$$;
revoke all on function public.book_purchase_receive(uuid,bigint,bigint,text,numeric) from public,anon,authenticated;

-- Keep stored statuses and old history intact; normalize only the operational view.
create or replace function public.book_service_stage(status text,phase text)
returns text language sql immutable set search_path='' as $$
 select case when status='Finalizada' then 'Resolvido'
 when phase='Recusa proprietário' then 'Recusa proprietário'
 when phase in ('Em andamento','Aguardando proprietário','Pendente fornecedor','Conferência') or status='Em andamento' then 'Em andamento'
 else 'Novo' end;
$$;
revoke all on function public.book_service_stage(text,text) from public,anon;
grant execute on function public.book_service_stage(text,text) to authenticated;
create or replace function public.book_manage_user(target_id uuid,display_name text,role_name text,hotels text[],expected_version bigint,selected_tabs text[] default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes','onboarding','danos'])
returns void language plpgsql security definer set search_path='' as $$
declare previous_tabs text[];
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre gerencia usuários.'; end if;
 if selected_tabs is null or cardinality(selected_tabs)>12 or exists(select 1 from unnest(selected_tabs) t where t is null or t not in ('chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes','onboarding','danos')) then raise sqlstate '22023' using message='Abas inválidas.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-user:'||target_id::text,0));
 select tabs into previous_tabs from public.book_profiles where id=target_id;
 perform public.book_manage_user_v9(target_id,display_name,role_name,hotels,expected_version);
 update public.book_profiles set tabs=case when role_name='adm' then selected_tabs else '{}'::text[] end where id=target_id;
 insert into public.book_user_audit(actor_id,user_id,old_data,new_data) values(auth.uid(),target_id,jsonb_build_object('tabs',previous_tabs),jsonb_build_object('tabs',selected_tabs));
end $$;
create or replace function public.book_flow_save(source_name text,target_id text,expected_version bigint,expected_record_version bigint,new_phase text,document jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_flow_meta; actor public.book_profiles; record_data jsonb; updated_data jsonb; assigned_login text; actual_version bigint; key text; value jsonb;
begin
 if source_name not in ('ordensServico','vistorias','feedbacks') or not public.book_flow_can(source_name,target_id,true) then raise sqlstate '42501' using message='Sem acesso para alterar esta etapa.'; end if;
 if expected_version is null or expected_version<0 or expected_record_version is null or jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>16000 then raise sqlstate '22023' using message='Acompanhamento inválido.'; end if;
 if new_phase is null or not new_phase=any(case source_name when 'ordensServico' then array['Novo','Em andamento','Recusa proprietário','Resolvido'] when 'vistorias' then array['Registrada','Em revisão','Concluída'] else array['Feedback','Em andamento','Concluído'] end) then raise sqlstate '22023' using message='Etapa inválida.'; end if;
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
create or replace function public.book_service_page(page_offset integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem acesso aos cards.'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 or jsonb_typeof(filters) is distinct from 'object' or length(coalesce(filters->>'search',''))>200 then raise sqlstate '22023' using message='Filtro inválido.'; end if;
 with source as materialized(select r.id,r.data,r.version,coalesce(m.version,0) meta_version,coalesce(m.data,'{}') meta_data,
 public.book_service_stage(r.data->>'status',m.phase) phase
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
create or replace function public.book_decision_snapshot(site text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_is_admin() or not public.book_can_tab('dashboard') then raise sqlstate '42501' using message='Sem acesso à visão geral.'; end if;
 if site is not null and (length(site)>100 or not public.book_can_hotel(site)) then raise sqlstate '42501' using message='Sem acesso a este condomínio.'; end if;
 with services as materialized (
  select r.id,public.book_hotel_name(r.hotel) hotel,r.data,
   public.book_routine_date(r.data->>'vencimento') due,
   public.book_service_stage(r.data->>'status',m.phase) phase,
   coalesce(nullif(r.data->>'responsavelLogin',''),'') assignee,
   p.id assignee_id,coalesce(nullif(p.nome,''),'A definir') assignee_name
  from public.book_records r left join public.book_flow_meta m on m.source='ordensServico' and m.record_id=r.id
   left join public.book_profiles p on p.login=r.data->>'responsavelLogin'
  where r.collection='ordensServico' and (site is null or public.book_hotel_name(r.hotel)=site)
 ), active as materialized (select * from services where phase not in ('Resolvido','Recusa proprietário')),
 properties as (
  select a.hotel,a.apartment,max(public.book_routine_date(r.data->>'data')) last_date
  from public.book_apartments a left join public.book_records r on r.collection='vistorias' and public.book_hotel_name(r.hotel)=a.hotel and r.data->>'apartamento'=a.apartment and public.book_routine_date(r.data->>'data')<=today
  where public.book_can_collection('vistorias') and (site is null or a.hotel=site)
  group by a.hotel,a.apartment
 ), inspections as materialized (
  select *, (last_date+interval '3 months')::date next_due from properties
 ), materials as materialized (
  select i->>'id' id,i->>'nome' name,case when jsonb_typeof(i->'quantidade')='number' then (i->>'quantidade')::numeric else null end quantity,public.book_decision_number(i->'minimo') minimum
  from public.book_records r cross join lateral jsonb_array_elements(coalesce(r.data->'itens','[]')) i
  where r.collection='estoqueBookSantos' and r.id='singleton' and public.book_can_tab('estoque')
 ), stock_alerts as (select *,coalesce(minimum,0) threshold from materials where quantity<=coalesce(minimum,0))
 select jsonb_build_object(
  'generatedAt',now(),'referenceDate',today,'hotel',site,
  'permissions',jsonb_build_object('stock',public.book_can_tab('estoque'),'inspections',public.book_can_collection('vistorias')),
  'services',jsonb_build_object('total',(select count(*) from services),'open',(select count(*) from active),'overdue',(select count(*) from active where due<today),'today',(select count(*) from active where due=today),'urgent',(select count(*) from active where data->>'prioridade'='Urgente'),'unassigned',(select count(*) from active where assignee=''),'withoutDeadline',(select count(*) from active where due is null)),
  'byHotel',coalesce((select jsonb_agg(to_jsonb(t) order by t.overdue desc,t.open desc,t.hotel) from (select hotel,count(*) open,count(*) filter(where due<today) overdue,count(*) filter(where data->>'prioridade'='Urgente') urgent from active group by hotel) t),'[]'),
  'byAssignee',coalesce((select jsonb_agg(to_jsonb(t) order by t.overdue desc,t.open desc,t.name) from (select assignee,assignee_id id,assignee_name name,count(*) open,count(*) filter(where due<today) overdue from active group by assignee,assignee_id,assignee_name) t),'[]'),
  'byPhase',coalesce((select jsonb_agg(to_jsonb(t) order by t.phase) from (select phase,count(*) count from services group by phase) t),'[]'),
  'queue',coalesce((select jsonb_agg(to_jsonb(t) order by t.rank,t.due nulls last,t.id) from (
   select id,hotel,data->>'apartamento' apartment,left(data->>'titulo',160) title,phase,data->>'prioridade' priority,due,assignee_name assignee,
    case when data->>'prioridade'='Urgente' then 0 when due<today then 1 when due=today then 2 when assignee='' then 3 else 4 end rank,
    case when data->>'prioridade'='Urgente' then 'Prioridade urgente informada' when due<today then 'Prazo vencido' when due=today then 'Vence hoje' when assignee='' then 'Sem responsável definido' else 'Prazo mais próximo' end reason
   from active order by rank,due nulls last,id limit 12) t),'[]'),
  'inspections',jsonb_build_object('units',(select count(*) from inspections),'missing',(select count(*) from inspections where last_date is null),'overdue',(select count(*) from inspections where next_due<today),'next30',(select count(*) from inspections where next_due between today and today+30),
   'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.next_due nulls first,t.hotel,t.apartment) from (select * from inspections where next_due<=today+30 or last_date is null order by next_due nulls first,hotel,apartment limit 20) t),'[]')),
  'stock',jsonb_build_object('global',true,'alerts',(select count(*) from stock_alerts),'unconfigured',(select count(*) from materials where minimum is null),'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.quantity,t.name) from (select * from stock_alerts order by quantity,name limit 20) t),'[]'))
 ) into result;
 return result;
end $$;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 17; $$;
commit;

