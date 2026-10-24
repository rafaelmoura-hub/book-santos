const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { loadConfig } = require('../server/config');
const root = path.resolve(__dirname, '..');

async function main() {
  const env = path.join(root, '.env');
  if (fs.existsSync(env)) process.loadEnvFile(env);
  const { port, host } = loadConfig();
  const address = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
  const origin = `http://${address.includes(':') ? `[${address}]` : address}:${port}`;
  console.log('Book Santos: verificando servidor');
  try {
    const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1500) });
    if (response.ok && (await response.json()).status === 'ok') {
      const login = await fetch(`${origin}/login.html`, { signal: AbortSignal.timeout(1500) });
      if (login.ok && (await login.text()).includes('Book Santos')) {
        console.log(`Book Santos: pronto em ${origin} (servidor já iniciado)`);
        return;
      }
    }
    throw new Error(`Já existe outro serviço na porta ${port}.`);
  } catch (error) {
    if (!['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code) && error.name !== 'TimeoutError') throw error;
  }
  const child = spawn(process.execPath, ['server/start.js'], { cwd: root, windowsHide: true, stdio: ['inherit', 'pipe', 'inherit'] });
  let ready = false;
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    if (!ready && chunk.toString().includes('Book Santos iniciado na porta')) {
      ready = true;
      console.log(`Book Santos: pronto em ${origin}`);
    }
  });
  child.on('error', error => { console.error(`ERRO: ${error.message}`); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
main().catch(error => { console.error(`ERRO: ${error.message}`); process.exitCode = 1; });
