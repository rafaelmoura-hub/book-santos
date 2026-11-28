const { hotels, filePath } = require('../assets/catalog');
const { randomUUID } = require('node:crypto');
const Money = require('../assets/money');
const { canCollection } = require('./permissions');
const COLLECTIONS = [
  'chamados',
  'ordensServico',
  'vistorias',
  'estoqueBookSantos',
  'conversasSuporte',
];
const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = (value) => typeof value === 'string' && /^[\w@:.-]{1,200}$/.test(value);

function validateChanges(input, user, hotelsAllowed = hotels) {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    throw fail(400, 'Envie entre 1 e 100 alterações.');
  const seen = new Set();
  for (const change of input) {
    if (
      !change ||
      !COLLECTIONS.includes(change.collection) ||
      !validId(change.id) ||
      !Number.isSafeInteger(change.version) ||
      change.version < 0 ||
      !change.data ||
      Array.isArray(change.data) ||
      typeof change.data !== 'object'
    )
      throw fail(400, 'Alteração inválida.');
    const key = `${change.collection}/${change.id}`;
    if (seen.has(key)) throw fail(400, 'Registro duplicado no lote.');
    seen.add(key);
    const metadata = JSON.stringify(change.data, (field, value) =>
      typeof value === 'string' && value.startsWith('data:') ? '[anexo]' : value,
    );
    if (
      Buffer.byteLength(metadata, 'utf8') >
      (change.collection === 'estoqueBookSantos' ? 512 * 1024 : 128 * 1024)
    )
      throw fail(413, 'Dados do registro acima do limite permitido. Divida o conteúdo.');
    if (!canCollection(user, change.collection, true)) throw fail(403, 'Acesso negado a esta aba.');
    if (user.funcao !== 'adm' && !['chamados', 'conversasSuporte'].includes(change.collection))
      throw fail(403, 'Acesso negado.');
    if (change.collection !== 'estoqueBookSantos' && !hotelsAllowed.includes(change.data.hotel))
      throw fail(400, 'Hotel inválido.');
    if (change.collection === 'estoqueBookSantos' && change.id !== 'singleton')
      throw fail(400, 'Estoque inválido.');
    if (
      change.collection === 'ordensServico' &&
      change.data.status === 'Recusada' &&
      (typeof change.data.motivoRecusa !== 'string' ||
        change.data.motivoRecusa.trim().length < 3 ||
        change.data.motivoRecusa.length > 2000)
    )
      throw fail(400, 'Informe o motivo da recusa (3 a 2000 caracteres).');
    try {
      // Numeric JSON also works before the finance migration. This conversion
      // only serializes canonical cents; arithmetic stays in Money/PostgreSQL.
      if (change.collection === 'estoqueBookSantos' && Array.isArray(change.data.itens)) {
        for (const item of change.data.itens) {
          item.valor = Number(Money.parse(item.valor));
          if (
            item.minimo != null &&
            (typeof item.minimo !== 'number' ||
              !Number.isFinite(item.minimo) ||
              !/^\d{1,9}(\.\d{1,2})?$/.test(String(item.minimo)))
          )
            throw new Error(
              'Mínimo do estoque deve ser não negativo, com até duas casas decimais.',
            );
        }
      }
      if (change.collection === 'ordensServico' && change.data.fechamento) {
        for (const field of ['valorServico', 'valorMaterial', 'custoTotal'])
          change.data.fechamento[field] = Number(Money.parse(change.data.fechamento[field]));
      }
    } catch (error) {
      throw fail(400, error.message);
    }
  }
  return input;
}

function fileBuffer(uri) {
  const match =
    /^data:(image\/(?:jpeg|png|webp|gif)|video\/(?:mp4|webm)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(
      uri,
    );
  if (!match)
    throw fail(400, 'Formato de anexo não permitido. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou PDF.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw fail(413, 'Cada anexo deve ter até 5 MB.');
  const type = match[1];
  const valid = {
    'image/jpeg': () => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': () => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/gif': () => /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()),
    'image/webp': () =>
      bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
    'video/mp4': () => bytes.subarray(4, 8).toString() === 'ftyp',
    'video/webm': () => bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
    'application/pdf': () => bytes.subarray(0, 5).toString() === '%PDF-',
  }[type]();
  if (!valid) throw fail(400, 'O conteúdo do arquivo não corresponde ao formato informado.');
  return { bytes, type };
}

async function storeAttachments(changes, user, upload, uploadedPaths = []) {
  let total = 0;
  const files = [];
  // Validate the entire payload before uploading anything.
  function walk(value, hotel, depth = 0, field = '') {
    if (depth > 15) throw fail(400, 'Registro muito complexo.');
    if (typeof value === 'string') {
      if (value.startsWith('data:')) {
        const file = fileBuffer(value);
        total += file.bytes.length;
        if (total > 10 * 1024 * 1024 || files.length >= 20)
          throw fail(413, 'Envie até 20 anexos e 10 MB por gravação.');
        const entry = { ...file, path: `${user.id}/${hotel}/${randomUUID()}` };
        files.push(entry);
        return `/api/files/${entry.path}`;
      }
      if (/^(?:https?:|javascript:|blob:|\/\/)/i.test(value))
        throw fail(400, 'Links externos não são permitidos nos registros.');
      if (
        ['dados', 'anexoData'].includes(field) &&
        (!value.startsWith('/api/files/') || !filePath(value.slice('/api/files/'.length)))
      )
        throw fail(400, 'Referência de anexo inválida.');
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, hotel, depth + 1));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, walk(item, hotel, depth + 1, key)]),
      );
    return value;
  }
  const prepared = changes.map((change) => ({
    ...change,
    data: walk(change.data, change.data.hotel),
  }));
  for (const file of files) {
    uploadedPaths.push(file.path);
    await upload(file.path, file.bytes, file.type);
  }
  return prepared;
}
module.exports = { COLLECTIONS, validId, validateChanges, fileBuffer, storeAttachments };
