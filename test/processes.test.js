const {test}=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');
const {definitions,date,csv,nextInspection}=require('../assets/processes');const {validateProcess,validateFlow}=require('../server/processes');const {createSupabaseApp}=require('../server/supabase-app');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('quadro contém quatro etapas e agrupa os registros antigos sem concluir cards reabertos',()=>{
 const {flowPhases,phaseLabel,servicePhase,orderStatusLabel}=require('../assets/processes');
 assert.deepEqual(flowPhases.ordensServico.map(phaseLabel),['Novo','Andamento','Recusado','Finalizado']);
 assert.deepEqual(['Aberta','Em andamento','Recusada','Finalizada'].map(orderStatusLabel),flowPhases.ordensServico.map(phaseLabel));
 assert.equal(servicePhase({data:{status:'Recusada'}}),'Recusa proprietário');
 for(const phase of ['Aguardando proprietário','Pendente fornecedor','Conferência'])assert.equal(servicePhase({phase,data:{status:'Aberta'}}),'Em andamento');
 assert.equal(servicePhase({phase:'Preventivos periódicos',data:{status:'Aberta'}}),'Novo');
 assert.equal(servicePhase({phase:'Resolvido',data:{status:'Em andamento'}}),'Em andamento');
 assert.equal(servicePhase({phase:'Recusa proprietário',data:{status:'Finalizada'}}),'Resolvido');
 assert.throws(()=>validateFlow({source:'ordensServico',id:'123',version:0,recordVersion:1,phase:'Aguardando proprietário',data:{}}));
});
function example(kind){const data={titulo:'Registro de teste',observacoes:'Informações',prioridade:'Normal',responsavel:null,prazo:'2026-11-10',anexos:[],checks:{}};for(const f of definitions[kind].fields)data[f.key]=f.required?(f.type==='select'?f.options[0]:f.type==='number'?'2':f.type==='user'?id:f.type==='date'?'2026-11-10':'Teste'):'';if(kind==='reservas')data.checkout='2026-11-12';return {id,kind,version:0,phase:definitions[kind].phases[0],hotel:'Be Urban',apartment:'214',data};}
test('rotina valida todos os processos, datas reais, campos protegidos e valores decimais',()=>{
 for(const kind of Object.keys(definitions)){const input=example(kind);assert.equal(validateProcess(input).kind,kind);}
 assert.equal(date('2026-02-30'),false);assert.equal(date('2028-02-29'),true);
 assert.equal(nextInspection('2026-01-31'),'2026-04-30');assert.equal(nextInspection('2026-10-20'),'2027-01-20');
 const project=example('projetos');project.data.custoPrevisto='12,50';project.data.service_id='forjado';assert.equal(validateProcess(project).data.custoPrevisto,'12.50');assert.equal(validateProcess(project).data.service_id,undefined);
 assert.throws(()=>validateProcess({...project,kind:'__proto__'}),e=>e.status===400);
 assert.throws(()=>validateProcess({...project,data:{...project.data,custoPrevisto:'1.234'}}),e=>e.status===400);
 const reservation=example('reservas');assert.throws(()=>validateProcess({...reservation,data:{...reservation.data,checkout:'2026-11-09'}}));
 assert.throws(()=>validateFlow({source:'__proto__',id,version:0,recordVersion:1,phase:'x',data:{}}),e=>e.status===400);
 assert.throws(()=>validateFlow({source:'ordensServico',id:'123',version:0,recordVersion:1,phase:'Novo',data:{owner_id:id}}),e=>e.status===400);
});
test('exportação da rotina mantém conteúdo e neutraliza fórmulas de planilhas',()=>{
 const output=csv([['Título','Comentário'],['=1+1','Texto; "citado"'],[' @SOMA(A1)','Linha\nseguinte']]);assert.ok(output.startsWith('\ufeff'));assert.ok(output.includes("'="));assert.ok(output.includes("' @"));assert.ok(output.includes('"Texto; ""citado"""'));
});
test('rotina: API protege abas, condomínio e recebimento de estoque',async t=>{
 let profile={id,funcao:'adm',tabs:['danos']};const saved=[];
 const provider={async login(){return {access_token:'token'};},async profile(){return profile;},async access(){return [{hotel:'Be Urban'}];},async processes(){return {rows:[],total:0,counts:{}};},async saveProcess(token,input){saved.push(input);}};
 const app=createSupabaseApp(provider);app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(r=>app.close(r)));
 const base='http://127.0.0.1:'+app.address().port;
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'test@example.com',senha:'test'})});const cookie=login.headers.get('set-cookie').split(';')[0];
 const call=(url,data)=>fetch(base+url,{headers:{Cookie:cookie,'Content-Type':'application/json'},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 assert.equal((await call('/api/processes?kind=danos')).status,200);
 assert.equal((await call('/api/processes',example('danos'))).status,200);assert.equal(saved.length,1);
 assert.equal((await call('/api/processes',{...example('danos'),hotel:'Housi'})).status,403);
 for(const removed of ['reservas','projetos','compras','onboarding']){
  assert.equal((await call('/api/processes?kind='+removed)).status,410);
  assert.equal((await call('/api/processes',example(removed))).status,410);
 }
 assert.equal((await call('/api/processes/flow?source=ordensServico&id=123')).status,403);
 assert.equal((await call('/api/processes/comment',{source:'feedbacks',id,body:'Comentário indevido'})).status,403);
 assert.equal((await call('/api/processes?kind=__proto__')).status,400);
 assert.equal((await call('/api/processes/receive',{})).status,403);
 assert.equal((await call('/api/processes/service',{})).status,403);
 profile={...profile,funcao:'cliente'};assert.equal((await call('/api/processes?kind=reservas')).status,403);
});
