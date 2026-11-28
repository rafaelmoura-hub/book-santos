// Páginas e arquivos estáticos da lista permitida, com redirecionamento por perfil.
const path = require('node:path');
const { asset, acceptsGzip } = require('../static-assets');
const { fail } = require('../app/http');

const ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED_FILE =
  /^\/(login\.(html|css|js)|assets\/(api|session|store|money|periods|catalog|events|notifications|processes|accessibility|legal|theme|mobile|auth|dictation)\.js|assets\/(ui|legal|brand|layout|mobile)\.css|assets\/book-task-logo\.png|assets\/login-skyline\.svg|(adm|cliente|hotel)\/[a-z]+\.(html|css|js))$/;
const TEXT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};

async function serveStatic({ req, res, route, user }) {
  if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Método não permitido.');
  if (/^\/hotel\/(hotel\.html)?$/.test(route)) {
    res.writeHead(302, { Location: '/adm/admin.html#condominios' });
    return res.end();
  }
  const file = route === '/' ? '/login.html' : route;
  if (!ALLOWED_FILE.test(file)) throw fail(404, 'Arquivo não encontrado.');
  if (
    (/^\/(adm|hotel)\//.test(file) && user?.funcao !== 'adm') ||
    (/^\/cliente\//.test(file) && user?.funcao !== 'cliente')
  ) {
    res.writeHead(302, { Location: '/login.html' });
    return res.end();
  }
  // Only allowlisted application files reach this cache, after access checks.
  const content = await asset(path.join(ROOT, file));
  res.setHeader('Vary', 'Accept-Encoding');
  if (/\.(css|js|png|svg)$/.test(file)) {
    const etag = content.etag;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      return res.end();
    }
  }
  const zipped = content.gzip && acceptsGzip(req.headers['accept-encoding']);
  const bytes = zipped ? content.gzip : content.bytes;
  const contentType =
    path.extname(file) === '.png'
      ? 'image/png'
      : `${TEXT_TYPES[path.extname(file)]}; charset=utf-8`;
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': bytes.length,
    ...(zipped ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

module.exports = { serveStatic };
