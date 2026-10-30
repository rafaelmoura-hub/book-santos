-- Executar como proprietário no SQL Editor, depois da migração 19.
-- O gerador injeta somente dados JSON escapados, nunca comandos da planilha.
begin;
set local statement_timeout='0';
do $$ begin
 if public.book_schema_version()<>19 then raise exception 'Esta importação requer o esquema 19.';end if;
 if not exists(select 1 from public.book_profiles where mestre) then raise exception 'Conta mestre não encontrada.';end if;
end $$;
create table if not exists public.book_history_import_backups(
 source_hash text primary key,source_file text not null,created_at timestamptz not null default now(),payload jsonb not null,imported_count integer not null
);
alter table public.book_history_import_backups enable row level security;
revoke all on public.book_history_import_backups from public,anon,authenticated;
grant select on public.book_history_import_backups to authenticated;
drop policy if exists book_history_master on public.book_history_import_backups;
create policy book_history_master on public.book_history_import_backups for select to authenticated using(public.book_is_master());
create temp table book_incoming_history(document jsonb) on commit drop;
insert into book_incoming_history values (__PAYLOAD__::jsonb);
create temp table book_incoming_cards on commit drop as
select jsonb_build_object('id',(8000000000000000+(r->>'sourceRow')::bigint)::text,
 'hotel',coalesce(r->>'inferredHotel','Condomínio a conferir'),'apartamento',coalesce(r->>'inferredApartment','A conferir'),'titulo',r->>'title',
 'descricao','Histórico parcial importado. A planilha não contém descrição, imóvel identificado, vencimento, fechamento, responsável, urgência, valores, comentários ou anexos.',
 'status',case r->>'phase' when 'Resolvido' then 'Finalizada' when 'Recusa Proprietário' then 'Recusada' when 'Cancelado' then 'Recusada' when 'Novo' then 'Aberta' else 'Em andamento' end,
 'criadaPor',coalesce(nullif(r->>'creator',''),'Não informado'),'data',to_char((r->>'createdLocal')::timestamp,'DD/MM/YYYY HH24:MI:SS'),'anexos','[]'::jsonb,
 'importacao',jsonb_build_object('parcial',true,'origem','Pipefy','arquivo',document->>'file','hash',document->>'hash','linha',(r->>'sourceRow')::integer,'faseOriginal',r->>'phase','criadorOriginal',r->>'creator','criadoEmLocal',r->>'createdLocal','criadoEmOriginal',r->>'createdOriginal','fusoFonte','Não informado','condominioPeloTitulo',r->>'inferredHotel','apartamentoPeloTitulo',r->>'inferredApartment','siglaConfirmada',r->>'confirmedCode','regraImovel','numero-inicial; UQ=Unique Residence; v1'))
 ||case when r->>'phase' in ('Recusa Proprietário','Cancelado') then jsonb_build_object('motivoRecusa','Fase de origem: '||(r->>'phase')||'. Motivo detalhado não informado.') else '{}'::jsonb end data
from book_incoming_history,jsonb_array_elements(document->'rows') r;
do $$ begin
 if exists(select 1 from public.book_history_import_backups b,book_incoming_history s where b.source_hash=s.document->>'hash') then raise exception 'Este arquivo já foi importado. Nada foi substituído.';end if;
 if (select count(*) from book_incoming_cards)<>(select (document->>'count')::integer from book_incoming_history) or exists(select 1 from book_incoming_cards where data->>'status' not in ('Aberta','Em andamento','Recusada','Finalizada') or data->>'id' !~ '^[0-9]{1,16}$' or nullif(data->>'titulo','') is null) then raise exception 'Dados de importação inválidos.';end if;
 if (select count(*) from book_incoming_cards)<>(select count(distinct data->>'id') from book_incoming_cards) then raise exception 'Identificadores duplicados.';end if;
end $$;
-- A cópia e a substituição ficam na mesma transação. Falhas desfazem tudo.
lock table public.book_records,public.book_flow_meta,public.book_flow_events,public.book_inspection_services,public.book_feedbacks,public.book_processes,public.book_audit in share row exclusive mode;
insert into public.book_history_import_backups(source_hash,source_file,imported_count,payload)
select document->>'hash',document->>'file',(document->>'count')::integer,jsonb_build_object(
 'records',coalesce((select jsonb_agg(to_jsonb(r)) from public.book_records r where collection='ordensServico'),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(a)) from public.book_audit a where collection='ordensServico'),'[]'),
 'flow_meta',coalesce((select jsonb_agg(to_jsonb(m)) from public.book_flow_meta m where source='ordensServico'),'[]'),
 'flow_events',coalesce((select jsonb_agg(to_jsonb(e)) from public.book_flow_events e where source='ordensServico'),'[]'),
 'inspection_links',coalesce((select jsonb_agg(to_jsonb(l)) from public.book_inspection_services l),'[]'),
 'feedbacks',coalesce((select jsonb_agg(to_jsonb(f)) from public.book_feedbacks f where service_id is not null),'[]'),
 'processes',coalesce((select jsonb_agg(to_jsonb(p)) from public.book_processes p where service_id is not null),'[]')) from book_incoming_history;
-- Não apaga usuários, apartamentos, vistorias, estoque, chamados de clientes ou arquivos.
update public.book_feedbacks set service_id=null,version=version+1 where service_id in(select id from public.book_records where collection='ordensServico');
update public.book_processes set service_id=null,version=version+1 where service_id in(select id from public.book_records where collection='ordensServico');
delete from public.book_inspection_services where service_id in(select id from public.book_records where collection='ordensServico');
delete from public.book_flow_events where source='ordensServico';
delete from public.book_flow_meta where source='ordensServico';
delete from public.book_audit where collection='ordensServico';
delete from public.book_records where collection='ordensServico';
-- Somente esta carga de manutenção aceita imóvel ausente. A trava impede
-- gravações concorrentes, e o validador volta antes do commit (ou no rollback).
alter table public.book_records disable trigger book_validate_record;
alter table public.book_records disable trigger book_card_state;
insert into public.book_records(collection,id,data,owner_id,hotel,version)
select 'ordensServico',data->>'id',data,(select id from public.book_profiles where mestre order by id limit 1),nullif(data->>'hotel','Condomínio a conferir'),1 from book_incoming_cards;
insert into public.book_flow_meta(source,record_id,phase,data)
select 'ordensServico',data->>'id',case data->>'status' when 'Finalizada' then 'Resolvido' when 'Recusada' then 'Recusa proprietário' when 'Em andamento' then 'Em andamento' else 'Novo' end,
case when data->>'status'='Recusada' then jsonb_build_object('motivo',data->>'motivoRecusa') else '{}'::jsonb end from book_incoming_cards;
alter table public.book_records enable trigger book_card_state;
alter table public.book_records enable trigger book_validate_record;
-- Importação é um evento de manutenção, não uma criação/conclusão ocorrida hoje.
insert into public.book_audit(actor_id,collection,record_id,old_data,new_data)
select owner_id,collection,id,data,data from public.book_records where collection='ordensServico';
create or replace function public.book_protect_partial_history()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.collection='ordensServico' and old.data#>>'{importacao,parcial}'='true' and auth.uid() is not null and new.data is distinct from old.data then raise sqlstate '42501' using message='Histórico parcial: confira os dados do imóvel antes de transformar este registro em card operacional.';end if;
 return new;
end $$;
revoke all on function public.book_protect_partial_history() from public,anon,authenticated;
drop trigger if exists book_partial_history on public.book_records;
create trigger book_partial_history before update on public.book_records for each row execute function public.book_protect_partial_history();
__REPORT_FUNCTIONS__
do $$ begin
 if (select count(*) from public.book_records where collection='ordensServico')<>(select (document->>'count')::integer from book_incoming_history) then raise exception 'Contagem final incorreta. Importação desfeita.';end if;
end $$;
select data->>'status' status,count(*) quantidade from public.book_records where collection='ordensServico' group by 1 order by 1;
commit;
