// Comportamentos de conta que eram cobertos pelo test/auth.test.js do servidor antigo (SQLite),
// agora conferidos no caminho Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSupabase } = require('../server/supabase');
const { createSupabaseApp } = require('../server/supabase-app');

const MASTER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

// Provider falso: cada e-mail vira um token e cada token um perfil.
function fakeProvider(overrides = {}) {
  const logins = [];
  const saved = [];
  const profiles = {
    'token-master': { id: MASTER, nome: 'Mestre', funcao: 'adm', mestre: true },
    'token-other': { id: OTHER, nome: 'Equipe', funcao: 'cliente', mestre: false },
  };
  const provider = {
    canCreateUsers: true,
    async login(email) {
      logins.push(email);
      if (email === 'master@example.com') return { access_token: 'token-master' };
      if (email === 'equipe@example.com') return { access_token: 'token-other' };
      throw Object.assign(new Error('E-mail ou senha inválidos.'), { status: 401 });
    },
    async profile(token) {
      const profile = profiles[token];
      if (!profile) throw Object.assign(new Error('Sessão inválida.'), { status: 401 });
      return profile;
    },
    async logout() {},
    async managedUsers() {
      return [];
    },
    async users() {
      return [{ id: OTHER, nome: 'Equipe', login: 'equipe@example.com', funcao: 'cliente' }];
    },
    async saveUser(token, value) {
      saved.push(value);
    },
    ...overrides,
  };
  return { provider, logins, saved };
}

async function start(t, provider) {
  const server = createSupabaseApp(provider);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email) => {
    const response = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: email, senha: 'senha-de-teste' }),
    });
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const call = (path, cookie, method = 'GET', body) =>
    fetch(base + path, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { login, call };
}

test('login não diferencia maiúsculas e minúsculas no e-mail', async (t) => {
  const { provider, logins } = fakeProvider();
  const { login, call } = await start(t, provider);
  const { response, cookie } = await login('  MASTER@Example.COM ');
  assert.equal(response.status, 200);
  assert.deepEqual(logins, ['master@example.com']);
  assert.equal((await call('/api/session', cookie)).status, 200);
});

test('cadastro com e-mail que já existe devolve 409', async (t) => {
  // No cliente Supabase: a resposta de conta existente vira 409 com mensagem clara.
  const supabase = createSupabase({
    url: 'https://example.supabase.co',
    key: 'sb_publishable_test',
    secretKey: 'sb_secret_test',
    fetchImpl: async (url) => {
      if (url.pathname === '/auth/v1/user') return Response.json({ id: MASTER });
      if (url.pathname === '/auth/v1/admin/users')
        return Response.json({ code: 'email_exists' }, { status: 422 });
      if (url.searchParams.get('select') === 'version') return Response.json([]);
      return Response.json([{ id: MASTER, funcao: 'adm', mestre: true }]);
    },
  });
  await assert.rejects(
    supabase.saveUser('token', {
      nome: 'Repetido',
      login: 'master@example.com',
      senha: 'senha-longa-de-teste',
      funcao: 'cliente',
      hotels: [],
    }),
    (error) => error.status === 409 && /Já existe uma conta/.test(error.message),
  );
  // No servidor: o 409 chega ao navegador com a mesma mensagem.
  const { provider } = fakeProvider({
    async saveUser() {
      throw Object.assign(new Error('Já existe uma conta com esse e-mail.'), { status: 409 });
    },
  });
  const { login, call } = await start(t, provider);
  const { cookie } = await login('master@example.com');
  const response = await call('/api/manage/users', cookie, 'POST', {
    nome: 'Repetido',
    login: 'master@example.com',
    senha: 'senha-longa-de-teste',
    funcao: 'cliente',
    hotels: [],
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /Já existe uma conta/);
});

test('nenhuma rota apaga contas, nem a do mestre', async (t) => {
  const deleted = [];
  const { provider } = fakeProvider({
    async deleteUser(token, id) {
      deleted.push(id);
    },
  });
  const { login, call } = await start(t, provider);
  const { cookie } = await login('master@example.com');
  assert.equal((await call(`/api/users/${MASTER}`, cookie, 'DELETE')).status, 403);
  assert.equal((await call(`/api/users/${OTHER}`, cookie, 'DELETE')).status, 403);
  assert.equal((await call('/api/manage/users', cookie, 'DELETE', { id: MASTER })).status, 405);
  assert.deepEqual(deleted, []);
  assert.equal((await call('/api/session', cookie)).status, 200);
});

test('conta editada pelo mestre perde a sessão na hora', async (t) => {
  const { provider, saved } = fakeProvider();
  const { login, call } = await start(t, provider);
  const master = await login('master@example.com');
  const other = await login('equipe@example.com');
  assert.equal((await call('/api/session', other.cookie)).status, 200);
  const response = await call('/api/manage/users', master.cookie, 'POST', {
    id: OTHER,
    version: 1,
    nome: 'Equipe editada',
    funcao: 'cliente',
    hotels: [],
  });
  assert.equal(response.status, 200);
  assert.equal(saved.length, 1);
  assert.equal((await call('/api/session', other.cookie)).status, 401);
  assert.equal((await call('/api/session', master.cookie)).status, 200);
});

test('lista de usuários não pede nem devolve senha', async (t) => {
  // No cliente Supabase: as consultas de perfis só pedem colunas sem senha.
  const selects = [];
  const supabase = createSupabase({
    url: 'https://example.supabase.co',
    key: 'sb_publishable_test',
    fetchImpl: async (url) => {
      if (url.pathname === '/auth/v1/user') return Response.json({ id: MASTER });
      if (url.pathname === '/rest/v1/book_profiles') selects.push(url.searchParams.get('select'));
      return Response.json([{ id: MASTER, funcao: 'adm', mestre: true }]);
    },
  });
  await supabase.users('token');
  await supabase.managedUsers('token');
  assert.ok(selects.length >= 2);
  for (const select of selects) assert.doesNotMatch(select, /senha|password|hash|secret/i);
  // No servidor: a resposta da lista não traz campo de senha.
  const { provider } = fakeProvider();
  const { login, call } = await start(t, provider);
  const { cookie } = await login('master@example.com');
  const response = await call('/api/users', cookie);
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /senha|password|hash/i);
});
