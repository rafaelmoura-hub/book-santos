// Imóveis: informações de acesso, remoção, cobertura de vistorias, apartamentos, acesso,
// cadastro pelo Onboarding e o script /assets/catalog.js gerado por usuário.
const { canTab } = require('../permissions');
const { validateCatalog, visibleHotels } = require('../catalog-management');
const { fail, readBody } = require('../app/http');

const APARTMENT_FIELDS = [
  'lockPassword',
  'safePassword',
  'wifiName',
  'wifiPassword',
  'masterPassword',
  'cleaningPassword',
  'governancePassword',
  'propertyPassword',
  'adminPassword',
  'accessNotes',
];

async function handleProperty({ app, req, url, route, user, session, json }) {
  const { provider } = app;
  if (
    !['/api/apartment-info', '/api/onboarding/remove', '/api/inspections/coverage'].includes(route)
  )
    return false;
  const tab =
    route === '/api/apartment-info'
      ? 'condominios'
      : route === '/api/onboarding/remove'
        ? 'onboarding'
        : 'vistorias';
  if (user.funcao !== 'adm' || !canTab(user, tab)) throw fail(403, 'Sem acesso a esta operação.');
  if (route === '/api/inspections/coverage') {
    if (req.method !== 'GET') throw fail(405, 'Método inválido.');
    return json(200, await provider.inspectionCoverage(session.accessToken));
  }
  if (
    !['GET', 'POST'].includes(req.method) ||
    (route === '/api/onboarding/remove' && req.method !== 'POST')
  )
    throw fail(405, 'Método inválido.');
  const input =
    req.method === 'GET'
      ? {
          hotel: url.searchParams.get('hotel'),
          apartment: url.searchParams.get('apartment'),
        }
      : await readBody(req, 45000);
  if (
    typeof input.hotel !== 'string' ||
    input.hotel.length > 100 ||
    !input.hotel ||
    (input.apartment != null &&
      (typeof input.apartment !== 'string' || !/^[A-Za-z0-9 -]{1,20}$/.test(input.apartment))) ||
    (route === '/api/apartment-info' && !input.apartment)
  )
    throw fail(400, 'Imóvel inválido.');
  if (!(await visibleHotels(provider, session.accessToken, user)).includes(input.hotel))
    throw fail(403, 'Sem acesso ao condomínio.');
  if (route === '/api/onboarding/remove') {
    if (input.confirm !== input.hotel + (input.apartment ? ' / ' + input.apartment : ''))
      throw fail(400, 'Confirme o imóvel que deseja remover.');
    return json(200, await provider.removeCatalog(session.accessToken, input));
  }
  if (
    req.method === 'POST' &&
    (!Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      !input.fields ||
      typeof input.fields !== 'object' ||
      Array.isArray(input.fields) ||
      Object.entries(input.fields).some(
        ([k, v]) =>
          !APARTMENT_FIELDS.includes(k) ||
          typeof v !== 'string' ||
          v.length > (k === 'accessNotes' ? 6000 : 256),
      ))
  )
    throw fail(400, 'Informações inválidas.');
  return json(
    200,
    await provider.apartmentInfo(
      session.accessToken,
      req.method === 'GET' ? { hotel: input.hotel, apartment: input.apartment } : input,
    ),
  );
}

async function handleCatalog(ctx) {
  const { app, req, route, user, session, quota, json } = ctx;
  const { provider } = app;
  if (await handleProperty(ctx)) return true;
  if (route === '/api/apartments' && req.method === 'GET')
    return json(200, await provider.apartments(session.accessToken));
  if (route === '/api/access' && req.method === 'GET')
    return json(200, await visibleHotels(provider, session.accessToken, user));
  if (route === '/api/onboarding/catalog' && req.method === 'POST') {
    if (!canTab(user, 'onboarding')) throw fail(403, 'Sem acesso ao Onboarding.');
    const input = validateCatalog(await readBody(req, 16384));
    if (
      input.kind === 'apartments' &&
      !(await visibleHotels(provider, session.accessToken, user)).includes(input.hotel)
    )
      throw fail(403, 'Sem acesso ao condomínio.');
    quota('catalog:' + user.id, 20, 'Aguarde um minuto antes de cadastrar novamente.');
    if (!provider.saveCatalog)
      throw fail(503, 'Aplique a migração 202610290016_onboarding_catalog.sql no Supabase.');
    return json(200, await provider.saveCatalog(session.accessToken, input));
  }
  return false;
}

// Fora de /api/: só chega aqui com sessão válida (arquivo protegido).
async function handleCatalogScript({ app, req, res, route, user, session }) {
  if (!(route === '/assets/catalog.js' && req.method === 'GET')) return false;
  const { provider } = app;
  const visible = await visibleHotels(provider, session.accessToken, user);
  const rows = await provider.apartments(session.accessToken);
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
  res.end(
    `window.BookCatalog = ${JSON.stringify({ hotels: visible, apartments: Object.fromEntries(visible.map((hotel) => [hotel, rows.filter((r) => r.hotel === hotel).map((r) => r.apartment)])) })};`,
  );
  return true;
}

module.exports = { handleCatalog, handleCatalogScript };
