-- Execute após as migrações 19 e 20. Preserva os dados e versões dos cards.
begin;
do $$ begin if public.book_schema_version()<19 then raise exception 'Aplique a migração 19 primeiro.'; end if; end $$;
create table if not exists public.book_labels(
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 40 and name=btrim(name)),
 color text not null check(color in ('teal','blue','purple','pink','orange','green','gray')),
 created_by uuid not null references public.book_profiles(id), created_at timestamptz not null default now()
);
create unique index if not exists book_labels_name on public.book_labels(lower(name));
create table if not exists public.book_card_labels(
 record_id text primary key, label_ids uuid[] not null default '{}', version bigint not null default 1,
 check(cardinality(label_ids)<=10)
);
create index if not exists book_card_labels_lookup on public.book_card_labels using gin(label_ids);
alter table public.book_labels enable row level security;
alter table public.book_card_labels enable row level security;
revoke all on public.book_labels,public.book_card_labels from anon,authenticated;
grant select on public.book_labels,public.book_card_labels to authenticated;
drop policy if exists book_labels_read on public.book_labels;
create policy book_labels_read on public.book_labels for select to authenticated using(public.book_is_admin() and public.book_can_tab('os'));
drop policy if exists book_card_labels_read on public.book_card_labels;
create policy book_card_labels_read on public.book_card_labels for select to authenticated using(public.book_is_admin() and public.book_flow_can('ordensServico',record_id));
create or replace function public.book_labels_catalog(new_name text default null,new_color text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.book_is_admin() or not public.book_can_tab('os') then raise sqlstate '42501'; end if;
 if new_name is not null then
  if length(btrim(new_name)) not between 1 and 40 or new_color is null or new_color not in ('teal','blue','purple','pink','orange','green','gray') then raise sqlstate '22023' using message='Nome ou cor inválidos.'; end if;
  perform pg_advisory_xact_lock(21021);
  if (select count(*) from public.book_labels)>=200 then raise sqlstate '22023' using message='Limite de 200 etiquetas.'; end if;
  insert into public.book_labels(name,color,created_by) values(btrim(new_name),new_color,auth.uid());
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color) order by lower(name)) from public.book_labels),'[]');
end $$;
create or replace function public.book_labels_read(card_ids text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.book_is_admin() or not public.book_can_tab('os') then raise sqlstate '42501'; end if;
 if card_ids is null or cardinality(card_ids)>100 then raise sqlstate '22023'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'labelIds',coalesce(l.label_ids,'{}'),'version',coalesce(l.version,0)))
 from public.book_records r left join public.book_card_labels l on l.record_id=r.id
 where r.collection='ordensServico' and r.id=any(card_ids) and public.book_can_hotel(r.hotel)),'[]');
end $$;
create or replace function public.book_labels_assign(target_id text,expected_version bigint,selected_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_ids uuid[]; old_version bigint; clean_ids uuid[]; actor_name text;
begin
 if not public.book_is_admin() or not public.book_can_tab('os') or not public.book_flow_can('ordensServico',target_id,true) then raise sqlstate '42501'; end if;
 if expected_version is null or expected_version<0 or selected_ids is null or cardinality(selected_ids)>10 then raise sqlstate '22023'; end if;
 select coalesce(array_agg(distinct x order by x),'{}') into clean_ids from unnest(selected_ids) x;
 if exists(select 1 from unnest(clean_ids) x where x is null or not exists(select 1 from public.book_labels l where l.id=x)) then raise sqlstate '22023' using message='Etiqueta inexistente.'; end if;
 perform 1 from public.book_records where collection='ordensServico' and id=target_id for update;
 select label_ids,version into old_ids,old_version from public.book_card_labels where record_id=target_id;
 if coalesce(old_version,0)<>expected_version then raise sqlstate 'PT409' using message='Etiquetas alteradas por outra pessoa. Reabra o card antes de salvar.'; end if;
 if clean_ids is distinct from coalesce(old_ids,'{}') then
  insert into public.book_card_labels(record_id,label_ids) values(target_id,clean_ids)
  on conflict(record_id) do update set label_ids=excluded.label_ids,version=book_card_labels.version+1;
  select nome into actor_name from public.book_profiles where id=auth.uid();
  insert into public.book_flow_events(source,record_id,actor_id,actor_name,action,previous,current)
  values('ordensServico',target_id,auth.uid(),actor_name,'Etiquetas atualizadas',to_jsonb(coalesce(old_ids,'{}')),to_jsonb(clean_ids));
 end if;
 return jsonb_build_object('id',target_id,'labelIds',clean_ids,'version',coalesce((select version from public.book_card_labels where record_id=target_id),0));
end $$;

create or replace function public.book_service_page(page_offset integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; master_access boolean:=public.book_is_master(); allowed_hotels text[]; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.book_is_admin() or not public.book_can_tab('os') then raise sqlstate '42501' using message='Sem acesso aos cards.'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 or jsonb_typeof(filters) is distinct from 'object' or length(coalesce(filters->>'search',''))>200 then raise sqlstate '22023' using message='Filtro inválido.'; end if;
 select coalesce(array_agg(public.book_hotel_name(hotel)),array[]::text[]) into allowed_hotels from public.book_hotel_access where user_id=auth.uid();
 with source as materialized(select r.id,r.data,r.version,coalesce(m.version,0) meta_version,coalesce(m.data,'{}') meta_data,
 public.book_service_stage(r.data->>'status',m.phase) phase
 from public.book_records r left join public.book_flow_meta m on m.source=r.collection and m.record_id=r.id where r.collection='ordensServico' and (master_access or public.book_hotel_name(r.hotel)=any(allowed_hotels))),
 selected as materialized(select * from source where
 (coalesce(filters->>'label','')='' or exists(select 1 from public.book_card_labels labels where labels.record_id=source.id and labels.label_ids @> array[(filters->>'label')::uuid])) and
 (coalesce(filters->>'search','')='' or data->>'titulo' ilike '%'||(filters->>'search')||'%' or data->>'apartamento' ilike '%'||(filters->>'search')||'%')
 and (coalesce(filters->>'phase','')='' or phase=filters->>'phase') and (coalesce(filters->>'hotel','')='' or public.book_hotel_name(data->>'hotel')=filters->>'hotel')
 and (coalesce(filters->>'assignee','')='' or data->>'responsavelLogin'=(select login from public.book_profiles where id::text=filters->>'assignee'))
 and (coalesce(filters->>'period','all')='all' or filters->>'period'='today' and public.book_routine_date(data->>'vencimento')=today or filters->>'period'='week' and public.book_routine_date(data->>'vencimento')>=date_trunc('week',today)::date and public.book_routine_date(data->>'vencimento')<date_trunc('week',today)::date+7 or filters->>'period'='late' and public.book_routine_date(data->>'vencimento')<today and phase not in ('Resolvido','Recusa proprietário'))
 ), page as(select * from selected order by id desc limit 50 offset page_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by id desc) from page p),'[]'),'total',(select count(*) from selected),'counts',coalesce((select jsonb_object_agg(phase,n) from (select phase,count(*) n from selected group by phase) g),'{}')) into result;
 return result;
end $$;
revoke all on function public.book_labels_catalog(text,text),public.book_labels_read(text[]),public.book_labels_assign(text,bigint,uuid[]) from public,anon;
grant execute on function public.book_labels_catalog(text,text),public.book_labels_read(text[]),public.book_labels_assign(text,bigint,uuid[]) to authenticated;
-- Include the catalog and assignments when cards are selected for backup.
do $$ begin
 if to_regprocedure('public.book_backup_v20(text[])') is null then alter function public.book_backup(text[]) rename to book_backup_v20; end if;
end $$;
revoke all on function public.book_backup_v20(text[]) from public,anon,authenticated;
create or replace function public.book_backup(selected text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.book_is_master() then raise sqlstate '42501'; end if;
 result:=public.book_backup_v20(selected);
 if 'ordensServico'=any(selected) then result:=result||jsonb_build_object(
 'labels',coalesce((select jsonb_agg(to_jsonb(l)) from public.book_labels l),'[]'),
 'card_labels',coalesce((select jsonb_agg(to_jsonb(l)) from public.book_card_labels l join public.book_records r on r.collection='ordensServico' and r.id=l.record_id),'[]'));end if;
 return result;
end $$;
revoke all on function public.book_backup(text[]) from public,anon;
grant execute on function public.book_backup(text[]) to authenticated;
notify pgrst,'reload schema';
commit;
