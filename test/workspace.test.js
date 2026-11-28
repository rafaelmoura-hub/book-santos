const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { canTab, canCollection } = require('../server/permissions');
const { validateUser } = require('../server/users');
const { validateAI, generateAI } = require('../server/ai');
const { createSupabaseApp } = require('../server/supabase-app');
test('abas: mestre mantém acesso; listas vazias e clientes não recebem acesso administrativo', () => {
  const limited = { funcao: 'adm', tabs: ['vistorias'] };
  assert.equal(canTab(limited, 'financeiro'), false);
  assert.equal(canCollection(limited, 'vistorias', true), true);
  assert.equal(canCollection(limited, 'ordensServico', true), false);
  assert.equal(canCollection({ funcao: 'adm', tabs: [] }, 'chamados'), false);
  assert.equal(canTab({ ...limited, mestre: true }, 'financeiro'), true);
  const input = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    nome: 'Adm',
    version: 1,
    funcao: 'adm',
    hotels: [],
    tabs: ['vistorias'],
  };
  assert.deepEqual(validateUser(input).tabs, ['vistorias']);
  assert.throws(() => validateUser({ ...input, tabs: ['usuarios'] }));
  assert.throws(() => validateUser({ ...input, tabs: ['vistorias', 'vistorias'] }));
});
test('IA: usa somente endpoints oficiais, autentica no servidor e nunca devolve a chave', async () => {
  const key = 'chave-privada-de-teste-123456';
  const input = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKey: key,
    messages: [{ role: 'user', content: 'Olá' }],
  };
  for (const provider of ['openai', 'gemini', 'claude']) {
    const result = await generateAI({ ...input, provider }, async (url, opts) => {
      assert.equal(opts.redirect, 'error');
      assert.ok(!url.includes(key));
      assert.equal(
        opts.headers.Authorization || opts.headers['x-goog-api-key'] || opts.headers['x-api-key'],
        provider === 'openai' ? `Bearer ${key}` : key,
      );
      const body = JSON.parse(opts.body);
      if (provider === 'openai') assert.equal(body.store, false);
      return Response.json(
        provider === 'openai'
          ? { output: [{ content: [{ type: 'output_text', text: 'Resposta' }] }] }
          : provider === 'gemini'
            ? { candidates: [{ content: { parts: [{ text: 'Resposta' }] } }] }
            : { content: [{ type: 'text', text: 'Resposta' }] },
      );
    });
    assert.equal(result.answer, 'Resposta');
    assert.ok(!JSON.stringify(result).includes(key));
  }
  assert.throws(() => validateAI({ ...input, model: 'https://evil.com' }));
  assert.throws(() => validateAI({ ...input, messages: [{ role: 'system', content: 'Comando' }] }));
  await assert.rejects(
    generateAI(input, async () => Response.json({ error: { message: key } }, { status: 401 })),
    (e) => !e.message.includes(key) && e.status === 400,
  );
});
test('workspace: APIs recusam cliente, status forjado e abas negadas; notas não aceitam proprietário do corpo', async (t) => {
  let profile = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      funcao: 'adm',
      mestre: false,
      tabs: ['vistorias'],
    },
    saved;
  const provider = {
    async login() {
      return { access_token: 'test' };
    },
    async profile() {
      return profile;
    },
    async access() {
      return [];
    },
    async notes() {
      return [];
    },
    async saveNote(token, input) {
      saved = input;
    },
    async records() {
      return { rows: [], next: null };
    },
  };
  const app = createSupabaseApp(provider, { aiGenerate: async () => ({ answer: 'Resposta' }) });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((r) => app.close(r)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'adm@example.com', senha: 'teste' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = (route, body) =>
    fetch(base + route, {
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call('/api/finance')).status, 403);
  assert.equal(
    (await call('/api/orders/reopen', { id: '1', version: 1, reason: 'Correção' })).status,
    403,
  );
  assert.deepEqual(await (await call('/api/snapshot')).json(), {
    vistorias: { loaded: [], cursor: null },
    ordensServico: { loaded: [], cursor: null },
  });
  const data = { id: profile.id, version: 0, title: 'Nota', body: 'Privada', owner_id: 'outro' };
  assert.equal((await call('/api/workspace/notes', data)).status, 200);
  assert.equal(saved.owner_id, undefined);
  assert.equal(
    (await call('/api/workspace/support', { ...data, subject: 'Ajuda', status: 'Fechado' })).status,
    403,
  );
  profile = { ...profile, funcao: 'cliente' };
  assert.equal((await call('/api/workspace/notes')).status, 403);
  assert.equal((await call('/api/workspace/support')).status, 403);
  assert.equal((await call('/api/ai', { provider: 'openai' })).status, 403);
  assert.equal((await fetch(base + '/api/workspace/notes')).status, 401);
});
