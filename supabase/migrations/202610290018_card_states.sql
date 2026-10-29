-- Um único card e quatro estados, compartilhados entre lista, quadro e agenda.
begin;
do $$ begin
 if to_regprocedure('public.book_service_stage(text,text)') is null then raise exception 'Aplique antes a migração 202610290017_simplify.sql.';end if;
end $$;
create or replace function public.book_service_stage(status text,phase text)
returns text language sql immutable set search_path='' as $$
 select case when status='Finalizada' then 'Resolvido'
 when status='Recusada' or phase='Recusa proprietário' then 'Recusa proprietário'
 when phase in ('Em andamento','Aguardando proprietário','Pendente fornecedor','Conferência') or status='Em andamento' then 'Em andamento'
 else 'Novo' end;
$$;
create or replace function public.book_commit_v9(changes jsonb)
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
      if not public.book_catalog_file_valid(item#>>'{}') then raise sqlstate '22023' using message='Referência de anexo inválida.'; end if;
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
      if site is null or not public.book_hotel_exists(site) or not public.book_can_hotel(site) or (old.hotel is not null and old.hotel<>site) then raise sqlstate '42501' using message='Sem acesso a este hotel.'; end if;
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
        if doc->>'status'='Recusada' and coalesce(length(trim(doc->>'motivoRecusa')),0) not between 3 and 2000 then raise sqlstate '22023' using message='Informe o motivo da recusa (3 a 2000 caracteres).'; end if;
        if nullif(trim(doc->>'titulo'),'') is null or coalesce(doc->>'status','') not in ('Aberta','Em andamento','Recusada','Finalizada') then raise sqlstate '22023' using message='Ordem de serviço inválida.'; end if;
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
revoke all on function public.book_commit_v9(jsonb) from public,anon,authenticated;
create or replace function public.book_flow_save(source_name text,target_id text,expected_version bigint,expected_record_version bigint,new_phase text,document jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.book_flow_meta; actor public.book_profiles; record_data jsonb; updated_data jsonb; assigned_login text; actual_version bigint; key text; value jsonb;
begin
 if source_name not in ('ordensServico','vistorias','feedbacks') or not public.book_flow_can(source_name,target_id,true) then raise sqlstate '42501' using message='Sem acesso para alterar esta etapa.'; end if;
 if expected_version is null or expected_version<0 or expected_record_version is null or jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>16000 then raise sqlstate '22023' using message='Acompanhamento inválido.'; end if;
 if new_phase is null or not new_phase=any(case source_name when 'ordensServico' then array['Novo','Em andamento','Recusa proprietário','Resolvido'] when 'vistorias' then array['Registrada','Em revisão','Concluída'] else array['Feedback','Em andamento','Concluído'] end) then raise sqlstate '22023' using message='Etapa inválida.'; end if;
 for key,value in select * from jsonb_each(document) loop
  if key not in ('origem','prestador','motivo','respostaCliente','resolvidoPor','responsavel','prazo','proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado') or (key in ('proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado') and jsonb_typeof(value)<>'boolean') or (key not in ('proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado') and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>2000)) then raise sqlstate '22023' using message='Campo de acompanhamento inválido.'; end if;
 end loop;
 if source_name='ordensServico' then perform pg_advisory_xact_lock(72491001); end if;
 perform pg_advisory_xact_lock(hashtextextended('book-flow:'||source_name||':'||target_id,0));
 if source_name='feedbacks' then select data,version into record_data,actual_version from public.book_feedbacks where id::text=target_id for update;
 else select data,version into record_data,actual_version from public.book_records where collection=source_name and id=target_id for update;end if;
 if actual_version<>expected_record_version then raise sqlstate 'PT409' using message='O registro mudou. Atualize antes de salvar.'; end if;
 if source_name='ordensServico' and ((new_phase='Resolvido' and record_data->>'status'<>'Finalizada') or (record_data->>'status'='Finalizada' and new_phase<>'Resolvido')) then raise sqlstate '22023' using message='Use o fechamento ou a reabertura do card para alterar a conclusão do serviço.'; end if;
 if new_phase='Recusa proprietário' and coalesce(length(trim(document->>'motivo')),0)<3 then raise sqlstate '22023' using message='Informe o motivo da recusa.'; end if;
 if source_name='feedbacks' and new_phase='Concluído' and (coalesce(length(trim(document->>'respostaCliente')),0)<3 or not exists(select 1 from public.book_profiles p where p.id::text=document->>'resolvidoPor' and p.funcao='adm' and (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and public.book_hotel_name(a.hotel)=public.book_hotel_name(record_data->>'hotel'))))) then raise sqlstate '22023' using message='Informe resposta ao cliente e administrador que resolveu.'; end if;
 select * into previous from public.book_flow_meta where source=source_name and record_id=target_id for update;
 if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='O acompanhamento mudou. Atualize a tela.'; end if;
 if source_name='ordensServico' then
  updated_data:=record_data;
  if document ? 'responsavel' then
   assigned_login:='';
   if nullif(document->>'responsavel','') is not null then
    select login into assigned_login from public.book_profiles p where p.id::text=document->>'responsavel' and p.funcao='adm' and (p.mestre or 'os'=any(p.tabs)) and (p.mestre or exists(select 1 from public.book_hotel_access a where a.user_id=p.id and public.book_hotel_name(a.hotel)=public.book_hotel_name(record_data->>'hotel')));
    if assigned_login is null then raise sqlstate '22023' using message='Responsável sem acesso ao serviço.'; end if;
   end if;
   updated_data:=updated_data||jsonb_build_object('responsavelLogin',assigned_login);
  end if;
  if document ? 'prazo' then
   if nullif(document->>'prazo','') is not null then
    if document->>'prazo' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise sqlstate '22023' using message='Prazo inválido.'; end if;perform (document->>'prazo')::date;
   end if;
   updated_data:=updated_data||jsonb_build_object('vencimento',document->>'prazo');
  end if;
  updated_data:=updated_data||jsonb_build_object('status',case new_phase when 'Novo' then 'Aberta' when 'Em andamento' then 'Em andamento' when 'Recusa proprietário' then 'Recusada' else 'Finalizada' end);
  if new_phase='Recusa proprietário' then updated_data:=updated_data||jsonb_build_object('motivoRecusa',trim(document->>'motivo'));end if;
  if updated_data is distinct from record_data then perform public.book_commit(jsonb_build_array(jsonb_build_object('collection',source_name,'id',target_id,'version',actual_version,'data',updated_data)));end if;
 end if;
 select * into actor from public.book_profiles where id=auth.uid();
 insert into public.book_flow_meta(source,record_id,phase,data) values(source_name,target_id,new_phase,document) on conflict(source,record_id) do update set phase=excluded.phase,data=excluded.data,version=book_flow_meta.version+1,updated_at=now();
 insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,previous,current) values(source_name,target_id,actor.id,actor.nome,'Acompanhamento atualizado',case when previous.source is null then null else to_jsonb(previous) end,jsonb_build_object('phase',new_phase,'data',document));
end $$;

-- Only status metadata changes here. No file references or attachment contents are modified.
-- The exclusive transaction lock prevents concurrent writes while this single file-scope
-- trigger is paused for owner-run maintenance. A rollback restores its previous state.
lock table public.book_records in access exclusive mode;
alter table public.book_records disable trigger book_file_scope;
with classified as (
 select r.collection,r.id,case public.book_service_stage(r.data->>'status',m.phase)
 when 'Resolvido' then 'Finalizada' when 'Recusa proprietário' then 'Recusada' when 'Em andamento' then 'Em andamento' else 'Aberta' end status,
 coalesce(nullif(trim(r.data->>'motivoRecusa'),''),nullif(trim(m.data->>'motivo'),''),'Recusa anterior sem motivo detalhado.') reason
 from public.book_records r left join public.book_flow_meta m on m.source=r.collection and m.record_id=r.id
 where r.collection='ordensServico'
)
update public.book_records r set data=r.data||jsonb_build_object('status',c.status)||
 case when c.status='Recusada' then jsonb_build_object('motivoRecusa',c.reason) else '{}'::jsonb end,
 version=r.version+1,updated_at=now()
from classified c where r.collection=c.collection and r.id=c.id and r.data->>'status' is distinct from c.status;
alter table public.book_records enable trigger book_file_scope;

create or replace function public.book_sync_card_state()
returns trigger language plpgsql security definer set search_path='' as $$
declare phase_name text; previous public.book_flow_meta; actor public.book_profiles; metadata jsonb;
begin
 if new.collection<>'ordensServico' then return new;end if;
 if new.data->>'status' is null or new.data->>'status' not in ('Aberta','Em andamento','Recusada','Finalizada') then raise sqlstate '22023' using message='Status do card inválido.';end if;
 if new.data->>'status'='Recusada' and coalesce(length(trim(new.data->>'motivoRecusa')),0) not between 3 and 2000 then raise sqlstate '22023' using message='Informe o motivo da recusa (3 a 2000 caracteres).';end if;
 phase_name:=case new.data->>'status' when 'Finalizada' then 'Resolvido' when 'Recusada' then 'Recusa proprietário' when 'Em andamento' then 'Em andamento' else 'Novo' end;
 select * into previous from public.book_flow_meta where source='ordensServico' and record_id=new.id for update;
 metadata:=coalesce(previous.data,'{}'::jsonb);
 if new.data->>'status'='Recusada' then metadata:=metadata||jsonb_build_object('motivo',trim(new.data->>'motivoRecusa'));end if;
 if previous.phase is distinct from phase_name or metadata is distinct from previous.data then
  insert into public.book_flow_meta(source,record_id,phase,data) values('ordensServico',new.id,phase_name,metadata)
  on conflict(source,record_id) do update set phase=excluded.phase,data=excluded.data,version=book_flow_meta.version+1,updated_at=now();
  select * into actor from public.book_profiles where id=auth.uid();
  if actor.id is not null and previous.phase is distinct from phase_name then
   insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,previous,current)
   values('ordensServico',new.id,actor.id,actor.nome,'Status do card atualizado',
   case when previous.source is null then null else jsonb_build_object('phase',previous.phase) end,
   jsonb_build_object('phase',phase_name,'status',new.data->>'status'));
  end if;
 end if;
 return new;
end $$;
revoke all on function public.book_sync_card_state() from public,anon,authenticated;
drop trigger if exists book_card_state on public.book_records;
create trigger book_card_state after insert or update on public.book_records for each row execute function public.book_sync_card_state();
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 18; $$;
commit;

