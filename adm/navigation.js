window.BookNavigation=(()=>{
 const groups=[
  ['atendimento','Atendimento',['chamados','chat','feedbacks']],
  ['operacao','Operação',['os','vistorias','danos']],
  ['imoveis','Imóveis',['condominios','onboarding']],
  ['gestao','Gestão',['estoque','financeiro']],
  ['equipe','Equipe e sistema',['avaliacoes','usuarios','suporte','backup']]
 ];
 const items=new Map();let nav,breadcrumb,command,menuToggle;
 const desktop=()=>window.matchMedia('(min-width:1051px)').matches;
 const paths={dashboard:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',chamados:'M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4Z',chat:'M3 4h18v13H8l-5 4Z',feedbacks:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',os:'M4 4h16v16H4ZM8 8h8M8 12h8M8 16h5',vistorias:'M8 5H4v16h16V5h-4M8 3h8v4H8Zm0 11 3 3 6-7',danos:'m4 20 8-8M15 3a5 5 0 0 0-3 8l-9 9 2 2 9-9a5 5 0 0 0 7-6l-4 4-4-4 4-4Z',condominios:'M5 21V3h14v18M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3',onboarding:'M3 10 12 3l9 7M5 9v12h14V9M12 12v6m-3-3h6',estoque:'m3 7 9-4 9 4-9 5Zm0 0v10l9 4 9-4V7M12 12v9',financeiro:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3ZM4 6v12c0 2 4 3 8 3s8-1 8-3V6M4 12c0 2 4 3 8 3s8-1 8-3',avaliacoes:'M4 21v-8h4v8M10 21V7h4v14M16 21V3h4v18',usuarios:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a6 6 0 0 1 12 0v3M17 4a4 4 0 0 1 0 8m0 3a5 5 0 0 1 5 5v1',suporte:'M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v7h4v-7Zm16 0h2v7h-4v-7ZM18 20l-4 2h-3',backup:'M5 4h14l3 11v5H2v-5Zm-3 11h20M17 18h2'};
 function icon(tab){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('nav-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[tab]||paths.os);svg.append(path);return svg;}
 function closeMenu(){document.body.classList.remove('layout-nav-open');menuToggle?.setAttribute('aria-expanded','false');}
 function initShell(){
  const header=document.querySelector('body > header');if(!header)return;
  menuToggle=document.createElement('button');menuToggle.type='button';menuToggle.className='layout-menu-toggle';menuToggle.textContent='☰ Menu';menuToggle.setAttribute('aria-expanded','false');nav.id='principalNavigation';menuToggle.setAttribute('aria-controls',nav.id);menuToggle.onclick=()=>{const open=document.body.classList.toggle('layout-nav-open');menuToggle.setAttribute('aria-expanded',String(open));if(open)nav.querySelector('.aba:not([hidden])')?.focus();};
  const close=document.createElement('button');close.type='button';close.className='layout-nav-close';close.textContent='Fechar menu';close.onclick=()=>{closeMenu();menuToggle.focus();};nav.prepend(close);
  breadcrumb=document.createElement('div');breadcrumb.className='layout-breadcrumb';breadcrumb.setAttribute('aria-label','Localização atual');
  const search=document.createElement('button');search.type='button';search.className='layout-search-button';search.textContent='⌕ Ir para uma aba';search.setAttribute('aria-haspopup','dialog');const key=document.createElement('kbd');key.textContent='Ctrl K';search.append(key);
  command=document.createElement('dialog');command.className='layout-command';command.setAttribute('aria-labelledby','layoutCommandTitle');const heading=document.createElement('h2');heading.id='layoutCommandTitle';heading.textContent='Ir para uma aba';const cancel=document.createElement('button');cancel.type='button';cancel.className='botao-secundario';cancel.textContent='Fechar';cancel.onclick=()=>command.close();const input=document.createElement('input');input.type='search';input.placeholder='Buscar uma aba…';input.setAttribute('aria-label','Buscar uma aba');const results=document.createElement('div');results.className='layout-command-results';
  const sync=document.querySelector('body > .sync-toolbar');if(sync)header.after(sync);
  const render=()=>{const filter=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');const buttons=[...nav.querySelectorAll('.aba:not([hidden])')].filter(b=>b.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(filter));results.replaceChildren(...buttons.map(b=>{const option=document.createElement('button');option.type='button';option.textContent=b.textContent;option.onclick=()=>{command.close();b.click();document.querySelector('main')?.focus({preventScroll:true});};return option;}));if(!buttons.length)results.textContent='Nenhuma aba encontrada.';};
  const open=()=>{input.value='';render();command.showModal();input.focus();};input.oninput=render;search.onclick=open;command.append(heading,cancel,input,results);document.body.append(command);header.prepend(menuToggle,breadcrumb,search);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')&&!document.querySelector('.modal[style*="display: block"]')){e.preventDefault();open();}if(e.key==='Escape'&&document.body.classList.contains('layout-nav-open')){closeMenu();menuToggle.focus();}});
  document.addEventListener('click',e=>{if(document.body.classList.contains('layout-nav-open')&&!nav.contains(e.target)&&!menuToggle.contains(e.target))closeMenu();});
 }
 const tabButton=tab=>document.getElementById('aba'+(tab==='os'?'OS':tab[0].toUpperCase()+tab.slice(1)));
 function activate(tab){
  if(!nav)return;
  for(const [details,tabs]of items){
   const selected=tabs.includes(tab);details.open=desktop()||selected;details.classList.toggle('nav-group-active',selected);
  }
  if(breadcrumb){const group=groups.find(g=>g[2].includes(tab));const home=document.createElement('span');home.textContent='⌂';home.setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='layout-group';label.textContent=group?group[1]+' ›':'';const current=document.createElement('strong');current.textContent=tabButton(tab)?.textContent||'Seu acesso';breadcrumb.replaceChildren(home,label,current);}
  closeMenu();
 }
 function init(){
  nav=document.querySelector('body > nav');if(!nav)return;
  nav.classList.add('grouped-navigation');
  const overview=tabButton('dashboard');if(overview)nav.prepend(overview);
  for(const [key,title,tabs]of groups){
   const buttons=tabs.map(tabButton).filter(Boolean);
   if(!buttons.some(button=>!button.hidden))continue;
   const details=document.createElement('details');details.className='nav-group';details.id='menu-'+key;
   const summary=document.createElement('summary');summary.textContent=title;
   const list=document.createElement('div');list.className='nav-group-items';list.setAttribute('role','group');list.setAttribute('aria-label',title);
   list.append(...buttons);details.append(summary,list);nav.append(details);items.set(details,tabs);
   details.open=desktop();
   summary.addEventListener('keydown',event=>{
    if(event.key==='Escape'){details.open=false;summary.focus();}
   });
   list.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();details.open=false;summary.focus();}});
  }
  for(const tab of ['dashboard',...groups.flatMap(g=>g[2])]){const button=tabButton(tab);if(button)button.prepend(icon(tab));}
  initShell();
  const hotelList=document.querySelector('#visaoCondominios .hoteis'),history=document.getElementById('historico');
  if(hotelList&&history){const columns=document.createElement('div');columns.className='layout-properties';hotelList.before(columns);columns.append(hotelList,history);}
 }
 return {init,activate};
})();
