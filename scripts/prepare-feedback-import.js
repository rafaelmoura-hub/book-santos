const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {locationFromTitle}=require('./prepare-history-import');
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const MAX_BATCH_BYTES=250*1024;
function stagingBatch(hash,rows){
 const values=rows.map(r=>'('+quote(hash)+','+r.sourceRow+','+quote(JSON.stringify(r))+')').join(',\n');
 return `-- Carga parcial de feedbacks. Pode repetir este arquivo sem duplicar linhas.\nbegin;\ncreate temp table feedback_batch(source_hash text,source_line integer,payload text) on commit drop;\ninsert into feedback_batch values\n${values};\ninsert into public.book_history_import_stage(source_hash,source_line,payload) select * from feedback_batch on conflict(source_hash,source_line) do nothing;\ndo $$ begin\n if exists(select 1 from feedback_batch b left join public.book_history_import_stage s using(source_hash,source_line) where s.payload is null or s.payload::jsonb is distinct from b.payload::jsonb) then raise exception 'Carga divergente: nenhuma linha deste lote foi gravada.';end if;\nend $$;\nselect count(*) linhas_carregadas from public.book_history_import_stage where source_hash=${quote(hash)};\ncommit;\n`;
}
function stagingBatches(hash,rows){
 const batches=[];let current=[];
 for(const row of rows){
  const next=[...current,row];
  if(Buffer.byteLength(stagingBatch(hash,next),'utf8')>MAX_BATCH_BYTES){
   if(!current.length)throw Error('Uma avaliação excede o limite do lote.');
   batches.push(stagingBatch(hash,current));current=[row];
   if(Buffer.byteLength(stagingBatch(hash,current),'utf8')>MAX_BATCH_BYTES)throw Error('Uma avaliação excede o limite do lote.');
  }else current=next;
 }
 if(current.length)batches.push(stagingBatch(hash,current));return batches;
}
function localDate(value){
 if(!value)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value+'T00:00:00';
 const serial=Number(value);if(!Number.isFinite(serial)||serial<1||serial>100000)throw Error('Data inválida.');
 return new Date(Date.UTC(1899,11,30)+Math.round(serial*86400)*1000).toISOString().slice(0,19);
}
function prepareFeedback(source){
 if(!source||!/^[a-f0-9]{64}$/.test(source.sha256)||!Array.isArray(source.rows)||!source.rows.length)throw Error('Relatório inválido.');
 const seen=new Set(),counts={};
 const rows=source.rows.map(r=>{
  const title=r['Título'],phase=r['Fase atual'];
  if(!Number.isSafeInteger(r.sourceRow)||r.sourceRow<2||seen.has(r.sourceRow)||typeof title!=='string'||!title.trim()||!['Feedback','Em andamento','Concluído'].includes(phase))throw Error('Linha inválida.');
  seen.add(r.sourceRow);counts[phase]=(counts[phase]||0)+1;
  const hash=createHash('sha256').update(source.sha256+':feedback:'+r.sourceRow).digest('hex');
  const id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-5'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
  const location=locationFromTitle(title),labels=(r['Etiquetas']||'').split(',').map(x=>x.trim());
  const grades=['Alta','Média','Baixa'].filter(g=>labels.includes(g));
  const created=localDate(r['Criado em']);if(!created)throw Error('Data de criação ausente.');
  const data={assunto:title,hotel:location.hotel||'Condomínio a conferir',apartamento:location.apartment||'A conferir',grau:grades.length===1?grades[0]:grades.length?'A conferir':'Não informado',observacoes:r['Descrição do feedback']||'',anexos:[],importacao:{parcial:true,origem:'Pipefy',hash:source.sha256,arquivo:source.sourceFile,linha:r.sourceRow,faseOriginal:phase,criadoEmLocal:created,finalizadoEmLocal:localDate(r['Finalizado em']),fusoFonte:'Não informado',original:r}};
  return {id,sourceRow:r.sourceRow,phase,data,response:r['Resposta Ao Cliente']||''};
 });
 const hash=quote(source.sha256),cell=v=>'"'+String(v).replaceAll('"','""')+'"';
 const csv='source_hash,source_line,payload\r\n'+rows.map(r=>[source.sha256,r.sourceRow,JSON.stringify(r)].map(cell).join(',')).join('\r\n')+'\r\n';
 const setup=fs.readFileSync(path.join(__dirname,'history-stage.sql'),'utf8').replaceAll('__HASH__',hash);
 const sql=fs.readFileSync(path.join(__dirname,'feedback-import.sql'),'utf8').replaceAll('__HASH__',hash).replaceAll('__COUNT__',String(rows.length));
 return {rows,counts,csv,setup,sql,batches:stagingBatches(source.sha256,rows)};
}
if(require.main===module){
 const [input,out]=process.argv.slice(2);if(!input||!out)throw Error('Informe source.json e a pasta de saída.');
 const plan=prepareFeedback(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')));fs.mkdirSync(out,{recursive:true});
 for(const [name,content] of [['01-PREPARAR-FEEDBACKS.sql',plan.setup],['02-DADOS-FEEDBACKS.csv',plan.csv],['03-CONCLUIR-FEEDBACKS.sql',plan.sql]])fs.writeFileSync(path.join(out,name),content);
 const batchDir=path.join(out,'lotes-sql');fs.mkdirSync(batchDir,{recursive:true});
 plan.batches.forEach((sql,i)=>fs.writeFileSync(path.join(batchDir,'LOTE-'+String(i+1).padStart(2,'0')+'.sql'),sql));
 fs.writeFileSync(path.join(batchDir,'LEIA-ME.txt'),`Execute cada LOTE no SQL Editor, em ordem, um por vez. São ${plan.batches.length} arquivos. Pode repetir um lote sem duplicar as linhas. Não execute o preparo entre os lotes. O último deve mostrar ${plan.rows.length} linhas_carregadas. Depois execute ../03-CONCLUIR-FEEDBACKS.sql. Os lotes só carregam dados temporários de importação; não alteram os feedbacks existentes. Não precisa importar o CSV neste método.\n`);
 console.log(JSON.stringify({count:plan.rows.length,phases:plan.counts,identified:plan.rows.filter(r=>r.data.hotel!=='Condomínio a conferir').length,batches:plan.batches.length}));
}
module.exports={prepareFeedback,localDate,stagingBatch,MAX_BATCH_BYTES};
