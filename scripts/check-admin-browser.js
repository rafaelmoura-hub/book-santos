// Optional local browser check; uses simulated data and never contacts Supabase.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSupabaseApp } = require('../server/supabase-app');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
async function main() {
  if (!fs.existsSync(chrome)) throw new Error('Defina CHROME_BIN com o caminho do Chrome instalado.');
  const master = { id:'11111111-1111-4111-8111-111111111111',nome:'Mestre',login:'master@example.com',funcao:'adm',mestre:true,version:1,book_hotel_access:[] };
  const users = [master]; let writes = 0;
  const provider = {
    canCreateUsers: true,
    async login() { return { access_token:'mock-token' }; },
    async profile() { return master; },
    async users() { return users; },
    async managedUsers() { return users; },
    async finance(token,payer) {
      const records=[{id:'1',hotel:'Unlimited',apartment:'1111',title:'Conserto',description:'Troca de torneira',status:'Finalizada',payer:'Book Santos',service:'0.10',material:'0.20',total:'0.30'},{id:'2',hotel:'Unique',apartment:'1111',title:'Limpeza',description:'Limpeza geral',status:'Em andamento',payer:'Airbnb',service:'2.50',material:'0.00',total:'2.50'}];
      return {groups:[{payer:'Book Santos',count:1,total:'0.30',finalized:'0.30',pending:'0.00'},{payer:'Airbnb',count:1,total:'2.50',finalized:'0.00',pending:'2.50'}],records:payer?records.filter(row=>row.payer===payer):records,next:null};
    },
    async saveUser(token,input) {
      writes++;
      if(input.id) Object.assign(users.find(user=>user.id===input.id),{nome:input.nome,funcao:input.funcao,version:2,book_hotel_access:input.hotels.map(hotel=>({hotel}))});
      else users.push({id:'55555555-5555-4555-8555-555555555555',nome:input.nome,login:input.login,funcao:input.funcao,version:1,mestre:false,book_hotel_access:input.hotels.map(hotel=>({hotel}))});
    },
    async apartments() { return ['Unlimited','Unique'].map(hotel=>({hotel,apartment:'1111'})); },
    async records() { return {rows:[],next:null}; }
  };
  const server=createSupabaseApp(provider); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'book-browser-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  try {
    let port;
    for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await delay(100);}}
    if(!port)throw new Error('Chrome não iniciou a depuração.');
    const target=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,{method:'PUT',signal:AbortSignal.timeout(10000)})).json();
    socket=new WebSocket(target.webSocketDebuggerUrl); await Promise.race([once(socket,'open'),delay(10000).then(()=>{throw new Error('Chrome não abriu a sessão de teste.');})]);
    let sequence=0;const pending=new Map();const errors=[];
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const handler=pending.get(message.id);if(handler){pending.delete(message.id);message.error?handler.reject(new Error(message.error.message)):handler.resolve(message.result);}}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Chrome excedeu o prazo: ${method}`));},10000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});
    await send('Runtime.enable');
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw new Error(`Tempo excedido: ${expression}`);};
    await wait("location.origin === '"+base+"' && document.readyState === 'complete'");
    await evaluate("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'master@example.com',senha:'senha'})}).then(r=>{if(!r.ok)throw Error('login');})");
    await send('Page.navigate',{url:base+'/adm/admin.html'});
    await wait("typeof mostrarAba === 'function' && !document.body.hidden");
    const tabs=await evaluate(`(() => {const result=[];for(const tab of ['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','usuarios']){mostrarAba(tab);const id=tab==='os'?'OS':tab[0].toUpperCase()+tab.slice(1);if(document.getElementById('visao'+id).hidden)throw Error(tab);if(document.querySelector('nav').getBoundingClientRect().height===0)throw Error('nav');result.push(tab);}return result;})()`);
    await evaluate("BookFinance.load()");
    await evaluate("if(document.querySelectorAll('.financeiro-card').length!==2)throw Error('finance records');if(!document.getElementById('financeiroLista').textContent.includes('0,30'))throw Error('money display');document.getElementById('fechamentoValorServico').value='0.10';document.getElementById('fechamentoValorMaterial').value='0.20';atualizarCustoTotal();if(document.getElementById('fechamentoCustoTotal').value!=='0.30')throw Error('money sum');");
    await evaluate("[...document.querySelectorAll('#financeiroAbas button')].find(button=>button.textContent.startsWith('Book Santos')).click()");
    await wait("document.querySelectorAll('.financeiro-card').length === 1 && document.getElementById('financeiroLista').textContent.includes('Conserto')");
    await evaluate("document.getElementById('fechamentoValorMaterial').value='12.34';renderizarMateriaisOS([]);if(document.getElementById('fechamentoValorMaterial').value!=='12.34')throw Error('manual material erased');document.getElementById('materiaisOS').dataset.hadMaterials='true';atualizarMateriaisOS();if(document.getElementById('fechamentoValorMaterial').value!=='0.00')throw Error('material reset');");
    await evaluate("mostrarAba('condominios');BookCondominios.mostrarHistorico('Unlimited');BookCondominios.selecionarApartamento('1111');BookCondominios.mostrarDadosApartamento('chamados');document.getElementById('abaEstoque').click();if(document.getElementById('visaoEstoque').hidden)throw Error('navigation');");
    await evaluate("BookUsers.load()");
    await evaluate("BookUsers.open();document.getElementById('usuarioNome').value='Pessoa teste';document.getElementById('usuarioEmail').value='pessoa@example.com';document.getElementById('usuarioSenha').value='senha-inicial-longa';document.getElementById('usuarioUnlimited').checked=true;BookUsers.save({preventDefault(){}})");
    if(users.length!==2||writes!==1)throw new Error('Cadastro não confirmado pelo servidor.');
    await evaluate("BookUsers.open('55555555-5555-4555-8555-555555555555');document.getElementById('usuarioFuncao').value='adm';document.getElementById('usuarioUnlimited').checked=false;document.getElementById('usuarioUnique').checked=true;BookUsers.save({preventDefault(){}})");
    if(writes!==2||users[1].funcao!=='adm'||users[1].book_hotel_access[0].hotel!=='Unique')throw new Error('Edição de permissões falhou.');
    if(errors.length)throw new Error(errors.join('; '));
    console.log(JSON.stringify({browser:'Chrome headless',tabs,created:1,permissionsUpdated:1,uncaughtErrors:0}));
  } finally {
    socket?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await delay(500);
    if(path.dirname(path.resolve(profile))===path.resolve(os.tmpdir()))try{fs.rmSync(profile,{recursive:true,force:true});}catch{ /* Browser cleanup can finish after process exit. */ }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
