-- Consultas administrativas com escopo expl?cito, sem repetir RLS em cada acompanhamento.
-- N?o altera cards nem backups. Execute ap?s o esquema 19.
begin;
do $$ begin if public.book_schema_version()<19 then raise exception 'Aplique antes a migra??o 19.';end if;end $$;
create or replace function public.book_service_page(page_offset integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; master_access boolean:=public.book_is_master(); allowed_hotels text[]; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_is_admin() or not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem acesso aos cards.'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 or jsonb_typeof(filters) is distinct from 'object' or length(coalesce(filters->>'search',''))>200 then raise sqlstate '22023' using message='Filtro inválido.'; end if;
 select coalesce(array_agg(public.book_hotel_name(hotel)),array[]::text[]) into allowed_hotels from public.book_hotel_access where user_id=auth.uid();
 with source as materialized(select r.id,r.data,r.version,coalesce(m.version,0) meta_version,coalesce(m.data,'{}') meta_data,
 public.book_service_stage(r.data->>'status',m.phase) phase
 from public.book_records r left join public.book_flow_meta m on m.source=r.collection and m.record_id=r.id where r.collection='ordensServico' and (master_access or public.book_hotel_name(r.hotel)=any(allowed_hotels))),
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
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; master_access boolean:=public.book_is_master(); allowed_hotels text[]; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_is_admin() or not public.book_can_tab('dashboard') then raise sqlstate '42501' using message='Sem acesso à visão geral.'; end if;
 if site is not null and (length(site)>100 or not public.book_can_hotel(site)) then raise sqlstate '42501' using message='Sem acesso a este condomínio.'; end if;
 select coalesce(array_agg(public.book_hotel_name(hotel)),array[]::text[]) into allowed_hotels from public.book_hotel_access where user_id=auth.uid();
 with services as materialized (
  select r.id,public.book_hotel_name(r.hotel) hotel,r.data,
   public.book_routine_date(r.data->>'vencimento') due,
   public.book_service_stage(r.data->>'status',m.phase) phase,
   coalesce(nullif(r.data->>'responsavelLogin',''),'') assignee,
   p.id assignee_id,coalesce(nullif(p.nome,''),'A definir') assignee_name
  from public.book_records r left join public.book_flow_meta m on m.source='ordensServico' and m.record_id=r.id
   left join public.book_profiles p on p.login=r.data->>'responsavelLogin'
  where r.collection='ordensServico' and public.book_can_collection('ordensServico') and (master_access or public.book_hotel_name(r.hotel)=any(allowed_hotels)) and (site is null or public.book_hotel_name(r.hotel)=site)
 ), active as materialized (select * from services where phase not in ('Resolvido','Recusa proprietário')),
 properties as (
  select a.hotel,a.apartment,max(public.book_routine_date(r.data->>'data')) last_date
  from public.book_apartments a left join public.book_records r on r.collection='vistorias' and public.book_hotel_name(r.hotel)=a.hotel and r.data->>'apartamento'=a.apartment and public.book_routine_date(r.data->>'data')<=today
  where public.book_can_collection('vistorias') and (master_access or public.book_hotel_name(a.hotel)=any(allowed_hotels)) and (site is null or a.hotel=site)
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

revoke all on function public.book_service_page(integer,jsonb),public.book_decision_snapshot(text) from public,anon;
grant execute on function public.book_service_page(integer,jsonb),public.book_decision_snapshot(text) to authenticated;
notify pgrst,'reload schema';
commit;
