const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSupabase } = require('../server/supabase');
const { createSupabaseApp } = require('../server/supabase-app');
const { validateUser } = require('../server/users');
const id='55555555-5555-4555-8555-555555555555';
const input={nome:'Teste',login:'novo@example.com',senha:'senha-longa-de-teste',funcao:'cliente',hotels:['Unlimited']};

test('cadastro valida funções, senha, hotéis e não aceita promoção a mestre',()=>{
  assert.equal(validateUser(input).login,'novo@example.com');
  for(const change of [{mestre:true},{funcao:'mestre'},{senha:'curta'},{hotels:['Outro']},{hotels:['Unique','Unique']},{id,version:1}])assert.throws(()=>validateUser({...input,...change}));
  assert.equal(validateUser({id,version:1,nome:'Novo',funcao:'adm',hotels:[]}).id,id);
});

test('somente mestre gerencia contas; dados privados não retornam ao navegador',async t=>{
  let master=false; const saved=[];
  const provider={canCreateUsers:true,async login(){return {access_token:'token'};},async profile(){return {id:'master',funcao:'adm',mestre:master};},async managedUsers(){return [{id,nome:'Novo'}];},async saveUser(token,value){saved.push(value);}};
  const server=createSupabaseApp(provider);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'master@example.com',senha:'senha'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const req=(method='GET',body)=>fetch(base+'/api/manage/users',{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  assert.equal((await req()).status,403);assert.equal((await req('POST',input)).status,403);assert.equal(saved.length,0);
  master=true;assert.deepEqual(await (await req()).json(),{users:[{id,nome:'Novo'}],canCreate:true});
  const response=await req('POST',input);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.equal(saved.length,1);
  assert.equal((await req('POST',{...input,mestre:true})).status,400);
  const old=await fetch(base+'/hotel/hotel.html',{headers:{Cookie:cookie},redirect:'manual'});assert.equal(old.status,302);assert.equal(old.headers.get('location'),'/adm/admin.html#condominios');
});

test('chave administrativa somente em chamadas Auth; perfil usa identidade do mestre',async()=>{
  const calls=[];let failed=false;
  const provider=createSupabase({url:'https://example.supabase.co',key:'sb_publishable_test',secretKey:'sb_secret_private',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.pathname==='/auth/v1/user')return Response.json({id:'master'});
    if(url.pathname==='/auth/v1/admin/users')return Response.json({id});
    if(url.pathname==='/rest/v1/rpc/book_manage_user')return failed?Response.json({code:'22023',message:'Inválido'},{status:400}):Response.json(null);
    if(url.pathname===`/auth/v1/admin/users/${id}`)return Response.json({});
    if(url.searchParams.has('id')&&url.searchParams.get('id')===`eq.${id}`)return Response.json([]);
    return Response.json([{id:'master',funcao:'adm',mestre:true}]);
  }});
  await provider.saveUser('master-session',input);
  const admin=calls.find(call=>call.url.pathname==='/auth/v1/admin/users');
  assert.equal(admin.options.headers.apikey,'sb_secret_private');assert.equal(JSON.parse(admin.options.body).email_confirm,true);
  const rpc=calls.find(call=>call.url.pathname==='/rest/v1/rpc/book_manage_user');
  assert.equal(rpc.options.headers.apikey,'sb_publishable_test');assert.equal(rpc.options.headers.Authorization,'Bearer master-session');assert.ok(!rpc.options.body.includes(input.senha));
  failed=true;await assert.rejects(provider.saveUser('master-session',input),/Inválido/);
  assert.equal(calls.at(-1).options.method,'DELETE');
});

test('conta com perfil confirmado não é apagada após resposta perdida',async()=>{
  let deleted=false;
  const provider=createSupabase({url:'https://example.supabase.co',key:'sb_publishable_test',secretKey:'sb_secret_private',fetchImpl:async(url,options)=>{
    if(url.pathname==='/auth/v1/user')return Response.json({id:'master'});
    if(url.pathname==='/auth/v1/admin/users')return Response.json({id});
    if(options.method==='DELETE'){deleted=true;return Response.json({});}
    if(url.pathname==='/rest/v1/rpc/book_manage_user')throw new Error('lost response');
    if(url.searchParams.get('id')===`eq.${id}`)return Response.json([{id}]);
    return Response.json([{id:'master',funcao:'adm',mestre:true}]);
  }});
  await provider.saveUser('master-session',input);assert.equal(deleted,false);
});
