-- Usar somente se o histórico desta planilha já foi importado.
-- Atualiza imóveis sem apagar cards, comentários, datas, status ou demais dados.
begin;
set local statement_timeout='0';
create temp table book_location_input(document jsonb) on commit drop;
insert into book_location_input values (__PAYLOAD__::jsonb);
lock table public.book_records in share row exclusive mode;
do $$ begin
 if (select count(*) from public.book_records r,book_location_input s where r.collection='ordensServico' and r.data#>>'{importacao,hash}'=s.document->>'hash' and r.data#>>'{importacao,parcial}'='true')<>(select (document->>'count')::integer from book_location_input) then raise exception 'O histórico completo deste arquivo não foi encontrado. Não execute este ajuste antes da importação.';end if;
end $$;
create table if not exists public.book_history_location_backups(source_hash text primary key,created_at timestamptz not null default now(),records jsonb not null);
alter table public.book_history_location_backups enable row level security;
revoke all on public.book_history_location_backups from public,anon,authenticated;
grant select on public.book_history_location_backups to authenticated;
drop policy if exists book_history_location_master on public.book_history_location_backups;
create policy book_history_location_master on public.book_history_location_backups for select to authenticated using(public.book_is_master());
insert into public.book_history_location_backups(source_hash,records)
select s.document->>'hash',coalesce(jsonb_agg(to_jsonb(r)),'[]') from book_location_input s join public.book_records r on r.collection='ordensServico' and r.data#>>'{importacao,hash}'=s.document->>'hash' group by s.document->>'hash' on conflict do nothing;
create temp table book_location_changes on commit drop as
select r.id,coalesce(x->>'inferredHotel',r.hotel) hotel,r.data||jsonb_build_object('hotel',coalesce(x->>'inferredHotel',r.hotel,r.data->>'hotel','Condomínio a conferir'),'apartamento',coalesce(x->>'inferredApartment',r.data->>'apartamento','A conferir'),'importacao',r.data->'importacao'||jsonb_build_object('condominioPeloTitulo',x->>'inferredHotel','apartamentoPeloTitulo',x->>'inferredApartment','siglaConfirmada',x->>'confirmedCode','regraImovel','numero-inicial; UQ=Unique Residence; v1')) doc
from book_location_input s,jsonb_array_elements(s.document->'rows') x,public.book_records r
where r.collection='ordensServico' and r.id=(8000000000000000+(x->>'sourceRow')::bigint)::text and r.data#>>'{importacao,hash}'=s.document->>'hash' and r.data#>>'{importacao,linha}'=x->>'sourceRow';
do $$ begin
 if (select count(*) from book_location_changes)<>(select (document->>'count')::integer from book_location_input) then raise exception 'Nem todos os cards correspondem às linhas da planilha. Ajuste desfeito.';end if;
end $$;
alter table public.book_records disable trigger book_validate_record;
update public.book_records r set data=c.doc,hotel=c.hotel,version=r.version+1,updated_at=now() from book_location_changes c
where r.collection='ordensServico' and r.id=c.id and (r.data is distinct from c.doc or r.hotel is distinct from c.hotel);
alter table public.book_records enable trigger book_validate_record;
select count(*) total,count(*) filter(where hotel='Unique Residence') unique_residence,count(*) filter(where data->>'apartamento'<>'A conferir') apartamentos_identificados
from public.book_records where collection='ordensServico' and data#>>'{importacao,hash}'=(select document->>'hash' from book_location_input);
commit;
