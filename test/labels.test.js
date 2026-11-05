const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createSupabaseApp}=require('../server/supabase-app');

test('etiquetas: sessão, acesso, limites, duplicatas e filtro validado',async t=>{
 let user={id:'11111111-1111-4111-8111-111111111111',nome:'Admin',login:'admin@example.com',funcao:'adm',mestre:false,tabs:['os']},received;
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const provider={login:async()=>({access_token:'token'}),profile:async()=>user,access:async()=>[],labels:async(token,input)=>{received=input;return [{id,name:'Revisar',color:'orange'}];},cardLabels:async(token,ids)=>{received=ids;return [];},assignLabels:async(token,input)=>{received=input;return {...input,version:1};},editOrder:async(token,input)=>{received=input;return {id:input.id,version:input.version+1,data:input.document};},servicePage:async(token,offset,filters)=>{received=filters;return {rows:[]};}};
 const server=createSupabaseApp(provider);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/labels')).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:user.login,senha:'teste'})});const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
 const post=(route,data)=>fetch(base+route,{method:'POST',headers,body:JSON.stringify(data)});
 assert.equal((await post('/api/labels',{name:' Revisar ',color:'orange'})).status,200);assert.equal(received.name,'Revisar');
 for(const input of [{name:'',color:'blue'},{name:'a'.repeat(41),color:'blue'},{name:'Revisar',color:'url(evil)'}])assert.equal((await post('/api/labels',input)).status,400);
 const assignment={id:'123',version:0,labelIds:[id]};assert.equal((await post('/api/card-labels',assignment)).status,200);assert.deepEqual(received,assignment);
 for(const input of [{...assignment,version:-1},{...assignment,labelIds:[id,id]},{...assignment,labelIds:['invalid']},{...assignment,id:'1 OR true'}])assert.equal((await post('/api/card-labels',input)).status,400);
 assert.equal((await fetch(base+'/api/card-labels?ids=123,456',{headers})).status,200);assert.deepEqual(received,['123','456']);
 assert.equal((await fetch(base+'/api/card-labels?ids='+Array(101).fill('123').join(','),{headers})).status,400);
 const page=label=>fetch(base+'/api/processes/services?filters='+encodeURIComponent(JSON.stringify({label})),{headers});
 assert.equal((await page(id)).status,200);assert.deepEqual(received,{label:id});assert.equal((await page('invalid')).status,400);
 for(const urgency of ['','Normal','Alta','Urgente','unknown']){const filters={label:id,urgency};assert.equal((await fetch(base+'/api/processes/services?filters='+encodeURIComponent(JSON.stringify(filters)),{headers})).status,200);assert.deepEqual(received,filters);}
 assert.equal((await fetch(base+'/api/processes/services?filters='+encodeURIComponent(JSON.stringify({urgency:'invalid'})),{headers})).status,400);
 const correction={id:'123',version:1,document:{titulo:'Corrigido'}};assert.equal((await post('/api/orders/edit',correction)).status,200);assert.deepEqual(received,correction);
 assert.equal((await post('/api/orders/edit',{...correction,document:{status:'Aberta'}})).status,400);
 user={...user,tabs:[]};assert.equal((await post('/api/orders/edit',correction)).status,403);assert.equal((await fetch(base+'/api/labels',{headers})).status,403);assert.equal((await post('/api/card-labels',assignment)).status,403);
 user={...user,funcao:'cliente',tabs:['os']};assert.equal((await post('/api/labels',{name:'Revisar',color:'blue'})).status,403);
});
