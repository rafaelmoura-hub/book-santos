const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events');
const { createObservability } = require('../server/observability');
const { urgencyBadge, urgencyLabel } = require('../assets/processes');
test('urgência escolhida pelo administrador mantém valores históricos e símbolos corretos', () => {
  assert.equal(urgencyBadge('Urgente'), '🔴⚠️ Alta');
  assert.equal(urgencyBadge('Alta'), '🟡⚠️ Média');
  assert.equal(urgencyBadge('Normal'), '🟢⚠️ Baixa');
  assert.equal(urgencyBadge(null), 'Não informada');
  assert.equal(urgencyLabel('Alta'), 'Média');
});
test('leituras simultâneas compartilham trabalho apenas enquanto pendentes, por sessão', async () => {
  const m = createObservability();
  let calls = 0,
    release;
  const work = () => {
    calls++;
    return new Promise((r) => (release = r));
  };
  const a = m.read('session1:key', work),
    b = m.read('session1:key', work);
  await Promise.resolve();
  assert.equal(calls, 1);
  release('ok');
  assert.deepEqual(await Promise.all([a, b]), ['ok', 'ok']);
  assert.equal(
    await m.read('session1:key', async () => {
      calls++;
      return 'fresh';
    }),
    'fresh',
  );
  assert.equal(calls, 2);
  assert.equal(m.snapshot().sharedReads, 1);
  await assert.rejects(m.read('failed', () => Promise.reject(Error('bad'))));
  assert.equal(await m.read('failed', async () => true), true);
});
test('telemetria não inclui query string, token, nome de arquivo ou corpo', () => {
  const m = createObservability(),
    res = new EventEmitter();
  res.statusCode = 500;
  m.track({ method: 'GET', url: '/api/files/private-client-name?token=SECRET' }, res);
  res.emit('finish');
  const encoded = JSON.stringify(m.snapshot());
  assert.ok(!encoded.includes('private-client-name'));
  assert.ok(!encoded.includes('SECRET'));
  assert.match(encoded, /files\/:file/);
});

test('homologacao recusa projeto de producao e multiplas instancias sem controle distribuido', () => {
  const { loadConfig } = require('../server/config');
  assert.throws(() =>
    loadConfig({
      BOOK_ENVIRONMENT: 'staging',
      SUPABASE_URL: 'same',
      BOOK_PRODUCTION_SUPABASE_URL: 'same',
    }),
  );
  assert.throws(() => loadConfig({ BOOK_INSTANCE_COUNT: '2' }));
  assert.equal(
    loadConfig({
      BOOK_ENVIRONMENT: 'staging',
      SUPABASE_URL: 'test',
      BOOK_PRODUCTION_SUPABASE_URL: 'live',
    }).port,
    3000,
  );
});
