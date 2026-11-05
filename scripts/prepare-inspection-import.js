const fs=require('node:fs');
const path=require('node:path');
function excelDate(value,date1904=false){
 if(value==null||value==='')return null;
 const n=Number(value);if(!Number.isFinite(n)||n<1||n>100000)throw Error('Data Excel inválida.');
 const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(n)*86400000);
 return date.toISOString().slice(0,10);
}
function prepare(source){
 if(!source||!/^[a-f0-9]{64}$/.test(source.sha256)||!Array.isArray(source.sheets))throw Error('Planilha inválida.');
 const seen=new Set(),rows=[];
 for(const sheet of source.sheets){
  if(!['VISTORIAS','GOV UNIQUE'].includes(sheet.name))continue;
  const track=sheet.name==='GOV UNIQUE'?'governance':'general';
  for(const row of sheet.rows.filter(r=>r.line>1)){
   const v=row.values,hotel=String(v.B||'').trim().replace(/\s+/g,' '),apartment=String(v.A||'').trim().replace(/\.0+$/,'').toUpperCase();
   if(!hotel||!apartment||!Number.isSafeInteger(row.line))throw Error('Imóvel inválido: '+sheet.name+' linha '+row.line);
   const last_date=excelDate(v.C,source.date1904),next_date=excelDate(v.G,source.date1904),scheduled_date=excelDate(v.E,source.date1904);
   if(!last_date||!next_date||next_date<last_date)throw Error('Datas incompletas ou invertidas: '+sheet.name+' linha '+row.line);
   const interval_days=Math.round((Date.parse(next_date)-Date.parse(last_date))/86400000);
   if(interval_days<1||interval_days>366)throw Error('Intervalo inválido: '+row.line);
   const key=JSON.stringify([hotel,apartment,track]);if(seen.has(key))throw Error('Apartamento duplicado no acompanhamento: '+hotel+' / '+apartment);seen.add(key);
   rows.push({hotel,apartment,track,last_date,next_date,scheduled_date,interval_days,inspection_kind:String(v.F||''),responsible:String(v.D||''),source_hash:source.sha256,source_sheet:sheet.name,source_row:row.line});
  }
 }
 if(!rows.length)throw Error('Nenhuma linha de vistoria encontrada.');
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 const sql=`-- Executar no SQL Editor como proprietario, depois da migracao 26.
-- Controle de datas somente. Nao cria checklists, fotos ou conclusoes ficticias.
begin;
set local standard_conforming_strings=on;
lock table public.book_inspection_controls in share row exclusive mode;
create temp table inspection_incoming on commit drop as
select * from jsonb_to_recordset(${literal(rows)}) as r(hotel text,apartment text,track text,last_date date,next_date date,scheduled_date date,interval_days integer,inspection_kind text,responsible text,source_hash text,source_sheet text,source_row integer);
create table if not exists public.book_inspection_import_batches(source_hash text primary key,source_file text not null,created_at timestamptz not null default now(),previous_controls jsonb not null,source_rows jsonb not null);
alter table public.book_inspection_import_batches enable row level security;
revoke all on public.book_inspection_import_batches from public,anon,authenticated;
insert into public.book_inspection_import_batches(source_hash,source_file,previous_controls,source_rows)
select '${source.sha256}',${"'"+String(source.sourceFile||'Controle de Vistorias.xlsx').replaceAll("'","''")+"'"},coalesce((select jsonb_agg(to_jsonb(c)) from public.book_inspection_controls c join inspection_incoming i using(hotel,apartment,track)),'[]'),${literal(rows)} on conflict do nothing;
insert into public.book_inspection_controls(hotel,apartment,track,last_date,next_date,scheduled_date,interval_days,inspection_kind,responsible,source_hash,source_sheet,source_row)
select i.* from inspection_incoming i join public.book_apartments a on a.hotel=i.hotel and a.apartment=i.apartment join public.book_condominiums c on c.name=a.hotel where a.archived_at is null and c.archived_at is null
on conflict(hotel,apartment,track) do update set last_date=excluded.last_date,next_date=excluded.next_date,scheduled_date=excluded.scheduled_date,interval_days=excluded.interval_days,inspection_kind=excluded.inspection_kind,responsible=excluded.responsible,source_hash=excluded.source_hash,source_sheet=excluded.source_sheet,source_row=excluded.source_row,updated_at=now()
where (book_inspection_controls.last_date,book_inspection_controls.next_date,book_inspection_controls.scheduled_date,book_inspection_controls.interval_days,book_inspection_controls.inspection_kind,book_inspection_controls.responsible,book_inspection_controls.source_hash,book_inspection_controls.source_sheet,book_inspection_controls.source_row)
is distinct from (excluded.last_date,excluded.next_date,excluded.scheduled_date,excluded.interval_days,excluded.inspection_kind,excluded.responsible,excluded.source_hash,excluded.source_sheet,excluded.source_row);
select i.hotel,i.apartment,i.source_sheet,i.source_row,'Apartamento ausente ou removido: cadastrar ou conferir antes de repetir a carga.' pendencia
from inspection_incoming i where not exists(select 1 from public.book_apartments a join public.book_condominiums c on c.name=a.hotel where a.hotel=i.hotel and a.apartment=i.apartment and a.archived_at is null and c.archived_at is null);
select c.source_sheet,count(*) linhas,count(*) filter(where c.next_date<(now() at time zone 'America/Sao_Paulo')::date) pendentes
from public.book_inspection_controls c join inspection_incoming i using(hotel,apartment,track) group by c.source_sheet order by c.source_sheet;
commit;
`;
 return {rows,sql};
}
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Uso: node scripts/prepare-inspection-import.js source.json pasta-privada');const result=prepare(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\ufeff/,'')));fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'01-IMPORTAR-DATAS.sql'),result.sql);fs.writeFileSync(path.join(output,'normalized.json'),JSON.stringify(result.rows,null,2));console.log(JSON.stringify({prepared:result.rows.length,databaseChanged:false}));}
module.exports={excelDate,prepare};
