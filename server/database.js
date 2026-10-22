const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, funcao TEXT NOT NULL CHECK(funcao IN ('adm','cliente')),
      mestre INTEGER NOT NULL DEFAULT 0 CHECK(mestre IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );`);
  return db;
}
module.exports = { openDatabase };
