window.BookRoutine=(()=>{
 const defs=BookProcesses.definitions,phases=BookProcesses.flowPhases;
 const el=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const req=(url,body)=>BookAPI.request(url,body?{method:'POST',body:JSON.stringify(body)}:{});
 let user,people=[],editing,attached=[],busy=false,flow=null,flowEvents=[],flowBefore=null,stock=null;const states=new Map();
 const can=kind=>BookWorkspace.can(defs[kind]?.tab||kind);
 function status(id,text){el(id).textContent=text;}
 function button(text,action,primary=false){const b=document.createElement('button');b.type='button';b.className=primary?'acao-principal':'botao-secundario';b.textContent=text;b.onclick=action;return b;}
 function staffOptions(select,value=''){select.replaceChildren(new Option('A definir',''));for(const p of people)select.append(new Option(p.nome,p.id));select.value=value;}
 function name(id){return people.find(p=>p.id===id)?.nome||'A definir';}
 function addSelect(label,id,options,parent){const wrap=document.createElement('label');wrap.textContent=label;const select=document.createElement('select');select.id=id;for(const [value,title]of options)select.append(new Option(title,value));wrap.append(select);parent.append(wrap);return select;}
 function filters(kind){const prefix='routine-'+kind;return {search:el(prefix+'-search').value.trim(),phase:el(prefix+'-phase').value,hotel:el(prefix+'-hotel').value,assignee:el(prefix+'-assignee').value,period:el(prefix+'-period').value};}
 function surface(kind,parent){
  const def=kind==='services'?{label:'Quadro de serviços',phases:phases.ordensServico}:defs[kind];
  const prefix='routine-'+kind,node=document.createElement('div');node.className='routine-surface';node.id=prefix;
  const toolbar=document.createElement('div');toolbar.className='routine-filters';
  const search=document.createElement('label');search.textContent='Buscar';search.innerHTML+='<input id="'+prefix+'-search" type="search" maxlength="200" placeholder="Título, nome ou apartamento">';toolbar.append(search);
  addSelect('Etapa',prefix+'-phase',[['','Todas'],...def.phases.map(p=>[p,p])],toolbar);
  addSelect('Condomínio',prefix+'-hotel',[['','Todos'],...BookCatalog.hotels.map(h=>[h,h])],toolbar);
  const assignee=addSelect('Responsável',prefix+'-assignee',[['','Todos']],toolbar);staffOptions(assignee);assignee.options[0].text='Todos';
  addSelect('Prazo',prefix+'-period',[['all','Todos'],['today','Hoje'],['week','Esta semana'],['late','Vencidas']],toolbar);
  const modes=document.createElement('div');modes.className='routine-actions';
  for(const [view,label]of [['board','Quadro'],['list','Lista'],['agenda','Agenda']]){const b=button(label,()=>{states.get(kind).view=view;render(kind);});b.dataset.view=view;modes.append(b);}
  modes.append(button('Minhas demandas',()=>{el(prefix+'-assignee').value=user.id;states.get(kind).offset=0;load(kind);}));modes.append(button('Atualizar',()=>load(kind)));modes.append(button('Exportar página',()=>exportPage(kind)));
  if(kind!=='services')modes.append(button('+ Novo registro',()=>edit(kind),true));
  node.append(toolbar,modes);const summary=document.createElement('p');summary.id=prefix+'-summary';summary.setAttribute('role','status');node.append(summary);const area=document.createElement('div');area.id=prefix+'-area';node.append(area);
  const paging=document.createElement('div');paging.className='collaboration-pagination';const previous=button('Anterior',()=>{states.get(kind).offset=Math.max(0,states.get(kind).offset-50);load(kind);}),next=button('Próxima',()=>{states.get(kind).offset+=50;load(kind);});previous.id=prefix+'-previous';next.id=prefix+'-next';paging.append(previous,next);node.append(paging);parent.append(node);
  states.set(kind,{rows:[],total:0,counts:{},offset:0,view:'board',generation:0});let timer;
  toolbar.addEventListener('change',()=>{states.get(kind).offset=0;load(kind);});el(prefix+'-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{states.get(kind).offset=0;load(kind);},300);};return node;
 }
 async function load(kind){
  if(kind==='services'&&!BookWorkspace.can('os')||kind!=='services'&&!can(kind))return;
  const state=states.get(kind),generation=++state.generation;status('routine-'+kind+'-summary','Carregando…');
  try{const result=await req('/api/processes'+(kind==='services'?'/services?':'?kind='+kind+'&')+'offset='+state.offset+'&filters='+encodeURIComponent(JSON.stringify(filters(kind))));if(generation!==state.generation)return;Object.assign(state,result);render(kind);}
  catch(error){if(generation===state.generation)status('routine-'+kind+'-summary',error.message);}
 }
 const canonicalPhase=row=>row.data?.status==='Finalizada'?'Resolvido':row.phase||'Novo';
 function card(kind,row){
  const isService=kind==='services',data=row.data,phase=isService?canonicalPhase(row):row.phase;
  const article=document.createElement('article');article.className='routine-card';
  const title=document.createElement('h3');title.textContent=data.titulo;const unit=document.createElement('p');unit.textContent=(isService?data.hotel:row.hotel)||'Equipe / geral';unit.textContent+=((isService?data.apartamento:row.apartment)?' · Apto '+(isService?data.apartamento:row.apartment):'');
  const detail=document.createElement('p');detail.textContent=isService?(people.find(p=>p.login===data.responsavelLogin)?.nome||data.responsavelLogin||'A definir'):name(data.responsavel);
  const due=document.createElement('p'),date=isService?data.vencimento:data.prazo;due.textContent=(date?'Prazo: '+formatarData(date):'Sem prazo')+' · '+data.prioridade;
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});if(date&&date<today&&!(isService?['Resolvido','Recusa proprietário']:defs[kind].terminal).includes(phase))due.className='routine-overdue';
  article.append(title,unit,detail,due);
  const open=button(isService?'Acompanhar serviço':'Abrir registro',()=>isService?openFlow('ordensServico',String(row.id)):edit(kind,row));article.append(open);
  if(row.service_id){const link=document.createElement('small');link.textContent='Serviço #'+row.service_id;article.append(link);}return article;
 }
 function render(kind){
  const state=states.get(kind),prefix='routine-'+kind,area=el(prefix+'-area'),def=kind==='services'?{phases:phases.ordensServico}:defs[kind];area.replaceChildren();
  el(prefix+'-previous').disabled=!state.offset;el(prefix+'-next').disabled=state.offset+50>=state.total;
  status(prefix+'-summary',state.total?`${state.offset+1}–${state.offset+state.rows.length} de ${state.total} registros. Contadores consideram todos os resultados dos filtros.`:'Nenhum registro encontrado.');
  el(prefix).querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
  if(state.view==='board'){
   area.className='routine-board';for(const phase of def.phases){const col=document.createElement('section');col.className='routine-column';const h=document.createElement('h3');h.textContent=phase+' · '+(state.counts[phase]||0);col.append(h);for(const row of state.rows.filter(r=>(kind==='services'?canonicalPhase(r):r.phase)===phase))col.append(card(kind,row));if(col.children.length===1){const empty=document.createElement('p');empty.className='workspace-hint';empty.textContent=state.counts[phase]?'Use o filtro de etapa para ver os registros desta coluna.':'Sem registros';col.append(empty);}area.append(col);}
  }else{
   area.className='routine-list';let rows=[...state.rows];if(state.view==='agenda')rows.sort((a,b)=>String((kind==='services'?a.data.vencimento:a.data.prazo)||'9999').localeCompare(String((kind==='services'?b.data.vencimento:b.data.prazo)||'9999')));
   for(const row of rows){const item=card(kind,row);const stage=document.createElement('p');stage.className='routine-stage';stage.textContent=kind==='services'?canonicalPhase(row):row.phase;item.prepend(stage);area.append(item);}
  }
 }
 function exportPage(kind){const state=states.get(kind),rows=[['Título','Condomínio','Apartamento','Etapa','Responsável','Prazo'],...state.rows.map(r=>[r.data.titulo,kind==='services'?r.data.hotel:r.hotel,kind==='services'?r.data.apartamento:r.apartment,r.phase,kind==='services'?r.data.responsavelLogin:name(r.data.responsavel),kind==='services'?r.data.vencimento:r.data.prazo])];const url=URL.createObjectURL(new Blob([BookProcesses.csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='BOOK-TESK-'+kind+'-pagina.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function field(def,value=''){
  const label=document.createElement('label');label.textContent=def.label;
  const input=document.createElement(def.type==='textarea'?'textarea':['select','user'].includes(def.type)?'select':'input');input.name=def.key;input.id='process-field-'+def.key;input.required=!!def.required;
  if(def.type==='select')for(const choice of def.options)input.append(new Option(choice,choice));
  else if(def.type==='user')staffOptions(input,value);
  else if(def.type==='textarea'){input.rows=3;input.maxLength=4000;}
  else{input.type=['date','email','number'].includes(def.type)?def.type:'text';input.maxLength=200;if(def.type==='number'){input.min='0.01';input.max='10000';input.step='0.01';}if(def.type==='money'){input.inputMode='decimal';input.placeholder='0,00';}}
  input.value=value;label.append(input);return label;
 }
 function units(value=''){const hotel=el('processHotel').value,select=el('processApartment');select.replaceChildren(new Option('Selecione',''));for(const unit of BookStore.apartments(hotel))select.append(new Option(unit,unit));select.value=value;select.disabled=!hotel;el('processFiles').disabled=!hotel;el('processFilesHint').textContent=hotel?'Até 20 anexos, 5 MB por arquivo e 10 MB por envio.':'Para anexos, vincule o registro a um condomínio e apartamento.';}
 function attachmentList(){el('processExisting').replaceChildren(...attached.map((a,index)=>{const row=document.createElement('div');row.className='attachment-row';const link=document.createElement('a');link.href=a.dados;link.target='_blank';link.rel='noopener';link.textContent=a.nome;row.append(link,button('Remover',()=>{attached.splice(index,1);attachmentList();}));return row;}));}
 async function edit(kind,row,prefill={}){
  if(busy)return;const def=defs[kind];editing=row||{id:crypto.randomUUID(),kind,version:0,phase:def.phases[0],hotel:prefill.hotel,apartment:prefill.apartment,data:prefill.data||{}};
  el('processForm').reset();el('processFiles').dispatchEvent(new Event('change'));attached=structuredClone(editing.data.anexos||[]);el('processTitle').textContent=(row?'Editar ':'Novo ')+def.singular;el('processName').value=editing.data.titulo||'';el('processHotel').value=editing.hotel||'';el('processHotel').required=!def.global;el('processHotel').disabled=!!row;units(editing.apartment||'');el('processApartment').required=!def.global;el('processApartment').disabled=!!row||!editing.hotel;
  el('processPhase').replaceChildren(...def.phases.map(p=>new Option(p,p)));el('processPhase').value=editing.phase;staffOptions(el('processAssignee'),editing.data.responsavel||'');el('processDue').value=editing.data.prazo||'';el('processPriority').value=editing.data.prioridade||'Normal';el('processObservations').value=editing.data.observacoes||'';
  el('processFields').replaceChildren(...def.fields.map(f=>field(f,editing.data[f.key]||'')));el('processChecks').replaceChildren(...def.checks.map(text=>{const label=document.createElement('label');label.className='collaboration-check';const c=document.createElement('input');c.type='checkbox';c.dataset.check=text;c.checked=!!editing.data.checks?.[text];label.append(c,document.createTextNode(text));return label;}));attachmentList();status('processStatus','');el('processHistoryButton').hidden=!row;el('processService').hidden=!row||!row.hotel||!BookWorkspace.can('os');el('processService').textContent=row?.service_id?'Abrir serviço #'+row.service_id:'Gerar serviço vinculado';el('processStock').hidden=kind!=='compras'||!row||!BookWorkspace.can('estoque');el('processStock').disabled=!!row?.stock_receipt;el('processDialog').showModal();
 }
 const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({nome:file.name,dados:reader.result});reader.onerror=()=>reject(Error('Não foi possível ler '+file.name));reader.readAsDataURL(file);});
 async function save(event){
  event.preventDefault();if(busy)return;busy=true;setBusy('processDialog',true);
  try{const def=defs[editing.kind],files=[...el('processFiles').files];BookStore.validateFiles(files);if(files.length+attached.length>20)throw Error('Limite de 20 anexos por registro.');
   const data={titulo:el('processName').value.trim(),observacoes:el('processObservations').value,prioridade:el('processPriority').value,responsavel:el('processAssignee').value||null,prazo:el('processDue').value,anexos:[...attached,...await Promise.all(files.map(fileData))],checks:{}};
   for(const field of def.fields)data[field.key]=el('process-field-'+field.key).value;
   el('processChecks').querySelectorAll('input').forEach(c=>data.checks[c.dataset.check]=c.checked);
   status('processStatus',files.length?'Enviando anexos e salvando…':'Salvando…');
   await req('/api/processes',{id:editing.id,kind:editing.kind,version:Number(editing.version),phase:el('processPhase').value,hotel:el('processHotel').value||null,apartment:el('processApartment').value||null,data});
   el('processDialog').close();await load(editing.kind);
  }catch(error){status('processStatus',error.message);}finally{busy=false;setBusy('processDialog',false);}
 }
 function setBusy(id,value){el(id).setAttribute('aria-busy',String(value));el(id).querySelectorAll('button').forEach(b=>{if(value)b.dataset.wasDisabled=String(b.disabled);b.disabled=value||b.dataset.wasDisabled==='true';if(!value)delete b.dataset.wasDisabled;});el(id).querySelectorAll('.attachment-row progress').forEach(p=>p.hidden=!value);}
 async function service(){
  if(busy||!editing)return;const linked=editing.service_id||(editing.kind==='compras'?editing.data.servicoId:null);if(linked){el('processDialog').close();await openFlow('ordensServico',linked);return;}
  if(!confirm('Criar um serviço vinculado usando os dados e anexos deste registro?'))return;busy=true;setBusy('processDialog',true);
  try{const result=await req('/api/processes/service',{source:'process',id:editing.id,version:Number(editing.version),recordId:String(BookStore.id())});el('processDialog').close();await load(editing.kind);busy=false;await openFlow('ordensServico',result.id);}catch(error){status('processStatus',error.message);}finally{busy=false;setBusy('processDialog',false);}
 }
 async function receive(){
  if(busy)return;try{const rows=await req('/api/data?collection=estoqueBookSantos');stock=rows.rows[0];if(!stock)throw Error('Cadastre os materiais no estoque antes do recebimento.');el('receiveMaterial').replaceChildren(...stock.data.itens.map(i=>new Option(i.nome||i.material||i.id,i.id)));el('receiveQuantity').value=editing.data.quantidade||'1';status('receiveStatus','');el('receiveDialog').showModal();}catch(error){status('processStatus',error.message);}
 }
 async function openFlow(source,id){
  if(busy)return;try{flow=await req('/api/processes/flow?source='+source+'&id='+encodeURIComponent(id));flow.source=source;flow.id=id;flowEvents=[];renderFlow();if(!el('flowDialog').open)el('flowDialog').showModal();}catch(error){if(el('flowDialog').open)status('flowStatus',error.message);else alert(error.message);}
 }
 function renderFlow(){
  const r=flow.record,d=r.data,meta=flow.meta;
  el('flowTitle').textContent=d.titulo||d.assunto||(flow.source==='vistorias'?'Vistoria #'+flow.id:defs[r.kind]?.label)||'Acompanhamento';
  el('flowRecordSummary').textContent=(r.hotel||d.hotel||'Equipe / geral')+' · '+(r.apartment||d.apartamento||'')+' · Versão '+flow.recordVersion;
  el('flowEdit').hidden=flow.source==='process';el('flowService').hidden=flow.source!=='vistorias'||!BookWorkspace.can('os');
  el('flowPurchase').hidden=flow.source!=='ordensServico'||!BookWorkspace.can('compras');
  el('flowService').textContent='Gerar / consultar serviço da vistoria';el('flowSettings').hidden=flow.source==='process';
  if(flow.source==='ordensServico'&&d.status==='Finalizada')el('flowSettings').hidden=true;
  const writable=flow.source==='process'?can(r.kind):BookWorkspace.can({ordensServico:'os',vistorias:'vistorias',feedbacks:'feedbacks'}[flow.source]);el('flowComment').hidden=!writable;if(!writable)el('flowSettings').hidden=true;
  if(flow.source!=='process'){
   const options=phases[flow.source];el('flowPhase').replaceChildren(...options.map(p=>new Option(p,p)));
   const phase=flow.source==='ordensServico'&&d.status==='Finalizada'?'Resolvido':meta?.phase==='Resolvido'&&d.status!=='Finalizada'?'Em andamento':meta?.phase||(flow.source==='ordensServico'&&d.status==='Em andamento'?'Em andamento':options[0]);el('flowPhase').value=phase;
   for(const name of ['origem','prestador','motivo','respostaCliente'])el('flow-'+name).value=meta?.data[name]||'';staffOptions(el('flow-resolvidoPor'),meta?.data.resolvidoPor||'');
   staffOptions(el('flow-responsavel'),people.find(p=>p.login===d.responsavelLogin)?.id||'');el('flow-prazo').value=d.vencimento||'';
   for(const name of ['proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado'])el('flow-'+name).checked=!!meta?.data[name];
   el('flowFeedbackFields').hidden=flow.source!=='feedbacks';el('flowServiceFields').hidden=flow.source!=='ordensServico';
  }
  el('flowCommentBody').value='';flowEvents=flow.events.slice(0,50);flowBefore=flowEvents.at(-1)?.id;renderHistory();el('flowMore').hidden=flow.events.length<=50;status('flowStatus','');
 }
 function renderHistory(){el('flowHistory').replaceChildren(...flowEvents.map(e=>{const node=document.createElement('article');node.className='routine-event';const strong=document.createElement('strong');strong.textContent=e.action+' · '+e.actor_name;const time=document.createElement('small');time.textContent=new Date(e.created_at).toLocaleString('pt-BR');const text=document.createElement('p');text.className='collaboration-text';text.textContent=e.body||e.current?.phase||'';node.append(strong,time,text);if(e.current){const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Dados registrados';const code=document.createElement('pre');code.textContent=JSON.stringify(e.current,null,2);detail.append(summary,code);node.append(detail);}return node;}));}
 function orderOpened(id){let b=el('orderRoutineButton');if(!b){b=button('Etapas, pendências e histórico',()=>{});b.id='orderRoutineButton';el('osDetalhes').after(b);}b.onclick=()=>openFlow('ordensServico',id);}
 async function activate(tab){if(defs[tab]&&tab!=='desempenho')load(tab);if(tab==='os'&&!el('routine-services').hidden)load('services');if(tab==='avaliacoes'&&!el('routine-desempenho').hidden)load('desempenho');}
 function init(profile){
  user=profile;
  for(const [kind,def]of Object.entries(defs))if(kind!=='desempenho'){
   const suffix=kind[0].toUpperCase()+kind.slice(1),nav=button(def.label,()=>mostrarAba(kind));nav.id='aba'+suffix;nav.className='aba';nav.hidden=!can(kind);document.querySelector('nav').append(nav);const section=document.createElement('section');section.id='visao'+suffix;section.hidden=true;section.innerHTML='<div class="titulo-secao"><h2>'+def.label+'</h2></div>';document.querySelector('main').append(section);surface(kind,section);
  }
  const team=document.createElement('details');team.className='routine-team-plans';team.innerHTML='<summary>Planos de desenvolvimento da equipe</summary><p class="workspace-hint">Acompanhamento compartilhado com quem possui acesso a Avaliações.</p>';el('visaoAvaliacoes').append(team);surface('desempenho',team);team.ontoggle=()=>{if(team.open)load('desempenho');};
  const services=surface('services',el('visaoOS'));services.hidden=true;const toggle=button('Quadro e agenda de serviços',()=>{services.hidden=!services.hidden;const show=services.hidden;el('listaOS').hidden=!show;el('resumoListaOS').hidden=!show;el('visaoOS').querySelector('.filtros-card').hidden=!show;toggle.textContent=show?'Quadro e agenda de serviços':'Voltar à lista de cards';if(!show)load('services');});el('visaoOS').querySelector('.titulo-secao').after(toggle);
  const dialog=document.createElement('dialog');dialog.id='processDialog';dialog.className='collaboration-dialog routine-dialog';dialog.setAttribute('aria-labelledby','processTitle');dialog.innerHTML='<div class="titulo-secao"><h2 id="processTitle">Processo</h2><button type="button" id="processClose" class="botao-secundario">Fechar</button></div><form id="processForm"><label>Título<input id="processName" maxlength="160" required></label><div class="collaboration-fields"><label>Condomínio<select id="processHotel"><option value="">Equipe / geral</option></select></label><label>Apartamento<select id="processApartment"></select></label><label>Etapa<select id="processPhase"></select></label><label>Responsável<select id="processAssignee"></select></label><label>Prazo<input type="date" id="processDue"></label><label>Prioridade<select id="processPriority"><option>Normal</option><option>Alta</option><option>Urgente</option></select></label></div><div id="processFields" class="collaboration-fields"></div><label>Observações<textarea id="processObservations" rows="3" maxlength="8000"></textarea></label><fieldset><legend>Conferência</legend><div id="processChecks"></div></fieldset><div id="processExisting"></div><label>Anexos<input id="processFiles" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf"><small id="processFilesHint"></small></label><button type="submit" class="acao-principal">Salvar registro</button></form><div class="routine-actions"><button type="button" class="botao-secundario" id="processHistoryButton">Histórico e comentários</button><button type="button" class="botao-secundario" id="processService">Gerar serviço vinculado</button><button type="button" class="botao-secundario" id="processStock">Receber no estoque</button></div><p id="processStatus" role="status"></p>';document.body.append(dialog);
  for(const hotel of BookCatalog.hotels)el('processHotel').append(new Option(hotel,hotel));el('processHotel').onchange=()=>units();el('processForm').onsubmit=save;el('processClose').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=event=>{if(busy)event.preventDefault();};el('processService').onclick=service;el('processStock').onclick=receive;el('processHistoryButton').onclick=()=>openFlow('process',editing.id);
  const receipt=document.createElement('dialog');receipt.id='receiveDialog';receipt.className='collaboration-dialog';receipt.innerHTML='<div class="titulo-secao"><h2>Receber compra no estoque</h2><button type="button" id="receiveClose" class="botao-secundario">Fechar</button></div><p>Esta entrada será registrada uma única vez. Cadastre novos materiais primeiro na aba Estoque.</p><form id="receiveForm"><label>Material<select id="receiveMaterial" required></select></label><label>Quantidade recebida<input id="receiveQuantity" type="number" min="0.01" max="10000" step="0.01" required></label><button type="submit" class="acao-principal">Confirmar recebimento</button><p id="receiveStatus" role="status"></p></form>';document.body.append(receipt);el('receiveClose').onclick=()=>{if(!busy)receipt.close();};receipt.oncancel=event=>{if(busy)event.preventDefault();};el('receiveForm').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;setBusy('receiveDialog',true);try{await req('/api/processes/receive',{id:editing.id,version:Number(editing.version),stockVersion:Number(stock.version),materialId:el('receiveMaterial').value,quantity:Number(el('receiveQuantity').value)});receipt.close();dialog.close();await load('compras');}catch(error){status('receiveStatus',error.message);}finally{busy=false;setBusy('receiveDialog',false);}};
  const flowDialog=document.createElement('dialog');flowDialog.id='flowDialog';flowDialog.className='collaboration-dialog routine-dialog';flowDialog.setAttribute('aria-labelledby','flowTitle');flowDialog.innerHTML='<div class="titulo-secao"><h2 id="flowTitle">Acompanhamento</h2><button id="flowClose" type="button" class="botao-secundario">Fechar</button></div><p id="flowRecordSummary"></p><form id="flowSettings"><label>Etapa<select id="flowPhase"></select></label><div id="flowServiceFields"><label>Origem<input id="flow-origem" maxlength="2000" placeholder="Vistoria, governança, hóspede…"></label><label>Fornecedor / prestador<input id="flow-prestador" maxlength="2000"></label><label>Motivo da recusa / pendência<textarea id="flow-motivo" maxlength="2000" rows="2"></textarea></label><fieldset><legend>Comunicação e operação</legend>'+[['proprietarioAvisado','Proprietário avisado'],['centralAvisada','Central de reservas avisada'],['anuncioAtualizado','Anúncio atualizado'],['protocoloAtualizado','Protocolo de check-in atualizado']].map(([id,label])=>'<label class="collaboration-check"><input type="checkbox" id="flow-'+id+'">'+label+'</label>').join('')+'</fieldset></div><div id="flowFeedbackFields"><label>Resposta / solução apresentada ao cliente<textarea id="flow-respostaCliente" rows="3" maxlength="2000"></textarea></label><label>Resolvido por<select id="flow-resolvidoPor"></select></label></div><button type="submit" class="acao-principal">Salvar acompanhamento</button></form><div class="routine-actions"><button id="flowEdit" type="button" class="botao-secundario">Abrir dados e fechamento do card</button><button id="flowService" type="button" class="botao-secundario">Gerar serviço da vistoria</button></div><h3>Atividades e comentários</h3><form id="flowComment"><label>Comentário<textarea id="flowCommentBody" maxlength="2000" rows="2" required></textarea></label><button type="submit" class="botao-secundario">Enviar comentário</button></form><p id="flowStatus" role="status"></p><div id="flowHistory"></div><button id="flowMore" type="button" class="botao-secundario" hidden>Atividades anteriores</button>';document.body.append(flowDialog);
  el('flowClose').onclick=()=>{if(!busy)flowDialog.close();};flowDialog.oncancel=event=>{if(busy)event.preventDefault();};
  const purchase=button('Solicitar compra para este serviço',()=>{if(busy)return;const record=flow.record;flowDialog.close();edit('compras',null,{hotel:record.data.hotel,apartment:record.data.apartamento,data:{titulo:('Compra — '+record.data.titulo).slice(0,160),itens:record.data.descricao||record.data.titulo,servicoId:flow.id}});});purchase.id='flowPurchase';el('flowEdit').after(purchase);
  const assignment=document.createElement('div');assignment.className='collaboration-fields';assignment.innerHTML='<label>Administrador responsável<select id="flow-responsavel"></select></label><label>Prazo do serviço<input id="flow-prazo" type="date"></label>';el('flowServiceFields').prepend(assignment);
  el('flowEdit').onclick=async()=>{if(flow.source==='ordensServico'){flowDialog.close();await BookStore.refresh(true);BookStore.includeRecord('ordensServico',flow.record);abrirOS(flow.id);}else if(flow.source==='feedbacks'){flowDialog.close();mostrarAba('feedbacks');}else{flowDialog.close();mostrarAba('vistorias');}};
  el('flowSettings').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;setBusy('flowDialog',true);const source=flow.source,id=flow.id;try{const data={};for(const k of ['origem','prestador','motivo','respostaCliente','resolvidoPor',...(source==='ordensServico'?['responsavel','prazo']:[])])data[k]=el('flow-'+k).value;for(const k of ['proprietarioAvisado','centralAvisada','anuncioAtualizado','protocoloAtualizado'])data[k]=el('flow-'+k).checked;await req('/api/processes/flow',{source,id,version:Number(flow.meta?.version||0),recordVersion:Number(flow.recordVersion),phase:el('flowPhase').value,data});flow=await req('/api/processes/flow?source='+source+'&id='+id);flow.source=source;flow.id=id;renderFlow();if(source==='ordensServico')load('services');}catch(error){status('flowStatus',error.message);}finally{busy=false;setBusy('flowDialog',false);}};
  el('flowComment').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;setBusy('flowDialog',true);try{await req('/api/processes/comment',{source:flow.source,id:flow.id,body:el('flowCommentBody').value});const source=flow.source,id=flow.id;flow=await req('/api/processes/flow?source='+source+'&id='+id);flow.source=source;flow.id=id;renderFlow();}catch(error){status('flowStatus',error.message);}finally{busy=false;setBusy('flowDialog',false);}};
  el('flowMore').onclick=async()=>{try{const page=await req('/api/processes/flow?source='+flow.source+'&id='+flow.id+'&before='+flowBefore);flowEvents.push(...page.events.slice(0,50));flowBefore=flowEvents.at(-1)?.id;el('flowMore').hidden=page.events.length<=50;renderHistory();}catch(error){status('flowStatus',error.message);}};
  el('flowService').onclick=async()=>{if(busy||!confirm('Criar ou consultar o serviço vinculado a esta vistoria?'))return;busy=true;setBusy('flowDialog',true);try{const result=await req('/api/processes/service',{source:'vistorias',id:flow.id,version:Number(flow.recordVersion),recordId:String(BookStore.id())});status('flowStatus','Serviço #'+result.id+' vinculado.');}catch(error){status('flowStatus',error.message);}finally{busy=false;setBusy('flowDialog',false);}};
  BookStore.setupAttachments();
  req('/api/users').then(rows=>{people=rows.filter(p=>p.funcao==='adm');for(const kind of states.keys()){const select=el('routine-'+kind+'-assignee');staffOptions(select,select.value);select.options[0].text='Todos';}}).catch(()=>{});
 }
 function openServices(query={},view='list'){
  if(!BookWorkspace.can('os'))return;
  for(const key of ['search','phase','hotel','assignee','period']){
   const input=el('routine-services-'+key),value=query[key]||(key==='period'?'all':'');
   if(key==='assignee'&&value&&![...input.options].some(o=>o.value===value))input.append(new Option('Responsável selecionado',value));
   input.value=value;
  }
  const state=states.get('services');state.offset=0;state.view=view;
  el('routine-services').hidden=false;el('listaOS').hidden=true;el('resumoListaOS').hidden=true;el('visaoOS').querySelector('.filtros-card').hidden=true;
  el('visaoOS').querySelector('.titulo-secao').nextElementSibling.textContent='Voltar à lista de cards';
  mostrarAba('os');
 }
 return {init,activate,openFlow,orderOpened,load,openServices};
})();
