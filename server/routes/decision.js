// Visão geral (painel SAD) e atividade por período.
const Periods = require('../../assets/periods');
const { canTab } = require('../permissions');
const { visibleHotels } = require('../catalog-management');
const { fail } = require('../app/http');

async function handleDecision({ app, req, url, route, user, session, read, json }) {
  const { provider } = app;
  if (route === '/api/decision/activity' && req.method === 'GET') {
    if (!canTab(user, 'dashboard')) throw fail(403, 'Sem acesso à visão geral.');
    let filters;
    try {
      filters = JSON.parse(url.searchParams.get('filters') || '{}');
    } catch {
      throw fail(400, 'Filtros inválidos.');
    }
    if (
      !filters ||
      Array.isArray(filters) ||
      typeof filters !== 'object' ||
      Object.keys(filters).some(
        (k) => !['start', 'end', 'group', 'hotel', 'urgency', 'assignees'].includes(k),
      ) ||
      !Array.isArray(filters.assignees) ||
      filters.assignees.length > 100 ||
      filters.assignees.some((v) => typeof v !== 'string' || v.length > 200) ||
      !['day', 'week', 'month', 'year'].includes(filters.group) ||
      !['', 'Normal', 'Alta', 'Urgente'].includes(filters.urgency) ||
      typeof filters.hotel !== 'string' ||
      filters.hotel.length > 100
    )
      throw fail(400, 'Filtros inválidos.');
    try {
      Periods.range('dia', filters.start);
      Periods.range('dia', filters.end);
    } catch {
      throw fail(400, 'Datas inválidas.');
    }
    if (
      filters.start > filters.end ||
      (Date.parse(filters.end) - Date.parse(filters.start)) / 86400000 > 7300
    )
      throw fail(400, 'Selecione um período de até 20 anos.');
    if (
      filters.hotel &&
      !(await visibleHotels(provider, session.accessToken, user)).includes(filters.hotel)
    )
      throw fail(403, 'Sem acesso ao condomínio.');
    return json(
      200,
      await read('activity:' + JSON.stringify(filters), () =>
        provider.activity(session.accessToken, filters),
      ),
    );
  }
  if (route === '/api/decision' && req.method === 'GET') {
    if (!canTab(user, 'dashboard')) throw fail(403, 'Sem acesso à visão geral.');
    const hotel = url.searchParams.get('hotel');
    if (hotel && !(await visibleHotels(provider, session.accessToken, user)).includes(hotel))
      throw fail(403, 'Sem acesso a este condomínio.');
    try {
      return json(
        200,
        await read('decision:' + hotel, () => provider.decision(session.accessToken, hotel)),
      );
    } catch (error) {
      if (error.status === 503)
        throw fail(
          503,
          'Painel SAD indisponível. Se ainda não aplicada, execute a migração 202610290015_decision.sql. As outras abas continuam disponíveis.',
        );
      throw error;
    }
  }
  return false;
}

module.exports = { handleDecision };
