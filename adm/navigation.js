window.BookNavigation=(()=>{
 const groups=[
  ['atendimento','Atendimento',['chamados','chat','feedbacks']],
  ['operacao','Operação',['os','vistorias','danos']],
  ['imoveis','Imóveis e reservas',['condominios','reservas','onboarding']],
  ['gestao','Gestão e recursos',['compras','estoque','financeiro','projetos']],
  ['equipe','Equipe e sistema',['avaliacoes','usuarios','suporte','backup']]
 ];
 const items=new Map();let nav;
 const tabButton=tab=>document.getElementById('aba'+(tab==='os'?'OS':tab[0].toUpperCase()+tab.slice(1)));
 function activate(tab){
  if(!nav)return;
  for(const [details,tabs]of items){
   const selected=tabs.includes(tab);details.open=selected;details.classList.toggle('nav-group-active',selected);
  }
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
   details.addEventListener('toggle',()=>{if(details.open)for(const other of items.keys())if(other!==details)other.open=false;});
   summary.addEventListener('keydown',event=>{
    if(event.key==='Escape'){details.open=false;summary.focus();}
   });
   list.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();details.open=false;summary.focus();}});
  }
 }
 return {init,activate};
})();
