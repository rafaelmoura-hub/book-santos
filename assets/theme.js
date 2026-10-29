/* The only persisted value is a display preference: light or dark. */
(() => {
 // Cross-document transitions keep normal navigation and authentication intact.
 const isLogin=url=>{try{return ['/','/login.html'].includes(new URL(url,location.href).pathname);}catch{return false;}};
 const isPanel=url=>{try{return ['/adm/admin.html','/cliente/cliente.html'].includes(new URL(url,location.href).pathname);}catch{return false;}};
 const allowSkippedTransition=transition=>{
  if(transition)for(const promise of [transition.ready,transition.finished,transition.updateCallbackDone])promise?.catch(()=>{});
 };
 window.addEventListener('pageswap',event=>{
  allowSkippedTransition(event.viewTransition); // Navigation still works when the browser skips the visual effect.
  if(event.viewTransition&&isLogin(location.href)&&isPanel(event.activation?.entry?.url))event.viewTransition.types.add('login');
 });
 window.addEventListener('pagereveal',event=>{
  allowSkippedTransition(event.viewTransition);
  if(event.viewTransition&&isPanel(location.href)&&isLogin(window.navigation?.activation?.from?.url))event.viewTransition.types.add('login');
 });
 const key='book:theme',system=window.matchMedia('(prefers-color-scheme: dark)');
 let preference=null;
 try{const saved=localStorage.getItem(key);if(saved==='light'||saved==='dark')preference=saved;}catch{}
 const current=()=>preference||(system.matches?'dark':'light');
 function apply(){
  const dark=current()==='dark';document.documentElement.dataset.theme=dark?'dark':'light';
  const button=document.getElementById('themeToggle');
  if(button){
   const label=dark?'Modo diurno':'Modo noturno';
   button.setAttribute('data-dark',String(dark));button.title='Ativar '+label.toLowerCase();
   button.querySelector('.theme-label').textContent=label;
   button.querySelector('.theme-icon').textContent=dark?'☀':'☾';
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#081824':'#042d46');
  window.dispatchEvent(new Event('book:theme'));
 }
 apply();
 function init(){
  if(document.getElementById('themeToggle'))return;
  const button=document.createElement('button');button.id='themeToggle';button.type='button';button.className='theme-toggle';
  const icon=document.createElement('span');icon.textContent='☾';icon.setAttribute('aria-hidden','true');icon.className='theme-icon';
  const label=document.createElement('span');label.textContent='Modo noturno';label.className='theme-label';button.append(icon,label);
  button.onclick=()=>{preference=current()==='dark'?'light':'dark';try{localStorage.setItem(key,preference);}catch{}apply();};
  const header=document.querySelector('body > header');if(header)header.append(button);else{button.classList.add('theme-floating');document.body.prepend(button);}apply();
 }
 system.addEventListener('change',()=>{if(!preference)apply();});
 window.addEventListener('storage',event=>{if(event.key===key){preference=['light','dark'].includes(event.newValue)?event.newValue:null;apply();}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
