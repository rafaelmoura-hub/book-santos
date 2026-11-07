-- Metadados publicos de prontidao; nao consulta registros nem credenciais.
begin;
create or replace function public.book_release_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('release',29,'ready',
  public.book_schema_version()>=19
  and to_regprocedure('public.book_backup_v27(text[])') is not null
  and to_regprocedure('public.book_labels_catalog(text,text)') is not null
  and to_regprocedure('public.book_order_edit(text,bigint,jsonb)') is not null
  and to_regprocedure('public.book_mfa_allowed()') is not null
  and to_regprocedure('public.book_inspection_coverage()') is not null
  and to_regclass('public.book_inspection_controls') is not null
  and to_regclass('public.book_apartment_details') is not null
  and exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.oid=to_regprocedure('public.book_apartment_info(text,text,bigint,jsonb)') and position('accessNotes' in p.prosrc)>0)
 );
$$;
revoke all on function public.book_release_status() from public;
grant execute on function public.book_release_status() to anon,authenticated;
notify pgrst,'reload schema';
commit;
