const { stat, readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { gzip } = require('node:zlib');
const { promisify } = require('node:util');
const compress = promisify(gzip);
const cache = new Map();
async function asset(filename) {
  const info = await stat(filename),
    stamp = `${info.mtimeMs}:${info.size}`;
  let entry = cache.get(filename);
  if (!entry || entry.stamp !== stamp) {
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    entry = {
      stamp,
      value: readFile(filename).then(async (bytes) => ({
        bytes,
        gzip: bytes.length > 1024 && !/\.png$/i.test(filename) ? await compress(bytes) : null,
        etag: `W/"${createHash('sha256').update(bytes).digest('hex')}"`,
      })),
    };
    cache.set(filename, entry);
  }
  try {
    return await entry.value;
  } catch (error) {
    if (cache.get(filename) === entry) cache.delete(filename);
    throw error;
  }
}
function acceptsGzip(header = '') {
  return header
    .split(',')
    .some(
      (part) =>
        /^gzip\s*(?:;\s*q\s*=\s*(?:1(?:\.0*)?|0?\.\d+))?\s*$/i.test(part.trim()) &&
        !/;\s*q\s*=\s*0(?:\.0*)?\s*$/i.test(part),
    );
}
module.exports = { asset, acceptsGzip };
