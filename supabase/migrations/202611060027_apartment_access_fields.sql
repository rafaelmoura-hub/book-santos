-- Acessos separados por finalidade. Nenhuma credencial real nesta migracao.
begin;
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
  if expected_version is null or expected_version<0 or jsonb_typeof(fields)<>'object' or octet_length(fields::text)>40000 then raise sqlstate '22023';end if;
  for k,v in select * from jsonb_each(fields) loop
   if k not in ('lockPassword','safePassword','wifiName','wifiPassword','masterPassword','cleaningPassword','governancePassword','propertyPassword','adminPassword','accessNotes') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case when k='accessNotes' then 6000 else 256 end) then raise sqlstate '22023';end if;
  end loop;
  if coalesce(r.version,0)<>expected_version then raise sqlstate 'PT409' using message='Informações alteradas por outra pessoa. Reabra antes de salvar.';end if;
  insert into public.book_apartment_details(hotel,apartment,document,updated_by) values(site,unit,fields,auth.uid())
  on conflict(hotel,apartment) do update set document=excluded.document,version=book_apartment_details.version+1,updated_by=auth.uid(),updated_at=now() returning * into r;
  -- A auditoria registra quem alterou, sem duplicar senhas em logs ou eventos.
  insert into public.book_apartment_details_audit(hotel,apartment,actor_id,version) values(site,unit,auth.uid(),r.version);
 end if;
 return jsonb_build_object('hotel',site,'apartment',unit,'version',coalesce(r.version,0),'fields',coalesce(r.document,'{}'),'updatedAt',r.updated_at);
end $$;
revoke all on function public.book_apartment_info(text,text,bigint,jsonb) from public,anon;
grant execute on function public.book_apartment_info(text,text,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
