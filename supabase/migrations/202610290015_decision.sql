-- SAD operacional: leitura global autorizada, sem duplicar os registros existentes.
begin;
create or replace function public.book_decision_number(value jsonb)
returns numeric language sql immutable set search_path='' as $$
 select case when jsonb_typeof(value)='number' and value::text ~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then (value#>>'{}')::numeric else null end;
$$;
create or replace function public.book_validate_stock_minimum()
returns trigger language plpgsql set search_path='' as $$
declare item jsonb;
begin
 if new.collection='estoqueBookSantos' then
  for item in select value from jsonb_array_elements(coalesce(new.data->'itens','[]')) loop
   if item ? 'minimo' and item->'minimo'<>'null'::jsonb and public.book_decision_number(item->'minimo') is null then
    raise sqlstate '22023' using message='Mínimo do estoque deve ser um número não negativo com até duas casas decimais.';
   end if;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists book_stock_minimum on public.book_records;
create trigger book_stock_minimum before insert or update on public.book_records for each row execute function public.book_validate_stock_minimum();

create or replace function public.book_decision_snapshot(site text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_is_admin() or not public.book_can_tab('dashboard') then raise sqlstate '42501' using message='Sem acesso à visão geral.'; end if;
 if site is not null and (length(site)>100 or not public.book_can_hotel(site)) then raise sqlstate '42501' using message='Sem acesso a este condomínio.'; end if;
 with services as materialized (
  select r.id,public.book_hotel_name(r.hotel) hotel,r.data,
   public.book_routine_date(r.data->>'vencimento') due,
   case when r.data->>'status'='Finalizada' then 'Resolvido' when m.phase='Resolvido' then case when r.data->>'status'='Em andamento' then 'Em andamento' else 'Novo' end
    else coalesce(m.phase,case when r.data->>'status'='Em andamento' then 'Em andamento' else 'Novo' end) end phase,
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
revoke all on function public.book_decision_number(jsonb),public.book_validate_stock_minimum(),public.book_decision_snapshot(text) from public,anon;
grant execute on function public.book_decision_number(jsonb),public.book_decision_snapshot(text) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 15; $$;
commit;
