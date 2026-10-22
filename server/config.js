function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const secure = env.COOKIE_SECURE === 'true';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  let publicOrigin;
  const configuredOrigin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  if (configuredOrigin) {
    const parsed = new URL(configuredOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('PUBLIC_ORIGIN deve conter somente protocolo e domínio.');
    publicOrigin = parsed.origin;
  }
  if (production && (!secure || !publicOrigin?.startsWith('https://'))) throw new Error('Publicação exige PUBLIC_ORIGIN=https://seu-dominio e COOKIE_SECURE=true.');
  return { port, host: env.HOST || '127.0.0.1', secure, publicOrigin };
}
module.exports = { loadConfig };
