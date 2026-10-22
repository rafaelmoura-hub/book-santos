const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSupabaseApp } = require('../server/supabase-app');

test('sessão renova token uma vez quando duas requisições chegam juntas', async t => {
  let now=1000000, refreshed=0;
  const provider={
    async login() { return {access_token:'old',refresh_token:'refresh',expires_in:3600}; },
    async profile() { return {id:'uid',funcao:'adm',mestre:true}; },
    async refresh(token) {
      assert.equal(token,'refresh'); refreshed++;
      await new Promise(resolve=>setTimeout(resolve,20));
      return {access_token:'new',refresh_token:'refresh-new',expires_in:3600};
    }
  };
  const server=createSupabaseApp(provider,{clock:()=>now});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'test@example.com',senha:'password'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  now+=3590000;
  const responses=await Promise.all([fetch(base+'/api/session',{headers:{Cookie:cookie}}),fetch(base+'/api/session',{headers:{Cookie:cookie}})]);
  assert.ok(responses.every(response=>response.status===200));
  assert.equal(refreshed,1);
  now+=8*3600000;
  assert.equal((await fetch(base+'/api/session',{headers:{Cookie:cookie}})).status,401);
});
