const fail = (status, message) => Object.assign(new Error(message), { status });
const FILE_LIMIT = 5 * 1024 * 1024;
async function boundedBytes(response, limit = FILE_LIMIT) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel?.();
    throw fail(413, 'Arquivo acima do limite permitido.');
  }
  let size = 0;
  const chunks = [];
  if (!response.body) return Buffer.alloc(0);
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Arquivo acima do limite permitido.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}
function requireJSON(req) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw fail(415, 'Envie os dados no formato JSON.');
  if (
    req.headers['content-encoding'] &&
    !['identity'].includes(req.headers['content-encoding'].toLowerCase())
  )
    throw fail(415, 'Compressão de requisições não permitida.');
}
function validateProfile(user) {
  if (
    !user ||
    typeof user.id !== 'string' ||
    !user.id ||
    !['adm', 'cliente'].includes(user.funcao) ||
    (user.mestre && user.funcao !== 'adm')
  )
    throw fail(403, 'Perfil não autorizado.');
  return user;
}
module.exports = { boundedBytes, requireJSON, validateProfile, FILE_LIMIT };
