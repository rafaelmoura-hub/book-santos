-- Indicadores por período e remarcação atômica com comentário opcional.
-- Mantém os comentários e as prioridades existentes; não apaga registros.
begin;
do $$ begin
 if public.book_schema_version()<18 then raise exception 'Aplique antes a migração 202610290018_card_states.sql.';end if;
end $$;
create index if not exists book_activity_audit on public.book_audit(collection,happened_at,record_id);
create index if not exists book_activity_comments on public.book_flow_events(source,action,created_at,record_id);
create or replace function public.book_card_schedule(target_id text,expected_version bigint,due_date date,comment_body text default '')
returns void language plpgsql security definer set search_path='' as $$
declare r public.book_records;
begin
 if not public.book_flow_can('ordensServico',target_id,true) then raise sqlstate '42501' using message='Sem acesso ao card.';end if;
 if due_date is null or due_date<'1000-01-01'::date or due_date>'9998-12-31'::date or comment_body is null or length(comment_body)>2000 then raise sqlstate '22023' using message='Prazo ou comentário inválido.';end if;
 perform pg_advisory_xact_lock(72491001);
 select * into r from public.book_records where collection='ordensServico' and id=target_id for update;
 if r.version is distinct from expected_version then raise sqlstate 'PT409' using message='O card mudou. Atualize antes de remarcar.';end if;
 if r.data->>'status' in ('Finalizada','Recusada') then raise sqlstate '22023' using message='Reabra o card antes de alterar seu prazo.';end if;
 if r.data->>'vencimento' is not distinct from due_date::text then raise sqlstate '22023' using message='Escolha uma nova data.';end if;
 perform public.book_commit(jsonb_build_array(jsonb_build_object('collection','ordensServico','id',target_id,'version',expected_version,'data',r.data||jsonb_build_object('vencimento',due_date::text))));
 if nullif(trim(comment_body),'') is not null then perform public.book_flow_comment('ordensServico',target_id,comment_body);end if;
end $$;

create or replace function public.book_activity_snapshot(filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;today date:=(now() at time zone 'America/Sao_Paulo')::date; result jsonb; grouping text;
begin
 if not public.book_is_admin() or not public.book_can_tab('dashboard') then raise sqlstate '42501' using message='Sem acesso à visão geral.';end if;
 if jsonb_typeof(filters) is distinct from 'object' or octet_length(filters::text)>8000 then raise sqlstate '22023' using message='Filtros inválidos.';end if;
 first_day:=(filters->>'start')::date;last_day:=(filters->>'end')::date;grouping:=coalesce(filters->>'group','week');
 if first_day is null or last_day is null or first_day>last_day or last_day-first_day>7300 or grouping not in ('day','week','month','year') or coalesce(filters->>'urgency','') not in ('','Normal','Alta','Urgente') or jsonb_typeof(coalesce(filters->'assignees','[]'))<>'array' or jsonb_array_length(coalesce(filters->'assignees','[]'))>100 then raise sqlstate '22023' using message='Período ou filtros inválidos.';end if;
 if nullif(filters->>'hotel','') is not null and not public.book_can_hotel(filters->>'hotel') then raise sqlstate '42501' using message='Sem acesso ao condomínio.';end if;
 with records as materialized (
  select r.* from public.book_records r where r.collection in ('ordensServico','vistorias') and public.book_can_collection(r.collection) and public.book_can_hotel(r.hotel)
  and (coalesce(filters->>'hotel','')='' or public.book_hotel_name(r.hotel)=filters->>'hotel')
  and (r.collection='vistorias' or coalesce(filters->>'urgency','')='' or r.data->>'prioridade'=filters->>'urgency')
  and (jsonb_array_length(coalesce(filters->'assignees','[]'))=0 or coalesce(r.data->>'responsavelLogin',r.data->>'vistoriadorLogin','') in (select jsonb_array_elements_text(filters->'assignees')))
 ), changes as materialized (
  select a.*, (a.happened_at at time zone 'America/Sao_Paulo')::date event_day from public.book_audit a join records r on r.collection=a.collection and r.id=a.record_id
  where (a.happened_at at time zone 'America/Sao_Paulo')::date between first_day and last_day
 ), comments as materialized (
  select e.*, (e.created_at at time zone 'America/Sao_Paulo')::date event_day from public.book_flow_events e join records r on r.collection=e.source and r.id=e.record_id
  where e.source='ordensServico' and e.action='Comentário' and e.created_at>=(first_day::timestamp at time zone 'America/Sao_Paulo') and e.created_at<((last_day+1)::timestamp at time zone 'America/Sao_Paulo')
 ), events as materialized (
  select 'created' kind,record_id id,event_day,happened_at stamp,''::text detail from changes where collection='ordensServico' and old_data is null
  union all select 'closed',record_id,event_day,happened_at,new_data->>'status' from changes where collection='ordensServico' and new_data->>'status' in ('Finalizada','Recusada') and old_data->>'status' is distinct from new_data->>'status'
  union all select 'comments',record_id,event_day,created_at,left(body,300) from comments where event_day between first_day and last_day
  union all select 'rescheduledWithoutComment',c.record_id,c.event_day,c.happened_at,coalesce(c.old_data->>'vencimento','Sem prazo')||' → '||coalesce(c.new_data->>'vencimento','Sem prazo') from changes c where c.collection='ordensServico' and c.old_data is not null and c.old_data->>'vencimento' is distinct from c.new_data->>'vencimento' and not exists(select 1 from comments m where m.record_id=c.record_id and m.event_day=c.event_day)
  union all select 'postponed',record_id,event_day,happened_at,(old_data->>'vencimento')||' → '||(new_data->>'vencimento') from changes where collection='ordensServico' and public.book_routine_date(new_data->>'vencimento')>public.book_routine_date(old_data->>'vencimento')
  union all select 'inspections',id,public.book_routine_date(data->>'data'),updated_at,'' from records where collection='vistorias' and public.book_routine_date(data->>'data') between first_day and last_day
  union all select 'overdue',id,today,updated_at,data->>'vencimento' from records where collection='ordensServico' and coalesce(data->>'status','Aberta') not in ('Finalizada','Recusada') and public.book_routine_date(data->>'vencimento')<today
 ), metrics as (
  select kind,case when kind='comments' then count(*) else count(distinct id) end count from events group by kind
 ), rows as (
  select e.*,r.hotel,r.data->>'apartamento' apartment,coalesce(r.data->>'titulo','Vistoria #'||r.id) title,
  row_number() over(partition by e.kind order by e.stamp desc,e.id) rank from events e join records r on r.id=e.id and r.collection=case when e.kind='inspections' then 'vistorias' else 'ordensServico' end
 )
 select jsonb_build_object('referenceDate',today,'start',first_day,'end',last_day,'metrics',coalesce((select jsonb_object_agg(kind,count) from metrics),'{}'),
 'series',coalesce((select jsonb_agg(to_jsonb(s) order by s.period,s.kind) from (select date_trunc(grouping,event_day::timestamp)::date period,kind,count(*) count from events where kind<>'overdue' group by 1,2) s),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(r)-'rank' order by r.stamp desc,r.id) from rows r where rank<=100),'[]')) into result;
 return result;
end $$;
revoke all on function public.book_card_schedule(text,bigint,date,text),public.book_activity_snapshot(jsonb) from public,anon;
grant execute on function public.book_card_schedule(text,bigint,date,text),public.book_activity_snapshot(jsonb) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 19; $$;
commit;
