const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Catalog=require('../assets/catalog');
const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases=Object.fromEntries(Catalog.hotels.map(h=>[normalize(h),h]));
Object.assign(aliases,{'unique':'Unique Residence','guaruja type':'Type','ponta da praia housi':'Housi'});
function hotelIn(text){const n=normalize(text);for(const [alias,hotel] of Object.entries(aliases).sort((a,b)=>b[0].length-a[0].length))if((' '+n+' ').includes(' '+alias+' '))return hotel;return null;}
function clean(value){return String(value).replace(/[✅☑✔\uFE0F]/gu,'').trim();}
function parse(text){
 const entries=[];let current=null,hotel=null,section='',wifi=false,wifiList=false;
 const finish=()=>{if(current){current.fields.accessNotes=current.raw.join('\n');delete current.raw;entries.push(current);current=null;}wifi=false;wifiList=false;};
 const begin=(header,tail,line)=>{
  finish();const match=header.match(/\b\d{1,4}[A-Za-z]?\b/);const apartment=match?match[0].toUpperCase():null;
  let site=hotelIn(header);const remainder=normalize(header.replace(match?.[0]||'','')).replace(/^(cond|ed)\s+/,'');
  if(!site&&(!remainder||['u','e'].includes(remainder)||remainder==='paineiras'&&hotel==='Embaré'))site=hotel;
  current={hotel:site,apartment,label:header,sourceLine:line,fields:{},warnings:[],blockedFields:[],raw:['*'+header+'*'+tail]};
  if(tail.trim())consume(tail.replace(/^\s*[-–—:]\s*/,''));
 };
 const put=(key,value)=>{value=clean(value);if(!value||current.blockedFields.includes(key))return;if(value.length>(key==='accessNotes'?6000:256)){current.warnings.push('Campo longo: '+key);return;}if(current.fields[key]&&current.fields[key]!==value){current.warnings.push('Valores diferentes: '+key);current.blockedFields.push(key);delete current.fields[key];return;}current.fields[key]=value;};
 function consume(line){
  const raw=line.trim().replace(/^[,\-–—]\s*/,'');const n=normalize(raw);
  const network=/^(?:q?wi[\s-]*fi|rede(?:s)?(?:\s+wi[\s-]*fi)?)(?:\s*:\s*|\s+(?:é\s+)?)(.*)$/iu.exec(raw);
  if(network){wifi=true;wifiList=!network[1].trim();if(network[1].trim())put('wifiName',network[1]);return;}
  if(/^(?:redes?\s+(?:wi[\s-]*fi)?)\s*:$/iu.test(raw)){wifi=true;wifiList=true;return;}
  const roleContext=raw.includes(':')?normalize(raw.slice(0,raw.indexOf(':'))):normalize(raw.replace(/\d.*$/u,''))+' '+normalize(raw.match(/\(([^)]+)\)\s*$|[-–—]\s*([^\d]+)$/u)?.slice(1).filter(Boolean).join(' ')||'');
  const roles=[];if(/\b(mestra|master)\b/.test(roleContext))roles.push('masterPassword');if(/\b(limpeza|cleaning)\b/.test(roleContext))roles.push('cleaningPassword');if(/\b(governanca|gov)\b/.test(roleContext))roles.push('governancePassword');if(/\b(patrimonio|pat)\b/.test(roleContext))roles.push('propertyPassword');if(/\b(adm|administrativa|administracao|administrador)\b/.test(roleContext))roles.push('adminPassword');
  if(roles.length){let value=raw.includes(':')?raw.slice(raw.indexOf(':')+1):raw.replace(/^(?:senha\s+)?(?:(?:da|do|de)\s+)?(?:mestra|master|limpeza|cleaning|governan[çc]a|gov\.?|patrim[ôo]nio|pat\.?|adm|administrativa|administra[çc][ãa]o|administrador)(?:\s*\/\s*(?:patrim[ôo]nio|governan[çc]a|gov|pat))?\s*/iu,'');
   value=value.replace(/\s*(?:[-–—]\s*|\()(?:patrim[ôo]nio|governan[çc]a|gov|pat)\)?\s*$/iu,'');if(/^\d/.test(clean(value)))roles.forEach(key=>put(key,value));else current.warnings.push('Acesso de equipe preservado nas observações');wifiList=false;return;
  }
  const safe=/^(?:senha\s+(?:do\s+)?)?cofre(?:\s+cart[ãa]o)?\s*:\s*(.*)$/iu.exec(raw);if(safe){put('safePassword',safe[1]);wifiList=false;return;}
  const guest=/^(?:senha\s+)?(?:h[óo]spedes?|clientes?|fechadura|porta)\s*:?\s*(.*)$/iu.exec(raw);if(guest){put('lockPassword',guest[1]);wifiList=false;return;}
  const password=/^(?:senha|senga|passe|password)\s*:?\s+(.+)$/iu.exec(raw)||/^(?:senha|senga|passe|password)\s*:\s*(.+)$/iu.exec(raw);
  if(password){if(!wifi&&/^(?:da|do|de|para)\s/i.test(password[1])){current.warnings.push('Acesso sem finalidade clara preservado nas observações');return;}put(wifi?'wifiPassword':'lockPassword',password[1]);wifiList=false;return;}
  if(wifiList){const value=clean(raw),old=current.fields.wifiName;delete current.fields.wifiName;put('wifiName',old?old+' / '+value:value);return;}
  if(/^[A-Za-z0-9#*]+$/.test(clean(raw))&&!wifi){put('lockPassword',raw);return;}
  current.warnings.push('Trecho preservado nas observações');
 }
 const lines=String(text).replace(/^\ufeff/,'').split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;if(/^([^\p{L}\p{N}])\1{8,}$/u.test(line)){finish();continue;}
  const star=/^\*([^*]+)\*(.*)$/.exec(line);
  if(star){if(!/\d/.test(star[1])){finish();section=star[1];hotel=hotelIn(section);}else begin(star[1],star[2],i+1);continue;}
  const title=/^([^:]+):\s*$/.exec(line);if(title&&!/^(?:redes?|wi[\s-]*fi)/iu.test(title[1])){finish();section=title[1];hotel=hotelIn(section);continue;}
  const heading=/^(\d{1,4}[A-Za-z]?\s+[^:–—-]+)\s*[-–—](.*)$/u.exec(line);if(heading){begin(heading[1].trim(),heading[2],i+1);continue;}
  if(!current){current={hotel,apartment:null,label:section||'Sem identificação',sourceLine:i+1,fields:{},warnings:['Número do apartamento não informado'],blockedFields:[],raw:[]};}
  current.raw.push(line);consume(line);
 }
 finish();
 const grouped=new Map();for(const entry of entries){if(!entry.hotel||!entry.apartment){entry.ready=false;continue;}const key=entry.hotel+'/'+entry.apartment;if(grouped.has(key)){entry.warnings.push('Imóvel repetido no texto');grouped.get(key).warnings.push('Imóvel repetido no texto');}else grouped.set(key,entry);entry.ready=(Catalog.apartments[entry.hotel]||[]).includes(entry.apartment);if(!entry.ready)entry.warnings.push('Não encontrado no catálogo local');}
 for(const entry of entries)if(entry.fields.accessNotes.length>6000){entry.ready=false;entry.warnings.push('Observações excedem o limite');}
 return entries;
}
function prepare(text){
 const entries=parse(text),hash=crypto.createHash('sha256').update(text).digest('hex');
 const candidates=entries.filter(e=>e.hotel&&e.apartment&&!e.warnings.includes('Imóvel repetido no texto'));
 const rows=candidates.map(e=>({hotel:e.hotel,apartment:e.apartment,fields:e.fields}));
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 const sql=`-- PRIVADO: contem senhas reais. Nao publicar no Git, Render ou mensagens.
-- Executar como proprietario no SQL Editor, depois da migracao 27.
begin;
set local standard_conforming_strings=on;
lock table public.book_apartment_details in share row exclusive mode;
do $$ begin if not exists(select 1 from public.book_profiles where mestre) then raise exception 'Conta mestre nao encontrada.';end if;end $$;
create temp table info_incoming on commit drop as select * from jsonb_to_recordset(${literal(rows)}) as r(hotel text,apartment text,fields jsonb);
create table if not exists public.book_apartment_info_imports(source_hash text primary key,created_at timestamptz not null default now(),previous_details jsonb not null);
alter table public.book_apartment_info_imports enable row level security;
revoke all on public.book_apartment_info_imports from public,anon,authenticated;
insert into public.book_apartment_info_imports(source_hash,previous_details)
select '${hash}',coalesce((select jsonb_agg(to_jsonb(d)) from public.book_apartment_details d join info_incoming i using(hotel,apartment)),'[]') on conflict do nothing;
create temp table info_merged on commit drop as
select i.hotel,i.apartment,coalesce(d.document,'{}')||coalesce((select jsonb_object_agg(k,v) from jsonb_each(i.fields) e(k,v) where coalesce(d.document->>k,'')=''),'{}') document
from info_incoming i join public.book_apartments a on a.hotel=i.hotel and a.apartment=i.apartment join public.book_condominiums c on c.name=a.hotel
left join public.book_apartment_details d on d.hotel=i.hotel and d.apartment=i.apartment where a.archived_at is null and c.archived_at is null;
create temp table info_conflicts on commit drop as
select i.hotel,i.apartment,e.key campo from info_incoming i join public.book_apartment_details d using(hotel,apartment) cross join lateral jsonb_each(i.fields) e
where coalesce(d.document->>e.key,'')<>'' and d.document->e.key is distinct from e.value;
create temp table info_changed on commit drop as select m.* from info_merged m left join public.book_apartment_details d using(hotel,apartment) where d.hotel is null or m.document is distinct from d.document;
insert into public.book_apartment_details(hotel,apartment,document,updated_by)
select hotel,apartment,document,(select id from public.book_profiles where mestre order by id limit 1) from info_changed
on conflict(hotel,apartment) do update set document=excluded.document,version=book_apartment_details.version+1,updated_by=excluded.updated_by,updated_at=now();
insert into public.book_apartment_details_audit(hotel,apartment,actor_id,version)
select d.hotel,d.apartment,d.updated_by,d.version from public.book_apartment_details d join info_changed i using(hotel,apartment);
select hotel,apartment,campo,'Valor existente preservado; conferir manualmente.' situacao from info_conflicts order by hotel,apartment,campo;
select i.hotel,i.apartment,'Apartamento ausente ou removido. Conferir cadastro.' pendencia from info_incoming i
where not exists(select 1 from public.book_apartments a join public.book_condominiums c on c.name=a.hotel where a.hotel=i.hotel and a.apartment=i.apartment and a.archived_at is null and c.archived_at is null);
select count(*) apartamentos_preenchidos from info_changed;
commit;
`;
 return {entries,sql,hash};
}
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Uso: node scripts/prepare-apartment-info-import.js texto-privado pasta-privada');const result=prepare(fs.readFileSync(input,'utf8'));fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'01-PREENCHER-INFORMACOES-PRIVADO.sql'),result.sql);fs.writeFileSync(path.join(output,'normalized-private.json'),JSON.stringify(result.entries,null,2));fs.writeFileSync(path.join(output,'CONFERENCIA-SEM-SENHAS.json'),JSON.stringify(result.entries.map(({fields,...entry})=>({...entry,fieldNames:Object.keys(fields)})),null,2));console.log(JSON.stringify({entries:result.entries.length,matchedLocal:result.entries.filter(e=>e.ready).length,pending:result.entries.filter(e=>!e.ready).map(e=>({hotel:e.hotel,apartment:e.apartment,label:e.label})),databaseChanged:false}));}
module.exports={parse,prepare};
