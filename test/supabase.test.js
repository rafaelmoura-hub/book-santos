const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSupabase } = require('../server/supabase');
const { createSupabaseApp } = require('../server/supabase-app');

test('cliente Supabase envia chave pública e valida usuário antes do perfil', async () => {
  const calls = [];
  const client = createSupabase({ url: 'https://example.supabase.co', key: 'sb_publishable_test', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-id' });
    return Response.json([{ id: 'user-id', funcao: 'cliente' }]);
  } });
  assert.equal((await client.profile('access-token')).id, 'user-id');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.apikey, 'sb_publishable_test');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token');
  assert.equal(calls[1].url.searchParams.get('id'), 'eq.user-id');
  assert.throws(() => createSupabase({ url: 'http://example.com', key: 'sb_publishable_test' }));
});

test('erros de rede e migração pendente têm mensagens claras', async () => {
  const config = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
  const offline = createSupabase({ ...config, fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(offline.check(), error => error.status === 503);
  const pending = createSupabase({ ...config, fetchImpl: async () => Response.json({ code: 'PGRST205' }, { status: 404 }) });
  await assert.rejects(pending.profile('token'), /migração SQL/);
  const truncated = createSupabase({ ...config, fetchImpl: async () => new Response('{incompleto', { status: 200, headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(truncated.backup('token',['chamados']), /Resposta incompleta/);
});

test('leitura normaliza o histórico Unique e prontidão exige as migrações novas', async () => {
  let version=3;
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_publishable_test',fetchImpl:async url=>{
    if(url.pathname==='/auth/v1/settings')return Response.json({});
    if(url.pathname.endsWith('book_schema_version'))return Response.json(version);
    if(url.pathname.endsWith('book_finance_history'))return Response.json({records:[{hotel:'Unique'}],groups:[]});
    if(url.pathname.endsWith('book_hotel_access'))return Response.json([{hotel:'Unique'}]);
    return Response.json([{id:'1',version:1,hotel:'Unique',data:{hotel:'Unique',apartamento:'904'}}]);
  }});
  assert.equal((await client.records('token','chamados')).rows[0].data.hotel,'Unique Residence');
  assert.equal((await client.finance('token')).records[0].hotel,'Unique Residence');
  assert.equal((await client.access('token'))[0].hotel,'Unique Residence');
  await assert.rejects(client.ready(),/202610280013/);
  version=13;assert.deepEqual(await client.ready(),{ok:true});
});

test('servidor Supabase protege sessão, perfis, arquivos e saída', async t => {
  let role = 'adm';
  let permitted = true;
  const loggedOut = [];
  const commits = [];
  const provider = {
    async login(email, password) {
      if (password !== 'senha-correta') throw Object.assign(new Error('Inválido'), { status: 401 });
      return { access_token: 'private-token', refresh_token: 'private-refresh', expires_in: 3600 };
    },
    async profile(token) {
      assert.equal(token, 'private-token');
      if (!permitted) throw Object.assign(new Error('Perfil removido'), { status: 403 });
      return { id: 'uid', nome: 'Teste', login: 'teste@example.com', funcao: role, mestre: role === 'adm' };
    },
    async users() { return [{ id: 'uid', nome: 'Teste' }]; },
    async records(token, collection) { return { rows: [{ id: '101', version: 1, data: { hotel: 'Unlimited' } }], next: null }; },
    async access() { return [{ hotel: 'Unlimited' }]; },
    async apartments() { return [{ hotel: 'Unlimited', apartment: '1111' }]; },
    async finance(token,payer,cursor,start,end) { assert.equal(token,'private-token');return {groups:[],records:[],next:null,payer,cursor,start,end}; },
    async commit(token, changes) { commits.push(changes); },
    async logout(token) { loggedOut.push(token); }
  };
  const server = createSupabaseApp(provider);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (url, method = 'GET', data, cookie, origin) => fetch(base + url, {
    method, redirect: 'manual', body: data ? JSON.stringify(data) : undefined,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }
  });
  assert.equal((await req('/api/session')).status, 401);
  assert.equal((await req('/adm/admin.html')).status, 302);
  assert.equal((await req('/.env')).status, 404);
  assert.equal((await req('/server/supabase.js')).status, 404);
  const css=await req('/assets/ui.css');
  assert.equal(css.status,200);assert.ok(css.headers.get('etag'));
  const cached=await fetch(base+'/assets/ui.css',{headers:{'If-None-Match':css.headers.get('etag')}});
  assert.equal(cached.status,304);assert.equal(await cached.text(),'');
  assert.equal((await req('/api/login', 'POST', { login: 'teste', senha: 'senha-correta' })).status, 400);
  assert.equal((await req('/api/login', 'POST', { login: 'teste@example.com', senha: 'errada' })).status, 401);
  const response = await req('/api/login', 'POST', { login: 'teste@example.com', senha: 'senha-correta' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.provider, 'supabase');
  assert.ok(!JSON.stringify(data).includes('private-token'));
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await req('/api/session', 'GET', undefined, cookie)).status, 200);
  const catalogScript = await req('/assets/catalog.js', 'GET', undefined, cookie);
  assert.equal(catalogScript.status, 200);
  assert.match(await catalogScript.text(), /Lume Alto da Boa Vista/);
  const adminPage = await req('/adm/admin.html', 'GET', undefined, cookie);
  assert.equal(adminPage.headers.get('cache-control'), 'no-store');
  assert.equal((await adminPage.text()).match(/class="hotel" data-hotel=/g).length, 17);
  assert.equal((await req('/api/users', 'GET', undefined, cookie)).status, 200);
  assert.equal((await req('/api/finance?payer=Airbnb','GET',undefined,cookie)).status,200);
  const period = await (await req('/api/finance?period=semana&date=2026-01-01','GET',undefined,cookie)).json();
  assert.equal(period.start,'2025-12-29');assert.equal(period.end,'2026-01-05');
  assert.equal((await req('/api/finance?period=dia&date=2026-02-30','GET',undefined,cookie)).status,400);
  assert.equal((await req('/api/finance?period=outro','GET',undefined,cookie)).status,400);
  assert.deepEqual(await (await req('/api/apartments','GET',undefined,cookie)).json(),[{hotel:'Unlimited',apartment:'1111'}]);
  assert.equal((await req('/api/data?collection=chamados', 'GET', undefined, cookie)).status, 200);
  assert.equal((await req('/api/data?collection=senha', 'GET', undefined, cookie)).status, 400);
  const snapshot = await (await req('/api/snapshot', 'GET', undefined, cookie)).json();
  assert.equal(Object.keys(snapshot).length, 5);
  assert.equal((await req('/api/data', 'POST', { changes: [{ collection:'chamados', id:'101', version:1, data:{ id:101,hotel:'Unlimited',assunto:'Teste' } }] }, cookie)).status, 200);
  assert.equal(commits.length, 1);
  assert.equal((await req('/api/data', 'POST', { changes: [] }, cookie)).status, 400);
  assert.equal((await req('/api/users', 'POST', {}, cookie)).status, 403);
  assert.equal((await req('/api/logout', 'POST', {}, cookie, 'https://evil.test')).status, 403);
  role = 'cliente';
  assert.equal((await req('/api/finance','GET',undefined,cookie)).status,403);
  assert.equal(Object.keys(await (await req('/api/snapshot', 'GET', undefined, cookie)).json()).length, 2);
  assert.equal((await req('/api/data?collection=estoqueBookSantos', 'GET', undefined, cookie)).status, 403);
  assert.equal((await req('/api/users', 'GET', undefined, cookie)).status, 403);
  assert.equal((await req('/adm/admin.html', 'GET', undefined, cookie)).status, 302);
  assert.equal((await req('/cliente/cliente.html', 'GET', undefined, cookie)).status, 200);
  assert.equal((await req('/api/logout', 'POST', {}, cookie)).status, 200);
  assert.deepEqual(loggedOut, ['private-token']);
  assert.equal((await req('/api/session', 'GET', undefined, cookie)).status, 401);
  permitted = false;
  assert.equal((await req('/api/login', 'POST', { login: 'teste@example.com', senha: 'senha-correta' })).status, 403);
});
