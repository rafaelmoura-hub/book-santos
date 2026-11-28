// Núcleo HTTP compartilhado pelas rotas: erros, leitura do corpo, cabeçalhos e respostas.
const { createHash } = require('node:crypto');

const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = (token) => createHash('sha256').update(token).digest('hex');

async function readBody(req, limit = 15 * 1024 * 1024) {
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw fail(413, 'Requisição acima do tamanho permitido.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Requisição acima do tamanho permitido.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail(400, 'JSON inválido.');
  }
}

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function applySecurityHeaders(res, secure) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

// `json` devolve true para que cada rota sinalize "respondi" com `return json(...)`.
function createResponders(res, { cookieName, secure }) {
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
    return true;
  };
  const cookie = (token, age) =>
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`,
    );
  return { json, cookie };
}

// Cota de gravação por minuto, no mapa `writes` compartilhado pela instância do servidor.
function createQuota(writes, now) {
  return (key, limit, message) => {
    const quota = writes.get(key) || { count: 0, until: now + 60000 };
    if (quota.count >= limit) throw fail(429, message);
    quota.count++;
    writes.set(key, quota);
  };
}

module.exports = { fail, digest, readBody, applySecurityHeaders, createResponders, createQuota };
