window.BookProperty=(()=>{
 const el=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const request=(url,body)=>BookAPI.request(url,body?{method:'POST',body:JSON.stringify(body)}:{});
 const labels={missing:'Sem vistoria',overdue:'Vencida',current:'No prazo'};
 let coverage=null,timer,busy=false,generation=0,selectedHotel='',overviewPage=0,infoGeneration=0,selectedDetail=null,selectedCondo=null;
 function dialog(id,title){let node=el(id);if(!node){node=document.createElement('dialog');node.id=id;node.className='workspace-dialog property-dialog';document.body.append(node);}node.replaceChildren();const header=document.createElement('div');header.className='workspace-heading';const h=document.createElement('h2');h.textContent=title;const close=document.createElement('button');close.type='button';close.textContent='Fechar';close.onclick=()=>node.close();header.append(h,close);node.append(header);return node;}
 async function openInfo(hotel,apartment){
  const infoRequest=++infoGeneration;const node=dialog('apartmentInfoDialog',hotel+' · Apartamento '+apartment),status=document.createElement('p');status.setAttribute('role','status');status.textContent='Carregando informações…';node.append(status);node.showModal();
  node.onclose=()=>{node.replaceChildren();};
  try{
   const row=await request('/api/apartment-info?hotel='+encodeURIComponent(hotel)+'&apartment='+encodeURIComponent(apartment));if(!node.open||infoRequest!==infoGeneration)return;
   const form=document.createElement('form');form.autocomplete='off';const controls=[];
   const hint=document.createElement('p');hint.textContent='Todos os campos são opcionais. As informações ficam salvas até serem alteradas.';form.append(hint);
   for(const [key,title,secret] of [['lockPassword','Senha da fechadura eletrônica',true],['safePassword','Senha do cofre',true],['wifiName','Nome da rede Wi-Fi',false],['wifiPassword','Senha da rede Wi-Fi',true]]){
    const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.name=key;input.type=secret?'password':'text';input.maxLength=256;input.autocomplete='off';input.setAttribute('data-no-dictation','');input.readOnly=true;input.value=row.fields[key]||'';label.append(input);controls.push(input);
    if(secret){const show=document.createElement('button');show.type='button';show.textContent='Mostrar';show.setAttribute('aria-label','Mostrar '+title.toLowerCase());show.onclick=()=>{const visible=input.type==='password';input.type=visible?'text':'password';show.textContent=visible?'Ocultar':'Mostrar';show.setAttribute('aria-label',(visible?'Ocultar ':'Mostrar ')+title.toLowerCase());};label.append(show);}form.append(label);
   }
   const edit=document.createElement('button');edit.type='button';edit.textContent='Editar informações';const save=document.createElement('button');save.type='submit';save.className='acao-principal';save.textContent='Salvar informações';save.hidden=true;
   edit.onclick=()=>{controls.forEach(input=>input.readOnly=false);edit.hidden=true;save.hidden=false;controls[0].focus();};form.append(edit,save);node.append(form);status.textContent='';
   form.onsubmit=async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;status.textContent='Salvando…';try{const fields=Object.fromEntries(controls.map(input=>[input.name,input.value]));const updated=await request('/api/apartment-info',{hotel,apartment,version:row.version,fields});row.version=updated.version;controls.forEach(input=>{input.readOnly=true;if(input.name!=='wifiName')input.type='password';});save.hidden=true;edit.hidden=false;status.textContent='Informações salvas.';}catch(error){status.textContent=error.message;}finally{save.disabled=false;}};
  }catch(error){status.textContent=error.message;}
 }
 function removeForm(){
  const section=el('visaoOnboarding'),form=document.createElement('form');form.id='removePropertyForm';form.className='onboarding-catalog';form.innerHTML='<h3>Remover imóvel da operação</h3><p>Retira o imóvel do catálogo ativo. Cards, vistorias e informações já salvas permanecem no histórico.</p><label>Condomínio<select id="removePropertyHotel" required></select></label><label>O que remover?<select id="removePropertyKind"><option value="apartment">Um apartamento</option><option value="condominium">O condomínio inteiro</option></select></label><label id="removePropertyUnitLabel">Apartamento<select id="removePropertyUnit" required></select></label><button type="submit" class="botao-secundario">Remover imóvel</button><p id="removePropertyStatus" role="status"></p>';section.append(form);
  const hotel=el('removePropertyHotel'),unit=el('removePropertyUnit'),kind=el('removePropertyKind');
  const units=()=>{const previous=unit.value;unit.replaceChildren(new Option('Selecione',''));BookStore.apartments(hotel.value).forEach(a=>unit.append(new Option(a,a)));unit.value=previous;};
  const catalog=()=>{const previous=hotel.value;hotel.replaceChildren(new Option('Selecione',''));BookCatalog.hotels.forEach(h=>hotel.append(new Option(h,h)));hotel.value=previous;units();};catalog();window.addEventListener('book:catalog',catalog);hotel.onchange=units;
  kind.onchange=()=>{const apartment=kind.value==='apartment';el('removePropertyUnitLabel').hidden=!apartment;unit.required=apartment;};
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;const apartment=kind.value==='apartment'?unit.value:null,site=hotel.value,target=site+(apartment?' / '+apartment:'');if(!confirm('Remover '+target+' do catálogo ativo? O histórico será preservado.'))return;button.disabled=true;
   try{await request('/api/onboarding/remove',{hotel:site,apartment,confirm:target});el('removePropertyStatus').textContent='Remoção salva. Atualizando catálogo…';await BookStore.refreshCatalog();el('removePropertyStatus').textContent='Imóvel removido do catálogo ativo. Histórico preservado.';refreshInspections();}catch(error){el('removePropertyStatus').textContent=error.message;}finally{button.disabled=false;}};
 }
 function decorateInspections(hotel){
  if(hotel&&hotel!==selectedHotel)selectedDetail=null;if(hotel)selectedHotel=hotel;if(!coverage)return;
  document.querySelectorAll('.inspection-badge').forEach(badge=>badge.remove());
  document.querySelectorAll('#areaVistorias .apartamentos-vistoria button').forEach(button=>{
   const apartment=button.textContent.replace(/^Apartamento\s+/,'').trim(),row=coverage.rows.find(r=>r.hotel===selectedHotel&&r.apartment===apartment);button.classList.toggle('inspection-unit-late',!!row&&row.status!=='current');button.title=row?labels[row.status]+(row.due_date?' · Próxima vistoria: '+row.due_date:''):'';
  });
 }
 const displayDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'Não informada';
 function renderApartmentDates(hotel,apartment,host){
  if(!host||!coverage)return;host.querySelector('.inspection-control-dates')?.remove();host.querySelector('#vistoriaDatesLoading')?.remove();
  const row=coverage.rows.find(r=>r.hotel===hotel&&r.apartment===apartment);if(!row)return;
  const box=document.createElement('div');box.className='inspection-control-dates';const checks=row.checks||[{track:'general',last_date:row.last_date,due_date:row.due_date,status:row.status}];
  for(const check of checks){
   const section=document.createElement('section');section.className='inspection-date-card';const heading=document.createElement('h4');heading.textContent=check.track==='governance'?'Governança':'Vistoria do imóvel';
   const last=document.createElement('p');last.className='inspection-last-date';last.textContent=(check.last_date&&check.last_date>coverage.referenceDate?'Data informada na planilha: ':'Última vistoria: ')+(check.last_date?displayDate(check.last_date):'Sem vistoria registrada');
   const next=document.createElement('p');next.className='inspection-next-date';next.textContent='Próxima vistoria: '+(check.due_date?displayDate(check.due_date):'A definir após a primeira vistoria');
   const state=document.createElement('p');state.className='inspection-date-status';state.textContent='Situação: '+labels[check.status];if(check.status!=='current')section.classList.add('inspection-unit-late');section.append(heading,last,next,state);
   if(check.scheduled_date){const scheduled=document.createElement('p');scheduled.textContent='Programada para: '+displayDate(check.scheduled_date);section.append(scheduled);}box.append(section);
  }host.append(box);
 }
 function decorateDetail(hotel,apartment){selectedDetail={hotel,apartment};renderApartmentDates(hotel,apartment,document.querySelector('#detalheApartamentoVistoria .vistoria-resumo > div'));}
 function decorateCondominiumDates(hotel,apartment){
  if(!BookWorkspace.can('vistorias'))return;const root=el('opcoesApartamento');if(!root)return;let host=el('condominiumInspectionDates');if(!host){host=document.createElement('div');host.id='condominiumInspectionDates';root.querySelector('h3').after(host);}selectedCondo={hotel,apartment,host};renderApartmentDates(hotel,apartment,host);
 }
 function refreshInspections(){clearTimeout(timer);timer=setTimeout(loadInspections,180);}
 async function loadInspections(){
  if(!BookWorkspace.can('vistorias'))return;if(busy)return;busy=true;const current=++generation;
  try{const data=await request('/api/inspections/coverage');if(current!==generation)return;coverage=data;decorateInspections();if(selectedDetail)decorateDetail(selectedDetail.hotel,selectedDetail.apartment);if(selectedCondo?.host.isConnected)renderApartmentDates(selectedCondo.hotel,selectedCondo.apartment,selectedCondo.host);if(el('inspectionOverviewDialog')?.open)renderOverview();if(el('inspectionCoverageStatus'))el('inspectionCoverageStatus').textContent='';}
  catch(error){if(el('inspectionOverviewDialog')?.open&&el('inspectionOverviewTable'))el('inspectionOverviewTable').textContent='Não foi possível carregar o resumo: '+error.message;if(el('inspectionCoverageStatus'))el('inspectionCoverageStatus').textContent='Resumo das vistorias indisponível: '+error.message;}
  finally{busy=false;}
 }
 function filteredRows(){const hotel=el('inspectionOverviewHotel')?.value||'',state=el('inspectionOverviewState')?.value||'';return (coverage?.rows||[]).filter(r=>(!hotel||r.hotel===hotel)&&(!state||r.status===state));}
 function renderOverview(){
  const area=el('inspectionOverviewTable');if(!area)return;if(!coverage){area.textContent='Carregando…';return;}
  const c=coverage.counts;el('inspectionOverviewCounts').textContent=`${c.total} apartamentos · ${c.overdue} vencidos · ${c.missing} sem vistoria · ${c.current} no prazo`;
  const rows=filteredRows(),page=rows.slice(overviewPage*100,overviewPage*100+100);area.innerHTML='<table><thead><tr><th>Condomínio</th><th>Apartamento</th><th>Última vistoria</th><th>Próxima vistoria</th><th>Situação</th></tr></thead><tbody>'+page.map(r=>`<tr class="${r.status!=='current'?'inspection-unit-late':''}"><td>${esc(r.hotel)}</td><td>${esc(r.apartment)}</td><td>${esc(r.last_date||'—')}</td><td>${esc(r.due_date||'—')}</td><td>${esc(labels[r.status])}</td></tr>`).join('')+'</tbody></table>';
  el('inspectionOverviewPage').textContent=rows.length?`${overviewPage*100+1}–${overviewPage*100+page.length} de ${rows.length}`:'Nenhum apartamento encontrado.';el('inspectionOverviewPrevious').disabled=overviewPage===0;el('inspectionOverviewNext').disabled=(overviewPage+1)*100>=rows.length;
 }
 function openOverview(){
  const node=dialog('inspectionOverviewDialog','Visão geral das vistorias');const content=document.createElement('div');content.innerHTML='<p>Vermelho: próxima vistoria anterior a hoje, conforme a planilha. As datas de vistoria e governança são acompanhadas separadamente. No dia do vencimento ainda está no prazo.</p><p id="inspectionOverviewCounts" role="status"></p><div class="property-overview-filters"><label>Condomínio<select id="inspectionOverviewHotel"><option value="">Todos</option></select></label><label>Situação<select id="inspectionOverviewState"><option value="">Todas</option><option value="overdue">Vencidas</option><option value="missing">Sem vistoria</option><option value="current">No prazo</option></select></label><button type="button" id="inspectionOverviewExport">Baixar planilha CSV</button></div><div id="inspectionOverviewTable" class="property-table-scroll"></div><p id="inspectionOverviewPage" role="status"></p><button id="inspectionOverviewPrevious" type="button">Anterior</button> <button id="inspectionOverviewNext" type="button">Próxima</button>';node.append(content);BookCatalog.hotels.forEach(h=>el('inspectionOverviewHotel').append(new Option(h,h)));
  for(const id of ['inspectionOverviewHotel','inspectionOverviewState'])el(id).onchange=()=>{overviewPage=0;renderOverview();};
  el('inspectionOverviewPrevious').onclick=()=>{overviewPage--;renderOverview();};el('inspectionOverviewNext').onclick=()=>{overviewPage++;renderOverview();};
  el('inspectionOverviewExport').onclick=()=>{if(!coverage)return;const rows=[['Condomínio','Apartamento','Última vistoria','Próxima vistoria','Situação'],...filteredRows().map(r=>[r.hotel,r.apartment,r.last_date||'',r.due_date||'',labels[r.status]])];const url=URL.createObjectURL(new Blob([BookProcesses.csv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='vistorias-'+coverage.referenceDate+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  overviewPage=0;node.showModal();renderOverview();refreshInspections();
 }
 function init(){
  if(BookWorkspace.can('onboarding'))removeForm();
  if(BookWorkspace.can('vistorias')){const section=el('visaoVistorias'),button=document.createElement('button');button.type='button';button.className='acao-principal';button.textContent='Visão geral das vistorias';button.onclick=openOverview;section.querySelector('.titulo-secao').after(button);const status=document.createElement('p');status.id='inspectionCoverageStatus';status.setAttribute('role','status');button.after(status);refreshInspections();window.addEventListener('book:data',refreshInspections);window.addEventListener('book:catalog',refreshInspections);}
 }
 return {init,openInfo,refreshInspections,decorateInspections,decorateDetail,decorateCondominiumDates,openOverview};
})();
