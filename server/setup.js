const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { openDatabase } = require('./database');
const { hashPassword } = require('./passwords');

(async () => {
  if(process.env.NODE_ENV==='production')throw new Error('Este assistente SQLite é exclusivo para testes locais. Configure o Supabase em produção.');
  const db = openDatabase(process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'book-santos.sqlite'));
  let rl;
  try {
    if (db.prepare('SELECT id FROM users LIMIT 1').get()) throw new Error('Administrador já configurado.');
    let hidden = false;
    const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
    rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    const nome = (await rl.question('Nome do administrador: ')).trim();
    const login = (await rl.question('Login (3 a 30 letras, números, ponto, _ ou -): ')).trim().toLowerCase();
    process.stdout.write('Senha (12 a 100 caracteres; entrada oculta): ');
    hidden = true;
    const senha = await rl.question('');
    hidden = false;
    process.stdout.write('\n');
    if (!nome || nome.length > 120 || !/^[a-z0-9._-]{3,30}$/.test(login) || senha.length < 12 || senha.length > 100) throw new Error('Dados inválidos. Execute novamente e confira os limites.');
    const hash = await hashPassword(senha);
    if (db.prepare('SELECT id FROM users LIMIT 1').get()) throw new Error('Administrador já configurado.');
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,1)').run(randomUUID(), nome, login, hash, 'adm');
    console.log('Administrador criado. Execute npm start.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { rl?.close(); db.close(); }
})();
