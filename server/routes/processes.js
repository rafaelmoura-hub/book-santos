// Processos, lista de serviços, acompanhamento (fluxo), comentários, vínculo com card e recebimento.
const { canTab, canCollection } = require('../permissions');
const { uuid } = require('../workspace');
const { storeAttachments } = require('../operations');
const { validateProcess, validateFlow } = require('../processes');
const { definitions: processDefinitions, flowPhases } = require('../../assets/processes');
const { visibleHotels } = require('../catalog-management');
const { fail, readBody } = require('../app/http');

const ROUTES = [
  '/api/processes',
  '/api/processes/services',
  '/api/processes/flow',
  '/api/processes/comment',
  '/api/processes/service',
  '/api/processes/receive',
];

async function handleProcesses({ app, req, url, route, user, session, read, quota, json }) {
  if (!ROUTES.includes(route)) return false;
  const { provider } = app;
  if (user.funcao !== 'adm') throw fail(403, 'Somente administradores.');
  const validSource = (source, id) =>
    ['process', ...Object.keys(flowPhases)].includes(source) &&
    typeof id === 'string' &&
    (['process', 'feedbacks'].includes(source) ? uuid(id) : /^\d{1,16}$/.test(id));
  const flowAllowed = (source, writing = false) =>
    source === 'process'
      ? Object.entries(processDefinitions).some(([kind, definition]) =>
          canTab(user, definition.tab || kind),
        )
      : source === 'feedbacks'
        ? canTab(user, 'feedbacks')
        : canCollection(user, source, writing);
  if (req.method === 'GET') {
    if (route === '/api/processes/flow') {
      const source = url.searchParams.get('source'),
        id = url.searchParams.get('id'),
        before = url.searchParams.get('before');
      if (!validSource(source, id) || (before && !/^\d{1,16}$/.test(before)))
        throw fail(400, 'Registro inválido.');
      if (!flowAllowed(source)) throw fail(403, 'Sem acesso ao acompanhamento.');
      return json(200, await provider.flowDetails(session.accessToken, source, id, before));
    }
    if (!['/api/processes', '/api/processes/services'].includes(route))
      throw fail(405, 'Método inválido.');
    const kind = url.searchParams.get('kind'),
      offset = Number(url.searchParams.get('offset') || 0);
    let filters;
    if (
      route === '/api/processes' &&
      ['reservas', 'projetos', 'compras', 'onboarding'].includes(kind)
    )
      throw fail(
        410,
        'Este processo foi removido. Onboarding está disponível apenas para cadastro de imóveis.',
      );
    try {
      filters = JSON.parse(url.searchParams.get('filters') || '{}');
    } catch {
      throw fail(400, 'Filtros inválidos.');
    }
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      !filters ||
      typeof filters !== 'object' ||
      Array.isArray(filters) ||
      Object.keys(filters).some(
        (k) => !['search', 'phase', 'assignee', 'hotel', 'period', 'label', 'urgency'].includes(k),
      ) ||
      Object.values(filters).some((v) => typeof v !== 'string' || v.length > 200) ||
      (filters.label && (!route.endsWith('/services') || !uuid(filters.label))) ||
      (filters.urgency &&
        (!route.endsWith('/services') ||
          !['Normal', 'Alta', 'Urgente', 'unknown'].includes(filters.urgency))) ||
      (filters.assignee && !uuid(filters.assignee)) ||
      (filters.period && !['all', 'today', 'week', 'late'].includes(filters.period))
    )
      throw fail(400, 'Filtros inválidos.');
    const tab = route.endsWith('/services') ? 'os' : processDefinitions[kind]?.tab || kind;
    if (route === '/api/processes' && !Object.hasOwn(processDefinitions, kind))
      throw fail(400, 'Processo inválido.');
    if (!canTab(user, tab)) throw fail(403, 'Sem acesso a esta aba.');
    return json(
      200,
      route.endsWith('/services')
        ? await read('services:' + offset + JSON.stringify(filters), () =>
            provider.servicePage(session.accessToken, offset, filters),
          )
        : await provider.processes(session.accessToken, kind, offset, filters),
    );
  }
  if (req.method !== 'POST') throw fail(405, 'Método inválido.');
  quota('routine:' + user.id, 40, 'Aguarde antes de salvar novamente.');
  const input = await readBody(req);
  if (route === '/api/processes') {
    if (['reservas', 'projetos', 'compras', 'onboarding'].includes(input?.kind))
      throw fail(410, 'Este processo foi removido. Use o cadastro de imóveis no Onboarding.');
    const valid = validateProcess(input),
      definition = processDefinitions[valid.kind];
    if (!canTab(user, definition.tab || valid.kind)) throw fail(403, 'Sem acesso a esta aba.');
    if (valid.hotel) {
      const allowed = await visibleHotels(provider, session.accessToken, user);
      if (!allowed.includes(valid.hotel)) throw fail(403, 'Sem acesso ao condomínio.');
    } else if (!definition.global || valid.apartment || valid.data.anexos.length)
      throw fail(400, 'Selecione condomínio e apartamento para anexar arquivos.');
    const paths = [];
    try {
      const prepared = await storeAttachments(
        [{ data: { ...valid.data, hotel: valid.hotel } }],
        user,
        (p, b, t) => provider.upload(session.accessToken, p, b, t),
        paths,
      );
      const { hotel, ...data } = prepared[0].data;
      await provider.saveProcess(session.accessToken, { ...valid, data });
    } catch (error) {
      if (paths.length) await provider.removeFiles(session.accessToken, paths).catch(() => {});
      throw error;
    }
  } else if (route === '/api/processes/flow') {
    const valid = validateFlow(input);
    if (!flowAllowed(valid.source, true))
      throw fail(403, 'Sem acesso para alterar o acompanhamento.');
    await provider.saveFlow(session.accessToken, valid);
  } else if (route === '/api/processes/comment') {
    if (
      !validSource(input?.source, input?.id) ||
      typeof input.body !== 'string' ||
      !input.body.trim() ||
      input.body.length > 2000
    )
      throw fail(400, 'Comentário inválido.');
    if (!flowAllowed(input.source, true)) throw fail(403, 'Sem acesso para comentar.');
    await provider.flowComment(session.accessToken, {
      source: input.source,
      id: input.id,
      body: input.body.trim(),
    });
  } else if (route === '/api/processes/service') {
    if (!canTab(user, 'os')) throw fail(403, 'Sem acesso a Cards.');
    if (
      !['process', 'vistorias'].includes(input?.source) ||
      !validSource(input.source, input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      typeof input.recordId !== 'string' ||
      !/^\d{1,16}$/.test(input.recordId)
    )
      throw fail(400, 'Vínculo inválido.');
    return json(200, { id: await provider.processService(session.accessToken, input) });
  } else if (route === '/api/processes/receive') {
    if (!canTab(user, 'compras') || !canTab(user, 'estoque'))
      throw fail(403, 'Exige acesso a Compras e Estoque.');
    if (
      !uuid(input?.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      !Number.isSafeInteger(input.stockVersion) ||
      input.stockVersion < 1 ||
      typeof input.materialId !== 'string' ||
      !/^[\w-]{1,100}$/.test(input.materialId) ||
      typeof input.quantity !== 'number' ||
      !Number.isFinite(input.quantity) ||
      input.quantity <= 0 ||
      input.quantity > 10000
    )
      throw fail(400, 'Recebimento inválido.');
    await provider.receivePurchase(session.accessToken, input);
  } else throw fail(405, 'Método inválido.');
  return json(200, { ok: true });
}

module.exports = { handleProcesses };
