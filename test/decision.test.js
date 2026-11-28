const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSupabaseApp } = require('../server/supabase-app');
const { createSupabase } = require('../server/supabase');
const { validateChanges } = require('../server/operations');
const { legalConfig } = require('../server/legal');

test('SAD exige aba, filtra condomínios e informa migração sem impedir o login', async (t) => {
  let user = {
      id: '11111111-1111-4111-8111-111111111111',
      nome: 'Admin',
      login: 'admin@example.com',
      funcao: 'adm',
      mestre: false,
      tabs: ['dashboard'],
    },
    pending = false,
    calls = 0;
  const provider = {
    login: async () => ({ access_token: 'token' }),
    profile: async () => user,
    access: async () => [{ hotel: 'Be Urban' }],
    decision: async (token, hotel) => {
      calls++;
      if (pending) throw Object.assign(Error('SQL'), { status: 503 });
      return { hotel, services: { open: 150 } };
    },
  };
  const server = createSupabaseApp(provider);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/decision')).status, 401);
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin@example.com', senha: 'teste' }),
  });
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  assert.equal((await fetch(base + '/api/decision?hotel=Unlimited', { headers })).status, 403);
  assert.equal(calls, 0);
  const ok = await fetch(base + '/api/decision?hotel=Be%20Urban', { headers });
  assert.equal((await ok.json()).services.open, 150);
  user = { ...user, tabs: [] };
  assert.equal((await fetch(base + '/api/decision', { headers })).status, 403);
  user = { ...user, funcao: 'cliente' };
  assert.equal((await fetch(base + '/api/decision', { headers })).status, 403);
  user = { ...user, funcao: 'adm', tabs: ['dashboard'] };
  pending = true;
  const r = await fetch(base + '/api/decision', { headers });
  assert.equal(r.status, 503);
  assert.match((await r.json()).message, /202610290015_decision/);
  assert.equal((await fetch(base + '/login.html')).status, 200);
});
test('mínimo do estoque aceita ausência e zero; rejeita negativo, precisão extra e texto', () => {
  const user = { funcao: 'adm', mestre: true };
  const change = (value) => [
    {
      collection: 'estoqueBookSantos',
      id: 'singleton',
      version: 0,
      data: { itens: [{ id: 'a', quantidade: 1, valor: 1, ...value }], colunas: [] },
    },
  ];
  for (const value of [{}, { minimo: 0 }, { minimo: 1.25 }, { minimo: null }])
    assert.doesNotThrow(() => validateChanges(change(value), user));
  for (const minimo of [-1, 0.001, '2', Infinity, 1e10])
    assert.throws(() => validateChanges(change({ minimo }), user));
  assert.equal(legalConfig({}).cnpj, '08.941.697/0001-07');
});
test('compatibilidade aceita esquemas de 14 a 19, sem aceitar versões desconhecidas', async () => {
  let version = 14;
  const client = createSupabase({
    url: 'https://example.supabase.co',
    key: 'sb_publishable_test',
    fetchImpl: async (url) =>
      Response.json(url.pathname.endsWith('book_schema_version') ? version : {}),
  });
  await client.ready();
  version = 15;
  await client.ready();
  version = 16;
  await client.ready();
  version = 17;
  await client.ready();
  version = 18;
  await client.ready();
  version = 19;
  await client.ready();
  version = 20;
  await assert.rejects(client.ready(), /migrações/);
});
