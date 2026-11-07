-- Inclui os dados novos na exportacao privada exclusiva do mestre.
begin;
do $$ begin
 if to_regclass('public.book_inspection_controls') is null or to_regclass('public.book_apartment_details') is null then raise exception 'Aplique as migracoes 25 a 27 primeiro.';end if;
 if to_regprocedure('public.book_backup_v27(text[])') is null then alter function public.book_backup(text[]) rename to book_backup_v27;end if;
end $$;
revoke all on function public.book_backup_v27(text[]) from public,anon,authenticated;
create or replace function public.book_backup(selected text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.book_is_master() then raise sqlstate '42501';end if;
 result:=public.book_backup_v27(selected);
 if 'cadastros'=any(selected) then
  result:=result||jsonb_build_object(
   'condominiums',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.book_condominiums c),'[]'),
   'apartments',coalesce((select jsonb_agg(to_jsonb(a) order by a.hotel,a.apartment) from public.book_apartments a),'[]'),
   'apartment_details',coalesce((select jsonb_agg(to_jsonb(d) order by d.hotel,d.apartment) from public.book_apartment_details d),'[]'));
 end if;
 if 'vistorias'=any(selected) then
  result:=result||jsonb_build_object('inspection_controls',coalesce((select jsonb_agg(to_jsonb(c) order by c.hotel,c.apartment,c.track) from public.book_inspection_controls c),'[]'));
 end if;
 if 'auditoria'=any(selected) then
  result:=result||jsonb_build_object('apartment_details_audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.book_apartment_details_audit a),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.book_backup(text[]) from public,anon;
grant execute on function public.book_backup(text[]) to authenticated;
notify pgrst,'reload schema';
commit;
