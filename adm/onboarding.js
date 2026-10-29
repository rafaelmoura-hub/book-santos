window.BookOnboarding=(()=>{
 const el=id=>document.getElementById(id);let busy=false;
 function init(){
  const section=el('visaoOnboarding'),form=document.createElement('form');form.id='onboardingCatalog';form.className='onboarding-catalog';
  form.innerHTML='<p>Cadastre imóveis para usá-los em Condomínios, vistorias e cards.</p><label>O que deseja cadastrar?<select id="onboardingKind"><option value="condominium">Novo condomínio</option><option value="apartments">Apartamentos em um condomínio existente</option></select></label><label id="onboardingNameLabel">Nome do condomínio<input id="onboardingName" maxlength="100" required autocomplete="off"></label><label id="onboardingExistingLabel" hidden>Condomínio<select id="onboardingExisting"></select></label><label>Apartamentos<textarea id="onboardingApartments" rows="3" maxlength="2000" placeholder="Ex.: 101, 102, 194A"></textarea><small>Separe por vírgula ou por linha. Até 100 por cadastro. Um novo condomínio pode começar sem apartamentos.</small></label><p id="onboardingUnits" class="workspace-hint"></p><button type="submit" class="acao-principal">Salvar em Condomínios</button><p id="onboardingStatus" role="status" aria-live="polite"></p>';
  section.querySelector('.titulo-secao').after(form);const select=el('onboardingExisting');select.append(new Option('Selecione',''));for(const hotel of BookCatalog.hotels)select.append(new Option(hotel,hotel));
  const units=()=>{const values=BookStore.apartments(select.value);el('onboardingUnits').textContent=select.value?'Já cadastrados: '+(values.join(', ')||'nenhum')+'.':'';};
  function mode(){const existing=el('onboardingKind').value==='apartments';el('onboardingNameLabel').hidden=existing;el('onboardingExistingLabel').hidden=!existing;el('onboardingName').required=!existing;select.required=existing;el('onboardingApartments').required=existing;units();}
  el('onboardingKind').onchange=mode;select.onchange=units;mode();window.addEventListener('book:catalog',units);
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;const controls=[...form.elements];controls.forEach(c=>c.disabled=true);form.setAttribute('aria-busy','true');el('onboardingStatus').textContent='Salvando…';
   try{
    const kind=el('onboardingKind').value,hotel=kind==='condominium'?el('onboardingName').value:select.value,apartments=el('onboardingApartments').value.split(/[,;\r\n]+/).map(a=>a.trim()).filter(Boolean);
    const result=await BookAPI.request('/api/onboarding/catalog',{method:'POST',body:JSON.stringify({kind,hotel,apartments})});
    el('onboardingName').value='';el('onboardingApartments').value='';
    try{await BookStore.refreshCatalog();el('onboardingStatus').textContent=result.hotel+' salvo em Condomínios. '+result.created+' apartamento(s) adicionado(s).';}
    catch{el('onboardingStatus').textContent='Cadastro salvo. Recarregue a página para atualizar as listas; não é necessário cadastrar novamente.';}
   }catch(error){el('onboardingStatus').textContent=error.message;}
   finally{busy=false;controls.forEach(c=>c.disabled=false);form.setAttribute('aria-busy','false');mode();}
  };
 }
 return {init};
})();
