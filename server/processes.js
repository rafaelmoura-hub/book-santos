const {definitions,flowPhases,date}=require('../assets/processes');
const {uuid}=require('./workspace');const Money=require('../assets/money');
const fail=m=>Object.assign(new Error(m),{status:400});
function validateProcess(input){
 if(!input||!uuid(input.id)||!Number.isSafeInteger(input.version)||input.version<0||!Object.hasOwn(definitions,input.kind)||!input.data||Array.isArray(input.data)||typeof input.data!=='object')throw fail('Processo inválido.');
 const def=definitions[input.kind],d=input.data;
 if(typeof d.titulo!=='string'||!d.titulo.trim()||d.titulo.length>160||typeof d.observacoes!=='string'||d.observacoes.length>8000||!def.phases.includes(input.phase)||!['Normal','Alta','Urgente'].includes(d.prioridade)||d.responsavel!==null&&!uuid(d.responsavel)||d.prazo&&!date(d.prazo)||!Array.isArray(d.anexos)||d.anexos.length>20||d.anexos.some(a=>!a||typeof a.nome!=='string'||a.nome.length>200||typeof a.dados!=='string'))throw fail('Preencha título, etapa, prazo e responsável válidos.');
 const data={titulo:d.titulo.trim(),observacoes:d.observacoes,prioridade:d.prioridade,responsavel:d.responsavel,prazo:d.prazo||'',anexos:d.anexos.map(a=>({nome:a.nome,dados:a.dados})),checks:{}};
 if(!d.checks||typeof d.checks!=='object'||Array.isArray(d.checks)||Object.entries(d.checks).some(([k,v])=>!def.checks.includes(k)||typeof v!=='boolean'))throw fail('Checklist inválido.');data.checks=d.checks;
 for(const field of def.fields){let value=d[field.key]??'';if(typeof value!=='string'||value.length>(field.type==='textarea'?4000:200)||field.required&&!value.trim())throw fail('Informe '+field.label+'.');if(value){if(field.type==='date'&&!date(value)||field.type==='number'&&(!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>10000)||field.type==='user'&&!uuid(value)||field.type==='select'&&!field.options.includes(value))throw fail('Valor inválido: '+field.label);if(field.type==='money'){try{value=Money.parse(value);}catch{throw fail('Valor monetário inválido: '+field.label);}}}data[field.key]=value;}
 if(input.kind==='reservas'&&data.checkout<=data.checkin)throw fail('O check-out deve ser posterior ao check-in.');
 if(input.kind==='desempenho'&&data.fim<data.inicio||input.kind==='projetos'&&data.inicio&&data.conclusao&&data.conclusao<data.inicio)throw fail('O fim do período deve ser posterior ao início.');
 return {id:input.id,version:input.version,kind:input.kind,phase:input.phase,hotel:input.hotel||null,apartment:input.apartment||null,data};
}
function validateFlow(input){
 if(!input||!Object.hasOwn(flowPhases,input.source)||!(input.source==='feedbacks'?uuid(input.id):typeof input.id==='string'&&/^\d{1,16}$/.test(input.id))||!Number.isSafeInteger(input.version)||input.version<0||!Number.isSafeInteger(input.recordVersion)||input.recordVersion<1||!flowPhases[input.source].includes(input.phase))throw fail('Etapa ou versão inválida.');
 const d=input.data;if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['origem','prestador','motivo','respostaCliente','resolvidoPor','responsavel','prazo','proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado'].includes(k)))throw fail('Dados de acompanhamento inválidos.');
 for(const [k,v]of Object.entries(d))if(['proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado'].includes(k)?typeof v!=='boolean':typeof v!=='string'||v.length>2000)throw fail('Campo de acompanhamento inválido.');
 if(d.responsavel&&!uuid(d.responsavel)||d.prazo&&!date(d.prazo))throw fail('Responsável ou prazo inválido.');
 return {source:input.source,id:input.id,version:input.version,recordVersion:input.recordVersion,phase:input.phase,data:d};
}
module.exports={validateProcess,validateFlow};
