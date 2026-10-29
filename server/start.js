const path = require('node:path');
const { existsSync } = require('node:fs');
const { createSupabase } = require('./supabase');
const { createSupabaseApp } = require('./supabase-app');
const { loadConfig } = require('./config');
const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
try {
  const provider = createSupabase({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY, secretKey: process.env.SUPABASE_SECRET_KEY });
  const { port, host, ...options } = loadConfig();
  const server = createSupabaseApp(provider, options);
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso.` : 'Não foi possível iniciar o servidor.'); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`BOOK TASK iniciado na porta ${port}.`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
