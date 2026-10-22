begin;

create or replace function public.book_finance_date(doc jsonb)
returns date language plpgsql stable set search_path=''
as $$
declare candidate text; parts text[]; normalized text;
begin
  foreach candidate in array array[doc#>>'{fechamento,data}',doc#>>'{fechamento,finalizadaEm}',doc->>'fechadaEm',doc->>'abertaEm',doc->>'criadaEm',doc->>'data'] loop
    if candidate is null or trim(candidate)='' then continue; end if;
    if public.book_valid_date(candidate) then return candidate::date; end if;
    if candidate ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then
      begin
        return (candidate::timestamptz at time zone 'America/Sao_Paulo')::date;
      exception when others then null;
      end;
    end if;
    parts:=regexp_match(candidate,'^([0-9]{2})/([0-9]{2})/([0-9]{4})([ ,]|$)');
    if parts is not null then
      normalized:=parts[3]||'-'||parts[2]||'-'||parts[1];
      if public.book_valid_date(normalized) then return normalized::date; end if;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.book_finance_date(jsonb) from public,anon;
grant execute on function public.book_finance_date(jsonb) to authenticated;

-- A separate name preserves compatibility with the previous three-argument RPC.
-- Source reads keep SECURITY INVOKER and therefore the existing hotel RLS.
create or replace function public.book_finance_history(payer text default null, cursor_id text default null, page_size integer default 50, start_date date default null, end_date date default null)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if not public.book_is_admin() then raise sqlstate '42501' using message='Financeiro disponível somente para administradores.'; end if;
  if page_size is null or page_size not between 1 and 100 or length(payer)>200 or length(cursor_id)>200 or
    (start_date is null)<>(end_date is null) or (start_date is not null and start_date>=end_date) then
    raise sqlstate '22023' using message='Período ou consulta financeira inválida.';
  end if;
  with dated as materialized (
    select id,data,public.book_finance_date(data) financial_date
    from public.book_records where collection='ordensServico'
  ), source as materialized (
    select id, data->>'hotel' hotel, data->>'apartamento' apartment, data->>'titulo' title,
      data->>'descricao' description, coalesce(data->>'status','Aberta') status, financial_date,
      coalesce(nullif(trim(data#>>'{fechamento,responsavelPagamento}'),''),'Sem responsável') responsible,
      public.book_money(data#>'{fechamento,valorServico}',false) service,
      public.book_money(data#>'{fechamento,valorMaterial}',false) material,
      case when data#>'{fechamento,custoTotal}' is null or data#>'{fechamento,custoTotal}'='null'::jsonb
        then public.book_money(data#>'{fechamento,valorServico}',false)+public.book_money(data#>'{fechamento,valorMaterial}',false)
        else public.book_money(data#>'{fechamento,custoTotal}',false) end total
    from dated where start_date is null or (financial_date>=start_date and financial_date<end_date)
  ), grouped as (
    select responsible,count(*) count,sum(total) total,
      coalesce(sum(total) filter(where status='Finalizada'),0) finalized,
      coalesce(sum(total) filter(where status<>'Finalizada'),0) pending
    from source group by responsible
  ), selected as (select * from source where payer is null or responsible=payer),
  page as (select * from selected where cursor_id is null or id<cursor_id order by id desc limit page_size+1),
  visible as (select * from page order by id desc limit page_size)
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('payer',responsible,'count',count,'total',to_char(total,'FM999999999999999999999999999990.00'),'finalized',to_char(finalized,'FM999999999999999999999999999990.00'),'pending',to_char(pending,'FM999999999999999999999999999990.00')) order by responsible) from grouped),'[]'),
    'records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'hotel',hotel,'apartment',apartment,'title',title,'description',description,'status',status,'date',financial_date,'payer',responsible,'service',to_char(service,'FM999999999999990.00'),'material',to_char(material,'FM999999999999990.00'),'total',to_char(total,'FM999999999999990.00')) order by id desc) from visible),'[]'),
    'next',case when (select count(*) from page)>page_size then (select id from visible order by id asc limit 1) else null end
  ) into result;
  return result;
end;
$$;
revoke all on function public.book_finance_history(text,text,integer,date,date) from public,anon;
grant execute on function public.book_finance_history(text,text,integer,date,date) to authenticated;
commit;
