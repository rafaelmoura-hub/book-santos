const { hotels, filePath } = require('../assets/catalog');
const http = require('node:http');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { COLLECTIONS, validId, validateChanges, storeAttachments } = require('./operations');
const { validateUser } = require('./users');
const Periods = require('../assets/periods');
const { validateBackup, attachments } = require('./backup');
const { sessionStore } = require('./session-store');
const ROOT = path.resolve(__dirname, '..');
const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = token => createHash('sha256').update(token).digest('hex');

async function readBody(req, limit = 15 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Requisição acima do tamanho permitido.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'JSON inválido.'); }
}

function createSupabaseApp(provider, { secure = false, publicOrigin, clock = Date.now, sessionKey, sessionFile } = {}) {
  // Tokens stay on the server; optional encrypted storage preserves a single instance's sessions.
  const sessions = sessionStore({ key: sessionKey, filename: sessionFile, clock });
  const attempts = new Map();
  const writes = new Map();
  return http.createServer(async (req, res) => {
    const now = clock();
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.on('finish', () => {
      if (res.statusCode >= 500) console.error(JSON.stringify({ event: 'http_error', requestId, status: res.statusCode, duration_ms: clock() - now }));
    });
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    for (const [key, value] of writes) if (value.until <= now) writes.delete(key);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    const cookie = (token, age) => res.setHeader('Set-Cookie', `book_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`);
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (route === '/health' && req.method === 'GET') return json(200, { status: 'ok' });
      if (route === '/ready' && req.method === 'GET') {
        await provider.ready();
        return json(200, { status: 'ok' });
      }
      if (!['GET', 'HEAD'].includes(req.method) && (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && req.headers.origin !== (publicOrigin || `${secure ? 'https' : 'http'}://${req.headers.host}`))) throw fail(403, 'Origem não permitida.');
      const token = /(?:^|;\s*)book_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const sessionId = token ? digest(token) : null;
      const session = sessions.get(sessionId);
      if (route === '/api/login' && req.method === 'POST') {
        // Socket limit is deliberately generous for a shared reverse proxy.
        // Account counters cannot be bypassed by spoofing forwarded headers.
        const ip = `ip:${req.socket.remoteAddress}`;
        const traffic = attempts.get(ip) || { count: 0, until: now + 60000 };
        if (traffic.count >= 300) throw fail(429, 'Muitas tentativas. Aguarde um minuto.');
        traffic.count++; attempts.set(ip, traffic);
        const input = await readBody(req, 16384);
        if (typeof input?.login !== 'string' || input.login.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.login.trim()) || typeof input.senha !== 'string' || !input.senha || input.senha.length > 100) throw fail(400, 'Informe seu e-mail e senha.');
        const account = digest(input.login.trim().toLowerCase());
        const attempt = attempts.get(account) || { count: 0, until: now + 900000 };
        if (attempt.count >= 10) throw fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
        attempt.count++; attempts.set(account, attempt);
        const auth = await provider.login(input.login.trim().toLowerCase(), input.senha);
        let user;
        try { user = await provider.profile(auth.access_token); }
        catch (error) { await provider.logout(auth.access_token).catch(() => {}); throw error; }
        const freshToken = randomBytes(32).toString('hex');
        const lifetime = 8 * 3600;
        sessions.delete(sessionId);
        sessions.set(digest(freshToken), { userId: user.id, accessToken: auth.access_token, refreshToken: auth.refresh_token, authExpires: now + (Number(auth.expires_in) || 3600) * 1000, expires: now + lifetime * 1000 });
        attempts.delete(account);
        cookie(freshToken, lifetime);
        return json(200, { ...user, provider: 'supabase' });
      }
      if (route === '/api/logout' && req.method === 'POST') {
        sessions.delete(sessionId); cookie('', 0);
        if (session) await provider.logout(session.accessToken).catch(() => {});
        return json(200, { ok: true });
      }
      const protectedFile = /^\/(adm|hotel|cliente)\//.test(route) || route === '/assets/catalog.js';
      let user;
      if (route.startsWith('/api/') || protectedFile) {
        if (session) {
          try {
            if (session.refreshToken && session.authExpires < now + 30000) {
              if (!session.refreshing) session.refreshing = provider.refresh(session.refreshToken).then(auth => {
                session.accessToken = auth.access_token; session.refreshToken = auth.refresh_token;
                session.authExpires = clock() + (Number(auth.expires_in) || 3600) * 1000;
                sessions.persist?.();
              }).finally(() => { session.refreshing = null; });
              await session.refreshing;
            }
            user = await provider.profile(session.accessToken);
          }
          catch (error) {
            if ([401, 403].includes(error.status)) { sessions.delete(sessionId); cookie('', 0); }
            throw error;
          }
        }
        if (!user) {
          if (protectedFile) { res.writeHead(302, { Location: '/login.html' }); return res.end(); }
          throw fail(401, 'Entre novamente para continuar.');
        }
      }
      if (route === '/api/session' && req.method === 'GET') return json(200, { ...user, provider: 'supabase' });
      if (route === '/api/backup' && req.method === 'POST') {
        if (user.funcao !== 'adm' || !user.mestre) throw fail(403, 'Somente o administrador mestre pode fazer backup.');
        const selected = validateBackup(await readBody(req, 4096));
        const quotaKey = `backup:${user.id}`;
        const quota = writes.get(quotaKey) || { count: 0, until: now + 60000 };
        if (quota.count >= 2) throw fail(429, 'Aguarde um minuto antes de iniciar outro backup.');
        quota.count++; writes.set(quotaKey, quota);
        const data = await provider.backup(session.accessToken, selected);
        if (!data || !Array.isArray(data.records)) throw fail(502, 'O servidor não confirmou os dados do backup. Nenhuma cópia completa foi gerada.');
        return json(200, { format: 'book-santos-backup', version: 1, selected, data, files: selected.includes('anexos') ? attachments(data.records) : [] });
      }
      if (route === '/api/finance' && req.method === 'GET') {
        if (user.funcao !== 'adm') throw fail(403, 'Financeiro disponível somente para administradores.');
        const payer = url.searchParams.get('payer');
        const cursor = url.searchParams.get('cursor');
        if (payer && payer.length > 200 || cursor && !validId(cursor)) throw fail(400, 'Consulta financeira inválida.');
        let period;
        try { period = Periods.range(url.searchParams.get('period') || 'all', url.searchParams.get('date')); }
        catch (error) { throw fail(400, error.message); }
        return json(200, await provider.finance(session.accessToken, payer, cursor, period.start, period.end));
      }
      if (route === '/api/manage/users') {
        if (user.funcao !== 'adm' || !user.mestre) throw fail(403, 'Somente o administrador mestre pode gerenciar usuários.');
        if (req.method === 'GET') return json(200, { users: await provider.managedUsers(session.accessToken), canCreate: provider.canCreateUsers === true });
        if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
        const key = `manage:${user.id}`;
        const quota = writes.get(key) || { count: 0, until: now + 60000 };
        if (quota.count >= 10) throw fail(429, 'Aguarde um minuto antes de gerenciar mais contas.');
        quota.count++; writes.set(key, quota);
        const input = validateUser(await readBody(req, 16384));
        await provider.saveUser(session.accessToken, input);
        if (input.id) for (const [key, value] of sessions) if (value.userId === input.id) sessions.delete(key);
        return json(200, { ok: true });
      }
      if (route === '/api/apartments' && req.method === 'GET') return json(200, await provider.apartments(session.accessToken));
      if (route === '/api/access' && req.method === 'GET') return json(200, user.mestre ? hotels : (await provider.access(session.accessToken)).map(row => row.hotel));
      if (route === '/api/snapshot' && req.method === 'GET') {
        let pages;
        try { pages = JSON.parse(url.searchParams.get('pages') || '{}'); }
        catch { throw fail(400, 'Paginação inválida.'); }
        if (!pages || Array.isArray(pages) || typeof pages !== 'object' || Object.values(pages).some(count => !Number.isInteger(count) || count < 1 || count > 20)) throw fail(400, 'Use entre 1 e 20 páginas por coleção.');
        const permitted = COLLECTIONS.filter(key => user.funcao === 'adm' || ['chamados','conversasSuporte'].includes(key));
        let active = permitted;
        if (url.searchParams.has('collections')) {
          try { active = JSON.parse(url.searchParams.get('collections')); } catch { throw fail(400, 'Coleções inválidas.'); }
          if (!Array.isArray(active) || active.length > permitted.length || new Set(active).size !== active.length || active.some(key => !permitted.includes(key))) throw fail(400, 'Coleções inválidas.');
        }
        const result = await Promise.all(active.map(async key => {
          let cursor = null; const loaded = [];
          for (let page = 0; page < (pages[key] || 1); page++) {
            const result = await provider.records(session.accessToken, key, cursor);
            loaded.push(...result.rows); cursor = result.next;
            if (!cursor) break;
          }
          return [key, { loaded, cursor }];
        }));
        const snapshot = Object.fromEntries(result);
        if (provider.counts && user.funcao === 'adm') snapshot.__counts = await provider.counts(session.accessToken);
        return json(200, snapshot);
      }
      if (route === '/api/data' && req.method === 'GET') {
        const collection = url.searchParams.get('collection');
        const cursor = url.searchParams.get('cursor');
        if (!COLLECTIONS.includes(collection) || cursor && !validId(cursor)) throw fail(400, 'Consulta inválida.');
        if (user.funcao !== 'adm' && !['chamados', 'conversasSuporte'].includes(collection)) throw fail(403, 'Acesso negado.');
        return json(200, await provider.records(session.accessToken, collection, cursor));
      }
      if (route === '/api/data' && req.method === 'POST') {
        const quota = writes.get(user.id) || { count: 0, until: now + 60000 };
        if (quota.count >= 60) throw fail(429, 'Limite de gravações atingido. Aguarde um minuto.');
        quota.count++; writes.set(user.id, quota);
        const raw = await readBody(req);
        const changes = validateChanges(raw?.changes, user);
        const uploadedPaths = [];
        try {
          const prepared = await storeAttachments(changes, user, (filename, bytes, type) => provider.upload(session.accessToken, filename, bytes, type), uploadedPaths);
          await provider.commit(session.accessToken, prepared);
        } catch (error) {
          if (uploadedPaths.length) await provider.removeFiles(session.accessToken, uploadedPaths).catch(() => console.error(JSON.stringify({ event: 'attachment_cleanup_pending', requestId })));
          throw error;
        }
        return json(200, { ok: true });
      }
      if (route.startsWith('/api/files/') && req.method === 'GET') {
        const filename = decodeURIComponent(route.slice('/api/files/'.length));
        if (!filePath(filename)) throw fail(400, 'Caminho de anexo inválido.');
        const file = await provider.file(session.accessToken, filename);
        const bytes = Buffer.from(await file.arrayBuffer());
        res.writeHead(200, { 'Content-Type': file.headers.get('content-type') || 'application/octet-stream', 'Content-Length': bytes.length, 'Content-Security-Policy': "default-src 'none'; sandbox" });
        return res.end(bytes);
      }
      if (route === '/api/users' && req.method === 'GET') {
        if (user.funcao !== 'adm') throw fail(403, 'Acesso negado.');
        return json(200, await provider.users(session.accessToken));
      }
      if (route === '/api/users' || route.startsWith('/api/users/')) throw fail(403, 'Gerencie as contas em Authentication → Users e os perfis em book_profiles no painel Supabase.');
      if (route.startsWith('/api/')) throw fail(404, 'Rota não encontrada.');
      if (route === '/assets/catalog.js' && req.method === 'GET') {
        const allowed = user.mestre ? hotels : (await provider.access(session.accessToken)).map(row => row.hotel === 'Unique' ? 'Unique Residence' : row.hotel);
        const catalog = require('../assets/catalog');
        const visible = hotels.filter(hotel => allowed.includes(hotel));
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(`window.BookCatalog = ${JSON.stringify({ hotels: visible, apartments: Object.fromEntries(visible.map(hotel => [hotel, catalog.apartments[hotel]])) })};`);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Método não permitido.');
      if (/^\/hotel\/(hotel\.html)?$/.test(route)) { res.writeHead(302, { Location: '/adm/admin.html#condominios' }); return res.end(); }
      const file = route === '/' ? '/login.html' : route;
      if (!/^\/(login\.(html|css|js)|assets\/(api|session|store|money|periods|catalog|events)\.js|(adm|cliente|hotel)\/[a-z]+\.(html|css|js))$/.test(file)) throw fail(404, 'Arquivo não encontrado.');
      if (/^\/(adm|hotel)\//.test(file) && user?.funcao !== 'adm' || /^\/cliente\//.test(file) && user?.funcao !== 'cliente') {
        res.writeHead(302, { Location: '/login.html' }); return res.end();
      }
      const content = await readFile(path.join(ROOT, file));
      res.writeHead(200, { 'Content-Type': `${{ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      json(error.status || (error.code === 'ENOENT' ? 404 : 500), { message: error.status ? error.message : 'Não foi possível concluir a operação.' });
    }
  });
}
module.exports = { createSupabaseApp };
