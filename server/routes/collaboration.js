// Notificações e colaboração: resumo do suporte, lembretes, feedbacks e avaliações.
const { hotels } = require('../../assets/catalog');
const { canTab } = require('../permissions');
const { uuid } = require('../workspace');
const { storeAttachments } = require('../operations');
const { validateCollaboration } = require('../collaboration');
const { visibleHotels } = require('../catalog-management');
const { fail, readBody } = require('../app/http');

const ROUTES = [
  '/api/workspace/support-summary',
  '/api/workspace/support-read',
  '/api/workspace/reminders',
  '/api/workspace/reminders-due',
  '/api/workspace/reminders-ack',
  '/api/feedbacks',
  '/api/feedbacks/service',
  '/api/evaluations',
];

const GRADES = [
  'Crítico',
  'Razoável',
  'Irrelevante',
  'Alta',
  'Média',
  'Baixa',
  'A conferir',
  'Não informado',
];

async function handleCollaboration({ app, req, url, route, user, session, quota, json }) {
  const { provider } = app;
  if (route === '/api/notifications' && req.method === 'GET')
    return json(200, await provider.notifications(session.accessToken));
  if (!ROUTES.includes(route)) return false;
  if (user.funcao !== 'adm') throw fail(403, 'Somente administradores.');
  if (
    (route.startsWith('/api/feedbacks') && !canTab(user, 'feedbacks')) ||
    (route === '/api/evaluations' && !canTab(user, 'avaliacoes'))
  )
    throw fail(403, 'Sem acesso a esta aba.');
  if (route === '/api/workspace/support-summary') {
    if (!user.mestre) throw fail(403, 'Somente o mestre.');
    if (req.method !== 'GET') throw fail(405, 'Método inválido.');
    return json(200, await provider.supportSummary(session.accessToken));
  }
  if (req.method === 'GET') {
    const offset = Number(url.searchParams.get('offset') || 0),
      before = url.searchParams.get('before');
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      (before && !Number.isFinite(Date.parse(before)))
    )
      throw fail(400, 'Consulta inválida.');
    if (route === '/api/workspace/reminders')
      return json(200, await provider.reminders(session.accessToken));
    if (route === '/api/feedbacks') {
      const grade = url.searchParams.get('grade');
      if (grade && !GRADES.includes(grade)) throw fail(400, 'Grau inválido.');
      return json(200, await provider.feedbacks(session.accessToken, offset, grade));
    }
    if (route === '/api/evaluations') {
      const beforeId = url.searchParams.get('beforeId');
      if (
        !!before !== !!beforeId ||
        (beforeId && !uuid(beforeId)) ||
        (before &&
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(before))
      )
        throw fail(400, 'Página inválida.');
      return json(200, await provider.evaluations(session.accessToken, before, beforeId));
    }
    throw fail(405, 'Método inválido.');
  }
  if (req.method !== 'POST') throw fail(405, 'Método inválido.');
  quota('collaboration:' + user.id, 60, 'Aguarde antes de enviar novamente.');
  const input = await readBody(req);
  if (route === '/api/workspace/reminders-due')
    return json(200, await provider.dueReminders(session.accessToken));
  if (route === '/api/workspace/reminders-ack') {
    if (
      !uuid(input?.id) ||
      typeof input.due !== 'string' ||
      !Number.isFinite(Date.parse(input.due))
    )
      throw fail(400, 'Lembrete inválido.');
    await provider.ackReminder(session.accessToken, input.id, input.due);
    return json(200, { ok: true });
  }
  if (route === '/api/workspace/support-read') {
    if (
      !uuid(input?.id) ||
      typeof input.seen !== 'string' ||
      !Number.isFinite(Date.parse(input.seen))
    )
      throw fail(400, 'Leitura inválida.');
    await provider.supportRead(session.accessToken, input.id, input.seen);
  } else if (route === '/api/workspace/reminders')
    await provider.saveReminder(session.accessToken, validateCollaboration('reminders', input));
  else if (route === '/api/evaluations')
    await provider.sendEvaluation(session.accessToken, validateCollaboration('evaluations', input));
  else if (route === '/api/feedbacks/service') {
    if (!canTab(user, 'os')) throw fail(403, 'Sem permissão para criar cards de serviço.');
    if (
      !uuid(input?.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      typeof input.recordId !== 'string' ||
      !/^\d{1,16}$/.test(input.recordId)
    )
      throw fail(400, 'Card inválido.');
    return json(200, { id: await provider.feedbackService(session.accessToken, input) });
  } else {
    const allowed = await visibleHotels(provider, session.accessToken, user),
      valid = validateCollaboration('feedbacks', input, [...hotels, ...allowed]);
    if (!allowed.includes(valid.data.hotel)) throw fail(403, 'Sem acesso ao condomínio.');
    if (
      Buffer.byteLength(
        JSON.stringify(valid.data, (k, v) =>
          typeof v === 'string' && v.startsWith('data:') ? '[anexo]' : v,
        ),
      ) >
      128 * 1024
    )
      throw fail(413, 'Feedback acima do limite.');
    const uploaded = [];
    let committed = false;
    try {
      const prepared = await storeAttachments(
        [{ data: valid.data }],
        user,
        (p, b, t) => provider.upload(session.accessToken, p, b, t),
        uploaded,
      );
      await provider.saveFeedback(session.accessToken, {
        ...valid,
        data: prepared[0].data,
      });
      committed = true;
    } finally {
      if (!committed && uploaded.length)
        await provider.removeFiles(session.accessToken, uploaded).catch(() => {});
    }
  }
  return json(200, { ok: true });
}

module.exports = { handleCollaboration };
