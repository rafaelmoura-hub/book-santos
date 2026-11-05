-- Informacoes privadas, remocao do catalogo sem apagar historico e cobertura trimestral.
begin;
alter table public.book_condominiums add column if not exists archived_at timestamptz;
alter table public.book_apartments add column if not exists archived_at timestamptz;
drop policy if exists book_active_condominiums on public.book_condominiums;
create policy book_active_condominiums on public.book_condominiums as restrictive for select to authenticated using(archived_at is null);
drop policy if exists book_active_apartments on public.book_apartments;
create policy book_active_apartments on public.book_apartments as restrictive for select to authenticated using(archived_at is null and exists(select 1 from public.book_condominiums c where c.name=hotel and c.archived_at is null));
create table if not exists public.book_apartment_details(
 hotel text not null,apartment text not null,document jsonb not null default '{}',version bigint not null default 1,
 updated_by uuid not null references public.book_profiles(id),updated_at timestamptz not null default now(),primary key(hotel,apartment),
 foreign key(hotel,apartment) references public.book_apartments(hotel,apartment)
);
alter table public.book_apartment_details enable row level security;
revoke all on public.book_apartment_details from public,anon,authenticated;
create table if not exists public.book_apartment_details_audit(
 id bigint generated always as identity primary key,hotel text not null,apartment text not null,actor_id uuid not null,version bigint not null,created_at timestamptz not null default now()
);
alter table public.book_apartment_details_audit enable row level security;
revoke all on public.book_apartment_details_audit from public,anon,authenticated;
create or replace function public.book_apartment_info(site text,unit text,expected_version bigint default null,fields jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.book_apartment_details; k text; v jsonb;
begin
 if not public.book_is_admin() or not public.book_can_tab('condominios') or not public.book_can_hotel(site) then raise sqlstate '42501';end if;
 perform 1 from public.book_apartments a join public.book_condominiums c on c.name=a.hotel where a.hotel=site and a.apartment=unit and a.archived_at is null and c.archived_at is null for share of a,c;
 if not found then raise sqlstate '22023' using message='Apartamento indisponível.';end if;
 perform pg_advisory_xact_lock(hashtextextended(site||chr(31)||unit,25025));
 select * into r from public.book_apartment_details where hotel=site and apartment=unit;
 if fields is not null then
  if expected_version is null or expected_version<0 or jsonb_typeof(fields)<>'object' or octet_length(fields::text)>6000 then raise sqlstate '22023';end if;
  for k,v in select * from jsonb_each(fields) loop
   if k not in ('lockPassword','safePassword','wifiName','wifiPassword') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>256 then raise sqlstate '22023';end if;
  end loop;
  if coalesce(r.version,0)<>expected_version then raise sqlstate 'PT409' using message='Informações alteradas por outra pessoa. Reabra antes de salvar.';end if;
  insert into public.book_apartment_details(hotel,apartment,document,updated_by) values(site,unit,fields,auth.uid())
  on conflict(hotel,apartment) do update set document=excluded.document,version=book_apartment_details.version+1,updated_by=auth.uid(),updated_at=now() returning * into r;
  -- A auditoria registra quem alterou, sem duplicar senhas em logs ou eventos.
  insert into public.book_apartment_details_audit(hotel,apartment,actor_id,version) values(site,unit,auth.uid(),r.version);
 end if;
 return jsonb_build_object('hotel',site,'apartment',unit,'version',coalesce(r.version,0),'fields',coalesce(r.document,'{}'),'updatedAt',r.updated_at);
end $$;
create or replace function public.book_catalog_remove(site text,unit text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if not public.book_is_admin() or not public.book_can_tab('onboarding') or not public.book_can_hotel(site) then raise sqlstate '42501';end if;
 perform pg_advisory_xact_lock(72491002);
 if unit is null then
  update public.book_condominiums set archived_at=now() where name=site and archived_at is null;
 else
  update public.book_apartments set archived_at=now() where hotel=site and apartment=unit and archived_at is null and exists(select 1 from public.book_condominiums where name=site and archived_at is null);
 end if;
 get diagnostics affected=row_count;
 if affected=0 then raise sqlstate 'PT409' using message='Imóvel já removido ou indisponível. Atualize o catálogo.';end if;
 insert into public.book_catalog_audit(actor_id,kind,hotel,apartments) values(auth.uid(),case when unit is null then 'remove_condominium' else 'remove_apartment' end,site,case when unit is null then '{}'::text[] else array[unit] end);
 return jsonb_build_object('removed',true,'hotel',site,'apartment',unit);
end $$;
create or replace function public.book_inspection_coverage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; result jsonb;
begin
 if not public.book_is_admin() or not public.book_can_tab('vistorias') then raise sqlstate '42501';end if;
 with latest as(select public.book_hotel_name(r.hotel) hotel,r.data->>'apartamento' apartment,max(public.book_routine_date(r.data->>'data')) last_date from public.book_records r
 where r.collection='vistorias' and public.book_can_hotel(r.hotel) group by 1,2),
 rows as(select a.hotel,a.apartment,l.last_date,(l.last_date+interval '3 months')::date due_date,
 case when l.last_date is null then 'missing' when (l.last_date+interval '3 months')::date<today then 'overdue' else 'current' end status
 from public.book_apartments a join public.book_condominiums c on c.name=a.hotel left join latest l on l.hotel=a.hotel and l.apartment=a.apartment
 where a.archived_at is null and c.archived_at is null and public.book_can_hotel(a.hotel))
 select jsonb_build_object('referenceDate',today,'rows',coalesce((select jsonb_agg(to_jsonb(r) order by hotel,apartment) from rows r),'[]'),
 'counts',jsonb_build_object('missing',(select count(*) from rows where status='missing'),'overdue',(select count(*) from rows where status='overdue'),'current',(select count(*) from rows where status='current'),'total',(select count(*) from rows))) into result;
 return result;
end $$;
revoke all on function public.book_apartment_info(text,text,bigint,jsonb),public.book_catalog_remove(text,text),public.book_inspection_coverage() from public,anon;
grant execute on function public.book_apartment_info(text,text,bigint,jsonb),public.book_catalog_remove(text,text),public.book_inspection_coverage() to authenticated;
notify pgrst,'reload schema';
commit;
