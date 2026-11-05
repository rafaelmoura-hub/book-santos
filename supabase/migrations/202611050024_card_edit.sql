-- Repeatable card corrections; preserves status, closure, source and attachments.
begin;
create or replace function public.book_order_edit(target_id text,expected_version bigint,document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.book_records; next_data jsonb; previous_data jsonb; k text; v jsonb;
begin
 if not public.book_is_admin() or not public.book_can_tab('os') or not public.book_flow_can('ordensServico',target_id,true) then raise sqlstate '42501';end if;
 if expected_version is null or expected_version<1 or jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>20000 then raise sqlstate '22023';end if;
 for k,v in select * from jsonb_each(document) loop
  if k not in ('titulo','descricao','prioridade','vencimento') or jsonb_typeof(v)<>'string' then raise sqlstate '22023';end if;
 end loop;
 select * into r from public.book_records where collection='ordensServico' and id=target_id for update;
 if r.id is null then raise sqlstate '22023';end if;
 if not public.book_can_hotel(r.hotel) then raise sqlstate '42501';end if;
 if r.version<>expected_version then raise sqlstate 'PT409' using message='Card alterado por outra pessoa. Reabra antes de salvar.';end if;
 previous_data:=r.data;next_data:=r.data||document;if document ? 'prioridade' then next_data:=next_data||jsonb_build_object('prioridadeDefinidaPeloAdmin',true);end if;
 if length(btrim(next_data->>'titulo')) not between 1 and 200 or length(coalesce(next_data->>'descricao',''))>10000 or (document ? 'prioridade' and document->>'prioridade' not in ('Normal','Alta','Urgente')) or (document ? 'vencimento' and document->>'vencimento'<>'' and public.book_routine_date(document->>'vencimento') is null) then raise sqlstate '22023' using message='Dados do card inválidos.';end if;
 if next_data is distinct from r.data then
  update public.book_records set data=next_data,version=version+1,updated_at=now() where collection=r.collection and id=r.id returning * into r;
  insert into public.book_audit(actor_id,collection,record_id,old_data,new_data) values(auth.uid(),r.collection,r.id,previous_data,next_data);
 end if;
 return to_jsonb(r);
end $$;
-- Imported source stays immutable; administrators may correct only display fields.
create or replace function public.book_protect_partial_history()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.collection='ordensServico' and old.data#>>'{importacao,parcial}'='true' and auth.uid() is not null and new.data is distinct from old.data then
  if not public.book_is_admin() or not public.book_can_tab('os') or not public.book_can_hotel(old.hotel) or (new.data-array['titulo','descricao','prioridade','vencimento','prioridadeDefinidaPeloAdmin']) is distinct from (old.data-array['titulo','descricao','prioridade','vencimento','prioridadeDefinidaPeloAdmin']) then raise sqlstate '42501' using message='Fonte e fechamento do histórico protegidos.';end if;
 end if;
 return new;
end $$;
revoke all on function public.book_order_edit(text,bigint,jsonb) from public,anon;
grant execute on function public.book_order_edit(text,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
