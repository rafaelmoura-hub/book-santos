const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const {createSupabaseApp}=require('../server/supabase-app');
test('recuperação genérica, renovação de senha, MFA e sessão pendente sem acesso aos dados',async t=>{
 const user={id:'11111111-1111-4111-8111-111111111111',nome:'Mestre',login:'master@example.com',funcao:'adm',mestre:true};
 let factors=[],passwordChanged=false,revoked=false;
 const provider={profile:async()=>user,login:async()=>({access_token:'aal1',refresh_token:'refresh'}),logout:async()=>{},mfaFactors:async()=>factors,
 recoverPassword:async()=>{},verifyRecovery:async(email,code)=>{if(code!=='123456')throw Error('invalid');return {access_token:'recovery',user:{id:user.id}};},updatePassword:async(token,password)=>{assert.equal(token,'recovery');assert.equal(password.length,14);passwordChanged=true;},logoutAll:async()=>{revoked=true;},
 mfaEnroll:async()=>({id:'factor',totp:{secret:'TEST-SECRET'}}),mfaVerify:async(token,id,code)=>{assert.equal(id,'factor');if(code!=='654321')throw Error('invalid');factors=[{id:'factor',factor_type:'totp',status:'verified'}];return {access_token:'aal2',refresh_token:'refresh2'};}};
 const server=createSupabaseApp(provider,{recoveryEnabled:true});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 let cookie='';const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});const login=async()=>{const r=await post('/api/login',{login:user.login,senha:'password'});cookie=r.headers.get('set-cookie').split(';')[0];return r.json();};
 assert.equal((await post('/api/auth/mfa/enroll',{})).status,401);
 const generic=await(await post('/api/auth/recovery',{email:user.login})).json();assert.equal(generic.ok,true);assert.ok(!generic.message.includes(user.login));
 assert.equal((await post('/api/auth/recovery/complete',{email:user.login,code:'000000',password:'new-password12'})).status,401);
 await login();assert.equal((await fetch(base+'/api/session',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await post('/api/auth/recovery/complete',{email:user.login,code:'123456',password:'new-password12'})).status,200);assert.ok(passwordChanged&&revoked);
 assert.equal((await fetch(base+'/api/session',{headers:{Cookie:cookie}})).status,401);
 await login();const enrollment=await(await post('/api/auth/mfa/enroll',{})).json();assert.equal(enrollment.secret,'TEST-SECRET');
 assert.equal((await post('/api/auth/mfa/confirm',{code:'000000'})).status,401);
 const confirmed=await post('/api/auth/mfa/confirm',{code:'654321'});assert.equal(confirmed.status,200);cookie=confirmed.headers.get('set-cookie').split(';')[0];
 const challenge=await login();assert.equal(challenge.mfaRequired,true);assert.equal(challenge.nome,undefined);
 assert.equal((await fetch(base+'/api/session',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await fetch(base+'/adm/admin.html',{headers:{Cookie:cookie},redirect:'manual'})).status,302);
 assert.equal((await post('/api/auth/mfa/verify',{code:'000000'})).status,401);
 const verified=await post('/api/auth/mfa/verify',{code:'654321'});assert.equal(verified.status,200);const oldCookie=cookie;cookie=verified.headers.get('set-cookie').split(';')[0];assert.notEqual(cookie,oldCookie);
 assert.equal((await fetch(base+'/api/session',{headers:{Cookie:cookie}})).status,200);assert.equal((await fetch(base+'/api/session',{headers:{Cookie:oldCookie}})).status,401);
});
test('MFA obrigatório mantém usuário em sessão restrita até configurar o autenticador',async t=>{
 const provider={login:async()=>({access_token:'token'}),profile:async()=>({id:'admin',funcao:'adm',nome:'Admin'}),mfaFactors:async()=>[],logout:async()=>{}};
 const server=createSupabaseApp(provider,{requireAdminMfa:true});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'admin@example.com',senha:'test'})});assert.equal((await response.json()).mfaEnrollRequired,true);
 assert.equal((await fetch(base+'/api/session',{headers:{Cookie:response.headers.get('set-cookie').split(';')[0]}})).status,401);
});
