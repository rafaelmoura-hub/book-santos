// Cards (ordens de serviço): etiquetas, remarcação e edição.
const Periods = require('../../assets/periods');
const { canTab } = require('../permissions');
const { uuid } = require('../workspace');
const { fail, readBody } = require('../app/http');

async function handleCards({ app, req, url, route, user, session, quota, json }) {
  const { provider } = app;
  if (['/api/labels', '/api/card-labels'].includes(route)) {
    if (user.funcao !== 'adm' || !canTab(user, 'os')) throw fail(403, 'Sem acesso aos cards.');
    if (req.method === 'GET') {
      if (route === '/api/labels') return json(200, await provider.labels(session.accessToken));
      const ids = (url.searchParams.get('ids') || '').split(',');
      if (ids.length > 100 || ids.some((id) => !/^\d{1,16}$/.test(id)))
        throw fail(400, 'Cards inválidos.');
      return json(200, await provider.cardLabels(session.accessToken, ids));
    }
    if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
    quota('labels:' + user.id, 40, 'Aguarde antes de salvar novamente.');
    const input = await readBody(req, 8192);
    if (route === '/api/labels') {
      if (
        !input ||
        typeof input.name !== 'string' ||
        !input.name.trim() ||
        input.name.trim().length > 40 ||
        !['teal', 'blue', 'purple', 'pink', 'orange', 'green', 'gray'].includes(input.color)
      )
        throw fail(400, 'Nome ou cor da etiqueta inválidos.');
      return json(
        200,
        await provider.labels(session.accessToken, {
          name: input.name.trim(),
          color: input.color,
        }),
      );
    }
    if (
      !input ||
      typeof input.id !== 'string' ||
      !/^\d{1,16}$/.test(input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      !Array.isArray(input.labelIds) ||
      input.labelIds.length > 10 ||
      new Set(input.labelIds).size !== input.labelIds.length ||
      input.labelIds.some((id) => !uuid(id))
    )
      throw fail(400, 'Etiquetas inválidas.');
    return json(200, await provider.assignLabels(session.accessToken, input));
  }
  if (route === '/api/cards/schedule' && req.method === 'POST') {
    if (!canTab(user, 'os')) throw fail(403, 'Sem acesso aos cards.');
    quota('schedule:' + user.id, 20, 'Aguarde antes de remarcar novamente.');
    const input = await readBody(req, 8192);
    if (
      !input ||
      typeof input.id !== 'string' ||
      !/^\d{1,16}$/.test(input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      typeof input.comment !== 'string' ||
      input.comment.length > 2000
    )
      throw fail(400, 'Remarcação inválida.');
    try {
      Periods.range('dia', input.due);
    } catch {
      throw fail(400, 'Data inválida.');
    }
    await provider.scheduleCard(session.accessToken, input);
    return json(200, { ok: true });
  }
  if (route === '/api/orders/edit') {
    if (user.funcao !== 'adm' || !canTab(user, 'os'))
      throw fail(403, 'Sem acesso para editar cards.');
    if (req.method !== 'POST') throw fail(405, 'Método inválido.');
    const input = await readBody(req, 25000);
    if (
      typeof input.id !== 'string' ||
      !/^\d{1,16}$/.test(input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      !input.document ||
      Array.isArray(input.document) ||
      typeof input.document !== 'object' ||
      Object.entries(input.document).some(
        ([k, v]) =>
          !['titulo', 'descricao', 'prioridade', 'vencimento'].includes(k) ||
          typeof v !== 'string' ||
          v.length > 10000,
      ) ||
      (input.document.prioridade &&
        !['Normal', 'Alta', 'Urgente'].includes(input.document.prioridade))
    )
      throw fail(400, 'Edição inválida.');
    return json(200, await provider.editOrder(session.accessToken, input));
  }
  return false;
}

module.exports = { handleCards };
