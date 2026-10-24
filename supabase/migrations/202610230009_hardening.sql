begin;
create or replace function public.book_hotel_name(value text)
returns text language sql immutable set search_path='' as $$ select case when value='Unique' then 'Unique Residence' else value end; $$;
revoke all on function public.book_hotel_name(text) from public,anon;
grant execute on function public.book_hotel_name(text) to authenticated;
create or replace function public.book_can_hotel(target text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.book_profiles p where p.id=auth.uid() and
 (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and public.book_hotel_name(a.hotel)=public.book_hotel_name(target)))); $$;
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
      if (item#>>'{}') !~ '^/api/files/[a-f0-9-]{36}/(Be Urban|Conde Luciano|Embaré|Helbor Stay|Housi|Houx|Ipanema|Lume Alto da Boa Vista|Maralta|Marco Aurelio|Nexone|Type|Unique Residence|Universo Palace|Unlimited|VN Melo|Xangô|Unique)/[a-f0-9-]{36}$' then raise sqlstate '22023' using message='Referência de anexo inválida.'; end if;
    end loop;
    perform pg_advisory_xact_lock(hashtextextended(col||':'||rid,0));
    select * into old from public.book_records where collection=col and id=rid for update;
    if coalesce(old.version,0)<>expected then raise sqlstate 'PT409' using message='Outro usuário alterou este registro. Atualize e tente novamente.'; end if;
    owner:=coalesce(old.owner_id,actor.id); site:=doc->>'hotel';
    -- Preserve original historical rows, versions, attachments and audit identities.
    if site='Unique Residence' and (old.hotel='Unique' or
      (col='conversasSuporte' and exists(select 1 from public.book_records where collection='chamados' and id=doc->>'chamadoId' and hotel='Unique'))) then
      site:='Unique'; doc:=jsonb_set(doc,'{hotel}',to_jsonb(site));
    end if;
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
      if site is null or site not in ('Be Urban','Conde Luciano','Embaré','Helbor Stay','Housi','Houx','Ipanema','Lume Alto da Boa Vista','Maralta','Marco Aurelio','Nexone','Type','Unique Residence','Universo Palace','Unlimited','VN Melo','Xangô','Unique') or not public.book_can_hotel(site) or (old.hotel is not null and old.hotel<>site) then raise sqlstate '42501' using message='Sem acesso a este hotel.'; end if;
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
        if nullif(doc->>'chamadoId','') is not null and not exists(select 1 from public.book_records where collection='chamados' and id=doc->>'chamadoId' and public.book_hotel_name(hotel)=public.book_hotel_name(site)) then raise sqlstate '22023' using message='Chamado vinculado inválido.'; end if;
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
create or replace function public.book_validate_record()
returns trigger language plpgsql security definer set search_path=''
as $$
declare group_value jsonb; answer jsonb; file_value jsonb; filename text;
begin
  if new.collection in ('chamados','ordensServico','vistorias') then
    if not exists(select 1 from public.book_apartments where hotel=new.hotel and apartment=new.data->>'apartamento') and not exists(
      select 1 from public.book_records previous where previous.collection=new.collection and previous.id=new.id
      and previous.hotel=new.hotel and previous.data->>'apartamento'=new.data->>'apartamento'
    ) then
      raise sqlstate '22023' using message='Apartamento não cadastrado neste hotel.';
    end if;
  end if;
  if new.collection='chamados' and
    (length(new.data->>'assunto')>100 or length(new.data->>'descricao')>2000) then
    raise sqlstate '22023' using message='Assunto ou descrição acima do limite.';
  end if;
  if new.collection='ordensServico' then
    if nullif(new.data->>'vencimento','') is not null and not public.book_valid_date(new.data->>'vencimento') then
      raise sqlstate '22023' using message='Vencimento inválido.';
    end if;
    if nullif(new.data#>>'{fechamento,data}','') is not null and not public.book_valid_date(new.data#>>'{fechamento,data}') then
      raise sqlstate '22023' using message='Data de fechamento inválida.';
    end if;
  end if;
  if new.collection='vistorias' then
    if not public.book_valid_date(new.data->>'data') or
      coalesce(length(trim(new.data->>'responsavel')),0) not between 1 and 120 or
      coalesce(new.data->>'tipo','') not in ('Simplificada','Completa') or
      jsonb_typeof(new.data->'checklist') is distinct from 'object' or new.data->'checklist'='{}'::jsonb or
      jsonb_typeof(new.data->'fotos') is distinct from 'array' or jsonb_array_length(new.data->'fotos')>20 then
      raise sqlstate '22023' using message='Preencha data, responsável, tipo e checklist da vistoria.';
    end if;
    for group_value in select value from jsonb_each(new.data->'checklist') loop
      if jsonb_typeof(group_value) is distinct from 'object' or group_value='{}'::jsonb then
        raise sqlstate '22023' using message='Grupo de checklist inválido.';
      end if;
      for answer in select value from jsonb_each(group_value) loop
        if jsonb_typeof(answer) is distinct from 'string' or (answer#>>'{}') not in ('Em ordem','Com problema','Não se aplica') then
          raise sqlstate '22023' using message='Resposta de checklist inválida.';
        end if;
      end loop;
    end loop;
  end if;
  for file_value in select * from jsonb_path_query(new.data,'$.**.dados') union all select * from jsonb_path_query(new.data,'$.**.anexoData') loop
    if jsonb_typeof(file_value) is distinct from 'string' then
      raise sqlstate '22023' using message='Anexo inválido.';
    end if;
    filename:=substring(file_value#>>'{}' from 12);
    if not exists(select 1 from storage.objects o where o.bucket_id='book-attachments' and o.name=filename
      and (storage.foldername(o.name))[2]=new.hotel
      and ((storage.foldername(o.name))[1]=auth.uid()::text or public.book_is_admin())) then
      raise sqlstate '22023' using message='Anexo inexistente ou sem acesso neste hotel.';
    end if;
  end loop;
  return new;
end;
$$;
create or replace function public.book_counts()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('chamados',count(*) filter(where collection='chamados'),
 'abertos',count(*) filter(where collection='chamados' and coalesce(data->>'status','Aberto')='Aberto'),
 'fechados',count(*) filter(where collection='chamados' and data->>'status'='Fechado'),
 'ordensServico',count(*) filter(where collection='ordensServico')) from public.book_records;
$$;
revoke all on function public.book_counts() from public,anon;
grant execute on function public.book_counts() to authenticated;
create or replace function public.book_schema_version()
returns integer language sql stable security definer set search_path='' as $$
 select case when to_regprocedure('public.book_backup(text[])') is not null
 and to_regprocedure('public.book_counts()') is not null
 and to_regprocedure('public.book_finance_history(text,text,integer,date,date)') is not null
 and (select count(*) from public.book_apartments)=126 then 9 else 0 end;
$$;
commit;
