const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { openDatabase } = require('./database');
const { hashPassword, verifyPassword } = require('./passwords');
const ROOT = path.resolve(__dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const publicUser = row => ({ id: row.id, nome: row.nome, login: row.login, funcao: row.funcao, mestre: !!row.mestre });
const fail = (status, message) => Object.assign(new Error(message), { status });

async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 16384) throw fail(413, 'Requisição muito grande.');
  }
  try { return JSON.parse(data); } catch { throw fail(400, 'JSON inválido.'); }
}
function fields(input) {
  if (!input || typeof input !== 'object') throw fail(400, 'Dados inválidos.');
  const { nome, login, senha, funcao } = input;
  if (typeof nome !== 'string' || !nome.trim() || nome.length > 120 ||
      typeof login !== 'string' || !/^[a-zA-Z0-9._-]{3,30}$/.test(login) ||
      !['adm', 'cliente'].includes(funcao) ||
      (senha !== undefined && (typeof senha !== 'string' || senha.length < 12 || senha.length > 100))) {
    throw fail(400, 'Informe nome, login de 3 a 30 caracteres, função e senha de 12 a 100 caracteres.');
  }
  return { nome: nome.trim(), login: login.toLowerCase(), senha, funcao };
}

function createApp(db, { secure = false } = {}) {
  const attempts = new Map();
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const cookie = (token, age) => res.setHeader('Set-Cookie', `book_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`);
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `${secure ? 'https' : 'http'}://${req.headers.host}`) throw fail(403, 'Origem não permitida.');
      const token = /(?:^|;\s*)book_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const user = token ? db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now()) : null;
      if (route === '/api/login' && req.method === 'POST') {
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
        const ip = req.socket.remoteAddress;
        const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
        if (attempt.count >= 10) throw fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
        attempt.count++; attempts.set(ip, attempt);
        const input = await body(req);
        if (typeof input?.login !== 'string' || typeof input.senha !== 'string' || input.senha.length > 100) throw fail(400, 'Dados inválidos.');
        const row = db.prepare('SELECT * FROM users WHERE login=?').get(input.login.trim().toLowerCase());
        const valid = await verifyPassword(input.senha, row?.password_hash || await dummyHash);
        if (!row || !valid) throw fail(401, 'Login ou senha incorretos.');
        attempts.delete(ip);
        const freshToken = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
        if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(freshToken), row.id, now + 8 * 3600000);
        cookie(freshToken, 8 * 3600);
        return json(200, publicUser(row));
      }
      if (route.startsWith('/api/')) {
        if (!user) throw fail(401, 'Entre novamente para continuar.');
        if (route === '/api/session' && req.method === 'GET') return json(200, publicUser(user));
        if (route === '/api/logout' && req.method === 'POST') {
          db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); cookie('', 0); return json(200, { ok: true });
        }
        if (route === '/api/users' && req.method === 'GET') {
          if (user.funcao !== 'adm') throw fail(403, 'Acesso negado.');
          return json(200, db.prepare('SELECT * FROM users ORDER BY nome').all().map(publicUser));
        }
        if (route === '/api/users' && req.method === 'POST') {
          if (!user.mestre) throw fail(403, 'Somente o administrador mestre pode gerenciar usuários.');
          const raw = await body(req);
          const input = fields(raw);
          const existing = raw.id ? db.prepare('SELECT * FROM users WHERE id=?').get(raw.id) : null;
          if (raw.id && !existing) throw fail(404, 'Usuário não encontrado.');
          if (existing?.mestre) throw fail(403, 'O administrador mestre está protegido.');
          if (!existing && !input.senha) throw fail(400, 'Informe uma senha.');
          const hash = input.senha ? await hashPassword(input.senha) : existing.password_hash;
          const id = existing?.id || randomUUID();
          try {
            if (existing) db.prepare('UPDATE users SET nome=?,login=?,password_hash=?,funcao=? WHERE id=?').run(input.nome, input.login, hash, input.funcao, id);
            else db.prepare('INSERT INTO users VALUES (?,?,?,?,?,0)').run(id, input.nome, input.login, hash, input.funcao);
          } catch (error) { if (error.message.includes('UNIQUE')) throw fail(409, 'Esse login já está em uso.'); throw error; }
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
          return json(200, { ok: true });
        }
        if (route.startsWith('/api/users/') && req.method === 'DELETE') {
          if (!user.mestre) throw fail(403, 'Acesso negado.');
          const target = db.prepare('SELECT * FROM users WHERE id=?').get(route.slice('/api/users/'.length));
          if (!target) throw fail(404, 'Usuário não encontrado.');
          if (target.mestre) throw fail(403, 'O administrador mestre está protegido.');
          db.prepare('DELETE FROM users WHERE id=?').run(target.id);
          return json(200, { ok: true });
        }
        throw fail(404, 'Rota não encontrada.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Método não permitido.');
      const file = route === '/' ? '/login.html' : route;
      // Only explicitly public assets may be served; never expose the database or server files.
      if (!/^\/(login\.(html|css|js)|assets\/(api|session)\.js|(adm|cliente|hotel)\/[a-z]+\.(html|css|js))$/.test(file)) throw fail(404, 'Arquivo não encontrado.');
      if (/^\/(adm|hotel)\//.test(file) && user?.funcao !== 'adm' || /^\/cliente\//.test(file) && user?.funcao !== 'cliente') {
        res.writeHead(302, { Location: '/login.html' }); return res.end();
      }
      const content = await readFile(path.join(ROOT, file));
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)];
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!error.status && error.code !== 'ENOENT') console.error(error);
      json(error.status || (error.code === 'ENOENT' ? 404 : 500), { message: error.status ? error.message : 'Não foi possível concluir a operação.' });
    }
  });
}
if (require.main === module) {
  if(process.env.NODE_ENV==='production')throw new Error('Use npm start para executar o servidor Supabase em produção.');
  const db = openDatabase(process.env.DATABASE_PATH || path.join(ROOT, 'data', 'book-santos.sqlite'));
  const port = Number(process.env.PORT || 3000);
  createApp(db, { secure: process.env.COOKIE_SECURE === 'true' }).listen(port, '127.0.0.1', () => console.log(`BOOK TASK: http://localhost:${port}`));
}
module.exports = { createApp };
