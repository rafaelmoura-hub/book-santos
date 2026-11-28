// Servidor HTTP do BOOK TASK sobre o Supabase. Este arquivo só monta a instância e
// define a ordem do pipeline; as rotas ficam em server/routes/ e o núcleo em server/app/.
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createObservability } = require('./observability');
const { createAuthSecurity } = require('./auth-security');
const { sessionStore } = require('./session-store');
const { generateAI } = require('./ai');
const { createAgent } = require('./ai-agent');
const { requireJSON } = require('./security');
const { fail, digest, applySecurityHeaders, createResponders, createQuota } = require('./app/http');
const { authenticate } = require('./app/authenticate');
const { createPublicRoutes } = require('./routes/public');
const { handleAuth, handleSession } = require('./routes/session');
const { handleDecision } = require('./routes/decision');
const { handleCards } = require('./routes/cards');
const { handleProcesses } = require('./routes/processes');
const { handleCollaboration } = require('./routes/collaboration');
const { handleAI } = require('./routes/ai');
const { handleWorkspace } = require('./routes/workspace');
const { handleBackup } = require('./routes/backup');
const { handleFinance } = require('./routes/finance');
const { handleUsers } = require('./routes/users');
const { handleCatalog, handleCatalogScript } = require('./routes/catalog');
const { handleData } = require('./routes/data');
const { serveStatic } = require('./routes/static');

// Rotas autenticadas de /api/. Cada uma devolve true quando respondeu; os caminhos
// atendidos por elas não se sobrepõem, então a ordem não muda o resultado.
const API_ROUTES = [
  handleSession,
  handleDecision,
  handleCards,
  handleProcesses,
  handleCollaboration,
  handleAI,
  handleWorkspace,
  handleBackup,
  handleFinance,
  handleUsers,
  handleCatalog,
  handleData,
];

function createSupabaseApp(
  provider,
  {
    secure = false,
    publicOrigin,
    clock = Date.now,
    sessionKey,
    sessionFile,
    aiGenerate = generateAI,
    requireAdminMfa = false,
    recoveryEnabled = false,
    maxSessions = 5000,
    sessionsPerUser = 5,
  } = {},
) {
  if (
    !Number.isSafeInteger(maxSessions) ||
    maxSessions < 1 ||
    !Number.isSafeInteger(sessionsPerUser) ||
    sessionsPerUser < 1
  )
    throw new Error('Limites de sessão inválidos.');
  // Tokens stay on the server; optional encrypted storage preserves a single instance's sessions.
  const sessions = sessionStore({ key: sessionKey, filename: sessionFile, clock });
  const cookieName = secure ? '__Host-book_session' : 'book_session';
  const tokenPattern = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`);
  // Estado único da instância: todas as rotas recebem estas mesmas referências via `ctx.app`.
  const app = {
    provider,
    clock,
    secure,
    requireAdminMfa,
    maxSessions,
    sessionsPerUser,
    aiGenerate,
    sessions,
    authSecurity: createAuthSecurity({
      provider,
      sessions,
      clock,
      requireAdminMfa,
      recoveryEnabled,
      maxSessions,
      sessionsPerUser,
    }),
    attempts: new Map(),
    writes: new Map(),
    inFlight: new Map(),
    metrics: createObservability({ clock }),
    agent: createAgent({ clock }),
    dropUserSessions: (id) => {
      for (const [key, value] of sessions) if (value.userId === id) sessions.delete(key);
    },
  };
  const { attempts, writes, metrics } = app;
  const handlePublic = createPublicRoutes({ provider, clock });
  const server = http.createServer(
    { maxHeaderSize: 16384, requestTimeout: 60000, headersTimeout: 15000, keepAliveTimeout: 5000 },
    async (req, res) => {
      metrics.track(req, res);
      const now = clock();
      const requestId = randomUUID();
      res.setHeader('X-Request-ID', requestId);
      res.on('finish', () => {
        if (res.statusCode >= 500)
          console.error(
            JSON.stringify({
              event: 'http_error',
              requestId,
              status: res.statusCode,
              duration_ms: clock() - now,
            }),
          );
      });
      for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      for (const [key, value] of writes) if (value.until <= now) writes.delete(key);
      applySecurityHeaders(res, secure);
      const { json, cookie } = createResponders(res, { cookieName, secure });
      try {
        const url = new URL(req.url, 'http://localhost');
        const route = url.pathname;
        const ctx = { app, req, res, url, route, now, requestId, json, cookie };
        // 1. Público: documentos legais, saúde e prontidão (sem origem nem sessão).
        if (await handlePublic(ctx)) return;
        // 2. Proteção contra envio de outra origem e exigência de JSON nas gravações da API.
        if (
          !['GET', 'HEAD'].includes(req.method) &&
          (req.headers['sec-fetch-site'] === 'cross-site' ||
            (req.headers.origin &&
              req.headers.origin !==
                (publicOrigin || `${secure ? 'https' : 'http'}://${req.headers.host}`)))
        )
          throw fail(403, 'Origem não permitida.');
        if (route.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) requireJSON(req);
        // 3. Sessão pelo cookie; entrada, saída e segundo fator.
        const token = tokenPattern.exec(req.headers.cookie || '')?.[1];
        ctx.sessionId = token ? digest(token) : null;
        ctx.session = sessions.get(ctx.sessionId);
        if (await handleAuth(ctx)) return;
        // 4. Autenticação das rotas /api/ e dos arquivos protegidos.
        const auth = await authenticate(ctx);
        if (auth.handled) return;
        ctx.user = auth.user;
        ctx.read = (key, fn) => metrics.read(ctx.sessionId + ':' + key, fn);
        ctx.quota = createQuota(writes, now);
        // 5. Rotas autenticadas.
        for (const handle of API_ROUTES) if (await handle(ctx)) return;
        if (route.startsWith('/api/')) throw fail(404, 'Rota não encontrada.');
        // 6. Script de catálogo por usuário e arquivos estáticos.
        if (await handleCatalogScript(ctx)) return;
        await serveStatic(ctx);
      } catch (error) {
        if (error.status === 413) {
          res.setHeader('Connection', 'close');
          req.resume();
        }
        json(error.status || (error.code === 'ENOENT' ? 404 : 500), {
          message: error.status ? error.message : 'Não foi possível concluir a operação.',
        });
      }
    },
  );
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 256;
  return server;
}
module.exports = { createSupabaseApp };
