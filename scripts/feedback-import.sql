-- Adiciona feedbacks sem substituir registros existentes. Executar como proprietário.
begin;
set local statement_timeout='0';
do $$ begin
 if public.book_schema_version()<19 then raise exception 'Aplique antes a migração 19.';end if;
 if not exists(select 1 from public.book_profiles where mestre) then raise exception 'Conta mestre não encontrada.';end if;
end $$;
create temp table incoming_feedbacks on commit drop as
 select payload::jsonb doc from public.book_history_import_stage where source_hash=__HASH__;
do $$ begin
 if (select count(*) from incoming_feedbacks)<>__COUNT__ or exists(select 1 from incoming_feedbacks where doc->'data'->'importacao'->>'hash' is distinct from __HASH__ or doc->>'phase' not in ('Feedback','Em andamento','Concluído') or nullif(doc->'data'->>'assunto','') is null) then raise exception 'Carga incompleta ou inválida. Nenhum feedback importado.';end if;
 if (select count(distinct doc->>'id') from incoming_feedbacks)<>__COUNT__ then raise exception 'Identificadores duplicados.';end if;
end $$;
lock table public.book_feedbacks,public.book_flow_meta,public.book_flow_events in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.book_feedbacks where data#>>'{importacao,hash}'=__HASH__) or exists(select 1 from incoming_feedbacks i join public.book_feedbacks f on f.id=(i.doc->>'id')::uuid) or exists(select 1 from incoming_feedbacks i join public.book_flow_meta m on m.source='feedbacks' and m.record_id=i.doc->>'id') then raise exception 'Carga já importada ou identificador em uso. Nenhuma alteração.';end if;
end $$;
insert into public.book_feedbacks(id,owner_id,hotel,data,created_at,updated_at)
select (doc->>'id')::uuid,(select id from public.book_profiles where mestre order by id limit 1),doc->'data'->>'hotel',doc->'data',
 (doc#>>'{data,importacao,criadoEmLocal}')::timestamp at time zone 'America/Sao_Paulo',
 coalesce(doc#>>'{data,importacao,finalizadoEmLocal}',doc#>>'{data,importacao,criadoEmLocal}')::timestamp at time zone 'America/Sao_Paulo'
from incoming_feedbacks;
-- Datas locais originais permanecem no JSON; fuso não informado pela fonte.
insert into public.book_flow_meta(source,record_id,phase,data)
select 'feedbacks',doc->>'id',doc->>'phase',jsonb_build_object('respostaCliente',doc->>'response') from incoming_feedbacks;
insert into public.book_audit(actor_id,collection,record_id,old_data,new_data)
select owner_id,'feedbacks',id::text,data,data from public.book_feedbacks where data#>>'{importacao,hash}'=__HASH__;
create or replace function public.book_protect_feedback_history()
returns trigger language plpgsql set search_path='' as $$ begin
 if old.data#>>'{importacao,parcial}'='true' and auth.uid() is not null then raise sqlstate '42501' using message='Histórico importado: confira o imóvel antes de editar ou criar serviço.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.book_protect_feedback_history() from public,anon,authenticated;
drop trigger if exists book_feedback_history on public.book_feedbacks;
create trigger book_feedback_history before update or delete on public.book_feedbacks for each row execute function public.book_protect_feedback_history();
select doc->>'phase' fase,count(*) quantidade from incoming_feedbacks group by 1 order by 1;
commit;
