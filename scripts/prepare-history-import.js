const fs=require('node:fs');
const path=require('node:path');
const statuses={Resolvido:'Finalizada','Recusa Proprietário':'Recusada','Em Andamento':'Em andamento','Pendente Fornecedor':'Em andamento','Aguardando Proprietário':'Em andamento','Conferência':'Em andamento',Novo:'Aberta',Cancelado:'Recusada'};
function locationFromTitle(title){
 const prefix=/^\s*(?:(?:apartamento|apto|ap)\.?\s*)?(\d{1,4})([AB])?(?=\s|$|[-:;/.,–—]|[A-Z]{1,3}(?:\s|$|[-:]))/i.exec(title);
 const reversed=/^\s*UQ\s*[-:–—]?\s*(\d{1,4})([AB])?(?=\s|$|[-:;/.,–—])/i.exec(title);
 const match=prefix||reversed,apartment=match?match[1]+(match[2]||'').toUpperCase():null;
 const unique=/(?:^|[^A-Z0-9])UQ(?=$|[^A-Z0-9])/i.test(title)||/^\s*\d{1,4}[AB]?UQ(?=$|[^A-Z0-9])/i.test(title);
 return {hotel:unique?'Unique Residence':null,apartment,code:unique?'UQ':null};
}
function prepare(source){
 if(!source||!Array.isArray(source.rows)||!source.rows.length||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('Relatório inválido.');
 const seen=new Set(),counts={};const cards=source.rows.map(r=>{
  if(!Number.isSafeInteger(r.sourceRow)||r.sourceRow<2||seen.has(r.sourceRow)||typeof r.title!=='string'||!r.title.trim()||!statuses[r.phase]||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(r.createdLocal))throw Error('Linha inválida: '+r.sourceRow);seen.add(r.sourceRow);
  const status=statuses[r.phase];counts[status]=(counts[status]||0)+1;
  const id=(8000000000000000n+BigInt(r.sourceRow)).toString(),[day,time]=r.createdLocal.split('T');
  const data={id,hotel:'Condomínio a conferir',apartamento:'A conferir',titulo:r.title,descricao:'Histórico parcial importado. A planilha não contém descrição, imóvel identificado, vencimento, fechamento, responsável, urgência, valores, comentários ou anexos.',status,criadaPor:r.creator||'Não informado',data:day.split('-').reverse().join('/')+' '+time,anexos:[],importacao:{parcial:true,origem:'Pipefy',arquivo:source.sourceFile,hash:source.sha256,linha:r.sourceRow,faseOriginal:r.phase,criadorOriginal:r.creator,criadoEmLocal:r.createdLocal,criadoEmOriginal:r.createdOriginal,fusoFonte:'Não informado'}};
  if(status==='Recusada')data.motivoRecusa='Fase de origem: '+r.phase+'. Motivo detalhado não informado.';
  const location=locationFromTitle(r.title);data.hotel=location.hotel||data.hotel;data.apartamento=location.apartment||data.apartamento;
  Object.assign(data.importacao,{condominioPeloTitulo:location.hotel,apartamentoPeloTitulo:location.apartment,siglaConfirmada:location.code,regraImovel:'numero-inicial; UQ=Unique Residence; v1'});
  return data;
 });
 const activity=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610300019_activity.sql'),'utf8');
 let report=activity.slice(activity.indexOf('create or replace function public.book_activity_snapshot'),activity.indexOf('revoke all on function public.book_card_schedule'));
 const anchor="  union all select 'closed',record_id,event_day,happened_at,new_data->>'status'";
 report=report.replace(anchor,"  union all select 'created',id,(data#>>'{importacao,criadoEmLocal}')::timestamp::date,(data#>>'{importacao,criadoEmLocal}')::timestamp at time zone 'America/Sao_Paulo','Criação na planilha; fuso de origem não informado' from records where data#>>'{importacao,parcial}'='true' and (data#>>'{importacao,criadoEmLocal}')::timestamp::date between first_day and last_day\n"+anchor);
 const financeSource=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610280010_permissions.sql'),'utf8');
 const finance=financeSource.slice(financeSource.indexOf('create or replace function public.book_finance_history'),financeSource.indexOf('create or replace function public.book_reopen_order'));
 if(!finance.includes("where collection='ordensServico'"))throw Error('Consulta financeira não localizada.');
 report+='\n'+finance.replace("where collection='ordensServico'","where collection='ordensServico' and data#>>'{importacao,parcial}' is distinct from 'true'");
 const payload={hash:source.sha256,file:source.sourceFile,count:cards.length,rows:source.rows.map(r=>{const location=locationFromTitle(r.title);return {...r,inferredHotel:location.hotel,inferredApartment:location.apartment,confirmedCode:location.code};})};
 const sql=fs.readFileSync(path.join(__dirname,'history-import.sql'),'utf8').replace('__PAYLOAD__',()=>"'"+JSON.stringify(payload).replaceAll("'","''")+"'").replace('__REPORT_FUNCTIONS__',()=>report);
 const restore=fs.readFileSync(path.join(__dirname,'restore-history.sql'),'utf8').replaceAll('__HASH__',"'"+source.sha256+"'");
 const locations=fs.readFileSync(path.join(__dirname,'history-locations.sql'),'utf8').replace('__PAYLOAD__',()=>"'"+JSON.stringify(payload).replaceAll("'","''")+"'");
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const stagingSetup=fs.readFileSync(path.join(__dirname,'history-stage.sql'),'utf8').replaceAll('__HASH__',quote(source.sha256));
 const load=table=>`insert into ${table} select jsonb_build_object('hash',${quote(source.sha256)},'file',${quote(source.sourceFile)},'count',${cards.length},'rows',coalesce(jsonb_agg(payload::jsonb order by source_line),'[]'::jsonb)) from public.book_history_import_stage where source_hash=${quote(source.sha256)};`;
 const stagedSQL=fs.readFileSync(path.join(__dirname,'history-import.sql'),'utf8').replace('insert into book_incoming_history values (__PAYLOAD__::jsonb);',()=>load('book_incoming_history')).replace('__REPORT_FUNCTIONS__',()=>report);
 const stagedLocations=fs.readFileSync(path.join(__dirname,'history-locations.sql'),'utf8').replace('insert into book_location_input values (__PAYLOAD__::jsonb);',()=>load('book_location_input'));
 const stagingRows=payload.rows.map(r=>({source_hash:source.sha256,source_line:r.sourceRow,payload:r}));
 const csvCell=value=>'"'+String(value).replaceAll('"','""')+'"';
 const csv='source_hash,source_line,payload\r\n'+stagingRows.map(r=>[r.source_hash,r.source_line,JSON.stringify(r.payload)].map(csvCell).join(',')).join('\r\n')+'\r\n';
 return {sql,counts,cards,restore,locations,stagingSetup,stagedSQL,stagedLocations,stagingRows,csv};
}
if(require.main===module){const input=process.argv[2],output=process.argv[3];if(!input||!output)throw Error('Uso: node scripts/prepare-history-import.js source.json destino.sql');const source=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));const result=prepare(source);fs.writeFileSync(output,result.sql);fs.writeFileSync(path.join(path.dirname(output),'RESTAURAR-CARDS-ANTERIORES.sql'),result.restore);fs.writeFileSync(path.join(path.dirname(output),'ATUALIZAR-IMOVEIS.sql'),result.locations);for(const [name,content] of [['01-PREPARAR-CARGA.sql',result.stagingSetup],['02-DADOS-HISTORICO.csv',result.csv],['03-CONCLUIR-IMPORTACAO.sql',result.stagedSQL],['04-ATUALIZAR-IMOVEIS-DA-CARGA.sql',result.stagedLocations]])fs.writeFileSync(path.join(path.dirname(output),name),content);console.log(JSON.stringify({setupBytes:Buffer.byteLength(result.stagingSetup),finalizeBytes:Buffer.byteLength(result.stagedSQL),csvBytes:Buffer.byteLength(result.csv),apartmentsIdentified:result.cards.filter(c=>c.apartamento!=='A conferir').length,uniqueResidence:result.cards.filter(c=>c.hotel==='Unique Residence').length,rows:result.cards.length,counts:result.counts,sqlBytes:Buffer.byteLength(result.sql),output}));}
module.exports={prepare,locationFromTitle};
