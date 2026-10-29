-- Cadastro de condomínios e apartamentos pelo Onboarding, sem apagar o histórico.
begin;
create table if not exists public.book_condominiums(
 name text primary key,
 created_at timestamptz not null default now(),
 created_by uuid references public.book_profiles(id)
);
insert into public.book_condominiums(name)
 select distinct hotel from public.book_apartments union select distinct hotel from public.book_hotel_access
 on conflict do nothing;
create unique index if not exists book_condominiums_name_ci on public.book_condominiums(lower(name));
alter table public.book_condominiums enable row level security;
revoke all on public.book_condominiums from public,anon,authenticated;
grant select on public.book_condominiums to authenticated;
drop policy if exists book_read_condominiums on public.book_condominiums;
create policy book_read_condominiums on public.book_condominiums for select to authenticated using(public.book_can_hotel(name));
alter table public.book_apartments drop constraint if exists book_apartments_hotel_check;
alter table public.book_hotel_access drop constraint if exists book_hotel_access_hotel_check;
alter table public.book_apartments drop constraint if exists book_apartments_catalog_fk;
alter table public.book_apartments add constraint book_apartments_catalog_fk foreign key(hotel) references public.book_condominiums(name);
alter table public.book_hotel_access drop constraint if exists book_access_catalog_fk;
alter table public.book_hotel_access add constraint book_access_catalog_fk foreign key(hotel) references public.book_condominiums(name);

create or replace function public.book_hotel_exists(site text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_condominiums c where c.name=site);
$$;
create or replace function public.book_catalog_file_valid(reference text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(reference ~ '^/api/files/[a-f0-9-]{36}/[^/]{2,100}/[a-f0-9-]{36}$'
 and public.book_hotel_exists(split_part(reference,'/',5)),false);
$$;
revoke all on function public.book_hotel_exists(text),public.book_catalog_file_valid(text) from public,anon;
grant execute on function public.book_hotel_exists(text),public.book_catalog_file_valid(text) to authenticated;
drop policy if exists book_registered_files on storage.objects;
create policy book_registered_files on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'book-attachments' or public.book_hotel_exists(split_part(name,'/',2)))
 with check(bucket_id<>'book-attachments' or public.book_hotel_exists(split_part(name,'/',2)));

create table if not exists public.book_catalog_audit(
 id bigint generated always as identity primary key,actor_id uuid not null references public.book_profiles(id),
 kind text not null,hotel text not null,apartments text[] not null,created_at timestamptz not null default now()
);
alter table public.book_catalog_audit enable row level security;
revoke all on public.book_catalog_audit from public,anon,authenticated;
grant select on public.book_catalog_audit to authenticated;
drop policy if exists book_read_catalog_audit on public.book_catalog_audit;
create policy book_read_catalog_audit on public.book_catalog_audit for select to authenticated using(public.book_is_master());

create or replace function public.book_catalog_add(entry_kind text,site_name text,units text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.book_profiles; existing text; unit text; clean_name text; clean_units text[]; inserted_count integer;
begin
 if not public.book_can_tab('onboarding') then raise sqlstate '42501' using message='Sem acesso ao Onboarding.'; end if;
 select * into actor from public.book_profiles where id=auth.uid();
 clean_name:=regexp_replace(trim(site_name),'[[:space:]]+',' ','g');
 if entry_kind is null or entry_kind not in ('condominium','apartments') or clean_name is null or length(clean_name) not between 2 and 100
 or clean_name !~ '^[[:alnum:]][[:alnum:] ._()-]*$' or clean_name in ('__proto__','prototype','constructor','Unique')
 or units is null or cardinality(units)>100 or (entry_kind='apartments' and cardinality(units)=0)
 then raise sqlstate '22023' using message='Condomínio ou apartamentos inválidos.'; end if;
 select coalesce(array_agg(upper(trim(u))),'{}'::text[]) into clean_units from unnest(units) u;
 if exists(select 1 from unnest(clean_units) u where u is null or u !~ '^[A-Z0-9][A-Z0-9-]{0,15}$')
 or cardinality(clean_units)<>(select count(distinct u) from unnest(clean_units) u)
 then raise sqlstate '22023' using message='Apartamentos inválidos ou repetidos.'; end if;
 -- Serialize additions so concurrent requests cannot duplicate names or exceed catalog limits.
 perform pg_advisory_xact_lock(72491002);
 select name into existing from public.book_condominiums where lower(name)=lower(clean_name);
 if entry_kind='condominium' then
  if existing is not null then raise sqlstate 'PT409' using message='Condomínio já cadastrado. Use Adicionar apartamentos.'; end if;
  if (select count(*) from public.book_condominiums)>=10000 then raise sqlstate '22023' using message='Limite do catálogo atingido.'; end if;
  insert into public.book_condominiums(name,created_by) values(clean_name,actor.id);
  -- A new condominium is visible to its creator and the master; other accounts keep their permissions.
  insert into public.book_hotel_access(user_id,hotel) values(actor.id,clean_name) on conflict do nothing;
 else
  if existing is null or not public.book_can_hotel(existing) then raise sqlstate '42501' using message='Condomínio indisponível.'; end if;
  clean_name:=existing;
 end if;
 if (select count(*) from public.book_apartments)+cardinality(clean_units)>10000 then raise sqlstate '22023' using message='Limite do catálogo atingido.'; end if;
 if exists(select 1 from public.book_apartments a where a.hotel=clean_name and upper(a.apartment)=any(clean_units))
 then raise sqlstate 'PT409' using message='Um dos apartamentos já existe. Confira a lista antes de salvar.'; end if;
 insert into public.book_apartments(hotel,apartment) select clean_name,u from unnest(clean_units) u;
 get diagnostics inserted_count=row_count;
 insert into public.book_catalog_audit(actor_id,kind,hotel,apartments) values(actor.id,entry_kind,clean_name,clean_units);
 return jsonb_build_object('hotel',clean_name,'created',inserted_count);
end $$;
revoke all on function public.book_catalog_add(text,text,text[]) from public,anon;
grant execute on function public.book_catalog_add(text,text,text[]) to authenticated;

create or replace function public.book_manage_user_v9(target_id uuid, display_name text, role_name text, hotels text[], expected_version bigint)
returns void language plpgsql security definer set search_path=''
as $$
declare previous public.book_profiles; email text; old_hotels jsonb;
begin
  -- Do not trust user_metadata or privileges asserted by the request body.
  if not public.book_is_master() then raise sqlstate '42501' using message='Somente o administrador mestre pode gerenciar usuários.'; end if;
  if target_id is null or coalesce(length(trim(display_name)),0) not between 1 and 120 or
    role_name is null or role_name not in ('adm','cliente') or expected_version is null or expected_version<0 or
    hotels is null or cardinality(hotels)>10000 or exists(select 1 from unnest(hotels) h where h is null or not public.book_hotel_exists(h)) then
    raise sqlstate '22023' using message='Nome, função ou hotéis inválidos.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book-user:'||target_id::text,0));
  select * into previous from public.book_profiles where id=target_id for update;
  if previous.mestre then raise sqlstate '42501' using message='O administrador mestre está protegido.'; end if;
  if coalesce(previous.version,0)<>expected_version then raise sqlstate 'PT409' using message='Usuário alterado por outra pessoa. Atualize a lista.'; end if;
  select lower(u.email) into email from auth.users u where u.id=target_id;
  if email is null then raise sqlstate '22023' using message='Conta de autenticação não encontrada.'; end if;
  select coalesce(jsonb_agg(hotel order by hotel),'[]') into old_hotels from public.book_hotel_access where user_id=target_id;
  insert into public.book_profiles(id,nome,login,funcao,mestre,version)
    values(target_id,trim(display_name),email,role_name,false,1)
    on conflict(id) do update set nome=excluded.nome,funcao=excluded.funcao,version=book_profiles.version+1;
  delete from public.book_hotel_access where user_id=target_id;
  insert into public.book_hotel_access(user_id,hotel) select target_id,h from (select distinct unnest(hotels) h) selected;
  insert into public.book_user_audit(actor_id,user_id,old_data,new_data)
    values(auth.uid(),target_id,case when previous.id is null then null else to_jsonb(previous)||jsonb_build_object('hotels',old_hotels) end,
      jsonb_build_object('nome',trim(display_name),'login',coalesce(previous.login,email),'funcao',role_name,'hotels',to_jsonb(hotels)));
end;
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

revoke all on function public.book_commit_v9(jsonb),public.book_manage_user_v9(uuid,text,text,text[],bigint) from public,anon,authenticated;
do $$ begin
 if to_regprocedure('public.book_backup_v15(text[])') is null then alter function public.book_backup(text[]) rename to book_backup_v15; end if;
end $$;
revoke all on function public.book_backup_v15(text[]) from public,anon,authenticated;
create or replace function public.book_backup(selected text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.book_is_master() then raise sqlstate '42501' using message='Somente o mestre faz backup.'; end if;
 result:=public.book_backup_v15(selected);
 if 'cadastros'=any(selected) then result:=result||jsonb_build_object(
 'condominiums',coalesce((select jsonb_agg(to_jsonb(c)) from public.book_condominiums c),'[]'),
 'catalog_audit',coalesce((select jsonb_agg(to_jsonb(a)) from public.book_catalog_audit a),'[]'));end if;
 return result;
end $$;
revoke all on function public.book_backup(text[]) from public,anon;
grant execute on function public.book_backup(text[]) to authenticated;
create or replace function public.book_schema_version() returns integer language sql stable security definer set search_path='' as $$ select 16; $$;
commit;

