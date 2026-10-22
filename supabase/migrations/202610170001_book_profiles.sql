-- Execute no SQL Editor do projeto Supabase. Não altera as tabelas do protótipo local.
begin;
create table if not exists public.book_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  login text not null unique check (length(login) between 3 and 254),
  funcao text not null default 'cliente' check (funcao in ('adm','cliente')),
  mestre boolean not null default false,
  created_at timestamptz not null default now(),
  constraint book_master_is_admin check (not mestre or funcao = 'adm')
);
alter table public.book_profiles enable row level security;

-- Security definer avoids recursive policies; no authorization comes from user_metadata.
create or replace function public.book_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.book_profiles where id = auth.uid() and funcao = 'adm'); $$;
revoke all on function public.book_is_admin() from public, anon;
grant execute on function public.book_is_admin() to authenticated;

revoke all on public.book_profiles from anon, authenticated;
grant select on public.book_profiles to authenticated;
drop policy if exists book_read_profile on public.book_profiles;
create policy book_read_profile on public.book_profiles for select to authenticated
using (id = (select auth.uid()) or (select public.book_is_admin()));

-- Profiles are provisioned by the project owner in SQL Editor/Table Editor.
-- No automatic first-user administrator; no anonymous signup receives company access.
-- Users cannot insert, update, delete or promote themselves through the Data API.
commit;
