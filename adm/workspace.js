window.BookWorkspace = (() => {
  const labels = {chamados:'Chamados',chat:'Chat',os:'Cards',vistorias:'Vistorias',condominios:'Condomínios',estoque:'Estoque',financeiro:'Financeiro',dashboard:'Visão geral',feedbacks:'Feedbacks',avaliacoes:'Avaliações',reservas:'Reservas',onboarding:'Onboarding',projetos:'Projetos',compras:'Compras',danos:'Danos e reposições'};
  let user, notes=[], note=null, tickets=[], ticket=null, offset=0, dirty=false, saving=false;
  let aiMessages=[],aiBusy=false;
  let supportRequest=0,supportRefreshing=false;
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const can = tab => !!user?.mestre || (user?.tabs ?? Object.keys(labels)).includes(tab);
  const panels={aiDialog:'IA',supportDialog:'Suporte',notesDialog:'Notas'};
  function openPanel(node){
    if(node.open)return false;
    if(saving||aiBusy)return false;
    for(const id of Object.keys(panels)){
      const previous=el(id);
      if(previous?.open){previous.close();if(id==='aiDialog')el('aiKey').value='';}
    }
    node.show();document.body.classList.add('workspace-open');
    if(node.id==='aiDialog'&&!el('aiKey').value)el('aiConnection').open=true;
    document.querySelectorAll('[data-workspace-target]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workspaceTarget===node.id)));
    node.querySelector('.workspace-heading button').focus({preventScroll:true});
    return true;
  }
  async function request(route, body) { return BookAPI.request(route, body ? {method:'POST',body:JSON.stringify(body)} : {}); }
  function dialog(id, title, body) {
    const node = document.createElement('dialog');node.id=id;node.className='workspace-dialog';node.setAttribute('aria-labelledby',id+'Title');
    node.innerHTML=`<div class="workspace-heading"><h2 id="${id}Title">${title}</h2><button type="button" class="botao-secundario" aria-label="Fechar painel lateral">Fechar</button></div><div class="workspace-panel-tabs" role="group" aria-label="Ferramentas do painel"></div><div class="workspace-panel-content">${body}</div><p class="workspace-status" role="status"></p>`;
    for(const [target,label]of Object.entries(panels)){
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.workspaceTarget=target;button.setAttribute('aria-controls',target);button.setAttribute('aria-pressed','false');
      button.onclick=()=>target==='notesDialog'?openNotes():target==='supportDialog'?openSupport():openPanel(el(target));
      node.querySelector('.workspace-panel-tabs').append(button);
    }
    node.querySelector('.workspace-heading button').onclick=()=>close(node);
    node.addEventListener('cancel',event=>{event.preventDefault();close(node);});document.body.append(node);return node;
  }
  function close(node) {
    if(saving)return;
    if(node.id==='notesDialog'&&dirty&&!confirm('Fechar sem salvar as alterações desta nota?'))return;
    if(node.id==='supportDialog'&&el('supportBody')?.value.trim()&&!confirm('Descartar a mensagem ainda não enviada?'))return;
    if(node.id==='aiDialog'){if(aiBusy)return;el('aiKey').value='';}
    if(node.id==='notesDialog')dirty=false;
    if(node.id==='supportDialog')el('supportBody').value='';
    node.close();
    document.body.classList.remove('workspace-open');
    document.querySelectorAll('[data-workspace-target]').forEach(button=>button.setAttribute('aria-pressed','false'));
    document.querySelector(`.workspace-actions [data-workspace-target="${node.id}"]`)?.focus({preventScroll:true});
  }
  async function run(node, action) {
    if(saving)return; saving=true;node.setAttribute('aria-busy','true');
    const buttons=[...node.querySelectorAll('button')].filter(button=>!button.disabled);buttons.forEach(button=>button.disabled=true);
    const status=node.querySelector('.workspace-status');status.textContent='Salvando…';
    try{await action();status.textContent='Salvo.';}catch(error){status.textContent=error.message;}
    finally{saving=false;node.removeAttribute('aria-busy');buttons.forEach(button=>button.disabled=false);if(node.id==='supportDialog')el('supportSend').disabled=ticket?.status==='Fechado'&&!user.mestre;}
  }
  function editNote(selected) {
    if(dirty&&!confirm('Descartar as alterações não salvas desta nota?'))return;
    note=selected||{id:crypto.randomUUID(),title:'',body:'',version:0};dirty=false;
    el('noteTitle').value=note.title;el('noteBody').value=note.body;
    el('noteDelete').hidden=!note.version;
    window.BookCollaboration?.noteSelected(note);
  }
  async function loadNotes() {
    notes=await request('/api/workspace/notes');
    el('notesList').replaceChildren(...notes.map(item=>{
      const button=document.createElement('button');button.type='button';button.textContent=item.title;button.dataset.noteId=item.id;button.onclick=()=>editNote(item);return button;
    }));
    if(!notes.length)el('notesList').textContent='Nenhuma nota salva.';
  }
  async function openNotes() {
    const node=el('notesDialog');if(!openPanel(node))return;node.querySelector('.workspace-status').textContent='Carregando notas…';
    try{await loadNotes();if(!dirty)editNote(notes.find(item=>item.id===note?.id)||notes[0]);node.querySelector('.workspace-status').textContent=dirty?'Alterações não salvas.':'Notas privadas, salvas na sua conta.';}
    catch(error){node.querySelector('.workspace-status').textContent=error.message;}
  }
  async function saveNote(remove=false) {
    if(!note||!el('notesForm').reportValidity())return;
    if(remove&&!confirm('Excluir esta nota definitivamente?'))return;
    const data={id:note.id,version:note.version,title:el('noteTitle').value.trim(),body:el('noteBody').value,remove};
    await run(el('notesDialog'),async()=>{await request('/api/workspace/notes',data);dirty=false;await loadNotes();editNote(remove?notes[0]:notes.find(n=>n.id===data.id));});
  }
  async function loadTickets(reset=true) {
    if(reset){offset=0;tickets=[];}
    const page=await request(`/api/workspace/support?offset=${offset}`);tickets.push(...page.slice(0,50));offset+=Math.min(page.length,50);
    el('supportMore').hidden=page.length<=50;
    el('supportList').replaceChildren(...tickets.map(item=>{
      const button=document.createElement('button');button.type='button';button.textContent=`${item.subject} · ${item.status}${user.mestre?' · '+item.owner_name:''}`;
      button.onclick=()=>selectTicket(item.id);return button;
    }));
    if(!tickets.length)el('supportList').textContent='Nenhum chamado de suporte.';
  }
  function newTicket() {
    if(el('supportBody').value.trim()&&!confirm('Descartar a mensagem ainda não enviada?'))return;
    ticket=null;el('supportSubject').disabled=false;el('supportSubject').value='';el('supportBody').value='';
    el('supportThread').textContent='Descreva o problema para conversar com o mestre.';el('supportToggle').hidden=true;
    el('supportBody').disabled=false;el('supportSend').disabled=false;
  }
  async function selectTicket(id, preserveDraft=false) {
    if(!preserveDraft&&el('supportBody').value.trim()&&!confirm('Descartar a mensagem ainda não enviada?'))return;
    const generation=++supportRequest;
    try{
      const rows=await request(`/api/workspace/support?id=${encodeURIComponent(id)}`);
      if(generation!==supportRequest)return;
      if(!rows[0])throw Error('Chamado indisponível.');ticket=rows[0];
      el('supportSubject').value=ticket.subject;el('supportSubject').disabled=true;
      if(!preserveDraft)el('supportBody').value='';
      const messages=(ticket.book_support_messages||[]).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
      el('supportThread').innerHTML=messages.map(m=>`<article class="mensagem-chat ${m.author_id===user.id?'minha-mensagem':''}"><strong>${esc(m.author_name)}${m.master?' · Mestre':''}</strong><p>${esc(m.body)}</p><small>${esc(new Date(m.created_at).toLocaleString('pt-BR'))}</small></article>`).join('');
      el('supportThread').scrollTop=el('supportThread').scrollHeight;
      el('supportToggle').hidden=!user.mestre;el('supportToggle').textContent=ticket.status==='Fechado'?'Reabrir chamado':'Fechar chamado';
      el('supportBody').disabled=ticket.status==='Fechado'&&!user.mestre;el('supportSend').disabled=el('supportBody').disabled;
      el('supportDialog').querySelector('.workspace-status').textContent=`${ticket.status} · ${ticket.owner_name}`;
      if(messages.length&&!document.hidden&&el('supportDialog').open){await request('/api/workspace/support-read',{id:ticket.id,seen:messages.at(-1).created_at});window.BookNotifications?.refresh();}
    }catch(error){el('supportDialog').querySelector('.workspace-status').textContent=error.message;throw error;}
  }
  async function openSupport() {
    const node=el('supportDialog');if(!openPanel(node))return;if(!node.dataset.initialized){newTicket();node.dataset.initialized='true';}
    try{await loadTickets();if(ticket)await selectTicket(ticket.id,true);else node.querySelector('.workspace-status').textContent=user.mestre?'Chamados dos administradores.':'Conversa privada entre você e o mestre.';}
    catch(error){node.querySelector('.workspace-status').textContent=error.message;}
  }
  async function sendSupport(status) {
    if(!status&&!el('supportForm').reportValidity())return;
    const data={id:ticket?.id||crypto.randomUUID(),version:ticket?.version||0,subject:el('supportSubject').value.trim(),body:status?'':el('supportBody').value.trim(),...(status?{status}:{})};
    if(status&&el('supportBody').value.trim()){alert('Envie ou apague a mensagem antes de alterar o status.');return;}
    await run(el('supportDialog'),async()=>{await request('/api/workspace/support',data);el('supportBody').value='';await loadTickets();await selectTicket(data.id);if(user.mestre)await loadMaster();window.BookNotifications?.refresh();});
  }
  async function loadMaster() {
    if(!user?.mestre)return;
    const node=el('masterSupportList');if(!node.children.length)node.textContent='Carregando…';const generation=++masterGeneration;node.setAttribute('aria-busy','true');
    try{
      const [summary,rows]=await Promise.all([request('/api/workspace/support-summary'),request('/api/workspace/support?offset='+masterOffset+'&status='+encodeURIComponent(el('masterSupportFilter').value))]);
      if(generation!==masterGeneration)return;
      el('supportTotal').textContent=summary.total;el('supportOpen').textContent=summary.open;el('supportClosed').textContent=summary.closed;
      el('masterSupportPrevious').disabled=masterOffset===0;el('masterSupportNext').disabled=rows.length<=50;
      node.replaceChildren(...rows.slice(0,50).map(item=>{
        const card=document.createElement('article');card.className='chamado support-card';
        const button=document.createElement('button');button.type='button';button.className='support-open-thread';button.textContent=`${item.subject} · ${item.owner_name}`;button.onclick=async()=>{try{await openSupport();await selectTicket(item.id);}catch{}};
        const select=document.createElement('select');select.setAttribute('aria-label','Status de '+item.subject);for(const status of ['Aberto','Fechado']){const option=new Option(status,status);select.append(option);}select.value=item.status;
        select.onchange=async()=>{select.disabled=true;try{await request('/api/workspace/support',{id:item.id,version:item.version,subject:'',body:'',status:select.value});await loadMaster();window.BookNotifications?.refresh();}catch(error){select.value=item.status;node.prepend(Object.assign(document.createElement('p'),{textContent:error.message}));}finally{select.disabled=false;}};
        card.append(button,select);return card;
      }));if(!node.children.length)node.textContent='Nenhum chamado nesta página com esse status.';
    }
    catch(error){if(generation===masterGeneration)node.textContent=error.message;}
    finally{if(generation===masterGeneration)node.removeAttribute('aria-busy');}
  }
  let masterOffset=0,masterGeneration=0;
  function renderAIThread(){
    el('aiThread').innerHTML=aiMessages.map(m=>`<article class="mensagem-chat ${m.role==='user'?'minha-mensagem':''}"><strong>${m.role==='user'?'Você':'Assistente'}</strong><p>${esc(m.content)}</p></article>`).join('');el('aiThread').scrollTop=el('aiThread').scrollHeight;
  }
  function aiBusyState(value){
    aiBusy=value;
    for(const id of ['aiSend','aiNew','aiProvider','aiModel','aiKey','aiPrompt'])el(id).disabled=value;
    el('aiDialog').setAttribute('aria-busy',String(value));
  }
  const fieldLabels={before:'Dados atuais',after:'Dados preparados',hotel:'Condomínio',apartamento:'Apartamento',titulo:'Título',descricao:'Descrição',assunto:'Assunto',categoria:'Categoria',prioridade:'Prioridade',responsavelLogin:'Administrador responsável',vencimento:'Vencimento',chamadoId:'Chamado vinculado',status:'Status',fechamento:'Fechamento',data:'Data',responsavel:'Responsável',responsavelPagamento:'Responsável pelo pagamento',executadoPorLogin:'Executor (login)',executadoPor:'Executor',valorServico:'Valor do serviço',valorMaterial:'Valor dos materiais',custoTotal:'Custo total',materiais:'Materiais utilizados',quantidade:'Quantidade',valor:'Valor',nome:'Nome',itens:'Itens',colunas:'Colunas',title:'Título',body:'Texto',subject:'Assunto',reason:'Motivo da reabertura',texto:'Mensagem',funcao:'Função',hotels:'Condomínios permitidos',tabs:'Abas permitidas',login:'E-mail',aba:'Tela',tipo:'Tipo',checklist:'Checklist',observacoes:'Observações',observacao:'Observação',excluir:'Excluir nota'};
  function reviewFields(value,parent,depth=0){
    if(depth>8)return;
    const dl=document.createElement('dl');dl.className='ai-review-fields';
    for(const [key,item]of Object.entries(value||{})){
      if(['version','remove','abertaEm','criadaEm','criadaPorLogin','criadaPor','owner_id'].includes(key)||item===null||item===undefined)continue;
      const block=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=fieldLabels[key]||key;
      if(item&&typeof item==='object'){
        const details=document.createElement('details');details.open=depth<1;
        const summary=document.createElement('summary');summary.textContent=Array.isArray(item)?`${item.length} item(ns)`:'Ver detalhes';details.append(summary);reviewFields(item,details,depth+1);dd.append(details);
      }else dd.textContent=typeof item==='boolean'?(item?'Sim':'Não'):String(item)||'Não informado';
      block.append(dt,dd);dl.append(block);
    }
    parent.append(dl);
  }
  function showAIActions(actions){
    const area=el('aiActions');area.replaceChildren();
    for(const action of actions||[]){
      const card=document.createElement('section');card.className='ai-action';
      const title=document.createElement('h3');title.textContent=action.summary;
      const notice=document.createElement('p');notice.className='workspace-hint';notice.textContent='Revise antes de confirmar. A proposta expira em 10 minutos e será descartada se você enviar um novo pedido.';
      const button=document.createElement('button');button.type='button';button.className='acao-principal ai-action-confirm';button.textContent='Confirmar ação';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='botao-secundario';cancel.textContent='Descartar';cancel.onclick=()=>{if(!aiBusy)card.remove();};
      const resultLabel=document.createElement('p');resultLabel.setAttribute('role','status');
      card.append(title,notice);reviewFields(action.preview,card);card.append(button,document.createTextNode(' '),cancel,resultLabel);
      button.onclick=async()=>{
        if(aiBusy)return;aiBusyState(true);button.disabled=true;cancel.disabled=true;resultLabel.textContent='Executando a ação confirmada…';
        try{
          const result=await BookAPI.request('/api/ai/actions',{method:'POST',body:JSON.stringify({id:action.id}),timeoutMs:120000});
          const receipt=`${result.summary}: execução confirmada${result.recordId?' · Registro #'+result.recordId:''}.`;
          resultLabel.textContent=receipt;button.hidden=true;cancel.hidden=true;
          if(aiMessages.at(-1)?.role==='assistant'){aiMessages.at(-1).content=(aiMessages.at(-1).content+'\n\nResultado confirmado pelo sistema: '+receipt).slice(-12000);renderAIThread();}
          if(result.credentials){
            const info=document.createElement('p');info.textContent='Conta criada. Guarde e compartilhe esta senha individualmente com a pessoa. Ela não será enviada à IA.';
            const credentials=document.createElement('pre');credentials.className='ai-credentials';credentials.textContent=`E-mail: ${result.credentials.login}\nSenha inicial: ${result.credentials.senha}`;card.append(info,credentials);
          }
          if(result.navigate){
            aiBusyState(false);close(el('aiDialog'));
            if(result.navigate==='notas')await openNotes();else if(result.navigate==='suporte'&&!user.mestre)await openSupport();else mostrarAba(result.navigate);
          }else{
            try{await BookStore.refresh(true);}catch{resultLabel.textContent+=' A gravação foi confirmada, mas atualize a tela para conferir os dados.';}
          }
        }catch(error){resultLabel.textContent=error.message;button.disabled=false;button.textContent='Conferir resultado';cancel.disabled=false;}
        finally{aiBusyState(false);}
      };
      area.append(card);
    }
  }
  function init(profile) {
    user=profile;
    const actions=document.createElement('div');actions.className='workspace-actions';
    for(const [target,label,fn] of [['aiDialog','IA',()=>openPanel(el('aiDialog'))],['supportDialog','Suporte',openSupport],['notesDialog','▤ Notas',openNotes]]){
      const button=document.createElement('button');button.type='button';button.className='botao-secundario';button.textContent=label;button.onclick=fn;button.dataset.workspaceTarget=target;button.setAttribute('aria-controls',target);button.setAttribute('aria-pressed','false');actions.append(button);
    }
    document.querySelector('header').append(actions);
    if(user.mestre){
      const controls=document.createElement('div');controls.className='support-controls';controls.innerHTML='<div class="cards support-totals"><article class="card"><h3>Total</h3><p id="supportTotal">—</p></article><article class="card"><h3>Abertos</h3><p id="supportOpen">—</p></article><article class="card"><h3>Fechados</h3><p id="supportClosed">—</p></article></div><label>Status nesta página<select id="masterSupportFilter"><option value="">Todos</option><option>Aberto</option><option>Fechado</option></select></label><div class="collaboration-pagination"><button id="masterSupportPrevious" type="button" class="botao-secundario">Anterior</button><button id="masterSupportNext" type="button" class="botao-secundario">Próxima</button></div>';
      el('masterSupportList').before(controls);el('masterSupportFilter').onchange=()=>{masterOffset=0;loadMaster();};el('masterSupportPrevious').onclick=()=>{masterOffset=Math.max(0,masterOffset-50);loadMaster();};el('masterSupportNext').onclick=()=>{masterOffset+=50;loadMaster();};
    }
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog:modal'))return;
      const active=Object.keys(panels).map(el).find(node=>node?.open);
      if(active){event.preventDefault();close(active);}
    });
    const ai=dialog('aiDialog','Assistente de IA','<form id="aiForm"><div class="ai-settings"><label>Serviço<select id="aiProvider"><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="claude">Claude</option></select></label><label>Modelo<input id="aiModel" maxlength="100" value="gpt-4.1-mini" required></label><label>Sua chave de API<input id="aiKey" type="password" minlength="16" maxlength="512" autocomplete="off" required></label></div><p class="workspace-hint">A API tem cobrança própria, separada da assinatura do aplicativo de IA. A chave não é salva e é apagada ao fechar. Apenas as mensagens desta conversa são enviadas ao provedor escolhido. O histórico fica nesta página até recarregá-la.</p><div id="aiThread" class="workspace-thread" aria-live="polite"></div><label>Mensagem<textarea id="aiPrompt" rows="3" maxlength="4000" required></textarea></label><button id="aiSend" type="submit" class="acao-principal">Enviar</button> <button id="aiNew" type="button" class="botao-secundario">Nova conversa</button></form>');
    const capabilities=document.createElement('p');capabilities.className='workspace-hint';capabilities.textContent='O assistente pode consultar dados autorizados e preparar ações no sistema. Qualquer gravação será mostrada para sua revisão e confirmação.';
    const actionArea=document.createElement('div');actionArea.id='aiActions';el('aiThread').after(capabilities,actionArea);
    ai.querySelector('.workspace-hint').textContent='Use a sua chave de API, com cobrança própria no provedor. A chave não é salva e é apagada ao fechar. As mensagens e os dados consultados pelas ferramentas são enviados somente ao provedor escolhido. O histórico fica nesta página até recarregá-la.';
    const connection=document.createElement('details');connection.id='aiConnection';connection.className='workspace-connection';connection.open=true;
    const connectionTitle=document.createElement('summary');connectionTitle.textContent='Conexão com a IA';connection.append(connectionTitle);
    const settings=ai.querySelector('.ai-settings'),connectionHint=ai.querySelector('.workspace-hint');settings.before(connection);connection.append(settings,connectionHint);
    el('aiNew').onclick=()=>{if(aiBusy)return;aiMessages=[];el('aiThread').replaceChildren();el('aiActions').replaceChildren();el('aiPrompt').value='';};
    el('aiProvider').onchange=()=>{aiMessages=[];el('aiThread').replaceChildren();el('aiActions').replaceChildren();el('aiKey').value='';el('aiModel').value={openai:'gpt-4.1-mini',gemini:'gemini-2.5-flash',claude:'claude-sonnet-4-5'}[el('aiProvider').value];};
    el('aiForm').onsubmit=async event=>{
      event.preventDefault();if(aiBusy)return;aiBusyState(true);el('aiActions').replaceChildren();
      const text=el('aiPrompt').value.trim(),status=ai.querySelector('.workspace-status');status.textContent='A IA está respondendo…';
      const pending=[...aiMessages,{role:'user',content:text}].slice(-19);
      try{
        const result=await BookAPI.request('/api/ai',{method:'POST',body:JSON.stringify({provider:el('aiProvider').value,model:el('aiModel').value.trim(),apiKey:el('aiKey').value.trim(),messages:pending}),timeoutMs:150000});
        aiMessages=[...pending,{role:'assistant',content:result.answer}];el('aiPrompt').value='';
        connection.open=false;
        renderAIThread();showAIActions(result.actions);status.textContent=result.actions?.length?'Ações preparadas; nenhuma gravação foi feita. Revise e confirme abaixo.':'Resposta recebida. Nenhuma alteração foi executada no site.';
      }catch(error){status.textContent=error.message;}finally{aiBusyState(false);}
    };
    dialog('notesDialog','Minhas notas','<div class="workspace-split"><aside><button type="button" id="noteNew" class="acao-principal">+ Nova nota</button><div id="notesList" class="workspace-list"></div></aside><form id="notesForm"><label>Título<input id="noteTitle" maxlength="120" required></label><label>Texto<textarea id="noteBody" maxlength="20000" rows="12"></textarea></label><button type="submit" class="acao-principal">Salvar nota</button> <button type="button" id="noteDelete" class="botao-secundario" hidden>Excluir nota</button></form></div>');
    el('noteNew').onclick=()=>editNote();el('notesForm').onsubmit=e=>{e.preventDefault();saveNote();};
    el('notesForm').oninput=()=>{dirty=true;el('notesDialog').querySelector('.workspace-status').textContent='Alterações não salvas.';};el('noteDelete').onclick=()=>saveNote(true);
    dialog('supportDialog','Suporte ao sistema','<div class="workspace-split"><aside><button type="button" id="supportNew" class="acao-principal">+ Abrir chamado</button><button type="button" id="supportRefresh" class="botao-secundario">Atualizar</button><div id="supportList" class="workspace-list"></div><button type="button" id="supportMore" class="botao-secundario" hidden>Carregar mais</button></aside><form id="supportForm"><label>Assunto<input id="supportSubject" maxlength="120" required></label><div id="supportThread" class="workspace-thread"></div><label>Mensagem<textarea id="supportBody" maxlength="4000" rows="3" required></textarea></label><button id="supportSend" type="submit" class="acao-principal">Enviar mensagem</button> <button type="button" id="supportToggle" class="botao-secundario" hidden>Fechar chamado</button></form></div>');
    el('supportNew').onclick=newTicket;el('supportForm').onsubmit=e=>{e.preventDefault();sendSupport();};
    el('supportToggle').onclick=()=>sendSupport(ticket?.status==='Aberto'?'Fechado':'Aberto');
    el('supportRefresh').onclick=async()=>{try{await loadTickets();if(ticket)await selectTicket(ticket.id,true);}catch(error){el('supportDialog').querySelector('.workspace-status').textContent=error.message;}};
    el('supportMore').onclick=async()=>{try{await loadTickets(false);}catch(error){el('supportDialog').querySelector('.workspace-status').textContent=error.message;}};
    setInterval(async()=>{
      if(!el('supportDialog').open||document.hidden||saving||supportRefreshing)return;
      supportRefreshing=true;
      try{if(ticket)await selectTicket(ticket.id,true);else await loadTickets();}
      catch{}finally{supportRefreshing=false;}
    },15000);
    for(const tab of Object.keys(labels)){
      const suffix=tab==='os'?'OS':tab[0].toUpperCase()+tab.slice(1);const button=el('aba'+suffix);if(button)button.hidden=!can(tab);
    }
    if(user.mestre){
      const nav=document.createElement('button');nav.id='abaSuporte';nav.className='aba';nav.textContent='Suporte';nav.onclick=()=>mostrarAba('suporte');document.querySelector('nav').append(nav);
    }
  }
  async function openTicket(id){await openSupport();if(id)await selectTicket(id);}
  return {labels,can,init,openNotes,openSupport,openTicket,loadMaster};
})();
