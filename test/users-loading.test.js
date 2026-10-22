const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');

test('lista de usuários informa falha, libera o botão e permite nova tentativa', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value:'',style:{},textContent:'',disabled:false,setAttribute(){},removeAttribute(){},querySelectorAll(){return [];} });
    return elements.get(id);
  };
  let fail = true, calls = 0;
  const context={document:{getElementById:get,addEventListener(){}},BookAPI:{async request(url,options){calls++;assert.equal(options.timeoutMs,30000);if(fail)throw new Error('Conexão indisponível');return {users:[],canCreate:false};}}};
  context.window=context;
  vm.runInNewContext(readFileSync('adm/usuarios.js','utf8'),context);
  await context.BookUsers.load();
  assert.equal(get('novoUsuario').disabled,false);
  assert.match(get('usuariosStatus').textContent,/Conexão indisponível/);
  fail=false;await context.BookUsers.load();
  assert.equal(calls,2);assert.equal(get('novoUsuario').disabled,false);
  assert.match(get('usuariosStatus').textContent,/SUPABASE_SECRET_KEY/);
  await context.BookUsers.open();
  assert.match(get('usuariosStatus').textContent,/sb_secret_/);
});

test('limite de espera inclui corpo da resposta e alerta sobre gravação incerta', async () => {
  const hold=setTimeout(()=>{},1000);
  try {
    const context={AbortSignal,Error,fetch:async(url,options)=>({ok:true,json:()=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});})})};
    context.window=context;vm.runInNewContext(readFileSync('assets/api.js','utf8'),context);
    await assert.rejects(context.BookAPI.request('/api/manage/users',{timeoutMs:5}),/demorou a responder/);
    await assert.rejects(context.BookAPI.request('/api/manage/users',{timeoutMs:5,method:'POST'}),/Não foi possível confirmar a gravação/);
  } finally {clearTimeout(hold);}
});
