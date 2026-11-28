// Rotas sem sessão nem checagem de origem: documentos legais, saúde e prontidão.
const { renderLegal, legalConfig } = require('../legal');
const { fail } = require('../app/http');

// O cache de prontidão vive aqui, um por instância de servidor.
function createPublicRoutes({ provider, clock }) {
  let readyCheck,
    readyUntil = 0,
    releaseCheck,
    releaseUntil = 0;
  return async function handlePublic({ req, res, route, json }) {
    if (
      (route === '/legal' || route.startsWith('/legal/')) &&
      ['GET', 'HEAD'].includes(req.method)
    ) {
      const html = renderLegal(route === '/legal' ? 'privacidade' : route.slice(7), legalConfig());
      if (!html) throw fail(404, 'Documento não encontrado.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : html);
      return true;
    }
    if (route === '/health' && req.method === 'GET')
      return json(200, { status: 'ok', version: '20261107-ready8' });
    if (route === '/ready/release' && req.method === 'GET') {
      if (clock() >= releaseUntil) {
        if (!releaseCheck)
          releaseCheck = Promise.resolve()
            .then(() => provider.ready({ release: true }))
            .then(() => {
              releaseUntil = clock() + 10000;
            })
            .finally(() => {
              releaseCheck = null;
            });
        await releaseCheck;
      }
      return json(200, { status: 'ok', scope: 'release', release: 29 });
    }
    if (route === '/ready' && req.method === 'GET') {
      if (clock() >= readyUntil) {
        if (!readyCheck)
          readyCheck = Promise.resolve()
            .then(() => provider.ready())
            .then(() => {
              readyUntil = clock() + 10000;
            })
            .finally(() => {
              readyCheck = null;
            });
        await readyCheck;
      }
      return json(200, { status: 'ok', scope: 'connectivity' });
    }
    return false;
  };
}

module.exports = { createPublicRoutes };
