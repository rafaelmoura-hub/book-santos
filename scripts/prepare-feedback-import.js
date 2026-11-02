const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {locationFromTitle}=require('./prepare-history-import');
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
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
 return {rows,counts,csv,setup,sql};
}
if(require.main===module){
 const [input,out]=process.argv.slice(2);if(!input||!out)throw Error('Informe source.json e a pasta de saída.');
 const plan=prepareFeedback(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')));fs.mkdirSync(out,{recursive:true});
 for(const [name,content] of [['01-PREPARAR-FEEDBACKS.sql',plan.setup],['02-DADOS-FEEDBACKS.csv',plan.csv],['03-CONCLUIR-FEEDBACKS.sql',plan.sql]])fs.writeFileSync(path.join(out,name),content);
 console.log(JSON.stringify({count:plan.rows.length,phases:plan.counts,identified:plan.rows.filter(r=>r.data.hotel!=='Condomínio a conferir').length}));
}
module.exports={prepareFeedback,localDate};
