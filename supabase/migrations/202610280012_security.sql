-- Defesa em profundidade: permissões por aba, arquivos e gravações da IA.
begin;
alter table public.book_records drop constraint if exists book_record_size;
alter table public.book_records add constraint book_record_size check (
 octet_length(data::text)<=case when collection='estoqueBookSantos' then 524288 else 131072 end
) not valid;

create or replace function public.book_can_read_profile(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_profiles actor where actor.id=auth.uid() and
 (actor.id=target or actor.mestre or (actor.funcao='adm' and
 (exists(select 1 from public.book_profiles p where p.id=target and p.funcao='adm' and
   (public.book_can_tab('os') or public.book_can_tab('vistorias') or public.book_can_tab('dashboard') or public.book_can_tab('chamados') or public.book_can_tab('chat')))
 or exists(select 1 from public.book_records r where r.owner_id=target and r.collection<>'estoqueBookSantos' and public.book_can_hotel(r.hotel) and public.book_can_collection(r.collection))))));
$$;
drop policy if exists book_scoped_profiles on public.book_profiles;
create policy book_scoped_profiles on public.book_profiles as restrictive for select to authenticated using(public.book_can_read_profile(id));

create or replace function public.book_can_read_file(filename text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_profiles actor where actor.id=auth.uid() and
 public.book_can_hotel(split_part(filename,'/',2)) and
 (split_part(filename,'/',1)=actor.id::text or exists(
   select 1 from public.book_records r where public.book_can_collection(r.collection) and public.book_can_hotel(r.hotel)
   and (actor.funcao='adm' or r.owner_id=actor.id)
   and exists(select 1 from (
     select v from jsonb_path_query(r.data,'$.**.dados') v
     union all select v from jsonb_path_query(r.data,'$.**.anexoData') v
   ) refs where v=to_jsonb('/api/files/'||filename))
 )));
$$;
drop policy if exists book_scoped_files on storage.objects;
create policy book_scoped_files on storage.objects as restrictive for select to authenticated using(bucket_id<>'book-attachments' or public.book_can_read_file(name));
drop policy if exists book_scoped_uploads on storage.objects;
create policy book_scoped_uploads on storage.objects as restrictive for insert to authenticated with check (
 bucket_id<>'book-attachments' or exists(select 1 from public.book_profiles p where p.id=auth.uid() and
 (p.funcao='cliente' or public.book_can_collection('chamados',true) or public.book_can_collection('ordensServico',true) or public.book_can_collection('vistorias',true) or public.book_can_collection('conversasSuporte',true)))
);
create or replace function public.book_validate_file_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare reference jsonb;
begin
 for reference in select * from jsonb_path_query(new.data,'$.**.dados') union all select * from jsonb_path_query(new.data,'$.**.anexoData') loop
  if not public.book_can_read_file(substr(reference#>>'{}',12)) then raise sqlstate '42501' using message='Sem acesso a este anexo.'; end if;
 end loop;
 return new;
end $$;
drop trigger if exists book_file_scope on public.book_records;
create trigger book_file_scope before insert or update on public.book_records for each row execute function public.book_validate_file_scope();

create or replace function public.book_ai_commit(changes jsonb,expected_stock_version bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare actual_version bigint;
begin
 if not public.book_is_admin() then raise sqlstate '42501' using message='Somente administradores.'; end if;
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>100 then raise sqlstate '22023' using message='Lote inválido.'; end if;
 -- The same transaction lock is used by all ordinary stock/order writes.
 perform pg_advisory_xact_lock(72491001);
 if expected_stock_version is not null then
  select coalesce(version,0) into actual_version from public.book_records where collection='estoqueBookSantos' and id='singleton' for update;
  if expected_stock_version<0 or coalesce(actual_version,0)<>expected_stock_version then raise sqlstate 'PT409' using message='O estoque mudou. Gere uma nova proposta.'; end if;
 end if;
 perform public.book_commit(changes);
end $$;
revoke all on function public.book_can_read_profile(uuid),public.book_can_read_file(text),public.book_validate_file_scope(),public.book_ai_commit(jsonb,bigint) from public,anon;
grant execute on function public.book_can_read_profile(uuid),public.book_can_read_file(text),public.book_ai_commit(jsonb,bigint) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 12; $$;
commit;
