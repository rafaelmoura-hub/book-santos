begin;

-- Cadastro inicial compatível com as telas atuais. Ajuste antes do piloto.
create table if not exists public.book_apartments (
  hotel text not null check (hotel in ('Unlimited','Unique')),
  apartment text not null check (apartment ~ '^[0-9A-Za-z ]{1,20}$'),
  primary key (hotel,apartment)
);
insert into public.book_apartments values
  ('Unlimited','1111'),('Unlimited','2222'),('Unique','1111'),('Unique','2222')
on conflict do nothing;
alter table public.book_apartments enable row level security;
revoke all on public.book_apartments from public,anon,authenticated;
grant select on public.book_apartments to authenticated;
drop policy if exists book_read_apartments on public.book_apartments;
create policy book_read_apartments on public.book_apartments for select to authenticated
using (public.book_can_hotel(hotel));

create or replace function public.book_valid_date(value text)
returns boolean language plpgsql immutable set search_path=''
as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  return to_char(value::date,'YYYY-MM-DD')=value;
exception when others then return false;
end;
$$;
revoke all on function public.book_valid_date(text) from public,anon;
grant execute on function public.book_valid_date(text) to authenticated;

-- Trigger also protects direct RPC calls, without rewriting previous migrations.
create or replace function public.book_validate_record()
returns trigger language plpgsql security definer set search_path=''
as $$
declare group_value jsonb; answer jsonb; file_value jsonb; filename text;
begin
  if new.collection in ('chamados','ordensServico','vistorias') then
    if not exists(select 1 from public.book_apartments where hotel=new.hotel and apartment=new.data->>'apartamento') then
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
revoke all on function public.book_validate_record() from public,anon,authenticated;
drop trigger if exists book_validate_record on public.book_records;
create trigger book_validate_record before insert or update on public.book_records
for each row execute function public.book_validate_record();

create or replace function public.book_schema_version()
returns integer language sql immutable set search_path='' as $$ select 3; $$;
revoke all on function public.book_schema_version() from public;
grant execute on function public.book_schema_version() to anon,authenticated;
commit;
