const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { loadConfig } = require('../server/config');
const { createSupabaseApp } = require('../server/supabase-app');

test('publicação recusa configuração sem HTTPS e valida porta/origem', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }));
  assert.throws(() => loadConfig({ PORT: '0' }));
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'https://example.com/path' }));
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'https://example.com?x=1' }));
  assert.equal(
    loadConfig({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      PUBLIC_ORIGIN: 'https://example.com',
      HOST: '0.0.0.0',
    }).publicOrigin,
    'https://example.com',
  );
  assert.equal(
    loadConfig({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      RENDER_EXTERNAL_URL: 'https://book-test.onrender.com',
    }).publicOrigin,
    'https://book-test.onrender.com',
  );
  assert.throws(() =>
    loadConfig({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      RENDER_EXTERNAL_URL: 'http://book-test.onrender.com',
    }),
  );
  assert.equal(
    loadConfig({
      PUBLIC_ORIGIN: 'https://custom.example.com',
      RENDER_EXTERNAL_URL: 'https://book-test.onrender.com',
    }).publicOrigin,
    'https://custom.example.com',
  );
});

test('datas manipuladas nunca retornam tags HTML nas duas telas', () => {
  for (const file of ['adm/admin.js', 'hotel/hotel.js']) {
    const source = readFileSync(file, 'utf8').match(
      /function formatarData\(data\) \{[\s\S]*?\n\}/,
    )[0];
    const escape = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
    const context = { escapar: escape, esc: escape };
    vm.createContext(context);
    vm.runInContext(source, context);
    assert.equal(context.formatarData('2026-10-22'), '22/10/2026');
    assert.ok(!context.formatarData('2026-10-<img src=x onerror=alert(1)>').includes('<'));
    assert.equal(context.formatarData(null), 'Sem data');
  }
});

test('limite por conta, origem pública e prontidão do banco', async (t) => {
  let healthy = true,
    now = Date.now();
  const provider = {
    async ready() {
      if (!healthy) throw Object.assign(new Error('Migração pendente'), { status: 503 });
    },
    async login(email, password) {
      if (password !== 'correta') throw Object.assign(new Error('Inválido'), { status: 401 });
      return { access_token: 'token' };
    },
    async profile() {
      return { id: 'id', funcao: 'cliente' };
    },
  };
  const server = createSupabaseApp(provider, {
    secure: true,
    publicOrigin: 'https://teste.example.com',
    clock: () => now,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (email, password, origin = 'https://teste.example.com') =>
    fetch(base + '/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'X-Forwarded-For': '203.0.113.1',
      },
      body: JSON.stringify({ login: email, senha: password }),
    });
  for (let i = 0; i < 10; i++)
    assert.equal((await login('bloqueado@example.com', 'errada')).status, 401);
  assert.equal((await login('bloqueado@example.com', 'correta')).status, 429);
  const accepted = await login('outro@example.com', 'correta');
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get('set-cookie'), /; Secure/);
  assert.match(accepted.headers.get('strict-transport-security'), /31536000/);
  assert.equal(
    (await login('outro@example.com', 'correta', 'https://intruso.example.com')).status,
    403,
  );
  assert.equal((await fetch(base + '/ready')).status, 200);
  healthy = false;
  now += 10001;
  assert.equal((await fetch(base + '/ready')).status, 503);
  assert.equal((await fetch(base + '/health')).status, 200);
});
