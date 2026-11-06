// Optional local browser check; uses simulated data and never contacts Supabase.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSupabaseApp } = require('../server/supabase-app');
const Catalog = require('../assets/catalog');
const Processes = require('../assets/processes');
const {auditVisualState}=require('./visual-audit');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
async function main() {
  if (!fs.existsSync(chrome)) throw new Error('Defina CHROME_BIN com o caminho do Chrome instalado.');
  const master = { id:'11111111-1111-4111-8111-111111111111',nome:'Mestre',login:'master@example.com',funcao:'adm',mestre:true,version:1,book_hotel_access:[] };
  const users = [master]; let writes = 0;
  const client = { id:'22222222-2222-4222-8222-222222222222',nome:'Cliente teste',login:'cliente@example.com',funcao:'cliente',mestre:false };
  const records = new Map();
  const addedCatalog=new Map(),removedHotels=new Set(),removedUnits=new Set(),apartmentInfoRows=new Map();
  const uploaded = new Map();
  const noteRows=new Map(),supportRows=new Map(),reminderRows=new Map(),feedbackRows=new Map(),evaluationRows=[],processRows=new Map(),flowMetas=new Map(),flowRows=[];
  let notificationState={chat:{count:0},support:{count:0}},dueReminderQueue=[];
  const identity = token => token === 'client-token' ? client : token==='limited-token'?users[1]:master;
  records.set('chamados/101', { id:'101',version:1,owner_id:client.id,data:{id:101,hotel:'Be Urban',apartamento:'214',assunto:'Torneira',descricao:'Vazamento',categoria:'Hidráulica',status:'Aberto',criadaPor:client.nome,criadaPorLogin:client.login,data:'23/10/2026'} });
  const labelCatalog=[],cardLabelRows=new Map();
  const provider = {
    async recoverPassword(){},
    async verifyRecovery(){return {access_token:'recovery',user:{id:'recovery-test'}};},
    async updatePassword(){},async logoutAll(){},
    async mfaFactors(){return [];},async mfaEnroll(){return {id:'test-factor',totp:{secret:'SIMULATED-KEY'}};},

    async labels(token,input={}){if(input.name){if(labelCatalog.some(l=>l.name.toLowerCase()===input.name.toLowerCase()))throw Object.assign(Error('Duplicate'),{status:409});labelCatalog.push({id:require('node:crypto').randomUUID(),...input});}return labelCatalog;},
    async cardLabels(token,ids){return ids.filter(id=>records.has('ordensServico/'+id)).map(id=>cardLabelRows.get(id)||{id,version:0,labelIds:[]});},
    async assignLabels(token,input){const row=cardLabelRows.get(input.id)||{version:0};if(row.version!==input.version)throw Object.assign(Error('Conflict'),{status:409});const result={...input,version:row.version+1};cardLabelRows.set(input.id,result);return result;},
    async decision(token,hotel){
      const stock=records.get('estoqueBookSantos/singleton')?.data.itens||[],alerts=stock.filter(i=>Number(i.quantidade)<=Number(i.minimo??0));
      return {generatedAt:new Date().toISOString(),referenceDate:'2026-10-29',hotel:hotel||null,permissions:{stock:true,inspections:true},services:{total:150,open:150,overdue:12,today:4,urgent:2,unassigned:3,withoutDeadline:1},byHotel:[{hotel:hotel||'Be Urban',open:150,overdue:12,urgent:2}],byAssignee:[{id:master.id,name:master.nome,assignee:master.login,open:150,overdue:12}],byPhase:[{phase:'Novo',count:150}],queue:[],inspections:{units:126,missing:125,overdue:1,next30:0,items:[{hotel:'Be Urban',apartment:'214',last_date:null,next_due:null}]},stock:{global:true,alerts:alerts.length,unconfigured:stock.filter(i=>i.minimo==null).length,items:alerts.map(i=>({id:i.id,name:i.nome,quantity:i.quantidade,minimum:i.minimo??null}))}};
    },
    async processes(token,kind,offset,filters={}){let rows=[...processRows.values()].filter(p=>p.kind===kind&&(!filters.phase||p.phase===filters.phase)&&(!filters.assignee||p.data.responsavel===filters.assignee)&&(!filters.hotel||p.hotel===filters.hotel)&&(!filters.search||p.data.titulo.includes(filters.search)));const counts={};rows.forEach(r=>counts[r.phase]=(counts[r.phase]||0)+1);return {rows:rows.slice(offset,offset+50),total:rows.length,counts};},
    async servicePage(token,offset,filters={}){let rows=[...records.entries()].filter(([k])=>k.startsWith('ordensServico/')).map(([,r])=>({...r,phase:Processes.servicePhase({...r,phase:flowMetas.get('ordensServico:'+r.id)?.phase})}));rows=rows.filter(r=>(!filters.phase||r.phase===filters.phase)&&(!filters.label||cardLabelRows.get(r.id)?.labelIds.includes(filters.label))&&(!filters.urgency||(filters.urgency==='unknown'?(r.data.importacao?.parcial||!['Normal','Alta','Urgente'].includes(r.data.prioridade)):(!r.data.importacao?.parcial&&r.data.prioridade===filters.urgency))));const counts={};rows.forEach(r=>counts[r.phase]=(counts[r.phase]||0)+1);return {rows:rows.slice(offset,offset+50),total:rows.length,counts};},
    async saveProcess(token,input){const previous=processRows.get(input.id);if((previous?.version||0)!==input.version)throw Error('Conflito de processo');const row={...input,owner_id:identity(token).id,version:input.version+1,created_at:previous?.created_at||new Date().toISOString(),service_id:previous?.service_id,stock_receipt:previous?.stock_receipt};processRows.set(input.id,row);flowRows.push({id:String(flowRows.length+1),source:'process',record_id:row.id,actor_id:identity(token).id,actor_name:identity(token).nome,action:'Atualizado',body:'',current:{phase:row.phase},created_at:new Date().toISOString()});},
    async flowDetails(token,source,id,before){const row=source==='process'?processRows.get(id):source==='feedbacks'?feedbackRows.get(id):records.get(source+'/'+id);if(!row)throw Error('Registro não encontrado');return {record:row,recordVersion:row.version,meta:flowMetas.get(source+':'+id)||null,events:flowRows.filter(e=>e.source===source&&e.record_id===id&&(!before||Number(e.id)<Number(before))).reverse().slice(0,51)};},
    async saveFlow(token,input){const key=input.source+':'+input.id,previous=flowMetas.get(key),row=input.source==='feedbacks'?feedbackRows.get(input.id):records.get(input.source+'/'+input.id);if((previous?.version||0)!==input.version||row.version!==input.recordVersion)throw Error('Conflito de acompanhamento');flowMetas.set(key,{source:input.source,record_id:input.id,version:input.version+1,phase:input.phase,data:input.data});if(input.source==='ordensServico'&&row.data.status==='Aberta'&&input.phase==='Em andamento'){row.data.status='Em andamento';row.version++;}flowRows.push({id:String(flowRows.length+1),source:input.source,record_id:input.id,actor_name:identity(token).nome,action:'Acompanhamento atualizado',current:{phase:input.phase},created_at:new Date().toISOString()});},
    async flowComment(token,input){flowRows.push({id:String(flowRows.length+1),source:input.source,record_id:input.id,actor_name:identity(token).nome,action:'Comentário',body:input.body,created_at:new Date().toISOString()});},
    async activity(token,filters){const items=[...records.entries()].filter(([k])=>k.startsWith('ordensServico/')||k.startsWith('vistorias/')).map(([k,r])=>({kind:k.startsWith('vistorias/')?'inspections':'created',id:r.id,hotel:r.data.hotel,apartment:r.data.apartamento,title:r.data.titulo||'Vistoria #'+r.id,event_day:filters.end,detail:''}));return {referenceDate:filters.end,start:filters.start,end:filters.end,metrics:{created:items.filter(r=>r.kind==='created').length,inspections:items.filter(r=>r.kind==='inspections').length},series:[],items};},
    async scheduleCard(token,input){const row=records.get('ordensServico/'+input.id);if(!row||row.version!==input.version)throw Error('O card mudou');row.data.vencimento=input.due;row.version++;if(input.comment)await this.flowComment(token,{source:'ordensServico',id:input.id,body:input.comment});},
    async processService(token,input){const p=input.source==='process'?processRows.get(input.id):records.get('vistorias/'+input.id);if(p.service_id)return p.service_id;p.service_id=input.recordId;const d=p.data;records.set('ordensServico/'+input.recordId,{id:input.recordId,version:1,owner_id:identity(token).id,data:{id:input.recordId,hotel:p.hotel||d.hotel,apartamento:p.apartment||d.apartamento,titulo:d.titulo||'Serviço da vistoria',descricao:d.observacoes||'Pendências',status:'Aberta',anexos:d.anexos||d.fotos||[]}});return input.recordId;},
    async receivePurchase(token,input){const p=processRows.get(input.id);if(p.stock_receipt)return;p.stock_receipt={quantity:input.quantity,material_id:input.materialId};p.phase='Recebida';p.version++;const s=records.get('estoqueBookSantos/singleton');s.data.itens.find(i=>i.id===input.materialId).quantidade+=input.quantity;s.version++;},
    async notifications(){return notificationState;},
    async supportRead(){},
    async supportSummary(){const rows=[...supportRows.values()];return {total:rows.length,open:rows.filter(r=>r.status==='Aberto').length,closed:rows.filter(r=>r.status==='Fechado').length};},
    async reminders(token){return [...reminderRows.values()].filter(r=>r.owner_id===identity(token).id);},
    async saveReminder(token,input){const previous=reminderRows.get(input.id);if((previous?.version||0)!==input.version)throw Error('Conflito de lembrete');reminderRows.set(input.id,{note_id:input.id,owner_id:identity(token).id,due_at:input.due,repeat:input.repeat,enabled:input.enabled,version:input.version+1});},
    async dueReminders(){const rows=dueReminderQueue;dueReminderQueue=[];return rows;},
    async ackReminder(){},
    async feedbacks(token,offset=0,grade){return [...feedbackRows.values()].filter(f=>!grade||f.data.grau===grade).slice(offset,offset+51);},
    async saveFeedback(token,input){const previous=feedbackRows.get(input.id);if((previous?.version||0)!==input.version)throw Error('Conflito de feedback');feedbackRows.set(input.id,{...input,hotel:input.data.hotel,version:input.version+1,service_id:previous?.service_id});},
    async feedbackService(token,input){const f=feedbackRows.get(input.id);if(f.service_id)return f.service_id;if(f.version!==input.version)throw Error('Conflito');f.service_id=input.recordId;f.version++;records.set('ordensServico/'+input.recordId,{id:input.recordId,owner_id:identity(token).id,version:1,data:{id:input.recordId,hotel:f.hotel,apartamento:f.data.apartamento,titulo:f.data.assunto,descricao:f.data.observacoes,status:'Aberta',prioridade:'Normal',anexos:f.data.anexos,feedbackId:f.id}});return input.recordId;},
    async evaluations(){return [...evaluationRows].reverse();},
    async sendEvaluation(token,input){if(!evaluationRows.some(m=>m.id===input.id))evaluationRows.push({id:input.id,author_id:identity(token).id,author_name:identity(token).nome,target_name:users.find(u=>u.id===input.target)?.nome,body:input.body,created_at:new Date().toISOString()});},
    async notes(token){return [...noteRows.values()].filter(row=>row.owner_id===identity(token).id);},
    async saveNote(token,input){const old=noteRows.get(input.id);if((old?.version||0)!==input.version)throw Error('Conflito de nota');if(input.remove)noteRows.delete(input.id);else noteRows.set(input.id,{...input,owner_id:identity(token).id,version:input.version+1});},
    async support(token,id,offset=0,status){const rows=[...supportRows.values()].filter(row=>(identity(token).mestre||row.owner_id===identity(token).id)&&(!id||row.id===id)&&(!status||row.status===status));return rows.slice(offset,offset+51);},
    async sendSupport(token,input){let row=supportRows.get(input.id);if((row?.version||0)!==input.version)throw Error('Conflito de suporte');if(!row){row={id:input.id,subject:input.subject,status:'Aberto',owner_id:identity(token).id,owner_name:identity(token).nome,version:0,book_support_messages:[]};supportRows.set(input.id,row);}row.version++;if(input.status)row.status=input.status;if(input.body)row.book_support_messages.push({id:crypto.randomUUID(),author_id:identity(token).id,author_name:identity(token).nome,master:identity(token).mestre,body:input.body,created_at:new Date().toISOString()});},
    async editOrder(token,input){const row=records.get('ordensServico/'+input.id);if(row.version!==input.version)throw Object.assign(Error('Conflito'),{status:409});row.data={...row.data,...input.document};row.version++;return structuredClone(row);},
    async reopenOrder(token,input){const row=records.get('ordensServico/'+input.id);if(row.version!==input.version)throw Error('Conflito');row.data={...row.data,status:'Em andamento',motivoReabertura:input.reason};row.version++;},
    canCreateUsers: true,
    async login(email) { return { access_token:email===client.login?'client-token':email==='pessoa@example.com'?'limited-token':'mock-token' }; },
    async profile(token) { return identity(token); },
    async access() { return [{hotel:'Be Urban'},{hotel:'Lume Alto da Boa Vista'}]; },
    async backup(token,selected) {
      return {exported_at:new Date().toISOString(),schema_version:9,records:[...records.entries()].filter(([key])=>selected.includes(key.split('/')[0])).map(([,row])=>row),profiles:selected.includes('cadastros')?users:[],access:[],apartments:[],audit:[],user_audit:[]};
    },
    async logout() {},
    async users() { return [...users,client]; },
    async managedUsers() { return users; },
    async finance(token,payer,cursor,start,end) {
      const records=[{id:'1',date:'2026-10-22',hotel:'Unlimited',apartment:'1111',title:'Conserto',description:'Troca de torneira',status:'Finalizada',payer:'Book Santos',service:'0.10',material:'0.20',total:'0.30'},{id:'2',date:'2026-09-14',hotel:'Unique Residence',apartment:'1111',title:'Limpeza',description:'Limpeza geral',status:'Em andamento',payer:'Airbnb',service:'2.50',material:'0.00',total:'2.50'}].filter(row=>!start || row.date>=start&&row.date<end);
      const groups=[{payer:'Book Santos',count:1,total:'0.30',finalized:'0.30',pending:'0.00'},{payer:'Airbnb',count:1,total:'2.50',finalized:'0.00',pending:'2.50'}].filter(group=>records.some(row=>row.payer===group.payer));
      return {groups,records:payer?records.filter(row=>row.payer===payer):records,next:null};
    },
    async saveUser(token,input) {
      writes++;
      if(input.id) Object.assign(users.find(user=>user.id===input.id),{nome:input.nome,funcao:input.funcao,tabs:input.tabs,version:2,book_hotel_access:input.hotels.map(hotel=>({hotel}))});
      else users.push({id:'55555555-5555-4555-8555-555555555555',nome:input.nome,login:input.login,funcao:input.funcao,version:1,mestre:false,book_hotel_access:input.hotels.map(hotel=>({hotel}))});
    },
    async apartmentInfo(token,input){const key=input.hotel+'/'+input.apartment,old=apartmentInfoRows.get(key)||{hotel:input.hotel,apartment:input.apartment,version:0,fields:{}};if(input.fields){if(old.version!==input.version)throw Object.assign(Error('Conflito'),{status:409});const next={...old,fields:input.fields,version:old.version+1};apartmentInfoRows.set(key,next);return next;}return old;},
    async removeCatalog(token,input){if(input.apartment)removedUnits.add(input.hotel+'/'+input.apartment);else removedHotels.add(input.hotel);return {removed:true};},
    async inspectionCoverage(token){const today=new Date().toISOString().slice(0,10),apartments=await provider.apartments(token),rows=apartments.map(a=>{const last=[...records.values()].filter(r=>r.data.hotel===a.hotel&&r.data.apartamento===a.apartment&&r.data.checklist).map(r=>r.data.data).sort().at(-1)||null,due=Processes.nextInspection(last);return {...a,last_date:last,due_date:due,status:!last?'missing':due<today?'overdue':'current'};}),counts={total:rows.length,missing:0,overdue:0,current:0};rows.forEach(r=>counts[r.status]++);return {referenceDate:today,rows,counts};},
    async condominiums(token){return [...Catalog.hotels,...addedCatalog.keys()].filter(h=>!removedHotels.has(h)).filter(h=>identity(token).mestre||['Be Urban','Lume Alto da Boa Vista'].includes(h)).map(name=>({name}));},
    async saveCatalog(token,input){
      if(input.kind==='condominium'){if(Catalog.hotels.includes(input.hotel)||addedCatalog.has(input.hotel))throw Object.assign(Error('Condomínio já cadastrado'),{status:409});addedCatalog.set(input.hotel,[]);}
      const existing=addedCatalog.get(input.hotel)||[];
      if(input.apartments.some(a=>existing.includes(a)||(Catalog.apartments[input.hotel]||[]).includes(a)))throw Object.assign(Error('Apartamento já cadastrado'),{status:409});
      addedCatalog.set(input.hotel,[...existing,...input.apartments]);return {hotel:input.hotel,created:input.apartments.length};
    },
    async apartments(token) { return [...new Set([...Catalog.hotels,...addedCatalog.keys()])].filter(h=>!removedHotels.has(h)).filter(h=>identity(token).mestre || ['Be Urban','Lume Alto da Boa Vista'].includes(h)).flatMap(hotel=>[...(Catalog.apartments[hotel]||[]),...(addedCatalog.get(hotel)||[])].filter(apartment=>!removedUnits.has(hotel+'/'+apartment)).map(apartment=>({hotel,apartment}))); },
    async records(token,collection) { return {rows:[...records.entries()].filter(([key,row])=>key.startsWith(collection+'/') && (identity(token).mestre || row.owner_id===client.id)).map(([,row])=>row),next:null}; },
    async commit(token,changes) {
      for(const change of changes) {
        const key=change.collection+'/'+change.id, old=records.get(key);
        if((old?.version||0)!==change.version) throw Object.assign(new Error('Conflito de versão'),{status:409});
        records.set(key,{id:change.id,owner_id:old?.owner_id||identity(token).id,version:change.version+1,data:change.data});
      }
    },
    async upload(token,name,bytes,type) { uploaded.set(name,{bytes,type}); },
    async removeFiles(token,names) { names.forEach(name=>uploaded.delete(name)); },
    async file(token,name) { const file=uploaded.get(name); if(!file)throw Error('Arquivo inexistente');return new Response(file.bytes,{headers:{'Content-Type':file.type}}); }
  };
  const server=createSupabaseApp(provider,{recoveryEnabled:true,aiGenerate:async raw=>raw.messages.at(-1).content.includes('Abra um card de teste pela IA')?{calls:[{id:'prepare-card',name:'preparar_acao',args:{operation:'criar_card',id:'',data_json:JSON.stringify({hotel:'Be Urban',apartamento:'214',titulo:'Card criado pela IA',descricao:'Reparo descrito pelo usuário',prioridade:'Normal'})}}],state:{}}:{answer:'Resposta de IA simulada para teste.'}}); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'book-browser-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  try {
    let port;
    for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];break;}catch{await delay(100);}}
    if(!port)throw new Error('Chrome não iniciou a depuração.');
    const target=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,{method:'PUT',signal:AbortSignal.timeout(10000)})).json();
    socket=new WebSocket(target.webSocketDebuggerUrl); await Promise.race([once(socket,'open'),delay(10000).then(()=>{throw new Error('Chrome não abriu a sessão de teste.');})]);
    let sequence=0;const pending=new Map();const errors=[];
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const handler=pending.get(message.id);if(handler){pending.delete(message.id);message.error?handler.reject(new Error(message.error.message)):handler.resolve(message.result);}}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Chrome excedeu o prazo: ${method}`));},10000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});
    await send('Runtime.enable');
    await send('Log.enable');
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(arg=>arg.description||arg.value).join(' '));if(message.method==='Log.entryAdded'&&message.params.entry.source==='security'&&message.params.entry.level==='error')errors.push(message.params.entry.text);});
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.SpeechRecognition=class{start(){window.__testDictation=this;}stop(){this.onend?.();}abort(){this.onend?.();}};"});
    const dialogs=[];
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Page.javascriptDialogOpening'){dialogs.push(message.params.message);send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}});
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(expression.slice(0,300)+'\n'+JSON.stringify(result.exceptionDetails));return result.result.value;};
    const tap=async selector=>{const point=await evaluate('(() => {const b=document.querySelector('+JSON.stringify(selector)+');b.scrollIntoView({block:"center",behavior:"instant"});const r=b.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;if(!r.width||!r.height||!b.contains(document.elementFromPoint(x,y)))throw Error(JSON.stringify({rect:r.toJSON(),hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,300)})+" Controle inacessivel: "+'+JSON.stringify(selector)+');return {x,y};})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});};
    const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}const state=await evaluate("JSON.stringify({url:location.href,ready:document.readyState,text:document.body?.innerText.slice(0,1200)})");throw new Error(`Tempo excedido: ${expression}\n${state}`);};
    const visualResults=[];
    const capture=async name=>{
      const original=await evaluate("document.documentElement.dataset.theme");
      for(const theme of ['light','dark']){
        if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate("document.getElementById('themeToggle').click()");
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const audit={state:name,...await evaluate('('+auditVisualState.toString()+')()')};visualResults.push(audit);
        if(audit.contrast.length||audit.clipped.length||audit.images.length)console.log(JSON.stringify({event:'visual_issue',state:name,theme,contrast:audit.contrast.length,clipped:audit.clipped.length,images:audit.images.length}));
        if(process.env.BOOK_PREVIEW_DIR){
          const folder=path.resolve(process.env.BOOK_PREVIEW_DIR);fs.mkdirSync(folder,{recursive:true});
          const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
          fs.writeFileSync(path.join(folder,name+'-'+theme+'.png'),Buffer.from(screenshot.data,'base64'));
          fs.writeFileSync(path.join(folder,'visual-report.json'),JSON.stringify(visualResults,null,2));
        }
      }
      if(await evaluate('document.documentElement.dataset.theme')!==original)await evaluate("document.getElementById('themeToggle').click()");
    };
    const contrastAudit=()=>evaluate(`(() => {
      const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number);
      const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      const bg=e=>{for(let n=e;n;n=n.parentElement){const c=rgb(getComputedStyle(n).backgroundColor);if(c.length===3||c[3]===1)return c;}return rgb(getComputedStyle(document.documentElement).backgroundColor);};
      const failures=[];
      for(const e of document.body.querySelectorAll('*')){
        if(!e.getClientRects().length||e.closest('[hidden],svg')||e.disabled||getComputedStyle(e).visibility==='hidden'||!Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim()))continue;
        const s=getComputedStyle(e);if(Number(s.opacity)<1)continue;
        const c=rgb(s.color),b=bg(e);if(c.length<3||b.length<3||c[3]!=null&&c[3]!==1)continue;
        const l=[luminance(c),luminance(b)].sort((a,b)=>a-b),ratio=(l[1]+.05)/(l[0]+.05),required=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700?3:4.5;
        if(ratio+.02<required)failures.push({element:e.id||e.className||e.tagName,text:e.textContent.trim().slice(0,55),ratio:Number(ratio.toFixed(2)),color:s.color,background:b});
      }
      return failures.slice(0,25);
    })()`);
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await wait("location.origin === '"+base+"' && document.readyState === 'complete'");
    await capture('login-desktop');
    await evaluate("document.querySelector('.account-recovery').click();const fields=document.querySelectorAll('.account-dialog input');fields[0].value='recover@example.com';document.querySelector('.account-dialog form button').click()");
    await wait("document.querySelector('.account-dialog [role=status]').textContent.includes('instru')");
    await evaluate("const resetFields=document.querySelectorAll('.account-dialog input');resetFields[1].value='123456';resetFields[2].value='new-password12';document.querySelector('.account-dialog form').requestSubmit()");
    await wait("document.querySelector('.account-dialog [role=status]').textContent.includes('Senha atualizada')");
    await capture('recuperacao-senha');await evaluate("document.querySelector('.account-dialog > button').click()");
    for(const width of [320,360,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await evaluate("if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Login excede largura');document.getElementById('senha').value='private-test';document.querySelector('.password-reveal').click();if(document.getElementById('senha').type!=='text')throw Error('Senha nao visivel');document.querySelector('.password-reveal').click();document.getElementById('senha').value=''");await tap('#senha');await send('Input.insertText',{text:'input-test'});await evaluate("if(document.activeElement.id!=='senha'||document.getElementById('senha').value!=='input-test')throw Error('Campo de senha obstruido');document.getElementById('senha').value=''");await capture('login-mobile-'+width);}
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await wait("!!document.getElementById('themeToggle') && document.querySelector('.brand-logo').naturalWidth===256 && document.querySelector('.brand-heading').textContent.trim()==='' ");
    await evaluate("document.getElementById('themeToggle').click()");
    await wait("document.documentElement.dataset.theme==='dark'");
    await capture('login-night');
    await send('Page.reload');
    await wait("document.readyState==='complete' && document.documentElement.dataset.theme==='dark' && document.querySelector('#themeToggle .theme-label')?.textContent==='Modo diurno'");
    await evaluate("document.getElementById('themeToggle').click()");
    await wait("document.documentElement.dataset.theme==='light'");
    await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Armazenamento bloqueado','SecurityError');}});"});
    await evaluate("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'master@example.com',senha:'senha'})}).then(r=>{if(!r.ok)throw Error('login');})");
    await send('Page.navigate',{url:base+'/adm/admin.html'});
    await wait("typeof mostrarAba === 'function' && !document.body.hidden");
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await evaluate("mostrarAba('chamados');mostrarAba('os');if(!document.getElementById('visaoOS').getAnimations().some(a=>a.id==='book-tab-enter'))throw Error('Transição da aba ausente')");
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate("mostrarAba('chamados');mostrarAba('os');if(document.getElementById('visaoOS').getAnimations().some(a=>a.id==='book-tab-enter'))throw Error('Movimento reduzido ignorado')");
    await evaluate("mostrarAba('os');document.querySelector('#visaoOS .acao-principal').focus();abrirFormularioOS()");
    await wait("document.getElementById('osModal').getAttribute('aria-modal')==='true' && document.activeElement.tagName==='BUTTON'");
    await capture('formulario-card');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
    await evaluate("if(!document.getElementById('osModal').contains(document.activeElement))throw Error('Tab escapou do modal')");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait("document.getElementById('osModal').style.display==='none' && document.activeElement===document.querySelector('#visaoOS .acao-principal')");
    await evaluate("mostrarAba('chamados')");
    await wait("!!document.querySelector('.linha-chamado .card-open') && document.querySelectorAll('.legal-footer a').length===6");
    await evaluate(`(async()=>{const row=document.getElementById('listaChamados').firstElementChild;await BookStore.refresh();if(row!==document.getElementById('listaChamados').firstElementChild)throw Error('Uma resposta idêntica reconstruiu a lista');})()`);
    await capture('painel-desktop');
    await evaluate("BookAccount.security()");await wait("document.querySelector('.account-dialog button')?.textContent.includes('Ativar')");await capture('seguranca-conta');
    await evaluate("document.querySelector('.account-dialog button').click()");await evaluate("[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent.includes('Gerar chave')).click()");
    await wait("document.querySelector('.account-secret').textContent==='SIMULATED-KEY'");await capture('configurar-autenticador');
    await evaluate("[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent==='Cancelar').click()");await wait("!document.querySelector('.account-dialog[open]')");
    await evaluate("document.querySelector('.layout-search-button').click();document.querySelector('.layout-command input').value='estoque';document.querySelector('.layout-command input').dispatchEvent(new Event('input'));if(document.querySelectorAll('.layout-command-results button').length!==1)throw Error('Busca de abas não filtrou');document.querySelector('.layout-command-results button').click();if(document.getElementById('visaoEstoque').hidden||document.querySelector('.layout-command').open)throw Error('Busca não navegou');mostrarAba('chamados')");
    await evaluate("if(document.querySelectorAll('body > nav .nav-group').length!==5)throw Error('Agrupamentos do menu');if(document.getElementById('abaOS').closest('details').id!=='menu-operacao'||document.getElementById('abaEstoque').closest('details').id!=='menu-gestao'||document.getElementById('abaOnboarding').closest('details').id!=='menu-imoveis')throw Error('Abas em grupos incorretos');if(!document.getElementById('menu-atendimento').open)throw Error('Grupo ativo fechado');");
    await evaluate("if(['Reservas','Projetos','Compras'].some(name=>document.getElementById('aba'+name))||document.getElementById('onboardingHistory')||document.getElementById('routine-onboarding')||document.getElementById('flowPurchase'))throw Error('Abas ou ações removidas continuam presentes')");
    const tabs=await evaluate(`(() => {const result=[];for(const tab of ['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','usuarios','backup','suporte','feedbacks','avaliacoes','onboarding','danos']){document.getElementById('aba'+(tab==='os'?'OS':tab[0].toUpperCase()+tab.slice(1))).click();const id=tab==='os'?'OS':tab[0].toUpperCase()+tab.slice(1);if(document.getElementById('visao'+id).hidden)throw Error(tab);if(document.querySelector('nav').getBoundingClientRect().height===0)throw Error('nav');result.push(tab);}return result;})()`);
    for(const tab of tabs){await evaluate(`mostrarAba(${JSON.stringify(tab)})`);await capture('aba-'+tab);}
    await evaluate("document.getElementById('themeToggle').click()");
    const darkContrast=[];
    for(const tab of tabs){await evaluate(`mostrarAba(${JSON.stringify(tab)});if(document.documentElement.dataset.theme!=='dark'||getComputedStyle(document.body).backgroundColor!==getComputedStyle(document.documentElement).backgroundColor)throw Error('Tema noturno ausente')`);const issues=await contrastAudit();if(issues.length)darkContrast.push({tab,issues});}
    if(darkContrast.length)throw Error('Contraste noturno: '+JSON.stringify(darkContrast));
    await evaluate("mostrarAba('dashboard');BookDecision.load(true)");
    await capture('dashboard-night');
    await evaluate("document.getElementById('decisionLegacyCharts').open=true;atualizarDashboard()");await capture('dashboard-graficos');
    await evaluate("document.getElementById('decisionLegacyCharts').open=false");
    await evaluate("document.getElementById('themeToggle').click()");
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("document.querySelector('.layout-menu-toggle').click();if(!document.body.classList.contains('layout-nav-open')||document.querySelector('.layout-menu-toggle').getAttribute('aria-expanded')!=='true')throw Error('Menu móvel não abriu');document.querySelector('.layout-nav-close').click();if(document.body.classList.contains('layout-nav-open'))throw Error('Menu móvel não fechou')");
    await tap('.mobile-bottom [data-mobile-tab="more"]');
    await wait("document.body.classList.contains('layout-nav-open') && document.querySelector('main').inert");
    await capture('mais-mobile');
    await tap('.mobile-more-tools button');
    await wait("document.getElementById('aiDialog').open && !document.querySelector('main').inert");
    await evaluate("document.querySelector('#aiDialog .workspace-heading button').click()");
    await tap('.mobile-bottom [data-mobile-tab="os"]');
    await wait("!document.getElementById('visaoOS').hidden && document.querySelector('.mobile-bottom [data-mobile-tab=\"os\"]').getAttribute('aria-current')==='page'");
    await tap('.mobile-profile');await capture('minha-conta-mobile');await evaluate("document.querySelector('.mobile-account[open] button').click()");
    for(const tab of tabs){
      await evaluate(`mostrarAba(${JSON.stringify(tab)})`);
      await evaluate(`if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Rolagem horizontal na aba ${tab}');`);
      await capture('aba-'+tab+'-mobile');
    }
    await evaluate("mostrarAba('condominios')");await capture('condominios-mobile');
    await evaluate(`(() => {const search=document.querySelector('.busca-condominio');search.value='embare';search.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await wait("document.querySelectorAll('#visaoCondominios [data-hotel]:not([hidden])').length === 1");
    await evaluate("if(document.querySelector('#visaoCondominios [data-hotel]:not([hidden])').dataset.hotel!=='Embaré')throw Error('Busca por condomínio sem acento');BookCondominios.filtrarLista('visaoCondominios','impossivel');if(document.getElementById('visaoCondominiosVazio').hidden)throw Error('Aviso de busca vazia');document.querySelector('.busca-condominio').value='';BookCondominios.filtrarLista('visaoCondominios','');");
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("mostrarAba('dashboard')");
    await wait("document.getElementById('decisionStatus').textContent.includes('Totais de todos') && document.querySelector('#decisionContent .card p').textContent==='150'");
    await evaluate("if(document.getElementById('decisionLegacyCharts').open)throw Error('Gráficos antigos devem ficar complementares');document.getElementById('decisionHotel').value='Be Urban';document.getElementById('decisionHotel').dispatchEvent(new Event('change'))");
    await wait("document.getElementById('decisionContent').getAttribute('aria-busy')==='false'");
    await capture('sad-desktop');
    await wait("document.getElementById('activityContent').querySelectorAll('.card').length===7");
    await evaluate("document.getElementById('activityGroup').value='month';document.getElementById('activityUrgency').value='Urgente';document.querySelector('.activity-filters').requestSubmit()");
    await wait("document.getElementById('activityContent').getAttribute('aria-busy')==='false'");
    await capture('analise-periodo');
    await evaluate("for(const input of document.querySelectorAll('.activity-filters input,.activity-filters select')){const a=input.getBoundingClientRect(),b=input.closest('label').getBoundingClientRect();if(a.right>b.right+1||a.left<b.left-1)throw Error('Filtro ultrapassa seu espaço: '+input.id)}");
    await evaluate("[...document.querySelectorAll('#decisionContent button')].find(b=>b.textContent==='Ver serviços vencidos').click()");
    await wait("!document.getElementById('visaoOS').hidden && !document.getElementById('routine-services').hidden && document.getElementById('routine-services-period').value==='late' && document.getElementById('routine-services-hotel').value==='Be Urban'");
    await evaluate("BookRoutine.openServices({},'board');document.querySelector('#visaoOS > .botao-secundario').click()");
    // Add records after the initial list loaded: status must query the server, not cached rows.
    for(const [id,status] of [['903001','Finalizada'],['903002','Recusada']])records.set('ordensServico/'+id,{id,version:1,owner_id:master.id,data:{id,hotel:'Be Urban',apartamento:'214',titulo:'Filtro remoto '+status,status,prioridade:'Normal'}});
    for(const [status,phase] of [['Finalizada','Resolvido'],['Recusada','Recusa proprietário'],['Aberta','Novo'],['Em andamento','Em andamento'],['','']]){
      await evaluate(`document.getElementById('filtroStatusOS').value=${JSON.stringify(status)};document.getElementById('filtroStatusOS').dispatchEvent(new Event('change',{bubbles:true}))`);
      await wait(`!document.getElementById('routine-services').hidden && document.getElementById('routine-services-phase').value===${JSON.stringify(phase)} && !document.getElementById('routine-services-summary').textContent.startsWith('Carregando')`);
      if(['Finalizada','Recusada'].includes(status))await wait(`document.getElementById('routine-services-area').textContent.includes(${JSON.stringify('Filtro remoto '+status)})`);
      await evaluate("document.querySelector('#visaoOS > .botao-secundario').click()");
    }
    records.delete('ordensServico/903001');records.delete('ordensServico/903002');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("mostrarAba('dashboard');if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)throw Error('SAD excede largura do celular')");
    await capture('sad-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("BookWorkspace.openNotes()");
    await evaluate("document.getElementById('noteTitle').value='Primeira nota';document.getElementById('noteBody').value='Assunto separado';document.getElementById('notesForm').requestSubmit()");
    await wait("document.querySelector('#notesDialog .workspace-status').textContent==='Salvo.'");
    await wait("!document.getElementById('noteReminder').hidden");
    await evaluate("document.getElementById('reminderEnabled').checked=true;document.getElementById('reminderRepeat').value='daily';document.getElementById('reminderSave').click()");
    await wait("document.getElementById('reminderStatus').textContent==='Lembrete salvo.'");
    if(reminderRows.size!==1||[...reminderRows.values()][0].repeat!=='daily')throw Error('Lembrete diário não foi salvo');
    await evaluate("document.getElementById('noteNew').click();document.getElementById('noteTitle').value='Outra nota';document.getElementById('noteBody').value='Outro assunto';document.getElementById('notesForm').requestSubmit()");
    await wait("document.querySelectorAll('#notesList button').length===2");
    await evaluate(`(() => {
      const panel=document.getElementById('notesDialog'),bounds=panel.getBoundingClientRect();
      if(panel.matches(':modal'))throw Error('Painel lateral bloqueia o site');
      if(Math.abs(bounds.right-document.documentElement.clientWidth)>1||bounds.width>440)throw Error('Painel não está ancorado à direita');
      document.getElementById('abaCondominios').click();
      if(document.getElementById('visaoCondominios').hidden)throw Error('Site inacessível com painel aberto');
      document.getElementById('noteBody').value='Rascunho lateral';document.getElementById('noteBody').dispatchEvent(new Event('input',{bubbles:true}));
      panel.querySelector('[data-workspace-target="aiDialog"]').click();
      if(panel.open||!document.getElementById('aiDialog').open)throw Error('Troca de painel falhou');
      document.getElementById('aiKey').value='chave-temporaria';
      document.querySelector('#aiDialog [data-workspace-target="notesDialog"]').click();
      if(document.getElementById('aiKey').value)throw Error('Chave permaneceu ao trocar de painel');
    })()`);
    await wait("document.getElementById('noteBody').value==='Rascunho lateral' && document.querySelector('#notesDialog .workspace-status').textContent==='Alterações não salvas.'");
    await evaluate("document.getElementById('noteBody').value='Outro assunto';document.getElementById('notesForm').requestSubmit()");
    await wait("document.querySelector('#notesDialog .workspace-status').textContent==='Salvo.'");
    await capture('notas-desktop');
    await evaluate("document.getElementById('notesDialog').querySelector('.workspace-heading button').click();BookWorkspace.openNotes()");
    await wait("document.querySelectorAll('#notesList button').length===2");
    await evaluate("document.getElementById('notesDialog').querySelector('.workspace-heading button').click();BookWorkspace.openSupport()");
    await evaluate("document.getElementById('supportSubject').value='Problema no sistema';document.getElementById('supportBody').value='Preciso de ajuda';document.getElementById('supportForm').requestSubmit()");
    await wait("document.querySelectorAll('#supportThread .mensagem-chat').length===1 && document.getElementById('supportDialog').getAttribute('aria-busy')!=='true'");
    await evaluate("document.getElementById('supportBody').value='Resposta do mestre';document.getElementById('supportForm').requestSubmit()");
    await wait("document.querySelectorAll('#supportThread .mensagem-chat').length===2 && document.getElementById('supportDialog').getAttribute('aria-busy')!=='true'");
    await capture('suporte-desktop');
    await evaluate("mostrarAba('suporte')");
    await wait("document.getElementById('supportOpen').textContent==='1' && !!document.querySelector('#masterSupportList select') && document.getElementById('masterSupportList').getAttribute('aria-busy')!=='true'");
    await evaluate("const supportStatus=document.querySelector('#masterSupportList select');supportStatus.value='Fechado';supportStatus.dispatchEvent(new Event('change'))");
    await wait("document.getElementById('supportClosed').textContent==='1' && document.getElementById('supportOpen').textContent==='0'");
    await evaluate("const reopenedStatus=document.querySelector('#masterSupportList select');reopenedStatus.value='Aberto';reopenedStatus.dispatchEvent(new Event('change'))");
    await wait("document.getElementById('supportOpen').textContent==='1' && document.getElementById('supportClosed').textContent==='0'");
    await evaluate("document.getElementById('supportDialog').querySelector('.workspace-heading button').click();document.querySelector('.workspace-actions button').click();document.getElementById('aiKey').value='chave-de-teste-nao-real';document.getElementById('aiPrompt').value='Ajuda para organizar uma vistoria';document.getElementById('aiForm').requestSubmit()");
    await wait("document.getElementById('aiThread').textContent.includes('Resposta de IA simulada')");
    await capture('ia-desktop');
    await evaluate("document.getElementById('themeToggle').click()");
    const aiContrast=await contrastAudit();if(aiContrast.length)throw Error('Contraste no painel de IA: '+JSON.stringify(aiContrast));
    await capture('ia-night');
    await evaluate("document.getElementById('themeToggle').click()");
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("if(document.getElementById('aiDialog').scrollWidth>document.getElementById('aiDialog').clientWidth+1)throw Error('IA excedeu largura do celular')");
    await capture('ia-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("document.getElementById('aiDialog').querySelector('.workspace-heading button').click();if(document.getElementById('aiKey').value)throw Error('Chave de IA permaneceu na tela após fechar');");
    await capture('condominios-desktop');
    await evaluate("mostrarAba('feedbacks');document.getElementById('feedbackNew').click();document.getElementById('feedbackHotel').value='Be Urban';document.getElementById('feedbackHotel').dispatchEvent(new Event('change'));if(document.getElementById('feedbackApartment').options.length!==7)throw Error('Apartamentos do feedback');document.getElementById('feedbackApartment').value='214';document.getElementById('feedbackSubject').value='Feedback do hóspede';document.getElementById('feedbackGrade').value='Crítico';document.getElementById('feedbackNotes').value='Verificar manutenção';document.getElementById('feedbackCreateService').checked=true");
    await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const files=new DataTransfer();files.items.add(new File([blob],'feedback.png',{type:'image/png'}));document.getElementById('feedbackFiles').files=files.files;document.getElementById('feedbackFiles').dispatchEvent(new Event('change'));document.getElementById('feedbackForm').requestSubmit();})()`);
    await wait("!document.getElementById('feedbackDialog').open && document.getElementById('feedbackList').textContent.includes('Feedback do hóspede')");
    const feedbackRow=[...feedbackRows.values()][0];if(!feedbackRow?.service_id||!feedbackRow.data.anexos[0].dados.startsWith('/api/files/'))throw Error('Feedback não vinculou foto e card');
    await capture('feedbacks-desktop');
    await evaluate("mostrarAba('avaliacoes');document.getElementById('evaluationBody').value='Parabéns pela vistoria <img src=x onerror=alert(1)>';document.getElementById('evaluationForm').requestSubmit()");
    await wait("document.getElementById('evaluationThread').textContent.includes('Parabéns pela vistoria')");
    await evaluate("if(document.querySelector('#evaluationThread img'))throw Error('Comentário executou HTML')");
    await capture('avaliacoes-desktop');
    notificationState={chat:{count:2,latest:{id:'mock-chat-1',body:'Nova mensagem do cliente',ticket:'101'}},support:{count:1,latest:{id:'mock-support-1',body:'Novo chamado de suporte'}}};
    const reminder=[...reminderRows.values()][0];dueReminderQueue=[{id:reminder.note_id,due:reminder.due_at,title:'Lembrete de teste'}];
    await evaluate("BookNotifications.refresh()");
    await wait("document.getElementById('notificationsList').textContent.includes('Lembrete de teste')");
    await evaluate("if(document.querySelector('.workspace-actions [data-workspace-target=\"supportDialog\"] .workspace-badge').textContent!=='1')throw Error('Badge do suporte');if(document.getElementById('chatBadge').textContent!=='2')throw Error('Badge do chat');document.getElementById('notificationsToggle').click()");
    await capture('notificacoes-desktop');
    await evaluate("document.getElementById('notificationsClose').click()");notificationState={chat:{count:0},support:{count:0}};
    const routineCases=[
      ['danos',{item:'Taça',quantidade:'1',origem:'Vistoria'}],
      ['desempenho',{funcionario:master.id,inicio:'2026-10-01',fim:'2026-10-28'}]
    ];
    for(const [kind,fields]of routineCases){
      await evaluate(`(() => {mostrarAba(${JSON.stringify(kind==='desempenho'?'avaliacoes':kind)});${kind==='desempenho'?"document.querySelector('.routine-team-plans').open=true;":''}document.querySelector('#routine-${kind} .routine-actions .acao-principal').click();document.getElementById('processName').value=${JSON.stringify('Rotina '+kind)};document.getElementById('processHotel').value='Be Urban';document.getElementById('processHotel').dispatchEvent(new Event('change'));document.getElementById('processApartment').value='214';document.getElementById('processDue').value='2026-11-10';document.getElementById('processAssignee').value=${JSON.stringify(master.id)};for(const [key,value]of Object.entries(${JSON.stringify(fields)}))document.getElementById('process-field-'+key).value=value;document.getElementById('processForm').requestSubmit();})()`);
      await wait(`!document.getElementById('processDialog').open && document.getElementById('processDialog').getAttribute('aria-busy')==='false' && document.getElementById('routine-${kind}-area').textContent.includes('Rotina ${kind}')`);
    }
    if(processRows.size!==2)throw Error('Novos processos não foram persistidos');
    await evaluate("mostrarAba('os');BookRoutine.openServices({})");
    await wait("!document.getElementById('routine-services-summary').textContent.startsWith('Carregando') && document.getElementById('routine-services-area').textContent.includes('Feedback do hóspede')");
    await evaluate("document.querySelector('#routine-services-area .routine-card button').click()");
    const originalEditTitle=await evaluate("document.querySelector('#osDetalhes h2').textContent");
    for(const title of ['Card corrigido uma vez','Card corrigido duas vezes',originalEditTitle]){
      await evaluate("document.getElementById('botaoEditarOS').click()");
      await wait("document.getElementById('editarCardDialog').open");
      await evaluate(`document.querySelector('#editarCardDialog [name=titulo]').value=${JSON.stringify(title)};document.querySelector('#editarCardDialog form').requestSubmit()`);
      await wait(`!document.getElementById('editarCardDialog').open && document.querySelector('#osDetalhes h2').textContent===${JSON.stringify(title)}`);
    }
    await evaluate("BookLabels.open(document.getElementById('fechamentoIdOS').value)");
    await wait("document.getElementById('labelsDialog').getAttribute('aria-busy')==='false'");
    await evaluate("document.getElementById('labelName').value='Retorno proprietario';document.getElementById('labelColor').value='purple';document.getElementById('labelCreate').requestSubmit()");
    await wait("document.querySelector('#labelsChoices input') && document.getElementById('labelsDialog').getAttribute('aria-busy')==='false'");
    await evaluate("document.querySelector('#labelsChoices input').click();document.getElementById('labelsActions').lastElementChild.click()");
    await wait("!document.getElementById('labelsDialog').open && document.querySelector('#osDetalhes .label-chip')?.textContent==='Retorno proprietario'");
    await evaluate("document.getElementById('osDetalhesModal').style.display='none';const select=document.getElementById('routine-services-label');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}))");
    await wait("document.querySelectorAll('#routine-services-area .routine-card').length===1 && document.querySelector('#routine-services-area .label-chip')?.textContent==='Retorno proprietario'");
    await evaluate("(() => {const select=document.getElementById('routine-services-urgency');select.value='invalid';select.value='unknown';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await wait("document.getElementById('routine-services-summary').textContent==='Nenhum registro encontrado.'");
    await evaluate("(() => {const select=document.getElementById('routine-services-urgency');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await wait("document.querySelectorAll('#routine-services-area .routine-card').length===1");
    await evaluate("(() => {const select=document.getElementById('routine-services-label');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await evaluate("BookRoutine.openServices({},'board');document.querySelector('#visaoOS .titulo-secao').nextElementSibling.click()");
    const damage=[...processRows.values()].find(r=>r.kind==='danos');
    await evaluate(`BookRoutine.openFlow('process',${JSON.stringify(damage.id)})`);
    await wait("document.getElementById('flowDialog').open");
    await wait("document.querySelector('#flowCommentBody + .dictation-button')");
    await evaluate("document.querySelector('#flowCommentBody + .dictation-button').click()");
    await wait("window.__testDictation?.lang==='pt-BR'");
    if(!dialogs.at(-1)?.startsWith('Para ditar, permita o microfone.'))throw Error('Aviso de privacidade do ditado ausente');dialogs.pop();
    await evaluate("window.__testDictation.onresult({resultIndex:0,results:[Object.assign([{transcript:'Comentario por voz'}],{isFinal:true})]})");
    await wait("document.getElementById('flowCommentBody').value==='Comentario por voz' && document.getElementById('flowDialog').open");
    await evaluate("document.querySelector('#flowCommentBody + .dictation-button').click()");
    await evaluate("document.getElementById('flowCommentBody').value='Comentário da rotina <img src=x>';document.getElementById('flowComment').requestSubmit()");
    await wait("document.getElementById('flowHistory').textContent.includes('Comentário da rotina')");
    await evaluate("if(document.querySelector('#flowHistory img'))throw Error('Comentário de rotina executou HTML');document.getElementById('flowClose').click();mostrarAba('os');document.querySelector('#visaoOS > .botao-secundario').click()");
    await wait("!document.getElementById('routine-services').hidden && document.getElementById('routine-services-area').textContent.includes('Feedback do hóspede')");
    await evaluate("const columns=[...document.querySelectorAll('#routine-services-area .routine-column > h3')].map(h=>h.textContent.split(' · ')[0]);if(JSON.stringify(columns)!==JSON.stringify(['Novo','Andamento','Recusado','Finalizado']))throw Error('Colunas incorretas: '+columns)");
    await capture('servicos-quadro-desktop');
    const linkedService=feedbackRow.service_id;
    await evaluate("[...document.querySelectorAll('#routine-services-area .routine-card')].find(c=>c.textContent.includes('Feedback do hóspede')).querySelector('button').click()");
    await wait("document.getElementById('osDetalhesModal').style.display==='block' && document.getElementById('osDetalhes').textContent.includes('Feedback do hóspede')");
    await capture('detalhes-card');
    await evaluate("if(document.getElementById('flowDialog').open||document.getElementById('processDialog').open)throw Error('Agenda abriu formulário diferente');if(JSON.stringify([...document.getElementById('osDetalheStatus').options].map(o=>o.text))!==JSON.stringify(['Novo','Andamento','Recusado','Finalizado']))throw Error('Status diferentes no card normal');document.getElementById('botaoFinalizarOS').click();if(document.getElementById('fechamentoModal').style.display!=='block')throw Error('Agenda sem fechamento normal');document.getElementById('fechamentoModal').style.display='none'");
    await evaluate(`(async()=>{abrirOS(${JSON.stringify(linkedService)});const old=window.prompt;window.prompt=()=> 'Serviço recusado pelo responsável';try{await alterarStatusOS(${JSON.stringify(linkedService)},'Recusada');}finally{window.prompt=old;}document.getElementById('osDetalhesModal').style.display='none';})()`);
    await wait("[...document.querySelectorAll('#routine-services-area .routine-column')].some(c=>c.querySelector('h3').textContent.startsWith('Recusado')&&c.textContent.includes('Feedback do hóspede'))");
    await evaluate(`(async()=>{await alterarStatusOS(${JSON.stringify(linkedService)},'Em andamento');document.querySelector('#visaoOS .titulo-secao .acao-principal').click();if(document.getElementById('osModal').style.display!=='block'||document.querySelectorAll('#formOS').length!==1)throw Error('Criar pela agenda não reutilizou o formulário');document.getElementById('osModal').style.display='none';})()`);
    await wait("[...document.querySelectorAll('#routine-services-area .routine-column')].some(c=>c.querySelector('h3').textContent.startsWith('Andamento')&&c.textContent.includes('Feedback do hóspede'))");
    const catalogCheck=await evaluate(`(() => {
      mostrarAba('os');abrirFormularioOS();
      const hotel=document.getElementById('osHotel'),ap=document.getElementById('osApartamento');
      if(!ap.disabled)throw Error('Apartamento deve aguardar condomínio');
      for(const name of BookCatalog.hotels){
        hotel.value=name;hotel.dispatchEvent(new Event('change'));
        const actual=[...ap.options].filter(o=>o.value).map(o=>o.value);
        if(JSON.stringify(actual)!==JSON.stringify(BookCatalog.apartments[name]))throw Error('Apartamentos: '+name);
        ap.value=actual[0];
      }
      hotel.value='';hotel.dispatchEvent(new Event('change'));if(ap.value||!ap.disabled)throw Error('Seleção antiga mantida');
      abrirFormularioOS(101);if(hotel.value!=='Be Urban'||ap.value!=='214')throw Error('Card pelo chamado');
      abrirFormularioOS('','Lume Alto da Boa Vista','194A');if(ap.value!=='194A')throw Error('Card pela vistoria');
      document.getElementById('osModal').style.display='none';
      mostrarAba('condominios');
      for(const name of BookCatalog.hotels){BookCondominios.mostrarHistorico(name);if(document.querySelectorAll('#historico .apartamento-opcao').length!==BookCatalog.apartments[name].length)throw Error('Histórico: '+name);}
      return {condominiums:BookCatalog.hotels.length,apartments:Object.values(BookCatalog.apartments).flat().length};
    })()`);
    await evaluate("mostrarAba('onboarding');document.getElementById('onboardingName').value='Condomínio Teste Novo';document.getElementById('onboardingApartments').value='101, 194a';document.getElementById('onboardingCatalog').requestSubmit()");
    await wait("document.getElementById('onboardingStatus').textContent.includes('salvo em Condomínios') && BookStore.apartments('Condomínio Teste Novo').length===2");
    await evaluate("document.getElementById('onboardingKind').value='apartments';document.getElementById('onboardingKind').dispatchEvent(new Event('change'));document.getElementById('onboardingExisting').value='Condomínio Teste Novo';document.getElementById('onboardingApartments').value='102';document.getElementById('onboardingCatalog').requestSubmit()");
    await wait("BookStore.apartments('Condomínio Teste Novo').length===3 && document.getElementById('onboardingCatalog').getAttribute('aria-busy')==='false'");
    await evaluate("mostrarAba('condominios');BookCondominios.mostrarHistorico('Condomínio Teste Novo');if(document.querySelectorAll('#historico .apartamento-opcao').length!==3)throw Error('Onboarding não atualizou Condomínios');if(!document.getElementById('usuarioCondomínio Teste Novo'))throw Error('Cadastro ausente nas permissões');selecionarHotelVistoria('Condomínio Teste Novo');if(document.querySelectorAll('#areaVistorias .apartamentos-vistoria button').length!==3)throw Error('Vistorias sem novo catálogo');abrirFormularioOS('','Condomínio Teste Novo','194A');if(document.getElementById('osApartamento').value!=='194A')throw Error('Card sem apartamento novo');document.getElementById('osModal').style.display='none'");

    await evaluate("BookCondominios.mostrarHistorico('Condomínio Teste Novo');BookCondominios.selecionarApartamento('101');[...document.querySelectorAll('#opcoesApartamento button')].find(b=>b.textContent==='Informações').click()");
    await wait("document.querySelector('#apartmentInfoDialog form')");
    await evaluate("(() => {const form=document.querySelector('#apartmentInfoDialog form');if(!form.elements.lockPassword.readOnly||form.elements.lockPassword.type!=='password')throw Error('Senha exposta');[...form.querySelectorAll('button')].find(b=>b.textContent==='Editar informações').click();form.elements.lockPassword.value='000123';form.elements.wifiName.value='Rede simulada';form.requestSubmit();})()");
    await wait("document.getElementById('apartmentInfoDialog').textContent.includes('Informações salvas.')");
    await capture('apartamento-informacoes');
    await evaluate("document.getElementById('apartmentInfoDialog').close()");
    await wait("!document.querySelector('#apartmentInfoDialog input')");
    await evaluate("BookProperty.openInfo('Condomínio Teste Novo','101')");
    await wait("document.querySelector('#apartmentInfoDialog [name=lockPassword]')?.value==='000123'");
    await evaluate("document.getElementById('apartmentInfoDialog').close();mostrarAba('vistorias');BookProperty.openOverview()");
    await wait("document.querySelector('#inspectionOverviewTable tbody tr')");
    await evaluate("document.getElementById('inspectionOverviewHotel').value='Condomínio Teste Novo';document.getElementById('inspectionOverviewHotel').dispatchEvent(new Event('change'))");
    await wait("document.querySelectorAll('#inspectionOverviewTable tbody tr').length===3");
    await capture('vistorias-visao-geral');
    await evaluate("document.getElementById('inspectionOverviewDialog').close();selecionarHotelVistoria('Condomínio Teste Novo')");
    await wait("document.querySelectorAll('#areaVistorias .inspection-unit-late').length===3");
    await evaluate("if(document.querySelector('#visaoVistorias .inspection-badge'))throw Error('Contador de vistoria deve estar removido')");
    await evaluate("mostrarAba('onboarding');document.getElementById('removePropertyHotel').value='Condomínio Teste Novo';document.getElementById('removePropertyHotel').dispatchEvent(new Event('change'));document.getElementById('removePropertyUnit').value='102';document.getElementById('removePropertyForm').requestSubmit()");
    await wait("BookStore.apartments('Condomínio Teste Novo').length===2 && !document.querySelector('#removePropertyForm [type=submit]').disabled");
    if(!dialogs.at(-1)?.startsWith('Remover '))throw Error('Confirmacao de remocao ausente');dialogs.pop();
    await evaluate("document.getElementById('removePropertyKind').value='condominium';document.getElementById('removePropertyKind').dispatchEvent(new Event('change'));document.getElementById('removePropertyForm').requestSubmit()");
    await wait("!BookCatalog.hotels.includes('Condomínio Teste Novo')");
    if(!dialogs.at(-1)?.startsWith('Remover '))throw Error('Confirmacao de remocao ausente');dialogs.pop();
    await evaluate(`(async()=>{
      mostrarAba('os');abrirFormularioOS('','Be Urban','214');
      document.getElementById('osTitulo').value='Card de teste';document.getElementById('osDescricao').value='Teste de fluxo';
      document.getElementById('osResponsavel').value='master@example.com';
      document.getElementById('osPrioridade').value='Urgente';
      await salvarOS({preventDefault(){}});
      const order=JSON.parse(BookStore.getItem('ordensServico'))[0];if(!order||order.apartamento!=='214')throw Error('Salvar card');
      window.testOrderId=order.id;
      await alterarStatusOS(order.id,'Em andamento');abrirOS(order.id);
      const schedule=document.querySelector('#cardActivity details form');if(!schedule)throw Error('Remarcação ausente');schedule.querySelector('input').value='2099-01-01';schedule.querySelector('textarea').value='Aguardando disponibilidade do apartamento';const originalRefresh=BookStore.refresh;BookStore.refresh=async()=>{};try{await schedule.onsubmit({preventDefault(){}});}finally{BookStore.refresh=originalRefresh;}
      const updated=JSON.parse(BookStore.getItem('ordensServico')).find(r=>r.id===order.id);if(updated.vencimento!=='2099-01-01'||!document.querySelector('#osDetalhes .deadline-future'))throw Error('Prazo do card não foi atualizado');
      const activity=await BookAPI.request('/api/processes/flow?source=ordensServico&id='+order.id);if(!activity.events.some(e=>e.body==='Aguardando disponibilidade do apartamento'))throw Error('Comentário da remarcação não foi preservado');
      abrirFechamentoOS(order.id);
      document.getElementById('fechamentoTerceiro').value='Não';document.getElementById('fechamentoTipoMaterial').value='Nenhum';atualizarCamposMaterial();
      document.getElementById('fechamentoValorServico').value='12.34';document.getElementById('fechamentoResponsavelPagamento').value='Book Santos';
      document.getElementById('fechamentoExecutadoPor').value='master@example.com';atualizarCustoTotal();
      document.getElementById('fechamentoData').value='2026-11-02';
      await salvarRascunhoFechamentoOS();
      let savedOrder=JSON.parse(BookStore.getItem('ordensServico')).find(r=>r.id===order.id);if(savedOrder.vencimento!=='2026-11-02'||savedOrder.fechamento.data!=='2026-11-02'||!document.getElementById('osDetalhes').textContent.includes('02/11/2026'))throw Error('Salvar informações não sincronizou fechamento e vencimento');
      abrirFechamentoOS(order.id);document.getElementById('fechamentoData').value='2026-11-03';await salvarFechamentoOS({preventDefault(){}});
      savedOrder=JSON.parse(BookStore.getItem('ordensServico')).find(r=>r.id===order.id);if(savedOrder.vencimento!=='2026-11-03'||savedOrder.fechamento.data!=='2026-11-03'||!document.querySelector('#osDetalhes .deadline-done'))throw Error('Finalizar não sincronizou fechamento e vencimento');
      const saved=JSON.parse(BookStore.getItem('ordensServico'))[0];if(saved.status!=='Finalizada'||saved.fechamento.custoTotal!==12.34)throw Error('Finalizar card');
      const originalPrompt=window.prompt;window.prompt=()=> 'Corrigir os dados de teste';
      try{await alterarStatusOS(order.id,'Em andamento');}finally{window.prompt=originalPrompt;}
      const reopened=JSON.parse(BookStore.getItem('ordensServico'))[0];if(reopened.status!=='Em andamento'||reopened.fechamento.custoTotal!==12.34)throw Error('Reabrir card preservando fechamento');
      abrirOS(order.id);abrirFechamentoOS(order.id);await salvarFechamentoOS({preventDefault(){}});
      document.getElementById('osDetalhesModal').style.display='none';
      mostrarAba('vistorias');selecionarHotelVistoria('Lume Alto da Boa Vista');selecionarApartamentoVistoria('194A');await abrirFormularioVistoria();
      const inspectors=document.getElementById('vistoriaResponsavel');
      if(inspectors.tagName!=='SELECT'||!inspectors.querySelector('option[value="master@example.com"]')||[...inspectors.options].some(option=>option.value==='cliente@example.com'))throw Error('Lista de administradores da vistoria');
      inspectors.value='master@example.com';document.getElementById('vistoriaTipo').value='Completa';renderizarChecklistVistoria();
      if(!document.querySelector('select[data-grupo="Banheiro"][data-item="Secador de cabelo"]')||!document.querySelector('select[data-grupo="Sacada"][data-item="Rede de proteção"]'))throw Error('Checklist completo de banheiro e sacada');
      document.getElementById('vistoriaTipo').value='Simplificada';renderizarChecklistVistoria();
      if(!document.querySelector('select[data-grupo="Banheiro"][data-item="Secador de cabelo"]')||!document.querySelector('select[data-grupo="Sacada"]'))throw Error('Checklist simplificado de banheiro e sacada');
      const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const selection=new DataTransfer();selection.items.add(new File([photo],'remover.png',{type:'image/png'}));selection.items.add(new File([photo],'vistoria.png',{type:'image/png'}));document.getElementById('vistoriaFotos').files=selection.files;
      document.getElementById('vistoriaFotos').dispatchEvent(new Event('change'));
      const fileList=document.getElementById('vistoriaFotos').closest('label').nextElementSibling;
      if(fileList.querySelectorAll('.attachment-row').length!==2)throw Error('Lista de arquivos selecionados');
      fileList.querySelector('.attachment-remove').click();
      if(document.getElementById('vistoriaFotos').files.length!==1||document.getElementById('vistoriaFotos').files[0].name!=='vistoria.png'||fileList.querySelectorAll('.attachment-row').length!==1)throw Error('Remover arquivo antes do envio');
      document.querySelectorAll('#gruposVistoria select').forEach(s=>s.value='Em ordem');
      const originalRequest=BookAPI.request;let release;
      BookAPI.request=async (...args)=>{if(args[0]==='/api/data'&&args[1]?.method==='POST')await new Promise(resolve=>{release=resolve;});return originalRequest(...args);};
      const saving=salvarVistoria({preventDefault(){}});
      try {
        for(let i=0;i<200&&!release;i++)await new Promise(resolve=>setTimeout(resolve,10));
        if(!release||fileList.dataset.sending!=='true'||fileList.querySelector('progress').hidden||!fileList.querySelector('button').disabled)throw Error('Indicador de envio de anexos');
      } finally { if(release)release(); BookAPI.request=originalRequest; }
      await saving;
      const inspection=JSON.parse(BookStore.getItem('vistorias'))[0];if(inspection.fotos.length!==1||inspection.fotos[0].nome!=='vistoria.png'||inspection.checklist.Banheiro?.['Secador de cabelo']!=='Em ordem'||!inspection.checklist.Sacada||inspection.responsavel!=='Mestre'||inspection.responsavelLogin!=='master@example.com'||inspection.apartamento!=='194A'||!inspection.fotos[0].dados.startsWith('/api/files/'))throw Error('Salvar vistoria com foto, ambientes e administrador');
      mostrarAba('estoque');await adicionarLinhaEstoque();if(JSON.parse(BookStore.getItem('estoqueBookSantos')).itens.length!==1)throw Error('Adicionar estoque');
      mostrarAba('dashboard');atualizarDashboard();
    })()`);

    await evaluate("mostrarAba('vistorias');selecionarHotelVistoria('Lume Alto da Boa Vista');selecionarApartamentoVistoria('194A');BookProperty.refreshInspections()");
    await wait("document.querySelector('#detalheApartamentoVistoria .inspection-last-date')?.textContent.includes(BookPeriods.today().split('-').reverse().join('/'))");
    await wait("document.querySelector('#detalheApartamentoVistoria .inspection-next-date')?.textContent.includes(BookProcesses.nextInspection(BookPeriods.today()).split('-').reverse().join('/'))");
    await evaluate("mostrarAba('condominios');BookCondominios.mostrarHistorico('Lume Alto da Boa Vista');BookCondominios.selecionarApartamento('194A')");
    await wait("document.querySelector('#condominiumInspectionDates .inspection-next-date')?.textContent.startsWith('Próxima vistoria: ')");
    await capture('apartamento-ultima-proxima');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('apartamento-ultima-proxima-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("mostrarAba('estoque');const minimum=document.querySelector('#tabelaEstoque input[aria-label^=\"Estoque mínimo\"]');minimum.value='3';minimum.dispatchEvent(new Event('change'))");
    await wait("JSON.parse(BookStore.getItem('estoqueBookSantos')).itens[0].minimo===3 && !BookStore.pending");
    await evaluate("BookFinance.load()");
    await evaluate("mostrarAba('os')");await capture('cards-finalizados');
    await evaluate("abrirOS(window.testOrderId)");
    await wait("!!document.querySelector('#cardActivity form textarea')");
    await evaluate("document.querySelector('#cardActivity form textarea').value='Comentário no card <img src=x>';document.querySelector('#cardActivity form').requestSubmit()");
    await wait("document.getElementById('cardActivity').textContent.includes('Comentário no card <img src=x>') && !document.querySelector('#cardActivity button[type=submit]').disabled");
    await evaluate("if(document.querySelector('#cardActivity img'))throw Error('Comentário executou HTML');document.querySelector('#cardActivity form textarea').value='Segunda informação preservada';document.querySelector('#cardActivity form').requestSubmit()");
    await wait("document.getElementById('cardActivity').textContent.includes('Segunda informação preservada') && document.getElementById('cardActivity').textContent.includes('Comentário no card <img src=x>')");
    await capture('card-comentarios');
    await evaluate("document.getElementById('osDetalhesModal').style.display='none';abrirFechamentoOS(window.testOrderId)");await capture('formulario-fechamento');
    await evaluate("document.getElementById('fechamentoModal').style.display='none';mostrarAba('vistorias');selecionarHotelVistoria('Lume Alto da Boa Vista');selecionarApartamentoVistoria('194A');document.querySelectorAll('.vistoria-registro').forEach(node=>node.open=true)");await capture('vistorias-resumo');
    await evaluate("abrirFormularioVistoria()");await capture('formulario-vistoria');
    await evaluate("fecharVistoriaModal();mostrarAba('usuarios')");await evaluate("BookUsers.open()");await capture('formulario-usuario');
    await evaluate("BookUsers.close()");
    const inspected=[...records.entries()].find(([k])=>k.startsWith('vistorias/'))[1];
    await evaluate("mostrarAba('dashboard');BookActivity.load(true)");
    await wait("document.getElementById('activityContent').getAttribute('aria-busy')==='false' && document.querySelectorAll('#activityContent .card').length===7");
    await evaluate("document.querySelector('#activityContent .card button').click()");
    await wait("document.getElementById('activityRecordsDialog').open && !!document.querySelector('#activityDetails table button')");
    await capture('registros-visao-geral');
    await evaluate(`(() => {const b=[...document.querySelectorAll('#activityDetails table button')].find(b=>b.textContent==='Card de teste');if(!b)throw Error('Card ausente no indicador');b.click();})()`);
    await wait("!document.getElementById('activityRecordsDialog').open && document.getElementById('osDetalhesModal').style.display==='block' && document.getElementById('osDetalhes').textContent.includes('Card de teste')");
    await evaluate("document.getElementById('osDetalhesModal').style.display='none';[...document.querySelectorAll('#activityContent .card')].find(c=>c.textContent.includes('Vistorias feitas')).querySelector('button').click()");
    await wait("document.getElementById('activityRecordsDialog').open && !!document.querySelector('#activityDetails table button')");
    await evaluate("document.querySelector('#activityDetails table button').click()");
    await wait(`!document.getElementById('activityRecordsDialog').open && !document.getElementById('visaoVistorias').hidden && [...document.querySelectorAll('.vistoria-registro')].some(n=>n.open && n.dataset.vistoriaId===${JSON.stringify(inspected.id)})`);
    await evaluate("mostrarAba('dashboard');[...document.querySelectorAll('#activityContent .card')].find(c=>c.textContent.includes('Cards fechados')).querySelector('button').click()");
    await wait("document.getElementById('activityRecordsDialog').open && document.getElementById('activityDetails').textContent.includes('Nenhum registro neste filtro')");
    await evaluate("document.querySelector('#activityRecordsDialog button').click();mostrarAba('usuarios')");
    await evaluate(`BookRoutine.openFlow('vistorias',${JSON.stringify(inspected.id)})`);
    await wait("document.getElementById('flowDialog').open");
    await evaluate("document.getElementById('flowService').click()");
    await wait("document.getElementById('flowStatus').textContent.includes('vinculado') && document.getElementById('flowDialog').getAttribute('aria-busy')==='false'");
    if(dialogs.pop()!=='Criar ou consultar o serviço vinculado a esta vistoria?')throw Error('Confirmação do serviço da vistoria não exibida');
    if(!inspected.service_id)throw Error('Vistoria não vinculou serviço');
    await evaluate("document.getElementById('flowClose').click()");
    await evaluate("if(document.querySelectorAll('.financeiro-card').length!==2)throw Error('finance records');if(!document.getElementById('financeiroLista').textContent.includes('0,30'))throw Error('money display');document.getElementById('fechamentoValorServico').value='0.10';document.getElementById('fechamentoValorMaterial').value='0.20';atualizarCustoTotal();if(document.getElementById('fechamentoCustoTotal').value!=='0.30')throw Error('money sum');");
    await evaluate("[...document.querySelectorAll('#financeiroAbas button')].find(button=>button.textContent.startsWith('Book Santos')).click()");
    await wait("document.querySelectorAll('.financeiro-card').length === 1 && document.getElementById('financeiroLista').textContent.includes('Conserto')");
    await evaluate("document.getElementById('financeiroPeriodo').value='dia';document.getElementById('financeiroData').value='2026-10-22';BookFinance.changePeriod()");
    await evaluate("if(document.querySelectorAll('.financeiro-card').length!==1)throw Error('daily records');if(document.getElementById('financeiroIntervalo').textContent!=='22/10/2026')throw Error('daily label');document.getElementById('financeiroPeriodo').value='semana';BookFinance.changePeriod()");
    await evaluate("if(document.getElementById('financeiroIntervalo').textContent!=='19/10/2026 a 25/10/2026')throw Error('week label');document.getElementById('financeiroPeriodo').value='mes';BookFinance.changePeriod()");
    await evaluate("if(document.getElementById('financeiroIntervalo').textContent!=='01/10/2026 a 31/10/2026')throw Error('month label');BookFinance.move(-1)");
    await evaluate("if(document.querySelectorAll('.financeiro-card').length!==0)throw Error('previous month records');if(document.getElementById('financeiroIntervalo').textContent!=='01/09/2026 a 30/09/2026')throw Error('previous month label');document.getElementById('financeiroPeriodo').value='ano';BookFinance.changePeriod()");
    await evaluate("if(document.querySelectorAll('.financeiro-card').length!==1)throw Error('year records');if(document.getElementById('financeiroIntervalo').textContent!=='01/01/2026 a 31/12/2026')throw Error('year label');");
    await evaluate("document.getElementById('fechamentoValorMaterial').value='12.34';renderizarMateriaisOS([]);if(document.getElementById('fechamentoValorMaterial').value!=='12.34')throw Error('manual material erased');document.getElementById('materiaisOS').dataset.hadMaterials='true';atualizarMateriaisOS();if(document.getElementById('fechamentoValorMaterial').value!=='0.00')throw Error('material reset');");
    await evaluate("mostrarAba('condominios');BookCondominios.mostrarHistorico('Unlimited');BookCondominios.selecionarApartamento('1111');BookCondominios.mostrarDadosApartamento('chamados');document.getElementById('abaEstoque').click();if(document.getElementById('visaoEstoque').hidden)throw Error('navigation');");
    await evaluate("BookUsers.load()");
    await evaluate("BookUsers.open();document.getElementById('usuarioNome').value='Pessoa teste';document.getElementById('usuarioEmail').value='pessoa@example.com';document.getElementById('usuarioSenha').value='senha-inicial-longa';document.getElementById('usuarioUnlimited').checked=true;BookUsers.save({preventDefault(){}})");
    if(users.length!==2||writes!==1)throw new Error('Cadastro não confirmado pelo servidor.');
    await evaluate("BookUsers.open('55555555-5555-4555-8555-555555555555');document.getElementById('usuarioFuncao').value='adm';document.getElementById('usuarioFuncao').dispatchEvent(new Event('change'));if(document.getElementById('usuarioAbas').hidden)throw Error('Abas não apareceram para adm');document.querySelectorAll('#usuarioAbas input').forEach(input=>input.checked=input.value==='vistorias');document.getElementById('usuarioUnlimited').checked=false;document.getElementById('usuarioUnique Residence').checked=true;BookUsers.save({preventDefault(){}})");
    if(writes!==2||users[1].funcao!=='adm'||users[1].book_hotel_access[0].hotel!=='Unique Residence')throw new Error('Edição de permissões falhou.');
    await evaluate(`(() => {
      function folder(name){const files=new Map(),folders=new Map();return {name,files,folders,async getDirectoryHandle(name,opts={}){if(!folders.has(name)){if(!opts.create)throw Error('Pasta ausente');folders.set(name,folder(name));}return folders.get(name);},async getFileHandle(name,opts={}){if(!opts.create&&!files.has(name))throw Error('Arquivo ausente');return {async createWritable(){return {async write(bytes){files.set(name,bytes);},async close(){},async abort(){}};},async getFile(){return new File([files.get(name)],name);}};}};}
      window.testHD=folder('HD-EXTERNO');window.showDirectoryPicker=async()=>window.testHD;
      document.getElementById('abaBackup').click();document.getElementById('backupIniciar').click();
    })()`);
    await wait("document.getElementById('backupStatus').textContent.startsWith('Backup concluído e conferido')");
    await evaluate(`(() => {const saved=[...window.testHD.folders.values()][0];if(!saved.files.has('dados.json')||!saved.folders.has('anexos'))throw Error('Cópia incompleta');window.showDirectoryPicker=async()=>saved;document.getElementById('backupVerificar').click();})()`);
    await wait("document.getElementById('backupStatus').textContent.startsWith('Backup íntegro')");
    await evaluate("document.querySelector('.workspace-actions button').click();document.getElementById('aiKey').value='chave-nao-real-para-teste';document.getElementById('aiPrompt').value='Abra um card de teste pela IA no Be Urban 214';document.getElementById('aiForm').requestSubmit()");
    await wait("document.querySelectorAll('#aiActions .ai-action-confirm').length===1 && document.getElementById('aiDialog').getAttribute('aria-busy')==='false'");
    if([...records.values()].some(row=>row.data.titulo==='Card criado pela IA'))throw Error('IA gravou antes da confirmação');
    await capture('ia-acao-desktop');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("if(document.getElementById('aiDialog').scrollWidth>document.getElementById('aiDialog').clientWidth+1)throw Error('Revisão da ação excedeu a largura do celular')");
    await capture('ia-acao-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("document.querySelector('#aiActions .ai-action-confirm').click()");
    await wait("document.getElementById('aiActions').textContent.includes('execução confirmada') && document.getElementById('aiDialog').getAttribute('aria-busy')==='false'");
    if([...records.values()].filter(row=>row.data.titulo==='Card criado pela IA').length!==1)throw Error('Confirmação não criou exatamente um card');
    await evaluate("document.getElementById('aiDialog').querySelector('.workspace-heading button').click()");
    const partialHistory={id:'8000000000099999',version:1,owner_id:master.id,hotel:null,data:{id:'8000000000099999',hotel:'Condomínio a conferir',apartamento:'A conferir',titulo:'Histórico parcial de teste',descricao:'Dados da origem preservados',status:'Em andamento',anexos:[],importacao:{parcial:true,faseOriginal:'Pendente Fornecedor',criadorOriginal:'Equipe da origem',criadoEmLocal:'2024-01-02T10:00:00'}}};
    records.set('ordensServico/'+partialHistory.id,partialHistory);
    await evaluate(`BookStore.includeRecord('ordensServico',${JSON.stringify(partialHistory)});mostrarAba('os');abrirOS('${partialHistory.id}')`);
    await wait("document.getElementById('cardActivity').textContent.includes('Histórico parcial')");
    await evaluate("if(!document.getElementById('osDetalheStatus').disabled||!document.getElementById('botaoFinalizarOS').hidden||!document.getElementById('botaoReabrirOS').hidden||document.querySelector('#cardActivity details form')||!document.getElementById('osDetalhes').textContent.includes('Não informada'))throw Error('Histórico parcial tratado como card operacional')");
    await capture('historico-parcial');
    partialHistory.data.hotel='Unique Residence';partialHistory.hotel='Unique Residence';partialHistory.data.apartamento='1001';partialHistory.data.importacao.condominioPeloTitulo='Unique Residence';partialHistory.version++;
    await evaluate(`BookStore.includeRecord('ordensServico',${JSON.stringify(partialHistory)});abrirOS('${partialHistory.id}')`);
    await wait("document.getElementById('cardActivity').textContent.includes('imóvel identificado pelo título') && document.getElementById('osDetalhes').textContent.includes('Unique Residence')");
    await capture('historico-unique');
    await evaluate("document.getElementById('osDetalhesModal').style.display='none'");records.delete('ordensServico/'+partialHistory.id);
    await evaluate("BookAPI.request('/api/logout',{method:'POST',body:'{}'})");
    await send('Page.navigate',{url:base+'/login.html'});
    await wait("typeof entrar === 'function'");
    await evaluate("document.getElementById('login').value='cliente@example.com';document.getElementById('senha').value='senha';document.querySelector('form').requestSubmit()");
    await wait("location.pathname === '/cliente/cliente.html' && typeof abrirChamado === 'function'");
    await capture('cliente-desktop');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Rolagem horizontal no cliente');");
    await capture('cliente-mobile');
    await tap('.client-quick-actions button');await wait("document.body.dataset.clientView==='form'");await capture('cliente-formulario-mobile');
    await tap('.mobile-bottom [data-mobile-tab="tickets"]');await wait("document.body.dataset.clientView==='tickets'");await capture('cliente-chamados-mobile');
    await tap('.mobile-bottom [data-mobile-tab="chat"]');await wait("!document.getElementById('chatCliente').hidden");await capture('cliente-chat-mobile');
    await evaluate("alternarChatCliente()");await tap('.mobile-bottom [data-mobile-tab="home"]');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const ticketId=await evaluate(`(async()=>{
      const hotels=[...document.getElementById('hotel').options].filter(o=>o.value).map(o=>o.value);
      if(hotels.join('|')!=='Be Urban|Lume Alto da Boa Vista')throw Error('Permissões do cliente');
      const hotel=document.getElementById('hotel');hotel.value='Be Urban';hotel.dispatchEvent(new Event('change'));
      if(document.getElementById('apartamento').options.length!==7)throw Error('Apartamentos do cliente');
      document.getElementById('apartamento').value='214';document.getElementById('assunto').value='Chamado pelo cliente';document.getElementById('descricao').value='Teste completo de chamado com foto';
      document.getElementById('categoria').selectedIndex=1;
      const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const selection=new DataTransfer();selection.items.add(new File([photo],'chamado.png',{type:'image/png'}));document.getElementById('arquivo').files=selection.files;mostrarArquivo();
      await abrirChamado({preventDefault(){}});
      const ticket=JSON.parse(BookStore.getItem('chamados')).find(c=>c.assunto==='Chamado pelo cliente');if(!ticket||!ticket.anexoData.startsWith('/api/files/'))throw Error('Chamado do cliente não salvo');
      alternarChatCliente();document.getElementById('chamadoChat').value=String(ticket.id);selecionarConversaCliente();document.getElementById('textoCliente').value='Mensagem do cliente';
      await enviarMensagemCliente({preventDefault(){}});
      if(!document.getElementById('mensagensCliente').textContent.includes('Mensagem do cliente'))throw Error('Enviar chat cliente');
      if((await fetch('/api/finance')).status!==403)throw Error('Financeiro acessível pelo cliente');
      if((await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selected:['chamados']})})).status!==403)throw Error('Backup acessível pelo cliente');
      return ticket.id;
    })()`);
    await capture('chat-cliente-com-mensagem');
    await evaluate("BookAPI.request('/api/login',{method:'POST',body:JSON.stringify({login:'master@example.com',senha:'senha'})})");
    await send('Page.navigate',{url:base+'/adm/admin.html'});
    await wait("typeof mostrarAba === 'function' && !document.body.hidden");
    await evaluate(`(async()=>{mostrarAba('chat');await abrirConversaChat('cliente@example.com',${JSON.stringify(String(ticketId))});document.getElementById('textoAdmin').value='Resposta do administrador';await enviarMensagemAdmin({preventDefault(){}});if(!document.getElementById('mensagensAdmin').textContent.includes('Resposta do administrador'))throw Error('Resposta do chat');abrirChamado(${ticketId});document.getElementById('modal').style.display='none';})()`);
    await capture('chat-admin-com-mensagem');
    await evaluate("BookAPI.request('/api/login',{method:'POST',body:JSON.stringify({login:'cliente@example.com',senha:'senha'})})");
    await send('Page.navigate',{url:base+'/cliente/cliente.html'});
    await wait("typeof abrirChamado === 'function' && location.pathname === '/cliente/cliente.html'");
    await evaluate(`(async()=>{alternarChatCliente();document.getElementById('chamadoChat').value=${JSON.stringify(String(ticketId))};await renderizarConversaCliente();if(!document.getElementById('mensagensCliente').textContent.includes('Resposta do administrador'))throw Error('Cliente não recebeu resposta');})()`);
    await evaluate("sair()");
    await wait("location.pathname === '/login.html' && typeof BookAPI !== 'undefined' && document.readyState === 'complete'");
    if(users[1].tabs.join('|')!=='vistorias')throw Error('Permissões por aba não foram salvas');
    await evaluate("BookAPI.request('/api/login',{method:'POST',body:JSON.stringify({login:'pessoa@example.com',senha:'senha'})})");
    await send('Page.navigate',{url:base+'/adm/admin.html'});
    await wait("typeof mostrarAba === 'function' && !document.body.hidden");
    await evaluate("if(!document.getElementById('abaFinanceiro').hidden||!document.getElementById('abaOS').hidden||document.getElementById('abaVistorias').hidden||document.getElementById('visaoVistorias').hidden)throw Error('Permissões por aba na interface');mostrarAba('financeiro');if(!document.getElementById('visaoFinanceiro').hidden)throw Error('Aba negada abriu');");
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("if(!document.querySelector('.mobile-bottom [data-mobile-tab=\"os\"]').hidden||!document.querySelector('.mobile-bottom [data-mobile-tab=\"chamados\"]').hidden)throw Error('Atalho sem permissao')");
    await tap('.mobile-bottom [data-mobile-tab="more"]');await capture('permissoes-mobile');await tap('.mobile-bottom [data-mobile-tab="more"]');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("if(document.querySelectorAll('body > nav .nav-group').length!==1||!document.getElementById('menu-operacao').open)throw Error('Grupo vazio ou não autorizado no menu');BookWorkspace.openNotes()");
    await wait("document.getElementById('notesList').textContent.includes('Nenhuma nota')");
    await evaluate("document.getElementById('notesDialog').querySelector('.workspace-heading button').click();BookWorkspace.openSupport()");
    await wait("document.getElementById('supportList').textContent.includes('Nenhum chamado')");
    await evaluate("document.getElementById('supportSubject').value='Ajuda do administrador';document.getElementById('supportBody').value='Não consigo acessar uma aba';document.getElementById('supportForm').requestSubmit()");
    await wait("document.querySelectorAll('#supportThread .mensagem-chat').length===1");
    await evaluate("document.getElementById('supportDialog').querySelector('.workspace-heading button').click();sair()");
    await wait("location.pathname === '/login.html'");
    await send('Page.navigate',{url:base+'/legal/lgpd'});
    await wait("document.readyState==='complete' && !!document.getElementById('privacyRequest')");
    await evaluate(`(() => {
      window.requestText='';const original=URL.createObjectURL;
      URL.createObjectURL=function(blob){blob.text().then(text=>window.requestText=text);return original.call(this,blob);};
      HTMLAnchorElement.prototype.click=function(){};
      document.getElementById('privacyName').value='Pessoa de teste';document.getElementById('privacyEmail').value='pessoa@example.com';
      document.getElementById('privacyRequest').requestSubmit();
    })()`);
    await wait("window.requestText.includes('Pessoa de teste') && document.getElementById('privacyStatus').textContent.includes('Nenhuma solicitação foi enviada')");
    await capture('lgpd-desktop');
    await evaluate("document.getElementById('themeToggle').click()");
    const legalContrast=await contrastAudit();if(legalContrast.length)throw Error('Contraste nos documentos: '+JSON.stringify(legalContrast));
    await capture('lgpd-night');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)throw Error('Documento legal excedeu largura do celular')");
    await capture('lgpd-mobile');
    for(const page of ['privacidade','termos','cookies','reembolso','empresa']){
      await send('Page.navigate',{url:base+'/legal/'+page});await wait("document.readyState==='complete' && !!document.getElementById('themeToggle')");await capture('legal-'+page);
    }
    if(errors.length)throw new Error(errors.join('; '));
    const visualFailures=visualResults.filter(r=>r.contrast.length||r.clipped.length||r.images.length);
    if(process.env.BOOK_PREVIEW_DIR)fs.writeFileSync(path.join(path.resolve(process.env.BOOK_PREVIEW_DIR),'visual-report.json'),JSON.stringify(visualResults,null,2));
    if(visualFailures.length){const unique=new Map();for(const r of visualFailures)for(const kind of ['contrast','clipped','images'])for(const issue of r[kind]){const key=r.theme+kind+JSON.stringify(issue);if(!unique.has(key))unique.set(key,{state:r.state,theme:r.theme,width:r.width,kind,...(typeof issue==='object'?issue:{source:issue})});}throw Error('Revisão visual: '+JSON.stringify({states:visualResults.length,issues:[...unique.values()]}));}
    if(dialogs.length)throw new Error('Alertas inesperados: '+dialogs.join('; '));
    console.log(JSON.stringify({browser:'Chrome headless',tabs,catalogCheck,created:1,permissionsUpdated:1,tabPermissions:true,privateNotes:true,masterSupport:true,supportStatusCounters:true,dailyReminder:true,chatSupportNotifications:true,feedbackWithPhotoAndService:true,teamEvaluations:true,aiChat:'simulated',aiCardWithConfirmation:true,cardReopening:true,cardLifecycle:true,inspectionWithPhoto:true,inventorySaved:true,clientTicketWithPhoto:true,chatBothDirections:true,clientPermissions:true,backupAndVerification:true,responsiveWidths:[320,360,390,1440],mobileBottomNavigation:true,mobileMoreMenu:true,mobileClientHome:true,externalDisk:'simulated',logout:true,uncaughtErrors:0}));
  } finally {
    socket?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await delay(500);
    if(path.dirname(path.resolve(profile))===path.resolve(os.tmpdir()))try{fs.rmSync(profile,{recursive:true,force:true});}catch{ /* Browser cleanup can finish after process exit. */ }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
