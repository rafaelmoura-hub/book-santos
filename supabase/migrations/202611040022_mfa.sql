-- Apply after migration 21. Require AAL2 for admins with a verified TOTP factor.
-- Does not enable MFA on any account or lock out accounts without a factor.
begin;
create or replace function public.book_mfa_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.book_profiles where id=auth.uid() and funcao='adm')
 or (auth.jwt()->>'aal')='aal2'
 or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified' and factor_type='totp');
$$;
revoke all on function public.book_mfa_allowed() from public,anon;
grant execute on function public.book_mfa_allowed() to authenticated;
do $$
declare signature text; target oid; definition text; args text; fname text;
begin
 foreach signature in array array['public.book_is_admin()','public.book_is_master()','public.book_can_hotel(text)','public.book_can_tab(text)','public.book_can_collection(text,boolean)'] loop
  target:=signature::regprocedure;
  select prosrc,proname,pg_get_function_arguments(target) into definition,fname,args from pg_proc where oid=target;
  if position('public.book_mfa_allowed()' in definition)=0 then
   execute format('create or replace function public.%I(%s) returns boolean language sql stable security definer set search_path='''' as %L',fname,args,
    'select public.book_mfa_allowed() and ('||btrim(definition,E' \n\r\t;')||')');
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
