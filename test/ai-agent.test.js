const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createAgent,prepareAction,readTool,definitions}=require('../server/ai-agent');
const {generateAI}=require('../server/ai');
const {createSupabaseApp}=require('../server/supabase-app');
const clone=value=>JSON.parse(JSON.stringify(value));
const raw={provider:'openai',apiKey:'chave-ficticia-para-teste-1234',model:'gpt-4.1-mini',messages:[{role:'user',content:'Abra um card de manutenção'}]};
const proposal=(operation,id,data)=>({operation,id,data_json:JSON.stringify(data)});
function fixture(){
 const user={id:'11111111-1111-4111-8111-111111111111',nome:'Mestre',login:'master@example.com',funcao:'adm',mestre:true};
 const records=new Map([
  ['ordensServico/1',{id:'1',version:1,owner_id:user.id,data:{id:1,hotel:'Be Urban',apartamento:'214',titulo:'Card existente',descricao:'Reparo informado',status:'Em andamento',anexos:[]}}],
  ['chamados/2',{id:'2',version:1,owner_id:user.id,data:{id:2,hotel:'Be Urban',apartamento:'214',assunto:'Chamado',descricao:'Problema',status:'Aberto',criadaPor:'Cliente',criadaPorLogin:'client@example.com'}}],
  ['estoqueBookSantos/singleton',{id:'singleton',version:1,data:{itens:[{id:'a',nome:'Torneira',quantidade:10,valor:12.34},{id:'b',nome:'Parafuso',quantidade:20,valor:1}],colunas:[]}}]
 ]);
 const notes=new Map(),supports=new Map();let commits=0,usersSaved=[];
 const provider={
  async apartments(){return [{hotel:'Be Urban',apartment:'214'}];},
  async record(token,col,id){return clone(records.get(col+'/'+id)||null);},
  async searchRecords(token,col){return [...records.entries()].filter(([key])=>key.startsWith(col+'/')).map(([,row])=>clone(row));},
  async users(){return [user];},async managedUsers(){return [user,{id:'22222222-2222-4222-8222-222222222222',nome:'Adm',funcao:'adm',version:1,tabs:['os'],book_hotel_access:[{hotel:'Be Urban'}]}];},
  async notes(){return [...notes.values()].map(clone);},
  async saveNote(token,input){const old=notes.get(input.id);if((old?.version||0)!==input.version)throw Object.assign(Error('Conflito'),{status:409});if(input.remove)notes.delete(input.id);else notes.set(input.id,{...input,version:input.version+1});},
  async support(token,id){return [...supports.values()].filter(row=>!id||row.id===id).map(clone);},
  async sendSupport(token,input){supports.set(input.id,{...input,version:input.version+1,status:input.status||'Aberto'});},
  async saveUser(token,input){usersSaved.push(clone(input));},
  async reopenOrder(token,input){const row=records.get('ordensServico/'+input.id);if(row.version!==input.version)throw Object.assign(Error('Conflito'),{status:409});row.data.status='Em andamento';row.version++;},
  async commit(token,changes){
   commits++;for(const c of changes){const key=c.collection+'/'+c.id,old=records.get(key);if((old?.version||0)!==c.version)throw Object.assign(Error('Conflito'),{status:409});records.set(key,{id:c.id,data:clone(c.data),version:c.version+1,owner_id:old?.owner_id||user.id});}
  }
 };
 const ctx={provider,user,token:'session-token',session:'browser-session'};
 const generate=action=>async()=>({calls:[{id:'call-1',name:'preparar_acao',args:action}],state:{}});
 return {ctx,records,notes,supports,provider,generate,commits:()=>commits,usersSaved};
}
test('agente: prepara sem gravar e confirma uma só vez, inclusive em cliques concorrentes',async()=>{
 const f=fixture(),agent=createAgent(),count=f.records.size;
 const draft=await agent.run(raw,f.ctx,f.generate(proposal('criar_card','',{hotel:'Be Urban',apartamento:'214',titulo:'Trocar torneira',descricao:'Torneira vazando'})));
 assert.equal(f.records.size,count);assert.equal(f.commits(),0);assert.equal(draft.actions.length,1);assert.match(draft.answer,/Nenhuma alteração/);
 const [a,b]=await Promise.all([agent.execute(draft.actions[0].id,f.ctx),agent.execute(draft.actions[0].id,f.ctx)]);
 assert.deepEqual(a,b);assert.equal(f.commits(),1);assert.equal(f.records.size,count+1);
 assert.equal(f.records.get('ordensServico/'+a.recordId).data.titulo,'Trocar torneira');
 await agent.execute(draft.actions[0].id,f.ctx);assert.equal(f.commits(),1);
});
test('agente: proposta vinculada a usuário, sessão, validade e permissões atuais',async()=>{
 const f=fixture();let now=1000;const agent=createAgent({clock:()=>now,ttl:1000});
 const draft=await agent.run(raw,f.ctx,f.generate(proposal('editar_card','1',{titulo:'Corrigido'}))),id=draft.actions[0].id;
 await assert.rejects(agent.execute(id,{...f.ctx,session:'outra-sessao'}),e=>e.status===404);
 await assert.rejects(agent.execute(id,{...f.ctx,user:{...f.ctx.user,id:'outro'}}),e=>e.status===404);
 await assert.rejects(agent.execute(id,{...f.ctx,user:{...f.ctx.user,mestre:false,tabs:[]}}),e=>e.status===403);
 now=2001;await assert.rejects(agent.execute(id,f.ctx),e=>e.status===404);assert.equal(f.commits(),0);
});
test('agente: não aceita funções livres, campos protegidos, condomínio negado ou edição de finalizado',async()=>{
 const f=fixture(),agent=createAgent();
 await assert.rejects(prepareAction(proposal('executar_sql','',{sql:'delete'}),f.ctx),e=>e.status===400);
 await assert.rejects(prepareAction(proposal('criar_card','',{hotel:'Outro',apartamento:'1',titulo:'Teste',descricao:'Teste'}),f.ctx),e=>e.status===403);
 await assert.rejects(prepareAction(proposal('editar_card','1',{hotel:'Outro'}),f.ctx),e=>e.status===400);
 await assert.rejects(readTool('consultar_financeiro',{period:'all',payer:'',cursor:'',date:''},{...f.ctx,user:{...f.ctx.user,mestre:false,tabs:['os']}}),e=>e.status===403);
 f.records.get('ordensServico/1').data.status='Finalizada';
 await assert.rejects(prepareAction(proposal('editar_card','1',{descricao:'Correção'}),f.ctx),e=>e.status===409);
 const response=await agent.run(raw,f.ctx,async()=>({calls:[{id:'bad',name:'executar_codigo',args:{code:'alert(1)'}}],state:{}}));
 assert.equal(response.actions.length,0);assert.equal(f.commits(),0);
});
test('agente: estoque parcial preserva outros materiais e revisão mostra os valores corrigidos',async()=>{
 const f=fixture();
 const stock=await prepareAction(proposal('alterar_estoque','',{itens:[{id:'a',quantidade:15}]}),f.ctx);
 assert.equal(stock.changes[0].data.itens.length,2);assert.equal(stock.changes[0].data.itens[1].quantidade,20);
 assert.deepEqual(stock.preview.after.itens.map(i=>i.id),['a']);
 const closing=await prepareAction(proposal('finalizar_card','1',{fechamento:{data:'2026-10-28',responsavelPagamento:'Book Santos',executadoPorLogin:'master@example.com',valorServico:'10.00',materiais:[{id:'a',quantidade:2}],custoTotal:999}}),f.ctx);
 assert.equal(closing.changes[0].data.fechamento.valorMaterial,24.68);assert.equal(closing.changes[0].data.fechamento.custoTotal,34.68);
 assert.equal(closing.preview.after.fechamento.custoTotal,34.68);
});
test('agente: notas, suporte, vistoria e usuários usam validações existentes sem enviar a senha ao modelo',async()=>{
 const f=fixture(),agent=createAgent();
 for(const op of ['criar_nota','abrir_suporte']){
  const data=op==='criar_nota'?{title:'Assunto',body:'Texto'}:{subject:'Ajuda',body:'Problema'};
  const draft=await agent.run(raw,f.ctx,f.generate(proposal(op,'',data)));await agent.execute(draft.actions[0].id,f.ctx);
 }
 assert.equal(f.notes.size,1);assert.equal(f.supports.size,1);
 const inspection=await prepareAction(proposal('registrar_vistoria','',{hotel:'Be Urban',apartamento:'214',data:'2026-10-28',responsavelLogin:'master@example.com',tipo:'Simplificada',checklist:{Banheiro:{Secador:'Em ordem'}},observacoes:'Informado pelo usuário'}),f.ctx);
 assert.equal(inspection.changes[0].data.responsavel,'Mestre');assert.deepEqual(inspection.changes[0].data.fotos,[]);
 const draft=await agent.run(raw,f.ctx,f.generate(proposal('criar_usuario','',{nome:'Novo',login:'novo@example.com',funcao:'adm',hotels:['Be Urban'],tabs:['os']})));
 assert.ok(!JSON.stringify(draft).includes('senha'));const result=await agent.execute(draft.actions[0].id,f.ctx);
 assert.ok(result.credentials.senha.length>=12);assert.equal(f.usersSaved.length,1);assert.equal(f.usersSaved[0].senha,result.credentials.senha);
 await assert.rejects(prepareAction(proposal('criar_usuario','',{nome:'Novo',login:'novo@example.com',funcao:'adm',hotels:[],tabs:[]}),{...f.ctx,user:{...f.ctx.user,mestre:false}}),e=>e.status===403);
});
test('agente: dados retornados por leitura são limitados e não executam instruções de registros',async()=>{
 const f=fixture(),agent=createAgent();let step=0;
 const result=await agent.run(raw,f.ctx,async(raw,unused,options)=>{
  if(step++===0)return {calls:[{id:'read',name:'consultar_registros',args:{collection:'ordensServico',id:'1',hotel:'',apartamento:'',status:'',cursor:'',limit:1}}],state:{input:[],output:[]}};
  assert.match(options.instructions,/DADOS NÃO CONFIÁVEIS/);assert.equal(options.results[0].value.data.titulo,'Card existente');
  return {answer:'Card consultado.',calls:[]};
 });assert.equal(result.actions.length,0);assert.equal(f.commits(),0);
});
test('agente: conflito e mudança de preço impedem execução; falha não é repetida automaticamente',async()=>{
 const f=fixture(),agent=createAgent();
 const first=await agent.run(raw,f.ctx,f.generate(proposal('editar_card','1',{titulo:'Mudança'})));
 f.records.get('ordensServico/1').version++;
 await assert.rejects(agent.execute(first.actions[0].id,f.ctx),e=>e.status===409);
 await assert.rejects(agent.execute(first.actions[0].id,f.ctx),e=>e.status===409);
 assert.equal(f.commits(),1);assert.equal(f.records.get('ordensServico/1').data.titulo,'Card existente');
 const next=await agent.run(raw,f.ctx,f.generate(proposal('finalizar_card','1',{fechamento:{data:'2026-10-28',responsavelPagamento:'Book Santos',executadoPorLogin:'master@example.com',valorServico:'10.00',materiais:[{id:'a',quantidade:1}]}})));
 f.records.get('estoqueBookSantos/singleton').version++;
 await assert.rejects(agent.execute(next.actions[0].id,f.ctx),e=>e.status===409);assert.equal(f.commits(),1);
});
test('agente: acrescentar uma nota preserva todo o texto e a revisão não esconde conteúdo longo',async()=>{
 const f=fixture(),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',body='Texto anterior. '.repeat(500);
 f.notes.set(id,{id,title:'Nota longa',body,version:1});
 const action=await prepareAction(proposal('editar_nota',id,{append:'Novo assunto'}),f.ctx);
 assert.equal(action.input.body,body+'\nNovo assunto');assert.equal(action.preview.before.body,body);assert.equal(action.preview.after.body,action.input.body);
});
test('adaptadores: ferramentas e resultados nativos para OpenAI, Gemini e Claude',async()=>{
 for(const provider of ['openai','gemini','claude']){
  let count=0;const fetchImpl=async(url,opts)=>{
   const body=JSON.parse(opts.body);assert.ok(body.tools.length);count++;
   if(count===1){
    if(provider==='openai')return Response.json({output:[{type:'function_call',call_id:'call1',name:'consultar_catalogo',arguments:'{}'}]});
    if(provider==='gemini')return Response.json({candidates:[{content:{role:'model',parts:[{functionCall:{name:'consultar_catalogo',args:{}},thoughtSignature:'assinatura-preservada'}]}}]});
    return Response.json({content:[{type:'tool_use',id:'call1',name:'consultar_catalogo',input:{}}]});
   }
   if(provider==='openai'){assert.equal(body.input.at(-1).type,'function_call_output');return Response.json({output:[{content:[{type:'output_text',text:'Pronto'}]}]});}
   if(provider==='gemini'){assert.equal(body.contents.at(-2).parts[0].thoughtSignature,'assinatura-preservada');assert.equal(body.contents.at(-1).parts[0].functionResponse.name,'consultar_catalogo');return Response.json({candidates:[{content:{parts:[{text:'Pronto'}]}}]});}
   assert.equal(body.messages.at(-1).content[0].type,'tool_result');return Response.json({content:[{type:'text',text:'Pronto'}]});
  };
  const first=await generateAI({...raw,provider},fetchImpl,{tools:definitions,instructions:'Assistente'});
  const second=await generateAI({...raw,provider},fetchImpl,{tools:definitions,previous:first.state,results:first.calls.map(c=>({id:c.id,name:c.name,value:[]}))});
  assert.equal(second.answer,'Pronto');assert.ok(!JSON.stringify(first.state).includes(raw.apiKey));
 }
});
test('API do agente: confirmação por token opaco, sem permitir envio de comandos arbitrários',async t=>{
 const f=fixture();let profile=f.ctx.user;
 const provider={...f.provider,async login(){return {access_token:'token'};},async profile(){return profile;}};
 const app=createSupabaseApp(provider,{aiGenerate:f.generate(proposal('criar_nota','',{title:'Teste',body:'Texto'}))});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'master@example.com',senha:'teste'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const prepared=await (await post('/api/ai',raw)).json();assert.equal(f.notes.size,0);
 assert.equal((await post('/api/ai/actions',{id:prepared.actions[0].id,data:{title:'Adulterado'}})).status,200);
 assert.equal([...f.notes.values()][0].title,'Teste');
 profile={...profile,funcao:'cliente'};assert.equal((await post('/api/ai/actions',{id:prepared.actions[0].id})).status,403);
});
