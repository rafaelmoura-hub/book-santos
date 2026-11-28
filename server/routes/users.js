// Gestão de contas pelo mestre e lista de usuários para administradores.
const { validateUser } = require('../users');
const { visibleHotels } = require('../catalog-management');
const { fail, readBody } = require('../app/http');

async function handleUsers({ app, req, route, user, session, quota, json }) {
  const { provider, dropUserSessions } = app;
  if (route === '/api/manage/users') {
    if (user.funcao !== 'adm' || !user.mestre)
      throw fail(403, 'Somente o administrador mestre pode gerenciar usuários.');
    if (req.method === 'GET')
      return json(200, {
        users: await provider.managedUsers(session.accessToken),
        canCreate: provider.canCreateUsers === true,
      });
    if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
    quota(`manage:${user.id}`, 10, 'Aguarde um minuto antes de gerenciar mais contas.');
    const input = validateUser(
      await readBody(req, 16384),
      await visibleHotels(provider, session.accessToken, user),
    );
    await provider.saveUser(session.accessToken, input);
    if (input.id) dropUserSessions(input.id);
    return json(200, { ok: true });
  }
  if (route === '/api/users' && req.method === 'GET') {
    if (user.funcao !== 'adm') throw fail(403, 'Acesso negado.');
    return json(200, await provider.users(session.accessToken));
  }
  if (route === '/api/users' || route.startsWith('/api/users/'))
    throw fail(
      403,
      'Gerencie as contas em Authentication → Users e os perfis em book_profiles no painel Supabase.',
    );
  return false;
}

module.exports = { handleUsers };
