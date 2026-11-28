// Entrada, saída, segundo fator (/api/auth/) e dados da sessão atual.
const { randomBytes } = require('node:crypto');
const { validateProfile } = require('../security');
const { fail, digest, readBody } = require('../app/http');

// Roda antes da autenticação: estas rotas criam ou encerram a sessão.
async function handleAuth(ctx) {
  const { app, req, route, now, session, sessionId, cookie, json } = ctx;
  const { provider, sessions, authSecurity, attempts, sessionsPerUser, maxSessions } = app;
  if (route.startsWith('/api/auth/')) {
    await authSecurity.handle({ route, req, session, sessionId, readBody, cookie, json });
    return true;
  }
  if (route === '/api/login' && req.method === 'POST') {
    // Socket limit is deliberately generous for a shared reverse proxy.
    // Account counters cannot be bypassed by spoofing forwarded headers.
    const ip = `ip:${req.socket.remoteAddress}`;
    const traffic = attempts.get(ip) || { count: 0, until: now + 60000 };
    if (traffic.count >= 300) throw fail(429, 'Muitas tentativas. Aguarde um minuto.');
    traffic.count++;
    attempts.set(ip, traffic);
    const input = await readBody(req, 16384);
    if (
      typeof input?.login !== 'string' ||
      input.login.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.login.trim()) ||
      typeof input.senha !== 'string' ||
      !input.senha ||
      input.senha.length > 100
    )
      throw fail(400, 'Informe seu e-mail e senha.');
    const account = digest(input.login.trim().toLowerCase());
    const attempt = attempts.get(account) || { count: 0, until: now + 900000 };
    if (attempt.count >= 10) throw fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
    attempt.count++;
    attempts.set(account, attempt);
    const auth = await provider.login(input.login.trim().toLowerCase(), input.senha);
    let user;
    try {
      user = validateProfile(await provider.profile(auth.access_token));
    } catch (error) {
      await provider.logout(auth.access_token).catch(() => {});
      throw error;
    }
    const challenge = await authSecurity.login(auth, user, cookie, sessionId);
    if (challenge) return json(200, challenge);
    const freshToken = randomBytes(32).toString('hex');
    const lifetime = 8 * 3600;
    sessions.delete(sessionId);
    const previous = [...sessions]
      .filter(([, value]) => value.userId === user.id)
      .sort((a, b) => a[1].expires - b[1].expires);
    while (previous.length >= sessionsPerUser) sessions.delete(previous.shift()[0]);
    if (sessions.size >= maxSessions) {
      await provider.logout(auth.access_token).catch(() => {});
      throw fail(503, 'Capacidade de sessões atingida. Aguarde antes de entrar novamente.');
    }
    sessions.set(digest(freshToken), {
      issuedAt: now,
      userId: user.id,
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      authExpires: now + (Number(auth.expires_in) || 3600) * 1000,
      expires: now + lifetime * 1000,
    });
    attempts.delete(account);
    cookie(freshToken, lifetime);
    return json(200, { ...user, provider: 'supabase' });
  }
  if (route === '/api/logout' && req.method === 'POST') {
    sessions.delete(sessionId);
    cookie('', 0);
    if (session) await provider.logout(session.accessToken).catch(() => {});
    return json(200, { ok: true });
  }
  return false;
}

// Já autenticado: perfil da sessão e painel de status do mestre.
async function handleSession({ app, req, route, user, json }) {
  if (route === '/api/system/status' && req.method === 'GET') {
    if (!user.mestre || user.funcao !== 'adm') throw fail(403, 'Somente o mestre.');
    return json(200, app.metrics.snapshot());
  }
  if (route === '/api/session' && req.method === 'GET')
    return json(200, { ...user, provider: 'supabase' });
  return false;
}

module.exports = { handleAuth, handleSession };
