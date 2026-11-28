// Coleções operacionais: carga inicial (snapshot), paginação, gravação em lote e anexos.
const { hotels, filePath } = require('../../assets/catalog');
const { COLLECTIONS, validId, validateChanges, storeAttachments } = require('../operations');
const { canCollection } = require('../permissions');
const { boundedBytes } = require('../security');
const { visibleHotels } = require('../catalog-management');
const { fail, readBody } = require('../app/http');

const SAFE_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'application/pdf',
];

async function handleData(ctx) {
  const { app, req, res, url, route, user, session, requestId, read, quota, json } = ctx;
  const { provider } = app;
  if (route === '/api/snapshot' && req.method === 'GET') {
    let pages;
    try {
      pages = JSON.parse(url.searchParams.get('pages') || '{}');
    } catch {
      throw fail(400, 'Paginação inválida.');
    }
    if (
      !pages ||
      Array.isArray(pages) ||
      typeof pages !== 'object' ||
      Object.values(pages).some((count) => !Number.isInteger(count) || count < 1 || count > 20)
    )
      throw fail(400, 'Use entre 1 e 20 páginas por coleção.');
    const permitted = COLLECTIONS.filter((key) => canCollection(user, key));
    let active = permitted;
    if (url.searchParams.has('collections')) {
      try {
        active = JSON.parse(url.searchParams.get('collections'));
      } catch {
        throw fail(400, 'Coleções inválidas.');
      }
      if (
        !Array.isArray(active) ||
        active.length > COLLECTIONS.length ||
        new Set(active).size !== active.length ||
        active.some((key) => !COLLECTIONS.includes(key))
      )
        throw fail(400, 'Coleções inválidas.');
      if (user.funcao !== 'adm' && active.some((key) => !permitted.includes(key)))
        throw fail(400, 'Coleções inválidas.');
      active = active.filter((key) => permitted.includes(key));
    }
    const result = await Promise.all(
      active.map(async (key) => {
        let cursor = null;
        const loaded = [];
        for (let page = 0; page < (pages[key] || 1); page++) {
          const result = await read('records:' + key + ':' + cursor, () =>
            provider.records(session.accessToken, key, cursor),
          );
          loaded.push(...result.rows);
          cursor = result.next;
          if (!cursor) break;
        }
        return [key, { loaded, cursor }];
      }),
    );
    const snapshot = Object.fromEntries(result);
    if (provider.counts && user.funcao === 'adm')
      snapshot.__counts = await provider.counts(session.accessToken);
    return json(200, snapshot);
  }
  if (route === '/api/data' && req.method === 'GET') {
    const collection = url.searchParams.get('collection');
    const cursor = url.searchParams.get('cursor');
    if (!COLLECTIONS.includes(collection) || (cursor && !validId(cursor)))
      throw fail(400, 'Consulta inválida.');
    if (!canCollection(user, collection)) throw fail(403, 'Sem acesso a esta aba.');
    if (user.funcao !== 'adm' && !['chamados', 'conversasSuporte'].includes(collection))
      throw fail(403, 'Acesso negado.');
    return json(200, await provider.records(session.accessToken, collection, cursor));
  }
  if (route === '/api/data' && req.method === 'POST') {
    // A cota de gravação geral usa o próprio id do usuário como chave.
    quota(user.id, 60, 'Limite de gravações atingido. Aguarde um minuto.');
    const raw = await readBody(req);
    const changes = validateChanges(raw?.changes, user, [
      ...hotels,
      ...(await visibleHotels(provider, session.accessToken, user)),
    ]);
    const uploadedPaths = [];
    try {
      const prepared = await storeAttachments(
        changes,
        user,
        (filename, bytes, type) => provider.upload(session.accessToken, filename, bytes, type),
        uploadedPaths,
      );
      await provider.commit(session.accessToken, prepared);
    } catch (error) {
      if (uploadedPaths.length)
        await provider
          .removeFiles(session.accessToken, uploadedPaths)
          .catch(() =>
            console.error(JSON.stringify({ event: 'attachment_cleanup_pending', requestId })),
          );
      throw error;
    }
    return json(200, { ok: true });
  }
  if (route.startsWith('/api/files/') && req.method === 'GET') {
    const filename = decodeURIComponent(route.slice('/api/files/'.length));
    if (!filePath(filename)) throw fail(400, 'Caminho de anexo inválido.');
    const file = await provider.file(session.accessToken, filename);
    const bytes = await boundedBytes(file);
    const type = (file.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const safeType = SAFE_FILE_TYPES.includes(type) ? type : 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': safeType,
      'Content-Length': bytes.length,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ...(safeType === 'application/octet-stream'
        ? { 'Content-Disposition': 'attachment; filename="anexo"' }
        : {}),
    });
    res.end(bytes);
    return true;
  }
  return false;
}

module.exports = { handleData };
