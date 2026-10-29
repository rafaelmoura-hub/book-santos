const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {validateCatalog}=require('../server/catalog-management');
const {createSupabaseApp}=require('../server/supabase-app');
const {createSupabase}=require('../server/supabase');

test('Onboarding normaliza cadastros sem aceitar duplicatas, nomes inseguros ou lotes excessivos',()=>{
 assert.deepEqual(validateCatalog({kind:'condominium',hotel:'  Prédio   Novo ',apartments:['194a','102']}),{kind:'condominium',hotel:'Prédio Novo',apartments:['194A','102']});
 assert.equal(validateCatalog({kind:'condominium',hotel:'Prédio Vazio',apartments:[]}).apartments.length,0);
 for(const input of [{kind:'apartments',hotel:'Prédio Novo',apartments:[]},{kind:'condominium',hotel:'../x',apartments:[]},{kind:'condominium',hotel:'<script>',apartments:[]},{kind:'condominium',hotel:'Prédio Novo',apartments:['194a','194A']},{kind:'apartments',hotel:'Prédio Novo',apartments:Array(101).fill('1')},{kind:'apartments',hotel:'Prédio Novo',apartments:[null]}])assert.throws(()=>validateCatalog(input));
});
test('API Onboarding exige sessão e aba; cadastro novo chega ao catálogo sem liberar outros condomínios',async t=>{
 let user={id:'11111111-1111-4111-8111-111111111111',funcao:'cliente',mestre:false,tabs:[]},saved=0;
 const names=['Prédio Permitido'],rows=[];
 const provider={login:async()=>({access_token:'token'}),profile:async()=>user,access:async()=>names.map(hotel=>({hotel})),condominiums:async()=>[...names,'Prédio Restrito'].map(name=>({name})),apartments:async()=>rows,saveCatalog:async(token,input)=>{saved++;names.push(input.hotel);rows.push(...input.apartments.map(apartment=>({hotel:input.hotel,apartment})));return {hotel:input.hotel,created:input.apartments.length};}};
 const server=createSupabaseApp(provider);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base=`http://127.0.0.1:${server.address().port}`,input={kind:'condominium',hotel:'Novo Cadastro',apartments:['101']};
 const post=(body,cookie='')=>fetch(base+'/api/onboarding/catalog',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 assert.equal((await post(input)).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'teste@example.com',senha:'teste'})});const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await post(input,cookie)).status,403);user={...user,funcao:'adm'};assert.equal((await post(input,cookie)).status,403);
 user={...user,tabs:['onboarding']};assert.equal((await post({...input,kind:'apartments',hotel:'Prédio Restrito'},cookie)).status,403);assert.equal(saved,0);
 assert.equal((await post(input,cookie)).status,200);assert.equal(saved,1);
 const access=await (await fetch(base+'/api/access',{headers:{Cookie:cookie}})).json();assert.ok(access.includes('Novo Cadastro'));assert.ok(!access.includes('Prédio Restrito'));
 const asset=await (await fetch(base+'/assets/catalog.js',{headers:{Cookie:cookie}})).text();assert.ok(asset.includes('Novo Cadastro'));assert.ok(!asset.includes('Prédio Restrito'));
});
test('provedor mantém leitura no esquema anterior e exige migração 16 para gravar catálogo',async()=>{
 let version=15;const calls=[];
 const provider=createSupabase({url:'https://example.supabase.co',key:'sb_publishable_test',fetchImpl:async(url,opts)=>{calls.push({url,opts});if(url.pathname.endsWith('book_schema_version'))return Response.json(version);if(url.pathname.endsWith('book_apartments'))return Response.json([{hotel:'Be Urban',apartment:'214'}]);if(url.pathname.endsWith('book_condominiums'))return Response.json([{name:'Prédio Vazio'}]);return Response.json({hotel:'Prédio Novo',created:1});}});
 assert.deepEqual(await provider.condominiums('token'),[{name:'Be Urban'}]);
 await assert.rejects(provider.saveCatalog('token',{kind:'condominium',hotel:'Prédio Novo',apartments:['1']}),/202610290016/);
 version=16;assert.deepEqual(await provider.condominiums('token'),[{name:'Prédio Vazio'}]);await provider.saveCatalog('token',{kind:'condominium',hotel:'Prédio Novo',apartments:['1']});
 const rpc=calls.find(c=>c.url.pathname.endsWith('book_catalog_add'));assert.deepEqual(JSON.parse(rpc.opts.body),{entry_kind:'condominium',site_name:'Prédio Novo',units:['1']});assert.equal(rpc.opts.headers.Authorization,'Bearer token');
});
