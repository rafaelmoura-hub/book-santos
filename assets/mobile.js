/* Mobile shell uses existing actions and permissions; no parallel data store. */
window.BookMobile=(()=>{
 const small=()=>matchMedia('(max-width:760px)').matches;
 const paths={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',ticket:'M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4Z',cards:'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5',chat:'M3 4h18v13H8l-5 4Z',more:'M5 12h.01M12 12h.01M19 12h.01',bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4',plus:'M12 4v16M4 12h16',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 8 0 0 1 16 0v2'};
 let bottom,profileDialog,clientView='home',clientRoot;
 function icon(key){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('mobile-icon');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[key]||paths.cards);svg.append(p);return svg;}
 function action(label,key,fn){const button=document.createElement('button');button.type='button';button.append(icon(key),document.createTextNode(label));button.onclick=fn;return button;}
 function profile(){try{return JSON.parse(BookStore.getItem('usuarioLogado')||'{}');}catch{return {};}}
 function header(){
  const node=document.querySelector('body > header');if(!node||node.querySelector('.mobile-profile'))return;
  const user=profile(),name=user.nome||'Minha conta';
  const avatar=document.createElement('button');avatar.type='button';avatar.className='mobile-profile';avatar.textContent=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toLocaleUpperCase('pt-BR');avatar.setAttribute('aria-label','Minha conta: '+name);avatar.setAttribute('aria-haspopup','dialog');
  profileDialog=document.createElement('dialog');profileDialog.className='mobile-account';profileDialog.setAttribute('aria-labelledby','mobileAccountTitle');
  const title=document.createElement('h2');title.id='mobileAccountTitle';title.textContent='Minha conta';const person=document.createElement('p');person.textContent=name;const email=document.createElement('p');email.textContent=user.login||'';
  const close=action('Voltar','home',()=>profileDialog.close()),logout=action('Sair da conta','user',()=>{profileDialog.close();document.querySelector('body > header > button[data-on-click="sair()"]')?.click();});
  profileDialog.append(title,person,email,close,logout);document.body.append(profileDialog);avatar.onclick=()=>profileDialog.showModal();node.append(avatar);
  const notices=document.getElementById('notificationsToggle');if(notices){const label=document.createElement('span');label.className='mobile-notification-label';label.textContent='Avisos';const badges=[...notices.querySelectorAll('.workspace-badge')];notices.replaceChildren(icon('bell'),label,...badges);notices.setAttribute('aria-label','Avisos');}
 }
 function createBottom(entries){bottom=document.createElement('nav');bottom.className='mobile-bottom';bottom.setAttribute('aria-label','Atalhos do celular');for(const [key,label,glyph,fn]of entries){const b=action(label,glyph,fn);b.dataset.mobileTab=key;bottom.append(b);}document.body.append(bottom);return bottom;}
 function mark(key){bottom?.querySelectorAll('button').forEach(b=>{if(b.dataset.mobileTab===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
 function initAdmin(options){
  header();const nav=document.querySelector('body > nav.grouped-navigation');
  const allowed=tab=>{const b=options.button(tab);return b&&!b.hidden;};
  const go=tab=>{options.button(tab)?.click();if(small()){scrollTo({top:0,behavior:'instant'});document.querySelector('main')?.focus({preventScroll:true});}};
  const home=allowed('dashboard')?'dashboard':allowed('chamados')?'chamados':null;
  const activeKey=tab=>tab===home||tab==='inicio'?'home':['chamados','os'].includes(tab)?tab:'more';
  createBottom([['home','Início','home',()=>home?go(home):options.home()],['chamados','Chamados','ticket',()=>go('chamados')],['os','Cards','cards',()=>go('os')],['more','Mais','more',()=>options.toggle()]]);
  bottom.querySelector('[data-mobile-tab="more"]').setAttribute('aria-controls',nav.id);
  bottom.querySelector('[data-mobile-tab="more"]').setAttribute('aria-expanded','false');
  bottom.querySelector('[data-mobile-tab="chamados"]').hidden=!allowed('chamados');bottom.querySelector('[data-mobile-tab="os"]').hidden=!allowed('os');
  const heading=document.createElement('div');heading.className='mobile-more-heading';const h=document.createElement('h2');h.textContent='Mais';const p=document.createElement('p');p.textContent='Acessos da sua operação';heading.append(h,p);nav.prepend(heading);
  const tools=document.createElement('section');tools.className='mobile-more-tools';tools.setAttribute('aria-label','Ferramentas pessoais');
  for(const [target,label,glyph]of [['aiDialog','Assistente IA','cards'],['notesDialog','Minhas notas e lembretes','cards'],['supportDialog','Falar com o suporte','chat']]){
   const original=document.querySelector('.workspace-actions [data-workspace-target="'+target+'"]');if(original)tools.append(action(label,glyph,()=>{options.close();original.click();}));
  }
  if(window.BookAccount)tools.append(action('Seguran\u00e7a da conta','user',()=>{options.close();BookAccount.security();}));
  tools.append(action('Ir para uma aba','more',()=>{options.close();document.querySelector('.layout-search-button').click();}),action('Minha conta','user',()=>{options.close();profileDialog.showModal();}));nav.append(tools);
  // Fixed navigation stays below all modal and editing surfaces.
  return {activate(tab){mark(activeKey(tab));},menu(open){bottom.querySelector('[data-mobile-tab="more"]').setAttribute('aria-expanded',String(open));if(open)mark('more');else{const selected=nav.querySelector('.aba.ativa');mark(activeKey(selected?.id==='abaDashboard'?'dashboard':selected?.id==='abaChamados'?'chamados':selected?.id==='abaOS'?'os':'other'));}},contains:node=>bottom.contains(node)};
 }
 function showClient(view){clientView=view;if(!document.getElementById('chatCliente').hidden)alternarChatCliente();document.body.dataset.clientView=view;mark(view);if(small()){scrollTo({top:0,behavior:'instant'});const target=view==='form'?document.getElementById('clientFormTitle'):view==='tickets'?document.getElementById('clientTicketsTitle'):document.getElementById('clientHomeTitle');target?.focus({preventScroll:true});}}
 function updateClient(){if(!clientRoot)return;const user=profile();let rows=[];try{rows=JSON.parse(BookStore.getItem('chamados')||'[]').filter(r=>r.criadaPorLogin===user.login);}catch{}
  const values={total:rows.length,open:rows.filter(r=>r.status!=='Fechado').length,closed:rows.filter(r=>r.status==='Fechado').length};for(const [key,value]of Object.entries(values))document.getElementById('clientCount-'+key).textContent=String(value);
  document.getElementById('clientWelcomeName').textContent=user.nome||'Minha conta';
 }
 function initClient(){
  header();const main=document.querySelector('main'),panels=main.querySelectorAll('.client-panel');panels[0].dataset.clientPanel='form';panels[1].dataset.clientPanel='tickets';panels[0].querySelector('h2').id='clientFormTitle';panels[1].querySelector('h2').id='clientTicketsTitle';for(const panel of panels)panel.querySelector('h2').tabIndex=-1;
  clientRoot=document.createElement('section');clientRoot.className='client-mobile-home';clientRoot.innerHTML='<h2 id="clientHomeTitle" tabindex="-1">Minha área</h2><p>Seus chamados e atendimento, em um só lugar.</p><article class="client-identity"><h3 id="clientWelcomeName"></h3><p>Portal do cliente</p></article><div class="client-quick-actions"></div><section class="client-totals"><h3>Seus chamados</h3><p>Registros disponíveis para sua conta</p><div class="mobile-counts"><article><strong id="clientCount-total">0</strong><span>Total</span></article><article><strong id="clientCount-open">0</strong><span>Abertos</span></article><article><strong id="clientCount-closed">0</strong><span>Fechados</span></article></div></section>';main.prepend(clientRoot);
  clientRoot.querySelector('.client-quick-actions').append(action('Abrir chamado','plus',()=>showClient('form')),action('Meus chamados','ticket',()=>showClient('tickets')));
  const more=document.createElement('dialog');more.className='mobile-account';more.setAttribute('aria-labelledby','clientMoreTitle');const h=document.createElement('h2');h.id='clientMoreTitle';h.textContent='Mais';more.append(h,action('Minha conta','user',()=>{more.close();profileDialog.showModal();}),action('Chat de suporte','chat',()=>{more.close();if(document.getElementById('chatCliente').hidden)alternarChatCliente();}),action('Voltar','home',()=>more.close()));document.body.append(more);
  createBottom([['home','Início','home',()=>showClient('home')],['tickets','Chamados','ticket',()=>showClient('tickets')],['chat','Chat','chat',()=>{if(document.getElementById('chatCliente').hidden)alternarChatCliente();}],['more','Mais','more',()=>{mark('more');more.showModal();}]]);
  const sync=()=>mark(document.getElementById('chatCliente').hidden?clientView:'chat');
  new MutationObserver(sync).observe(document.getElementById('chatCliente'),{attributes:true,attributeFilter:['hidden']});more.addEventListener('close',sync);
  showClient(clientView);updateClient();window.addEventListener('book:data',updateClient);
 }
 return {initAdmin,initClient};
})();
