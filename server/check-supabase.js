const path = require('node:path');
const { existsSync } = require('node:fs');
const { createSupabase } = require('./supabase');
const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
(async () => {
  try {
    const client = createSupabase({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY });
    await client.ready();
    console.log('Auth e versão 12 das migrações confirmados. Confira também as permissões com contas de teste.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
})();
