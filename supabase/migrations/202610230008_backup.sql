begin;

-- Application data snapshot, not a dump of Supabase Auth credentials or SQL schema.
create or replace function public.book_backup(selected text[])
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if not public.book_is_master() then raise sqlstate '42501' using message='Somente o administrador mestre pode fazer backup.'; end if;
  if selected is null or cardinality(selected)=0 or cardinality(selected)>8 or
    exists(select 1 from unnest(selected) s where s is null or s not in ('chamados','ordensServico','vistorias','estoqueBookSantos','conversasSuporte','cadastros','auditoria','anexos')) then
    raise sqlstate '22023' using message='Opções de backup inválidas.';
  end if;
  select jsonb_build_object(
    'exported_at',now(), 'schema_version',public.book_schema_version(),
    'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.collection,r.id) from public.book_records r where r.collection=any(selected)),'[]'::jsonb),
    'profiles',case when 'cadastros'=any(selected) then coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.book_profiles p),'[]'::jsonb) else '[]'::jsonb end,
    'access',case when 'cadastros'=any(selected) then coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id,a.hotel) from public.book_hotel_access a),'[]'::jsonb) else '[]'::jsonb end,
    'apartments',case when 'cadastros'=any(selected) then coalesce((select jsonb_agg(to_jsonb(a) order by a.hotel,a.apartment) from public.book_apartments a),'[]'::jsonb) else '[]'::jsonb end,
    'audit',case when 'auditoria'=any(selected) then coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.book_audit a),'[]'::jsonb) else '[]'::jsonb end,
    'user_audit',case when 'auditoria'=any(selected) then coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.book_user_audit a),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;
revoke all on function public.book_backup(text[]) from public,anon;
grant execute on function public.book_backup(text[]) to authenticated;
commit;
