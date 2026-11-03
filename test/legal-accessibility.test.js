const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {renderLegal,legalConfig}=require('../server/legal');
const {createSupabaseApp}=require('../server/supabase-app');
const {acceptsGzip}=require('../server/static-assets');

test('documentos públicos escapam dados da empresa e não inventam contato ou protocolo',()=>{
  const c=legalConfig({BOOK_COMPANY_NAME:'<script>alert(1)</script>',BOOK_PRIVACY_EMAIL:'x@example.com\r\nBcc:y@example.com'});
  assert.equal(c.email,'');assert.match(renderLegal('empresa',c),/&lt;script&gt;/);
  assert.doesNotMatch(renderLegal('empresa',c),/<script>alert/);
  const form=renderLegal('lgpd',c);assert.match(form,/não abre protocolo/);assert.doesNotMatch(form,/id="privacyMail"/);
  assert.match(renderLegal('lgpd',{email:'privacidade@example.com'}),/id="privacyMail"/);
  assert.equal(renderLegal('__proto__'),null);
});
test('documentos e assets comprimidos funcionam sem sessão sem liberar os dados protegidos',async t=>{
  const server=createSupabaseApp({});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const page of ['privacidade','termos','cookies','reembolso','lgpd','empresa']){
    const r=await fetch(base+'/legal/'+page);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/lang="pt-BR"/);
  }
  assert.equal((await fetch(base+'/legal/inexistente')).status,404);
  const r=await fetch(base+'/assets/accessibility.js',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(r.headers.get('content-encoding'),'gzip');assert.match(await r.text(),/MutationObserver/);
  assert.equal((await fetch(base+'/assets/accessibility.js',{headers:{'If-None-Match':r.headers.get('etag')}})).status,304);
  const plain=await fetch(base+'/assets/accessibility.js',{headers:{'Accept-Encoding':'gzip;q=0'}});assert.equal(plain.headers.get('content-encoding'),null);
  const privatePage=await fetch(base+'/adm/admin.html',{redirect:'manual'});assert.equal(privatePage.status,302);
  assert.equal((await fetch(base+'/api/session')).status,401);
  const logo=await fetch(base+'/assets/book-task-logo.png');assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');const png=Buffer.from(await logo.arrayBuffer());assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(png.length<100000);
  assert.equal((await fetch(base+'/assets/not-public.png')).status,404);
  const layout=await fetch(base+'/assets/layout.css');assert.equal(layout.status,200);assert.match(layout.headers.get('content-type'),/text\/css/);
  const skyline=await fetch(base+'/assets/login-skyline.svg');assert.equal(skyline.status,200);assert.match(skyline.headers.get('content-type'),/image\/svg\+xml/);assert.match(await skyline.text(),/^<svg/);
  assert.ok(!acceptsGzip('gzip;q=0'));assert.ok(acceptsGzip('br, gzip;q=0.8'));
});
test('login prossegue com storage bloqueado e sem persistir identificação pessoal',async()=>{
  let requested;const status={},button={};const location={protocol:'http:',href:''};
  const elements={mensagem:status,login:{value:' teste@example.com '},senha:{value:'senha'}};
  const context={location,document:{getElementById:id=>elements[id],querySelector:()=>({classList:{add(){},remove(){}}})},localStorage:{removeItem(){throw Error('bloqueado');}},BookAPI:{request:async(url,opts)=>{requested=JSON.parse(opts.body);return {funcao:'adm'};}}};
  vm.createContext(context);vm.runInContext(readFileSync('login.js','utf8'),context);
  await context.entrar({preventDefault(){},target:{querySelector:()=>button,setAttribute(){}}});
  assert.equal(location.href,'/adm/admin.html');assert.equal(button.disabled,false);assert.equal(requested.login,'teste@example.com');
});
test('falha de rede na sessão mostra recuperação sem redirecionamento em loop',async()=>{
  const appended=[];const body={hidden:true,prepend(...nodes){appended.push(...nodes);}};let redirected=false;
  const context={localStorage:{removeItem(){throw Error('bloqueado');}},location:{replace(){redirected=true;}},document:{body,querySelector:()=>null,createElement:()=>({append(){},setAttribute(){},focus(){}})},BookAPI:{request:async()=>{throw Error('Sem conexão');}}};
  vm.createContext(context);await vm.runInContext(readFileSync('assets/session.js','utf8'),context);
  assert.equal(body.hidden,false);assert.equal(redirected,false);assert.equal(appended.length,1);
});
test('telas não carregam scripts de tracking ou fontes externas',()=>{
  for(const file of ['login.html','adm/admin.html','cliente/cliente.html','hotel/hotel.html']){
    const html=readFileSync(file,'utf8');assert.doesNotMatch(html,/<script[^>]+src=["'](?:https?:)?\/\//i);assert.doesNotMatch(html,/google-analytics|googletagmanager|connect\.facebook|fonts\.googleapis/i);
    assert.match(html,/assets\/accessibility\.js/);
  }
});
