// Confere a sessão das rotas /api/ e dos arquivos protegidos antes de qualquer rota autenticada.
const { validateProfile } = require('../security');
const { fail } = require('./http');

const isProtectedFile = (route) =>
  /^\/(adm|hotel|cliente)\//.test(route) || route === '/assets/catalog.js';

// Devolve { user } (user indefinido para rotas públicas) ou { handled: true } após redirecionar.
async function authenticate(ctx) {
  const { app, res, route, now, session, sessionId, cookie } = ctx;
  const { provider, sessions, inFlight, clock, requireAdminMfa } = app;
  const protectedFile = isProtectedFile(route);
  let user;
  if (route.startsWith('/api/') || protectedFile) {
    if (session && !session.pendingMfa) {
      if (route.startsWith('/api/')) {
        const count = inFlight.get(sessionId) || 0;
        if (count >= 12)
          throw fail(429, 'Há muitas solicitações em andamento. Aguarde alguns segundos.');
        inFlight.set(sessionId, count + 1);
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          const next = (inFlight.get(sessionId) || 1) - 1;
          if (next) inFlight.set(sessionId, next);
          else inFlight.delete(sessionId);
        };
        res.once('finish', release);
        res.once('close', release);
      }
      try {
        if (session.refreshToken && session.authExpires < now + 30000) {
          if (!session.refreshing)
            session.refreshing = provider
              .refresh(session.refreshToken)
              .then((auth) => {
                session.accessToken = auth.access_token;
                session.refreshToken = auth.refresh_token;
                session.authExpires = clock() + (Number(auth.expires_in) || 3600) * 1000;
                sessions.persist?.();
              })
              .finally(() => {
                session.refreshing = null;
              });
          await session.refreshing;
        }
        user = validateProfile(await provider.profile(session.accessToken));
        if (user.mfaRequired || (requireAdminMfa && user.funcao === 'adm' && !session.mfaVerified))
          throw fail(401, 'Confirme o código do autenticador ao entrar novamente.');
        if (user.id !== session.userId || sessions.get(sessionId) !== session)
          throw fail(401, 'A sessão mudou. Entre novamente para continuar.');
      } catch (error) {
        if ([401, 403].includes(error.status)) {
          sessions.delete(sessionId);
          cookie('', 0);
        }
        throw error;
      }
    }
    if (!user) {
      if (protectedFile) {
        res.writeHead(302, { Location: '/login.html' });
        res.end();
        return { handled: true };
      }
      throw fail(401, 'Entre novamente para continuar.');
    }
  }
  return { user };
}

module.exports = { authenticate };
