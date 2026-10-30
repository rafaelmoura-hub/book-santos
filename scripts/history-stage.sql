-- Etapa 1: prepara somente uma tabela de carga. Não altera os cards atuais.
begin;
create table if not exists public.book_history_import_stage(
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 source_line integer not null check(source_line>=2),
 payload text not null check(jsonb_typeof(payload::jsonb)='object'),
 primary key(source_hash,source_line),
 check((payload::jsonb->>'sourceRow')::integer=source_line)
);
alter table public.book_history_import_stage enable row level security;
revoke all on public.book_history_import_stage from public,anon,authenticated;
grant select on public.book_history_import_stage to authenticated;
drop policy if exists book_history_stage_master on public.book_history_import_stage;
create policy book_history_stage_master on public.book_history_import_stage for select to authenticated using(public.book_is_master());
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant select,insert,update,delete on public.book_history_import_stage to service_role;
 end if;
end $$;
-- Reexecutar esta preparação limpa somente a carga deste arquivo, para permitir
-- repetir um upload incompleto. Não apaga cards nem backups.
delete from public.book_history_import_stage where source_hash=__HASH__;
select count(*) linhas_na_carga from public.book_history_import_stage where source_hash=__HASH__;
commit;
