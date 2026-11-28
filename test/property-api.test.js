const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSupabaseApp } = require('../server/supabase-app');
test('informacoes e cobertura exigem permissao; senhas nao entram na URL; remocao exige confirmacao', async (t) => {
  let user = {
      id: '11111111-1111-4111-8111-111111111111',
      nome: 'Admin',
      login: 'admin@example.com',
      funcao: 'adm',
      mestre: false,
      tabs: ['condominios', 'onboarding', 'vistorias'],
    },
    received;
  const provider = {
    login: async () => ({ access_token: 'token' }),
    profile: async () => user,
    access: async () => [{ hotel: 'Be Urban' }],
    condominiums: async () => [{ name: 'Be Urban' }, { name: 'Restrito' }],
    apartmentInfo: async (token, input) => {
      received = input;
      return { version: 1, fields: input.fields || {} };
    },
    removeCatalog: async (token, input) => {
      received = input;
      return { removed: true };
    },
    inspectionCoverage: async () => ({
      rows: [],
      counts: { total: 0, missing: 0, overdue: 0, current: 0 },
    }),
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
  assert.equal(
    (await fetch(base + '/api/apartment-info?hotel=Be%20Urban&apartment=214')).status,
    401,
  );
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: user.login, senha: 'teste' }),
  });
  const headers = {
    Cookie: login.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
  };
  const post = (url, body) =>
    fetch(base + url, { method: 'POST', headers, body: JSON.stringify(body) });
  const input = {
    hotel: 'Be Urban',
    apartment: '214',
    version: 0,
    fields: { lockPassword: '0001', wifiPassword: ' espacos preservados ' },
  };
  assert.equal((await post('/api/apartment-info', input)).status, 200);
  assert.deepEqual(received, input);
  assert.equal(
    (
      await post('/api/apartment-info', {
        ...input,
        fields: {
          masterPassword: 'fake-0001#',
          governancePassword: 'fake-0002#',
          accessNotes: 'a'.repeat(6000),
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (await post('/api/apartment-info', { ...input, fields: { accessNotes: 'a'.repeat(6001) } }))
      .status,
    400,
  );
  assert.equal(
    (await post('/api/apartment-info', { ...input, fields: { unknown: 'x' } })).status,
    400,
  );
  assert.equal(
    (await post('/api/apartment-info', { ...input, fields: { wifiPassword: 'x'.repeat(257) } }))
      .status,
    400,
  );
  assert.equal(
    (await fetch(base + '/api/apartment-info?hotel=Restrito&apartment=214', { headers })).status,
    403,
  );
  assert.equal((await fetch(base + '/api/inspections/coverage', { headers })).status, 200);
  assert.equal(
    (await post('/api/onboarding/remove', { hotel: 'Be Urban', apartment: '214' })).status,
    400,
  );
  assert.equal(
    (
      await post('/api/onboarding/remove', {
        hotel: 'Be Urban',
        apartment: '214',
        confirm: 'Be Urban / 214',
      })
    ).status,
    200,
  );
  user = { ...user, tabs: [] };
  assert.equal((await post('/api/apartment-info', input)).status, 403);
  assert.equal((await fetch(base + '/api/inspections/coverage', { headers })).status, 403);
  user = { ...user, funcao: 'cliente', tabs: ['condominios', 'vistorias', 'onboarding'] };
  assert.equal((await post('/api/apartment-info', input)).status, 403);
  assert.equal(
    (await post('/api/onboarding/remove', { hotel: 'Be Urban', confirm: 'Be Urban' })).status,
    403,
  );
});
