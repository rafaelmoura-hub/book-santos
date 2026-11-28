const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { boundedBytes, validateProfile } = require('../server/security');
const { createSupabaseApp } = require('../server/supabase-app');
const { validateChanges } = require('../server/operations');

test('proteções de tamanho limitam streams sem confiar no Content-Length', async () => {
  await assert.rejects(
    boundedBytes(new Response('abc', { headers: { 'Content-Length': '999' } }), 10),
    (e) => e.status === 413,
  );
  await assert.rejects(
    boundedBytes(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(Buffer.alloc(8));
            c.enqueue(Buffer.alloc(8));
            c.close();
          },
        }),
      ),
      10,
    ),
    (e) => e.status === 413,
  );
  assert.equal((await boundedBytes(new Response('abc'), 10)).toString(), 'abc');
  assert.throws(
    () => validateProfile({ id: 'x', funcao: 'cliente', mestre: true }),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      validateChanges([
        { collection: 'chamados', id: '1', version: 0, data: { descricao: 'x'.repeat(140000) } },
      ]),
    (e) => e.status === 413,
  );
});

test('HTTP: JSON obrigatório, cookie seguro, identidade e limite de sessões', async (t) => {
  let identity = 'same',
    readyCalls = 0;
  const provider = {
    async login() {
      return { access_token: 'token' };
    },
    async logout() {},
    async profile() {
      return { id: identity, funcao: 'adm', mestre: true };
    },
    async ready() {
      readyCalls++;
      await new Promise((r) => setTimeout(r, 30));
    },
  };
  const server = createSupabaseApp(provider, {
    secure: true,
    publicOrigin: 'https://book.example',
    sessionsPerUser: 1,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ login: 'test@example.com', senha: 'test' });
  const login = (headers = {}) =>
    fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
  assert.equal((await login({ 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await login({ 'Content-Encoding': 'gzip' })).status, 415);
  assert.equal((await login({ Origin: 'https://evil.example' })).status, 403);
  const first = await login(),
    cookie1 = first.headers.get('set-cookie').split(';')[0];
  assert.match(cookie1, /^__Host-book_session=/);
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  const second = await login(),
    cookie2 = second.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/api/session', { headers: { Cookie: cookie1 } })).status, 401);
  assert.equal(
    (await fetch(base + '/api/session', { headers: { Cookie: 'other=1; ' + cookie2 } })).status,
    200,
  );
  identity = 'different';
  assert.equal((await fetch(base + '/api/session', { headers: { Cookie: cookie2 } })).status, 401);
  const readiness = await Promise.all(Array.from({ length: 8 }, () => fetch(base + '/ready')));
  assert.ok(readiness.every((r) => r.status === 200));
  assert.equal(readyCalls, 1);
  const releaseReadiness = await Promise.all(
    Array.from({ length: 8 }, () => fetch(base + '/ready/release')),
  );
  assert.ok(releaseReadiness.every((r) => r.status === 200));
  assert.equal(
    readyCalls,
    2,
    'A verificacao recente nao reutiliza o resultado basico, mas compartilha chamadas simultaneas.',
  );
  assert.equal((await releaseReadiness[0].json()).scope, 'release');
  assert.equal(server.requestTimeout, 60000);
  assert.equal(server.maxHeadersCount, 64);
  assert.throws(() => createSupabaseApp(provider, { sessionsPerUser: 0 }));
});
