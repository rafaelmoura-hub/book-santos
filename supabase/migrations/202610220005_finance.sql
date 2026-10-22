begin;

-- Decimal arithmetic is authoritative in PostgreSQL. JSON monetary fields use
-- canonical decimal strings; quantities remain numeric and are not money.
create or replace function public.book_money(value jsonb, strict boolean default true)
returns numeric language plpgsql immutable set search_path=''
as $$
declare amount numeric; raw text;
begin
  if value is null or value='null'::jsonb then return 0.00; end if;
  if jsonb_typeof(value) not in ('string','number') then raise sqlstate '22023' using message='Valor monetário inválido.'; end if;
  raw:=value#>>'{}';
  if length(raw)>40 or raw !~ '^[0-9]+(\.[0-9]+)?$' then raise sqlstate '22023' using message='Informe um valor decimal positivo.'; end if;
  amount:=raw::numeric;
  if amount>999999999999.99 or (strict and amount<>round(amount,2)) then
    raise sqlstate '22023' using message='Dinheiro deve ter até duas casas decimais e respeitar o limite de valor.';
  end if;
  return round(amount,2);
end;
$$;
revoke all on function public.book_money(jsonb,boolean) from public,anon;
grant execute on function public.book_money(jsonb,boolean) to authenticated;

create or replace function public.book_money_doc(col text, doc jsonb)
returns jsonb language plpgsql immutable set search_path=''
as $$
declare item jsonb; normalized jsonb:='[]'; field text;
begin
  if col='estoqueBookSantos' and jsonb_typeof(doc->'itens')='array' then
    for item in select value from jsonb_array_elements(doc->'itens') loop
      item:=item||jsonb_build_object('valor',to_char(public.book_money(item->'valor'),'FM999999999999990.00'));
      normalized:=normalized||jsonb_build_array(item);
    end loop;
    doc:=jsonb_set(doc,'{itens}',normalized);
  elsif col='ordensServico' and doc ? 'fechamento' then
    if jsonb_typeof(doc->'fechamento') is distinct from 'object' then raise sqlstate '22023' using message='Fechamento inválido.'; end if;
    if length(doc#>>'{fechamento,responsavelPagamento}')>200 then raise sqlstate '22023' using message='Responsável pelo pagamento inválido.'; end if;
    foreach field in array array['valorServico','valorMaterial','custoTotal'] loop
      doc:=jsonb_set(doc,array['fechamento',field],to_jsonb(to_char(public.book_money(doc#>array['fechamento',field]),'FM999999999999990.00')));
    end loop;
  end if;
  return doc;
end;
$$;
revoke all on function public.book_money_doc(text,jsonb) from public,anon;
grant execute on function public.book_money_doc(text,jsonb) to authenticated;

-- SECURITY INVOKER preserves record RLS and hotel restrictions, including totals.
create or replace function public.book_finance(payer text default null, cursor_id text default null, page_size integer default 50)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if not public.book_is_admin() then raise sqlstate '42501' using message='Financeiro disponível somente para administradores.'; end if;
  if page_size is null or page_size not between 1 and 100 or length(payer)>200 or length(cursor_id)>200 then raise sqlstate '22023' using message='Consulta financeira inválida.'; end if;
  with source as materialized (
    select id, data->>'hotel' hotel, data->>'apartamento' apartment, data->>'titulo' title,
      data->>'descricao' description, coalesce(data->>'status','Aberta') status,
      coalesce(nullif(trim(data#>>'{fechamento,responsavelPagamento}'),''),'Sem responsável') responsible,
      public.book_money(data#>'{fechamento,valorServico}',false) service,
      public.book_money(data#>'{fechamento,valorMaterial}',false) material,
      case when data#>'{fechamento,custoTotal}' is null or data#>'{fechamento,custoTotal}'='null'::jsonb
        then public.book_money(data#>'{fechamento,valorServico}',false)+public.book_money(data#>'{fechamento,valorMaterial}',false)
        else public.book_money(data#>'{fechamento,custoTotal}',false) end total
    from public.book_records where collection='ordensServico'
  ), grouped as (
    select responsible,count(*) count,sum(total) total,
      coalesce(sum(total) filter(where status='Finalizada'),0) finalized,
      coalesce(sum(total) filter(where status<>'Finalizada'),0) pending
    from source group by responsible
  ), selected as (
    select * from source where (payer is null or responsible=payer)
  ), page as (
    select * from selected where cursor_id is null or id<cursor_id order by id desc limit page_size+1
  ), visible as (select * from page order by id desc limit page_size)
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('payer',responsible,'count',count,'total',to_char(total,'FM999999999999999999999999999990.00'),'finalized',to_char(finalized,'FM999999999999999999999999999990.00'),'pending',to_char(pending,'FM999999999999999999999999999990.00')) order by responsible) from grouped),'[]'),
    'records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'hotel',hotel,'apartment',apartment,'title',title,'description',description,'status',status,'payer',responsible,'service',to_char(service,'FM999999999999990.00'),'material',to_char(material,'FM999999999999990.00'),'total',to_char(total,'FM999999999999990.00')) order by id desc) from visible),'[]'),
    'next',case when (select count(*) from page)>page_size then (select id from visible order by id asc limit 1) else null end
  ) into result;
  return result;
end;
$$;
revoke all on function public.book_finance(text,text,integer) from public,anon;
grant execute on function public.book_finance(text,text,integer) to authenticated;

-- Updated book_commit follows below; no historical records are rewritten.

create or replace function public.book_commit(changes jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare
  actor public.book_profiles; c jsonb; old public.book_records; doc jsonb;
  owner uuid; site text; col text; rid text; expected bigint;
  stock public.book_records; stock_data jsonb; material jsonb; item jsonb;
  delta numeric; qty numeric; old_qty numeric; idx integer; found_item boolean;
  chat_ticket public.book_records; msg jsonb; previous jsonb; n integer;
  material_cost numeric; service_cost numeric;
begin
  select * into actor from public.book_profiles where id=auth.uid();
  if actor.id is null then raise sqlstate '42501' using message='Perfil não autorizado.'; end if;
  if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>100 then
    raise sqlstate '22023' using message='Lote inválido (máximo 100 alterações).'; end if;
  -- Serialize stock edits and order consumption in a consistent lock order.
  if exists(select 1 from jsonb_array_elements(changes) where value->>'collection' in ('ordensServico','estoqueBookSantos')) then
    perform pg_advisory_xact_lock(72491001);
  end if;
  for c in select value from jsonb_array_elements(changes) order by value->>'collection',value->>'id' loop
    col:=c->>'collection'; rid:=c->>'id'; doc:=c->'data'; expected:=(c->>'version')::bigint;
    if col not in ('chamados','ordensServico','vistorias','estoqueBookSantos','conversasSuporte') or
       col is null or rid is null or expected is null or expected<0 or jsonb_typeof(doc) is distinct from 'object' then
      raise sqlstate '22023' using message='Registro inválido.'; end if;
    doc:=public.book_money_doc(col,doc);
    if jsonb_path_exists(doc, '$.** ? (@.type() == "string" && @ like_regex "^(data:|javascript:|https?:|//|blob:)" flag "i")') then
      raise sqlstate '22023' using message='Use somente referências de anexos do sistema.'; end if;
    for item in select * from jsonb_path_query(doc,'$.**.dados') union all select * from jsonb_path_query(doc,'$.**.anexoData') loop
      if (item#>>'{}') !~ '^/api/files/[a-f0-9-]{36}/(Unlimited|Unique)/[a-f0-9-]{36}$' then raise sqlstate '22023' using message='Referência de anexo inválida.'; end if;
    end loop;
    perform pg_advisory_xact_lock(hashtextextended(col||':'||rid,0));
    select * into old from public.book_records where collection=col and id=rid for update;
    if coalesce(old.version,0)<>expected then raise sqlstate 'PT409' using message='Outro usuário alterou este registro. Atualize e tente novamente.'; end if;
    owner:=coalesce(old.owner_id,actor.id); site:=doc->>'hotel';
    if col='estoqueBookSantos' then
      if actor.funcao<>'adm' or rid<>'singleton' then raise sqlstate '42501' using message='Acesso negado ao estoque.'; end if;
      if jsonb_typeof(doc->'itens') is distinct from 'array' or jsonb_typeof(doc->'colunas') is distinct from 'array' then raise sqlstate '22023' using message='Estoque inválido.'; end if;
      for item in select value from jsonb_array_elements(doc->'itens') loop
        if jsonb_typeof(item->'quantidade') is distinct from 'number' or jsonb_typeof(item->'valor') not in ('number','string') or
           (item->>'quantidade')::numeric<0 or (item->>'valor')::numeric<0 or coalesce(item->>'id','') !~ '^[a-zA-Z0-9_-]{1,100}$' then
          raise sqlstate '22023' using message='Quantidade e valor devem ser positivos.'; end if;
      end loop;
      if exists(select 1 from jsonb_array_elements(doc->'colunas') where coalesce(value->>'id','') !~ '^[a-zA-Z0-9_-]{1,100}$') then raise sqlstate '22023' using message='Coluna de estoque inválida.'; end if;
      if (select count(*) from jsonb_array_elements(doc->'itens'))<>(select count(distinct value->>'id') from jsonb_array_elements(doc->'itens')) then
        raise sqlstate '22023' using message='Materiais duplicados.'; end if;
      if exists(select 1 from public.book_records r cross join lateral jsonb_array_elements(coalesce(r.data#>'{fechamento,materiais}','[]')) m
        where r.collection='ordensServico' and not exists(select 1 from jsonb_array_elements(doc->'itens') i where i->>'id'=m->>'id')) then
        raise sqlstate '22023' using message='Material usado em serviço não pode ser removido.'; end if;
    else
      if site is null or site not in ('Unlimited','Unique') or not public.book_can_hotel(site) or (old.hotel is not null and old.hotel<>site) then raise sqlstate '42501' using message='Sem acesso a este hotel.'; end if;
      if doc->>'id' is distinct from rid and col<>'conversasSuporte' then raise sqlstate '22023' using message='Identificador inválido.'; end if;
      if col<>'conversasSuporte' and rid !~ '^[0-9]{1,16}$' then raise sqlstate '22023' using message='Identificador numérico inválido.'; end if;
      if col in ('ordensServico','vistorias') and actor.funcao<>'adm' then raise sqlstate '42501' using message='Somente administradores.'; end if;
      if col='chamados' then
        if nullif(trim(doc->>'assunto'),'') is null or nullif(trim(doc->>'descricao'),'') is null or nullif(doc->>'apartamento','') is null or
          coalesce(doc->>'status','') not in ('Aberto','Fechado') then raise sqlstate '22023' using message='Chamado incompleto.'; end if;
        if old.id is not null and actor.funcao<>'adm' then raise sqlstate '42501' using message='Cliente não pode editar chamado existente.'; end if;
        if old.id is null then
          doc:=doc||jsonb_build_object('criadaPor',actor.nome,'criadaPorLogin',actor.login,'status','Aberto','criadaEm',now());
        else
          doc:=doc||jsonb_build_object('criadaPor',old.data->>'criadaPor','criadaPorLogin',old.data->>'criadaPorLogin');
        end if;
      end if;
      if col='conversasSuporte' then
        select * into chat_ticket from public.book_records where collection='chamados' and id=doc->>'chamadoId';
        if chat_ticket.id is null or chat_ticket.hotel<>site or (actor.funcao<>'adm' and chat_ticket.owner_id<>actor.id) then raise sqlstate '42501' using message='Conversa não autorizada.'; end if;
        owner:=chat_ticket.owner_id;
        if rid<>owner::text||'::'||chat_ticket.id then raise sqlstate '22023' using message='Conversa inválida.'; end if;
        doc:=doc||jsonb_build_object('clienteLogin',chat_ticket.data->>'criadaPorLogin','clienteNome',chat_ticket.data->>'criadaPor');
        if jsonb_typeof(doc->'mensagens') is distinct from 'array' or jsonb_array_length(doc->'mensagens')>1000 or
          jsonb_array_length(doc->'mensagens')<jsonb_array_length(coalesce(old.data->'mensagens','[]')) then raise sqlstate '22023' using message='Conversa inválida ou limite de 1000 mensagens atingido.'; end if;
        n:=0;
        for msg in select value from jsonb_array_elements(doc->'mensagens') loop
          previous:=old.data->'mensagens'->n;
          if previous is not null then
            if (msg-'lidoAdmin'-'lidoCliente')<>(previous-'lidoAdmin'-'lidoCliente') or
              (actor.funcao='adm' and msg->'lidoCliente' is distinct from previous->'lidoCliente') or
              (actor.funcao='cliente' and msg->'lidoAdmin' is distinct from previous->'lidoAdmin') then raise sqlstate '42501' using message='Histórico de mensagens protegido.'; end if;
          else
            if nullif(trim(msg->>'texto'),'') is null or length(msg->>'texto')>2000 or
              msg->>'autorNome' is distinct from actor.nome or
              msg->>'autorTipo' is distinct from (case when actor.funcao='adm' then 'admin' else 'cliente' end) then raise sqlstate '22023' using message='Mensagem inválida.'; end if;
          end if;
          n:=n+1;
        end loop;
      end if;
      if col='ordensServico' then
        if nullif(trim(doc->>'titulo'),'') is null or coalesce(doc->>'status','') not in ('Aberta','Em andamento','Finalizada') then raise sqlstate '22023' using message='Ordem de serviço inválida.'; end if;
        if nullif(doc->>'responsavelLogin','') is not null and not exists(select 1 from public.book_profiles p where p.login=doc->>'responsavelLogin' and p.funcao='adm' and
          (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and a.hotel=site))) then raise sqlstate '22023' using message='Responsável sem acesso ao hotel.'; end if;
        if coalesce(doc->>'prioridade','Normal') not in ('Normal','Alta','Urgente') then raise sqlstate '22023' using message='Prioridade inválida.'; end if;
        if old.id is null then
          doc:=doc||jsonb_build_object('criadaPor',actor.nome,'criadaPorLogin',actor.login,'abertaEm',now());
        else
          doc:=doc||jsonb_build_object('criadaPor',old.data->>'criadaPor','criadaPorLogin',old.data->>'criadaPorLogin');
        end if;
        if old.id is not null and old.data->>'status'='Finalizada' and doc is distinct from old.data then raise sqlstate '42501' using message='Serviço finalizado não pode ser alterado.'; end if;
        if nullif(doc->>'chamadoId','') is not null and not exists(select 1 from public.book_records where collection='chamados' and id=doc->>'chamadoId' and hotel=site) then raise sqlstate '22023' using message='Chamado vinculado inválido.'; end if;
        if jsonb_typeof(coalesce(doc#>'{fechamento,materiais}','[]'))<>'array' then raise sqlstate '22023' using message='Materiais inválidos.'; end if;
        select * into stock from public.book_records where collection='estoqueBookSantos' and id='singleton' for update;
        stock_data:=stock.data;
        for material in
          select jsonb_build_object('id',id,'delta',sum(amount)) from (
            select value->>'id' id,(value->>'quantidade')::numeric amount from jsonb_array_elements(coalesce(doc#>'{fechamento,materiais}','[]'))
            union all select value->>'id',-(value->>'quantidade')::numeric from jsonb_array_elements(coalesce(old.data#>'{fechamento,materiais}','[]'))
          ) movements group by id having sum(amount)<>0
        loop
          delta:=(material->>'delta')::numeric; found_item:=false; idx:=0;
          for item in select value from jsonb_array_elements(coalesce(stock_data->'itens','[]')) loop
            if item->>'id'=material->>'id' then
              found_item:=true; qty:=(item->>'quantidade')::numeric-delta;
              if qty<0 then raise sqlstate 'PT409' using message='Estoque insuficiente. Atualize os materiais.'; end if;
              stock_data:=jsonb_set(stock_data,array['itens',idx::text,'quantidade'],to_jsonb(round(qty,2)));
            end if;
            idx:=idx+1;
          end loop;
          if not found_item then raise sqlstate '22023' using message='Material não encontrado no estoque.'; end if;
        end loop;
        if exists(select 1 from jsonb_array_elements(coalesce(doc#>'{fechamento,materiais}','[]')) where jsonb_typeof(value->'quantidade') is distinct from 'number' or value->>'id' is null or (value->>'quantidade')::numeric<=0) then raise sqlstate '22023' using message='Consumo inválido.'; end if;
        if stock_data is distinct from stock.data then
          update public.book_records set data=stock_data,version=version+1,updated_at=now() where collection='estoqueBookSantos' and id='singleton';
          insert into public.book_audit(actor_id,collection,record_id,old_data,new_data) values(actor.id,'estoqueBookSantos','singleton',stock.data,stock_data);
        end if;
        if doc ? 'fechamento' then
          service_cost:=coalesce((doc#>>'{fechamento,valorServico}')::numeric,0);
          material_cost:=coalesce((doc#>>'{fechamento,valorMaterial}')::numeric,0);
          if service_cost<0 or material_cost<0 then raise sqlstate '22023' using message='Valores não podem ser negativos.'; end if;
          if jsonb_array_length(coalesce(doc#>'{fechamento,materiais}','[]'))>0 then
            select coalesce(sum((m->>'quantidade')::numeric*public.book_money(i->'valor',false)),0) into material_cost
            from jsonb_array_elements(doc#>'{fechamento,materiais}') m
            join jsonb_array_elements(stock_data->'itens') i on i->>'id'=m->>'id';
          end if;
          perform public.book_money(to_jsonb(round(material_cost+service_cost,2)));
          doc:=jsonb_set(doc,'{fechamento,valorMaterial}',to_jsonb(to_char(round(material_cost,2),'FM999999999999990.00')));
          doc:=jsonb_set(doc,'{fechamento,custoTotal}',to_jsonb(to_char(round(material_cost+service_cost,2),'FM999999999999990.00')));
        end if;
        if doc->>'status'='Finalizada' then
          if nullif(doc#>>'{fechamento,data}','') is null or nullif(doc#>>'{fechamento,responsavelPagamento}','') is null or
            not exists(select 1 from public.book_profiles p where p.login=doc#>>'{fechamento,executadoPorLogin}' and p.funcao='adm' and
              (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and a.hotel=site))) then
            raise sqlstate '22023' using message='Informe data, responsável pelo pagamento e executor autorizado para finalizar.';
          end if;
        end if;
      end if;
    end if;
    insert into public.book_records(collection,id,data,owner_id,hotel,version) values(col,rid,doc,owner,site,1)
      on conflict(collection,id) do update set data=excluded.data,version=book_records.version+1,updated_at=now();
    insert into public.book_audit(actor_id,collection,record_id,old_data,new_data) values(actor.id,col,rid,old.data,doc);
  end loop;
end;
$$;
revoke all on function public.book_commit(jsonb) from public, anon;
grant execute on function public.book_commit(jsonb) to authenticated;


commit;
