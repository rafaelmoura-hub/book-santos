-- Abas autorizadas e reabertura de cards, com validação no banco.
begin;
alter table public.book_profiles add column if not exists tabs text[] not null default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard'];
create or replace function public.book_can_tab(tab_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_profiles where id=auth.uid() and funcao='adm' and (mestre or tab_name=any(tabs)));
$$;
create or replace function public.book_can_collection(col text, writing boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_profiles p where p.id=auth.uid() and (
 (p.funcao='cliente' and col in ('chamados','conversasSuporte')) or (p.funcao='adm' and (p.mestre or
 case when writing then public.book_can_tab(case col when 'chamados' then 'chamados' when 'conversasSuporte' then 'chat' when 'ordensServico' then 'os' when 'vistorias' then 'vistorias' when 'estoqueBookSantos' then 'estoque' end)
 else case col
 when 'chamados' then p.tabs && array['chamados','chat','os','condominios','dashboard']
 when 'conversasSuporte' then 'chat'=any(p.tabs)
 when 'ordensServico' then p.tabs && array['os','vistorias','condominios','financeiro','dashboard','estoque']
 when 'vistorias' then 'vistorias'=any(p.tabs)
 when 'estoqueBookSantos' then p.tabs && array['estoque','os'] else false end end))));
$$;
revoke all on function public.book_can_tab(text),public.book_can_collection(text,boolean) from public,anon;
grant execute on function public.book_can_tab(text),public.book_can_collection(text,boolean) to authenticated;
drop policy if exists book_tabs_records on public.book_records;
create policy book_tabs_records on public.book_records as restrictive for select to authenticated using(public.book_can_collection(collection));
drop policy if exists book_tabs_audit on public.book_audit;
create policy book_tabs_audit on public.book_audit as restrictive for select to authenticated using(public.book_can_collection(collection));
do $$ begin
 if to_regprocedure('public.book_manage_user_v9(uuid,text,text,text[],bigint)') is null then
 alter function public.book_manage_user(uuid,text,text,text[],bigint) rename to book_manage_user_v9;
 end if;
 if to_regprocedure('public.book_commit_v9(jsonb)') is null then alter function public.book_commit(jsonb) rename to book_commit_v9; end if;
end $$;
revoke all on function public.book_manage_user_v9(uuid,text,text,text[],bigint),public.book_commit_v9(jsonb) from public,anon,authenticated;
revoke all on function public.book_finance(text,text,integer) from public,anon,authenticated;
create or replace function public.book_manage_user(target_id uuid,display_name text,role_name text,hotels text[],expected_version bigint,selected_tabs text[] default array['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard'])
returns void language plpgsql security definer set search_path='' as $$
declare previous_tabs text[];
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre gerencia usuários.'; end if;
 if selected_tabs is null or cardinality(selected_tabs)>8 or exists(select 1 from unnest(selected_tabs) t where t is null or t not in ('chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard')) then raise sqlstate '22023' using message='Abas inválidas.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('book-user:'||target_id::text,0));
 select tabs into previous_tabs from public.book_profiles where id=target_id;
 perform public.book_manage_user_v9(target_id,display_name,role_name,hotels,expected_version);
 update public.book_profiles set tabs=case when role_name='adm' then selected_tabs else '{}'::text[] end where id=target_id;
 insert into public.book_user_audit(actor_id,user_id,old_data,new_data) values(auth.uid(),target_id,jsonb_build_object('tabs',previous_tabs),jsonb_build_object('tabs',case when role_name='adm' then selected_tabs else '{}'::text[] end));
end $$;
create or replace function public.book_commit(changes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 if jsonb_typeof(changes) is distinct from 'array' then raise sqlstate '22023' using message='Lote inválido.'; end if;
 for c in select value from jsonb_array_elements(changes) loop
 if not public.book_can_collection(c->>'collection',true) then raise sqlstate '42501' using message='Sem permissão para alterar esta aba.'; end if;
 end loop;
 perform public.book_commit_v9(changes);
end $$;
create or replace function public.book_finance_history(payer text default null,cursor_id text default null,page_size integer default 50,start_date date default null,end_date date default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.book_can_tab('financeiro') then raise sqlstate '42501' using message='Sem acesso ao financeiro.'; end if;
 if page_size is null or page_size not between 1 and 100 or length(payer)>200 or length(cursor_id)>200 or (start_date is null)<>(end_date is null) or (start_date is not null and start_date>=end_date) then raise sqlstate '22023' using message='Período ou consulta inválida.'; end if;
 with dated as materialized (
 select id,data,public.book_finance_date(data) financial_date from public.book_records where collection='ordensServico'
 ), source as materialized (
 select id,data->>'hotel' hotel,data->>'apartamento' apartment,data->>'titulo' title,data->>'descricao' description,coalesce(data->>'status','Aberta') status,financial_date,
 coalesce(nullif(trim(data#>>'{fechamento,responsavelPagamento}'),''),'Sem responsável') responsible,
 public.book_money(data#>'{fechamento,valorServico}',false) service,public.book_money(data#>'{fechamento,valorMaterial}',false) material,
 case when data#>'{fechamento,custoTotal}' is null or data#>'{fechamento,custoTotal}'='null'::jsonb then public.book_money(data#>'{fechamento,valorServico}',false)+public.book_money(data#>'{fechamento,valorMaterial}',false) else public.book_money(data#>'{fechamento,custoTotal}',false) end total
 from dated where start_date is null or (financial_date>=start_date and financial_date<end_date)
 ), grouped as (
 select responsible,count(*) count,sum(total) total,coalesce(sum(total) filter(where status='Finalizada'),0) finalized,coalesce(sum(total) filter(where status<>'Finalizada'),0) pending from source group by responsible
 ), selected as (select * from source where payer is null or responsible=payer),
 page as (select * from selected where cursor_id is null or id<cursor_id order by id desc limit page_size+1),visible as (select * from page order by id desc limit page_size)
 select jsonb_build_object(
 'groups',coalesce((select jsonb_agg(jsonb_build_object('payer',responsible,'count',count,'total',to_char(total,'FM999999999999999999999999999990.00'),'finalized',to_char(finalized,'FM999999999999999999999999999990.00'),'pending',to_char(pending,'FM999999999999999999999999999990.00')) order by responsible) from grouped),'[]'),
 'records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'hotel',hotel,'apartment',apartment,'title',title,'description',description,'status',status,'date',financial_date,'payer',responsible,'service',to_char(service,'FM999999999999990.00'),'material',to_char(material,'FM999999999999990.00'),'total',to_char(total,'FM999999999999990.00')) order by id desc) from visible),'[]'),
 'next',case when (select count(*) from page)>page_size then (select id from visible order by id asc limit 1) else null end) into result;
 return result;
end $$;
create or replace function public.book_reopen_order(record_id text,expected_version bigint,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_records; doc jsonb;
begin
 if not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem permissão para reabrir cards.'; end if;
 if coalesce(length(trim(reason)),0) not between 3 and 1000 then raise sqlstate '22023' using message='Informe o motivo da reabertura (3 a 1000 caracteres).'; end if;
 perform pg_advisory_xact_lock(72491001);
 perform pg_advisory_xact_lock(hashtextextended('ordensServico:'||record_id,0));
 select * into previous from public.book_records where collection='ordensServico' and id=record_id for update;
 if previous.id is null or not public.book_can_hotel(previous.hotel) then raise sqlstate '42501' using message='Card indisponível.'; end if;
 if expected_version is null or previous.version<>expected_version or previous.data->>'status'<>'Finalizada' then raise sqlstate 'PT409' using message='O card mudou. Atualize antes de reabrir.'; end if;
 doc:=previous.data||jsonb_build_object('status','Em andamento','reabertaEm',now(),'reabertaPor',auth.uid(),'motivoReabertura',trim(reason));
 update public.book_records set data=doc,version=version+1,updated_at=now() where collection='ordensServico' and id=record_id;
 insert into public.book_audit(actor_id,collection,record_id,old_data,new_data) values(auth.uid(),'ordensServico',record_id,previous.data,doc);
end $$;
revoke all on function public.book_manage_user(uuid,text,text,text[],bigint,text[]),public.book_commit(jsonb),public.book_finance_history(text,text,integer,date,date),public.book_reopen_order(text,bigint,text) from public,anon;
grant execute on function public.book_manage_user(uuid,text,text,text[],bigint,text[]),public.book_commit(jsonb),public.book_finance_history(text,text,integer,date,date),public.book_reopen_order(text,bigint,text) to authenticated;
commit;
