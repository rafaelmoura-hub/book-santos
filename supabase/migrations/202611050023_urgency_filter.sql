-- Apply after migration 21. Preserves existing priorities and access controls.
begin;
create or replace function public.book_service_page(page_offset integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; master_access boolean:=public.book_is_master(); allowed_hotels text[]; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_is_admin() or not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem acesso aos cards.'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 or jsonb_typeof(filters) is distinct from 'object' or length(coalesce(filters->>'search',''))>200 or coalesce(filters->>'urgency','') not in ('','Normal','Alta','Urgente','unknown') then raise sqlstate '22023' using message='Filtro inválido.'; end if;
 select coalesce(array_agg(public.book_hotel_name(hotel)),array[]::text[]) into allowed_hotels from public.book_hotel_access where user_id=auth.uid();
 with source as materialized(select r.id,r.data,r.version,coalesce(m.version,0) meta_version,coalesce(m.data,'{}') meta_data,
 public.book_service_stage(r.data->>'status',m.phase) phase
 from public.book_records r left join public.book_flow_meta m on m.source=r.collection and m.record_id=r.id where r.collection='ordensServico' and (master_access or public.book_hotel_name(r.hotel)=any(allowed_hotels))),
 selected as materialized(select * from source where
 (coalesce(filters->>'urgency','')='' or (filters->>'urgency'='unknown' and ((data#>>'{importacao,parcial}'='true' and coalesce(data->>'prioridadeDefinidaPeloAdmin','false')<>'true') or coalesce(data->>'prioridade','') not in ('Normal','Alta','Urgente'))) or (filters->>'urgency' in ('Normal','Alta','Urgente') and (coalesce(data#>>'{importacao,parcial}','false')<>'true' or data->>'prioridadeDefinidaPeloAdmin'='true') and data->>'prioridade'=filters->>'urgency')) and
 (coalesce(filters->>'label','')='' or exists(select 1 from public.book_card_labels labels where labels.record_id=source.id and labels.label_ids @> array[(filters->>'label')::uuid])) and
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
notify pgrst,'reload schema';
commit;
