// Assistente de IA: conversa (/api/ai) e execução de propostas confirmadas (/api/ai/actions).
const { uuid } = require('../workspace');
const { fail, readBody } = require('../app/http');

async function handleAI({ app, req, route, user, session, sessionId, quota, json }) {
  if (!((route === '/api/ai' || route === '/api/ai/actions') && req.method === 'POST'))
    return false;
  const { provider, agent, aiGenerate, dropUserSessions } = app;
  if (user.funcao !== 'adm') throw fail(403, 'Disponível somente para administradores.');
  const context = {
    provider,
    token: session.accessToken,
    user,
    session: sessionId,
    invalidateUser: dropUserSessions,
  };
  const executing = route === '/api/ai/actions';
  quota(
    `${executing ? 'ai-actions' : 'ai'}:${user.id}`,
    executing ? 20 : 5,
    'Aguarde um minuto antes de enviar outra solicitação à IA.',
  );
  if (executing) {
    const input = await readBody(req, 4096);
    if (!uuid(input?.id)) throw fail(400, 'Proposta inválida.');
    return json(200, await agent.execute(input.id, context));
  }
  return json(200, await agent.run(await readBody(req, 150000), context, aiGenerate));
}

module.exports = { handleAI };
