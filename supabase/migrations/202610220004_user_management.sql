begin;
alter table public.book_profiles add column if not exists version bigint not null default 1;

create or replace function public.book_is_master()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.book_profiles where id=auth.uid() and funcao='adm' and mestre); $$;
revoke all on function public.book_is_master() from public,anon;
grant execute on function public.book_is_master() to authenticated;

drop policy if exists book_read_access on public.book_hotel_access;
create policy book_read_access on public.book_hotel_access for select to authenticated
using(user_id=auth.uid() or public.book_is_master());

create table if not exists public.book_user_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  user_id uuid not null,
  old_data jsonb,
  new_data jsonb not null,
  happened_at timestamptz not null default now()
);
alter table public.book_user_audit enable row level security;
revoke all on public.book_user_audit from public,anon,authenticated;
grant select on public.book_user_audit to authenticated;
drop policy if exists book_read_user_audit on public.book_user_audit;
create policy book_read_user_audit on public.book_user_audit for select to authenticated using(public.book_is_master());

create or replace function public.book_manage_user(target_id uuid, display_name text, role_name text, hotels text[], expected_version bigint)
returns void language plpgsql security definer set search_path=''
as $$
declare previous public.book_profiles; email text; old_hotels jsonb;
begin
  -- Do not trust user_metadata or privileges asserted by the request body.
  if not public.book_is_master() then raise sqlstate '42501' using message='Somente o administrador mestre pode gerenciar usuários.'; end if;
  if target_id is null or coalesce(length(trim(display_name)),0) not between 1 and 120 or
    role_name is null or role_name not in ('adm','cliente') or expected_version is null or expected_version<0 or
    hotels is null or cardinality(hotels)>2 or exists(select 1 from unnest(hotels) h where h is null or h not in ('Unlimited','Unique')) then
    raise sqlstate '22023' using message='Nome, função ou hotéis inválidos.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book-user:'||target_id::text,0));
  select * into previous from public.book_profiles where id=target_id for update;
  if previous.mestre then raise sqlstate '42501' using message='O administrador mestre está protegido.'; end if;
  if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='Usuário alterado por outra pessoa. Atualize a lista.'; end if;
  select lower(u.email) into email from auth.users u where u.id=target_id;
  if email is null then raise sqlstate '22023' using message='Conta de autenticação não encontrada.'; end if;
  select coalesce(jsonb_agg(hotel order by hotel),'[]') into old_hotels from public.book_hotel_access where user_id=target_id;
  insert into public.book_profiles(id,nome,login,funcao,mestre,version)
    values(target_id,trim(display_name),email,role_name,false,1)
    on conflict(id) do update set nome=excluded.nome,funcao=excluded.funcao,version=book_profiles.version+1;
  delete from public.book_hotel_access where user_id=target_id;
  insert into public.book_hotel_access(user_id,hotel) select target_id,h from (select distinct unnest(hotels) h) selected;
  insert into public.book_user_audit(actor_id,user_id,old_data,new_data)
    values(auth.uid(),target_id,case when previous.id is null then null else to_jsonb(previous)||jsonb_build_object('hotels',old_hotels) end,
      jsonb_build_object('nome',trim(display_name),'login',coalesce(previous.login,email),'funcao',role_name,'hotels',to_jsonb(hotels)));
end;
$$;
revoke all on function public.book_manage_user(uuid,text,text,text[],bigint) from public,anon;
grant execute on function public.book_manage_user(uuid,text,text,text[],bigint) to authenticated;
commit;
