window.BookWorkspace = (() => {
  const labels = {chamados:'Chamados',chat:'Chat',os:'Cards',vistorias:'Vistorias',condominios:'Condomínios',estoque:'Estoque',financeiro:'Financeiro',dashboard:'Visão geral'};
  let user, notes=[], note=null, tickets=[], ticket=null, offset=0, dirty=false, saving=false;
  let aiMessages=[],aiBusy=false;
  let supportRequest=0,supportRefreshing=false;
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const can = tab => !!user?.mestre || (user?.tabs ?? Object.keys(labels)).includes(tab);
  async function request(route, body) { return BookAPI.request(route, body ? {method:'POST',body:JSON.stringify(body)} : {}); }
  function dialog(id, title, body) {
    const node = document.createElement('dialog');node.id=id;node.className='workspace-dialog';
    node.innerHTML=`<div class="workspace-heading"><h2>${title}</h2><button type="button" class="botao-secundario" aria-label="Fechar">Fechar</button></div>${body}<p class="workspace-status" role="status"></p>`;
    node.querySelector('.workspace-heading button').onclick=()=>close(node);
    node.addEventListener('cancel',event=>{event.preventDefault();close(node);});document.body.append(node);return node;
  }
  function close(node) {
    if(saving)return;
    if(node.id==='notesDialog'&&dirty&&!confirm('Fechar sem salvar as alterações desta nota?'))return;
    if(node.id==='supportDialog'&&el('supportBody')?.value.trim()&&!confirm('Descartar a mensagem ainda não enviada?'))return;
    if(node.id==='aiDialog'){if(aiBusy)return;el('aiKey').value='';}
    node.close();
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
  }
  async function loadNotes() {
    notes=await request('/api/workspace/notes');
    el('notesList').replaceChildren(...notes.map(item=>{
      const button=document.createElement('button');button.type='button';button.textContent=item.title;button.onclick=()=>editNote(item);return button;
    }));
    if(!notes.length)el('notesList').textContent='Nenhuma nota salva.';
  }
  async function openNotes() {
    const node=el('notesDialog');if(node.open)return;node.showModal();node.querySelector('.workspace-status').textContent='Carregando notas…';
    try{await loadNotes();dirty=false;editNote(notes[0]);node.querySelector('.workspace-status').textContent='Notas privadas, salvas na sua conta.';}
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
    }catch(error){el('supportDialog').querySelector('.workspace-status').textContent=error.message;throw error;}
  }
  async function openSupport() {
    const node=el('supportDialog');if(node.open)return;node.showModal();newTicket();
    try{await loadTickets();node.querySelector('.workspace-status').textContent=user.mestre?'Chamados dos administradores.':'Conversa privada entre você e o mestre.';}
    catch(error){node.querySelector('.workspace-status').textContent=error.message;}
  }
  async function sendSupport(status) {
    if(!status&&!el('supportForm').reportValidity())return;
    const data={id:ticket?.id||crypto.randomUUID(),version:ticket?.version||0,subject:el('supportSubject').value.trim(),body:status?'':el('supportBody').value.trim(),...(status?{status}:{})};
    if(status&&el('supportBody').value.trim()){alert('Envie ou apague a mensagem antes de alterar o status.');return;}
    await run(el('supportDialog'),async()=>{await request('/api/workspace/support',data);el('supportBody').value='';await loadTickets();await selectTicket(data.id);});
  }
  async function loadMaster() {
    if(!user?.mestre)return;
    const node=el('masterSupportList');node.textContent='Carregando…';
    try{const rows=await request('/api/workspace/support');node.replaceChildren(...rows.slice(0,50).map(item=>{
      const button=document.createElement('button');button.className='chamado support-card';button.textContent=`${item.subject} · ${item.owner_name} · ${item.status}`;
      button.onclick=async()=>{await openSupport();await selectTicket(item.id);};return button;
    }));if(!rows.length)node.textContent='Nenhum chamado de suporte. Todos os chamados podem ser consultados no botão Suporte do topo.';}
    catch(error){node.textContent=error.message;}
  }
  function init(profile) {
    user=profile;
    const actions=document.createElement('div');actions.className='workspace-actions';
    for(const [label,fn] of [['IA',()=>el('aiDialog').showModal()],['Suporte',openSupport],['▤ Notas',openNotes]]){
      const button=document.createElement('button');button.type='button';button.className='botao-secundario';button.textContent=label;button.onclick=fn;actions.append(button);
    }
    document.querySelector('header').append(actions);
    const ai=dialog('aiDialog','Assistente de IA','<form id="aiForm"><div class="ai-settings"><label>Serviço<select id="aiProvider"><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="claude">Claude</option></select></label><label>Modelo<input id="aiModel" maxlength="100" value="gpt-4.1-mini" required></label><label>Sua chave de API<input id="aiKey" type="password" minlength="16" maxlength="512" autocomplete="off" required></label></div><p class="workspace-hint">A API tem cobrança própria, separada da assinatura do aplicativo de IA. A chave não é salva e é apagada ao fechar. Apenas as mensagens desta conversa são enviadas ao provedor escolhido. O histórico fica nesta página até recarregá-la.</p><div id="aiThread" class="workspace-thread" aria-live="polite"></div><label>Mensagem<textarea id="aiPrompt" rows="3" maxlength="4000" required></textarea></label><button id="aiSend" type="submit" class="acao-principal">Enviar</button> <button id="aiNew" type="button" class="botao-secundario">Nova conversa</button></form>');
    el('aiNew').onclick=()=>{if(aiBusy)return;aiMessages=[];el('aiThread').replaceChildren();el('aiPrompt').value='';};
    el('aiProvider').onchange=()=>{aiMessages=[];el('aiThread').replaceChildren();el('aiKey').value='';el('aiModel').value={openai:'gpt-4.1-mini',gemini:'gemini-2.5-flash',claude:'claude-sonnet-4-5'}[el('aiProvider').value];};
    el('aiForm').onsubmit=async event=>{
      event.preventDefault();if(aiBusy)return;aiBusy=true;el('aiSend').disabled=true;el('aiProvider').disabled=true;el('aiNew').disabled=true;
      const text=el('aiPrompt').value.trim(),status=ai.querySelector('.workspace-status');status.textContent='A IA está respondendo…';
      const pending=[...aiMessages,{role:'user',content:text}].slice(-19);
      try{
        const result=await BookAPI.request('/api/ai',{method:'POST',body:JSON.stringify({provider:el('aiProvider').value,model:el('aiModel').value.trim(),apiKey:el('aiKey').value.trim(),messages:pending}),timeoutMs:70000});
        aiMessages=[...pending,{role:'assistant',content:result.answer}];el('aiPrompt').value='';
        el('aiThread').innerHTML=aiMessages.map(m=>`<article class="mensagem-chat ${m.role==='user'?'minha-mensagem':''}"><strong>${m.role==='user'?'Você':'Assistente'}</strong><p>${esc(m.content)}</p></article>`).join('');el('aiThread').scrollTop=el('aiThread').scrollHeight;status.textContent='Resposta recebida. Confira as informações antes de usá-las.';
      }catch(error){status.textContent=error.message;}finally{aiBusy=false;el('aiSend').disabled=false;el('aiProvider').disabled=false;el('aiNew').disabled=false;}
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
  return {labels,can,init,openNotes,openSupport,loadMaster};
})();
