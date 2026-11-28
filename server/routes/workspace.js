// Anotações e conversas de suporte do workspace, e reabertura de cards (mesma cota "workspace").
const { canTab } = require('../permissions');
const { uuid, validateWorkspace } = require('../workspace');
const { fail, readBody } = require('../app/http');

async function handleWorkspace({ app, req, url, route, user, session, quota, json }) {
  if (!(
    route === '/api/orders/reopen' ||
    route === '/api/workspace/notes' ||
    route === '/api/workspace/support'
  ))
    return false;
  const { provider } = app;
  if (user.funcao !== 'adm') throw fail(403, 'Disponível somente para administradores.');
  if (route === '/api/orders/reopen' && !canTab(user, 'os'))
    throw fail(403, 'Sem permissão para reabrir cards.');
  const kind = route.endsWith('/notes') ? 'notes' : 'support';
  if (req.method === 'GET' && route !== '/api/orders/reopen') {
    const id = url.searchParams.get('id');
    const offset = Number(url.searchParams.get('offset') || 0);
    if ((id && !uuid(id)) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
      throw fail(400, 'Consulta inválida.');
    const filter = url.searchParams.get('status');
    if (filter && !['Aberto', 'Fechado'].includes(filter)) throw fail(400, 'Status inválido.');
    return json(
      200,
      kind === 'notes'
        ? await provider.notes(session.accessToken)
        : await provider.support(session.accessToken, id, offset, filter),
    );
  }
  if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
  quota(`workspace:${user.id}`, 30, 'Aguarde um minuto antes de salvar novamente.');
  const input = await readBody(req, 100000);
  if (route === '/api/orders/reopen') {
    if (
      !input ||
      !/^[0-9]{1,16}$/.test(input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 3 ||
      input.reason.length > 1000
    )
      throw fail(400, 'Informe card, versão e motivo válidos.');
    await provider.reopenOrder(session.accessToken, {
      id: input.id,
      version: input.version,
      reason: input.reason.trim(),
    });
  } else {
    const valid = validateWorkspace(kind, input);
    if (kind === 'support' && valid.status && !user.mestre)
      throw fail(403, 'Somente o mestre altera o status do suporte.');
    if (kind === 'notes') await provider.saveNote(session.accessToken, valid);
    else await provider.sendSupport(session.accessToken, valid);
  }
  return json(200, { ok: true });
}

module.exports = { handleWorkspace };
