// Financeiro (somente leitura, administradores com a aba liberada).
const Periods = require('../../assets/periods');
const { canTab } = require('../permissions');
const { validId } = require('../operations');
const { fail } = require('../app/http');

async function handleFinance({ app, req, url, route, user, session, json }) {
  if (!(route === '/api/finance' && req.method === 'GET')) return false;
  if (!canTab(user, 'financeiro')) throw fail(403, 'Sem acesso ao financeiro.');
  if (user.funcao !== 'adm') throw fail(403, 'Financeiro disponível somente para administradores.');
  const payer = url.searchParams.get('payer');
  const cursor = url.searchParams.get('cursor');
  if ((payer && payer.length > 200) || (cursor && !validId(cursor)))
    throw fail(400, 'Consulta financeira inválida.');
  let period;
  try {
    period = Periods.range(url.searchParams.get('period') || 'all', url.searchParams.get('date'));
  } catch (error) {
    throw fail(400, error.message);
  }
  return json(
    200,
    await app.provider.finance(session.accessToken, payer, cursor, period.start, period.end),
  );
}

module.exports = { handleFinance };
