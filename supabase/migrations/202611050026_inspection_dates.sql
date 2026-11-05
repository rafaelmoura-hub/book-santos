-- Datas de controle da planilha, sem criar checklists ou conclusoes ficticias.
begin;
do $$ begin if to_regclass('public.book_apartment_details') is null then raise exception 'Aplique a migracao 25 primeiro.';end if;end $$;
create table if not exists public.book_inspection_controls(
 hotel text not null,apartment text not null,track text not null check(track in ('general','governance')),
 last_date date not null,next_date date not null,scheduled_date date,interval_days integer not null check(interval_days between 1 and 366),
 inspection_kind text not null default '',responsible text not null default '',source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 source_sheet text not null,source_row integer not null check(source_row>=2),updated_at timestamptz not null default now(),
 primary key(hotel,apartment,track),foreign key(hotel,apartment) references public.book_apartments(hotel,apartment),check(next_date>=last_date)
);
alter table public.book_inspection_controls enable row level security;
revoke all on public.book_inspection_controls from public,anon,authenticated;
grant select on public.book_inspection_controls to authenticated;
drop policy if exists book_inspection_controls_read on public.book_inspection_controls;
create policy book_inspection_controls_read on public.book_inspection_controls for select to authenticated using(public.book_is_admin() and public.book_can_tab('vistorias') and public.book_can_hotel(hotel));
create or replace function public.book_inspection_coverage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; result jsonb;
begin
 if not public.book_is_admin() or not public.book_can_tab('vistorias') then raise sqlstate '42501';end if;
 with latest as(
  select public.book_hotel_name(r.hotel) hotel,r.data->>'apartamento' apartment,
   case when r.data->>'inspectionTrack'='governance' then 'governance' else 'general' end track,
   max(public.book_routine_date(r.data->>'data')) last_date
  from public.book_records r where r.collection='vistorias' and public.book_can_hotel(r.hotel)
  and public.book_routine_date(r.data->>'data')<=today group by 1,2,3
 ), active as(select a.hotel,a.apartment from public.book_apartments a join public.book_condominiums c on c.name=a.hotel
  where a.archived_at is null and c.archived_at is null and public.book_can_hotel(a.hotel)),
 tracks as(select hotel,apartment,'general'::text track from active
  union select a.hotel,a.apartment,'governance' from active a where exists(select 1 from public.book_inspection_controls c where c.hotel=a.hotel and c.apartment=a.apartment and c.track='governance')
  or exists(select 1 from latest l where l.hotel=a.hotel and l.apartment=a.apartment and l.track='governance')),
 dates as(select t.hotel,t.apartment,t.track,
  case when c.hotel is not null and (l.last_date is null or l.last_date<=c.last_date) then c.last_date else l.last_date end last_date,
  case when c.hotel is not null and (l.last_date is null or l.last_date<=c.last_date) then c.next_date
   when c.hotel is not null then l.last_date+c.interval_days
   when t.track='governance' then l.last_date+45 else (l.last_date+interval '3 months')::date end due_date,
  c.scheduled_date
  from tracks t left join latest l on l.hotel=t.hotel and l.apartment=t.apartment and l.track=t.track
  left join public.book_inspection_controls c on c.hotel=t.hotel and c.apartment=t.apartment and c.track=t.track),
 checks as(select *,case when due_date is null then 'missing' when due_date<today then 'overdue' else 'current' end status from dates),
 rows as(select hotel,apartment,
  (array_agg(last_date order by due_date nulls first,track))[1] last_date,
  min(due_date) due_date,
  case when bool_or(status='overdue') then 'overdue' when bool_or(status='missing') then 'missing' else 'current' end status,
  jsonb_agg(jsonb_build_object('track',track,'last_date',last_date,'due_date',due_date,'scheduled_date',scheduled_date,'status',status) order by track) checks
  from checks group by hotel,apartment)
 select jsonb_build_object('referenceDate',today,'rule','next_date_before_today','rows',coalesce((select jsonb_agg(to_jsonb(r) order by hotel,apartment) from rows r),'[]'),
  'counts',jsonb_build_object('missing',(select count(*) from rows where status='missing'),'overdue',(select count(*) from rows where status='overdue'),'current',(select count(*) from rows where status='current'),'total',(select count(*) from rows))) into result;
 return result;
end $$;
revoke all on function public.book_inspection_coverage() from public,anon;
grant execute on function public.book_inspection_coverage() to authenticated;
notify pgrst,'reload schema';
commit;
