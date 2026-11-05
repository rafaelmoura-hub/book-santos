window.BookAccount=(()=>{
 const req=(path,data)=>BookAPI.request('/api/auth/'+path,{method:'POST',body:JSON.stringify(data)});
 let dialog,mode,working=false;
 function open(title){
  if(dialog?.open)return null;dialog=document.createElement('dialog');dialog.className='mobile-account account-dialog';dialog.setAttribute('aria-labelledby','accountDialogTitle');
  const h=document.createElement('h2');h.id='accountDialogTitle';h.textContent=title;dialog.append(h);document.body.append(dialog);
  dialog.addEventListener('close',event=>{event.currentTarget.remove();});dialog.showModal();return dialog;
 }
 function field(parent,label,type='text'){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type=type;input.required=true;input.autocomplete=type==='password'?'new-password':type==='email'?'email':'one-time-code';wrap.append(input);parent.append(wrap);return input;}
 function button(parent,text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;parent.append(b);return b;}
 function status(parent){const p=document.createElement('p');p.setAttribute('role','status');parent.append(p);return p;}
 async function run(node,message,fn){if(working)return;working=true;node.setAttribute('aria-busy','true');const controls=[...node.querySelectorAll('button,input')];controls.forEach(c=>c.disabled=true);try{await fn();}catch(e){message.textContent=e.message;}finally{working=false;controls.forEach(c=>c.disabled=false);node.setAttribute('aria-busy','false');}}
 function redirect(user){location.href=user.funcao==='adm'?'/adm/admin.html':'/cliente/cliente.html';}
 function recovery(){const node=open('Recuperar acesso');if(!node)return;const explanation=document.createElement('p');explanation.textContent='Solicite o código enviado ao seu e-mail e escolha uma nova senha.';node.append(explanation);
  const form=document.createElement('form');node.append(form);const email=field(form,'E-mail','email');email.maxLength=254;const send=button(form,'Enviar código',()=>{if(!email.reportValidity())return;run(node,message,async()=>{const result=await req('recovery',{email:email.value.trim()});message.textContent=result.message;});});
  const code=field(form,'Código recebido por e-mail');code.inputMode='numeric';code.pattern='[0-9]{6,10}';code.maxLength=10;const password=field(form,'Nova senha (12 a 100 caracteres)','password');password.minLength=12;password.maxLength=100;
  const mfaCode=field(form,'C\u00f3digo do autenticador (se ativado)');mfaCode.required=false;mfaCode.pattern='[0-9]{6}';mfaCode.inputMode='numeric';
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Salvar nova senha';form.append(submit);const message=status(node);form.onsubmit=e=>{e.preventDefault();run(node,message,async()=>{await req('recovery/complete',{email:email.value.trim(),code:code.value.trim(),password:password.value,mfaCode:mfaCode.value});form.remove();message.textContent='Senha atualizada. Entre novamente com a nova senha.';});};button(node,'Voltar',()=>node.close());
 }
 function challenge(state){const node=open(state.mfaEnrollRequired?'Ativar verificação em duas etapas':'Verificação em duas etapas');if(!node)return;mode=state.mfaEnrollRequired?'confirm':'verify';
  const info=document.createElement('p');info.textContent=state.mfaEnrollRequired?'Cadastre a chave no seu aplicativo autenticador. Depois, informe o código de 6 dígitos.':'Informe o código do seu aplicativo autenticador.';node.append(info);
  const secret=document.createElement('p');secret.className='account-secret';node.append(secret);const form=document.createElement('form');node.append(form);const code=field(form,'Código do autenticador');code.pattern='[0-9]{6}';code.maxLength=6;code.inputMode='numeric';
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Confirmar código';form.append(submit);const message=status(node);
  if(state.mfaEnrollRequired){submit.disabled=true;button(node,'Gerar chave de configuração',()=>run(node,message,async()=>{const result=await req('mfa/enroll',{});secret.textContent=result.secret;message.textContent='Guarde o acesso ao seu autenticador em local seguro.';submit.disabled=false;}));}
  form.onsubmit=e=>{e.preventDefault();run(node,message,async()=>{const user=await req('mfa/'+mode,{code:code.value});secret.textContent='';redirect(user);});};
  const cancel=()=>run(node,message,async()=>{await req('mfa/cancel',{});secret.textContent='';node.close();});
  node.addEventListener('cancel',e=>{e.preventDefault();if(!working)cancel();});button(node,'Cancelar',cancel);
 }
 async function security(){const node=open('Segurança da conta');if(!node)return;const message=status(node);try{const state=await BookAPI.request('/api/auth/security');message.textContent=state.mfaEnabled?'Verificação em duas etapas ativa. O código será solicitado no próximo login.':'Proteja sua conta com um aplicativo autenticador.';if(!state.mfaEnabled)button(node,'Ativar verificação em duas etapas',()=>{node.close();challenge({mfaEnrollRequired:true,stay:true});});const profile=JSON.parse(BookStore.getItem('usuarioLogado')||'{}');if(profile.mestre)button(node,'Ver desempenho do sistema',()=>run(node,message,async()=>{const report=await BookAPI.request('/api/system/status');const failures=report.routes.reduce((n,r)=>n+r.errors,0);message.textContent='Servidor ativo h\u00e1 '+Math.floor(report.uptimeSeconds/60)+' min. Falhas registradas: '+failures+'. Leituras simult\u00e2neas agrupadas: '+report.sharedReads+'.';}));}catch(e){message.textContent=e.message;}button(node,'Fechar',()=>node.close());}
 function init(){if(document.body.classList.contains('login-page')){const b=document.createElement('button');b.type='button';b.className='account-recovery';b.textContent='Esqueci minha senha';b.onclick=recovery;document.querySelector('.login-box form').after(b);}else if(document.body.dataset.screen==='admin.js'){const tools=document.querySelector('.sync-tools');if(tools)button(tools,'Segurança da conta',security);}}
 return {init,challenge,security};
})();
