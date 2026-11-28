const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');

// Optional encrypted persistence on a persistent disk. No tokens in browser storage.
function sessionStore({ key, filename, clock = Date.now } = {}) {
  if (!key && !filename) return new Map();
  if (!/^[a-f0-9]{64}$/i.test(key || '') || !filename || !path.isAbsolute(filename))
    throw new Error(
      'Configure BOOK_SESSION_KEY com 64 dígitos hexadecimais e BOOK_SESSION_FILE com um caminho absoluto em disco persistente.',
    );
  const secret = Buffer.from(key, 'hex');
  const sessions = new Map();
  if (fs.existsSync(filename)) {
    try {
      const input = Buffer.from(fs.readFileSync(filename, 'utf8'), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', secret, input.subarray(0, 12));
      decipher.setAuthTag(input.subarray(12, 28));
      const rows = JSON.parse(
        Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString('utf8'),
      );
      for (const [id, session] of rows)
        if (session.expires > clock()) Map.prototype.set.call(sessions, id, session);
    } catch {
      throw new Error(
        'Não foi possível abrir as sessões persistidas. Confira a chave e o arquivo configurados.',
      );
    }
  }
  sessions.persist = () => {
    const rows = [...sessions]
      .filter(([, s]) => s.expires > clock())
      .map(([id, s]) => [
        id,
        {
          userId: s.userId,
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          authExpires: s.authExpires,
          expires: s.expires,
          issuedAt: s.issuedAt,
          pendingMfa: s.pendingMfa === true,
          mfaVerified: s.mfaVerified === true,
          factorId: s.factorId,
          enrollment: s.enrollment,
        },
      ]);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', secret, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(rows), 'utf8'), cipher.final()]);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = filename + '.tmp';
    fs.writeFileSync(
      temporary,
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'),
      { mode: 0o600 },
    );
    fs.renameSync(temporary, filename);
  };
  sessions.set = (id, value) => {
    Map.prototype.set.call(sessions, id, value);
    sessions.persist();
    return sessions;
  };
  sessions.delete = (id) => {
    const changed = Map.prototype.delete.call(sessions, id);
    if (changed) sessions.persist();
    return changed;
  };
  return sessions;
}
module.exports = { sessionStore };
