const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { validateCollaboration } = require('../server/collaboration');
const { createSupabaseApp } = require('../server/supabase-app');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const feedback = {
  id,
  version: 0,
  data: {
    assunto: 'Limpeza',
    hotel: 'Be Urban',
    apartamento: '214',
    grau: 'Crítico',
    observacoes: 'Verificar',
    anexos: [],
  },
};
test('colaboração valida feedback, lembrete e comentário sem aceitar campos de autoria', () => {
  assert.deepEqual(validateCollaboration('feedbacks', feedback), feedback);
  assert.throws(() =>
    validateCollaboration('feedbacks', { ...feedback, data: { ...feedback.data, grau: 'Outro' } }),
  );
  assert.throws(() =>
    validateCollaboration('feedbacks', {
      ...feedback,
      data: { ...feedback.data, anexos: [{ dados: 'data:x' }] },
    }),
  );
  assert.throws(() => validateCollaboration('evaluations', { id, body: ' ' }));
  assert.deepEqual(
    validateCollaboration('evaluations', { id, body: 'Comentário', author_id: 'outra' }),
    { id, body: 'Comentário', target: null },
  );
  assert.throws(() =>
    validateCollaboration('reminders', {
      id,
      version: 0,
      due: 'infinito',
      repeat: 'daily',
      enabled: true,
    }),
  );
  assert.equal(
    validateCollaboration('reminders', {
      id,
      version: 0,
      due: '2026-11-01T14:00:00.000Z',
      repeat: 'daily',
      enabled: true,
    }).repeat,
    'daily',
  );
});
test('colaboração: API nega cliente e administrador sem aba; resumo e suporte não aceitam promoção', async (t) => {
  let profile = { id, funcao: 'adm', mestre: false, tabs: [] };
  const provider = {
    async login() {
      return { access_token: 'token' };
    },
    async profile() {
      return profile;
    },
    async notifications() {
      return { chat: { count: 0 }, support: { count: 0 } };
    },
  };
  const app = createSupabaseApp(provider);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((r) => app.close(r)));
  const base = 'http://127.0.0.1:' + app.address().port;
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'test@example.com', senha: 'test' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = (url, data) =>
    fetch(base + url, {
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}),
    });
  for (const url of ['/api/feedbacks', '/api/evaluations', '/api/workspace/support-summary'])
    assert.equal((await call(url)).status, 403);
  assert.equal((await call('/api/feedbacks', feedback)).status, 403);
  profile = { ...profile, funcao: 'cliente' };
  for (const url of ['/api/workspace/reminders', '/api/evaluations', '/api/feedbacks'])
    assert.equal((await call(url)).status, 403);
  assert.equal((await call('/api/notifications')).status, 200);
  assert.equal((await fetch(base + '/api/notifications')).status, 401);
});
test('feedbacks: API salva anexos pelo fluxo privado e não confia no hotel do corpo', async (t) => {
  const saved = [],
    uploaded = [],
    deleted = [];
  let allowed = true;
  const provider = {
    async login() {
      return { access_token: 'token' };
    },
    async profile() {
      return { id, funcao: 'adm', tabs: ['feedbacks'] };
    },
    async access() {
      return [{ hotel: allowed ? 'Be Urban' : 'Housi' }];
    },
    async upload(token, path) {
      uploaded.push(path);
    },
    async saveFeedback(token, value) {
      saved.push(value);
    },
    async removeFiles(token, paths) {
      deleted.push(...paths);
    },
  };
  const app = createSupabaseApp(provider);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((r) => app.close(r)));
  const base = 'http://127.0.0.1:' + app.address().port;
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'test@example.com', senha: 'test' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = (data) =>
    fetch(base + '/api/feedbacks', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const photo =
    'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
  const withPhoto = {
    ...feedback,
    data: { ...feedback.data, anexos: [{ nome: 'foto.png', dados: photo }] },
  };
  assert.equal((await post(withPhoto)).status, 200);
  assert.equal(uploaded.length, 1);
  assert.ok(saved[0].data.anexos[0].dados.startsWith('/api/files/' + id + '/Be Urban/'));
  allowed = false;
  assert.equal((await post(withPhoto)).status, 403);
  assert.equal(uploaded.length, 1);
  allowed = true;
  provider.saveFeedback = async () => {
    throw Object.assign(new Error('Conflito'), { status: 409 });
  };
  assert.equal((await post(withPhoto)).status, 409);
  assert.equal(deleted.length, 1);
});
