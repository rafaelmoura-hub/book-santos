const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { deadlineState, urgencyLabel } = require('../assets/processes');
const { createSupabaseApp } = require('../server/supabase-app');
test('prazo distingue futuro, hoje, vencido e finalizado; urgência preserva os valores históricos', () => {
  const today = '2026-10-30';
  assert.equal(deadlineState({ vencimento: '2026-10-31' }, today), 'future');
  assert.equal(deadlineState({ vencimento: today }, today), 'today');
  assert.equal(deadlineState({ vencimento: '2026-10-29' }, today), 'late');
  assert.equal(deadlineState({ vencimento: '2026-10-29', status: 'Finalizada' }, today), 'done');
  assert.equal(deadlineState({ vencimento: '2026-10-29', status: 'Recusada' }, today), 'future');
  assert.equal(deadlineState({}, today), 'future');
  assert.deepEqual(['Normal', 'Alta', 'Urgente'].map(urgencyLabel), ['Baixa', 'Média', 'Alta']);
});
test('análise e remarcação exigem sessão, abas e parâmetros válidos', async (t) => {
  let user = {
      id: '11111111-1111-4111-8111-111111111111',
      nome: 'Admin',
      login: 'admin@example.com',
      funcao: 'adm',
      mestre: false,
      tabs: ['dashboard', 'os'],
    },
    received;
  const provider = {
    login: async () => ({ access_token: 'token' }),
    profile: async () => user,
    access: async () => [{ hotel: 'Be Urban' }],
    activity: async (token, input) => {
      received = input;
      return { metrics: { created: 2 } };
    },
    scheduleCard: async (token, input) => {
      received = input;
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
  assert.equal((await fetch(base + '/api/decision/activity')).status, 401);
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: user.login, senha: 'teste' }),
  });
  const headers = {
    Cookie: login.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
  };
  const filters = {
    start: '2026-10-01',
    end: '2026-10-30',
    group: 'week',
    hotel: 'Be Urban',
    urgency: 'Urgente',
    assignees: ['admin@example.com'],
  };
  const get = (f) =>
    fetch(base + '/api/decision/activity?filters=' + encodeURIComponent(JSON.stringify(f)), {
      headers,
    });
  assert.equal((await get(filters)).status, 200);
  assert.deepEqual(received, filters);
  for (const f of [
    { ...filters, start: '2026-02-30' },
    { ...filters, end: '2026-01-01' },
    { ...filters, group: 'sql' },
    { ...filters, assignees: 'bad' },
    { ...filters, hotel: 'Unlimited' },
  ])
    assert.ok((await get(f)).status >= 400);
  const schedule = (data) =>
    fetch(base + '/api/cards/schedule', { method: 'POST', headers, body: JSON.stringify(data) });
  const card = { id: '123', version: 1, due: '2026-11-01', comment: 'Acesso combinado' };
  assert.equal((await schedule(card)).status, 200);
  assert.deepEqual(received, card);
  assert.equal((await schedule({ ...card, version: 0 })).status, 400);
  user = { ...user, tabs: [] };
  assert.equal((await get(filters)).status, 403);
  assert.equal((await schedule(card)).status, 403);
  user = { ...user, funcao: 'cliente', tabs: ['dashboard', 'os'] };
  assert.equal((await get(filters)).status, 403);
  assert.equal((await schedule(card)).status, 403);
});
