// Backup privado, só para o administrador mestre.
const { validateBackup, attachments } = require('../backup');
const { fail, readBody } = require('../app/http');

async function handleBackup({ app, req, route, user, session, quota, json }) {
  if (!(route === '/api/backup' && req.method === 'POST')) return false;
  if (user.funcao !== 'adm' || !user.mestre)
    throw fail(403, 'Somente o administrador mestre pode fazer backup.');
  const selected = validateBackup(await readBody(req, 4096));
  quota(`backup:${user.id}`, 2, 'Aguarde um minuto antes de iniciar outro backup.');
  const data = await app.provider.backup(session.accessToken, selected);
  if (!data || !Array.isArray(data.records))
    throw fail(
      502,
      'O servidor não confirmou os dados do backup. Nenhuma cópia completa foi gerada.',
    );
  return json(200, {
    format: 'book-santos-backup',
    version: 1,
    selected,
    data,
    files: selected.includes('anexos') ? attachments(data) : [],
  });
}

module.exports = { handleBackup };
