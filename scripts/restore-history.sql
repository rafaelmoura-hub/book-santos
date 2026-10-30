-- Restaura a cópia anterior somente se nenhum card novo foi criado após a carga.
begin;
lock table public.book_records,public.book_flow_meta,public.book_flow_events,public.book_inspection_services,public.book_feedbacks,public.book_processes,public.book_audit in share row exclusive mode;
create temp table book_restore_history on commit drop as select * from public.book_history_import_backups where source_hash=__HASH__;
do $$ begin
 if (select count(*) from book_restore_history)<>1 then raise exception 'Backup não encontrado.';end if;
 if exists(select 1 from public.book_records where collection='ordensServico' and (data#>>'{importacao,hash}' is distinct from __HASH__ or data#>>'{importacao,parcial}' is distinct from 'true')) then raise exception 'Existem cards posteriores ou de outra origem. Restauração automática interrompida.';end if;
 if exists(select 1 from public.book_flow_events where source='ordensServico') then raise exception 'O histórico recebeu atividades ou comentários. Exporte esses dados antes de restaurar.';end if;
 if (select count(*) from public.book_records where collection='ordensServico')<>(select imported_count from book_restore_history) then raise exception 'O conjunto de cards foi alterado. Confira antes de restaurar.';end if;
end $$;
delete from public.book_flow_events where source='ordensServico';
delete from public.book_flow_meta where source='ordensServico';
delete from public.book_audit where collection='ordensServico';
delete from public.book_records where collection='ordensServico';
-- Restaura somente documentos da cópia protegida, sob a trava desta transação.
alter table public.book_records disable trigger book_validate_record;
alter table public.book_records disable trigger book_file_scope;
insert into public.book_records select r.* from book_restore_history b,jsonb_populate_recordset(null::public.book_records,b.payload->'records') r;
alter table public.book_records enable trigger book_file_scope;
alter table public.book_records enable trigger book_validate_record;
insert into public.book_flow_meta select r.* from book_restore_history b,jsonb_populate_recordset(null::public.book_flow_meta,b.payload->'flow_meta') r
on conflict(source,record_id) do update set phase=excluded.phase,data=excluded.data,version=excluded.version,updated_at=excluded.updated_at;
insert into public.book_flow_events overriding system value select r.* from book_restore_history b,jsonb_populate_recordset(null::public.book_flow_events,b.payload->'flow_events') r;
insert into public.book_audit overriding system value select r.* from book_restore_history b,jsonb_populate_recordset(null::public.book_audit,b.payload->'audit') r;
insert into public.book_inspection_services select r.* from book_restore_history b,jsonb_populate_recordset(null::public.book_inspection_services,b.payload->'inspection_links') r on conflict(inspection_id) do nothing;
do $$ begin
 if exists(select 1 from public.book_feedbacks f,book_restore_history b,jsonb_populate_recordset(null::public.book_feedbacks,b.payload->'feedbacks') r where f.id=r.id and f.service_id is null and f.version<>r.version+1) or exists(select 1 from public.book_processes p,book_restore_history b,jsonb_populate_recordset(null::public.book_processes,b.payload->'processes') r where p.id=r.id and p.service_id is null and p.version<>r.version+1) then raise exception 'Um vínculo foi editado após a importação. Restauração desfeita.';end if;
end $$;
update public.book_feedbacks f set service_id=r.service_id,version=f.version+1 from book_restore_history b,jsonb_populate_recordset(null::public.book_feedbacks,b.payload->'feedbacks') r where f.id=r.id and f.service_id is null;
update public.book_processes p set service_id=r.service_id,version=p.version+1 from book_restore_history b,jsonb_populate_recordset(null::public.book_processes,b.payload->'processes') r where p.id=r.id and p.service_id is null;
select count(*) cards_restaurados from public.book_records where collection='ordensServico';
commit;
