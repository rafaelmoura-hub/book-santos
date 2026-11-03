window.BookLabels=(()=>{
 const colors={teal:'Turquesa',blue:'Azul',purple:'Roxo',pink:'Rosa',orange:'Laranja',green:'Verde',gray:'Cinza'};
 let catalog=[],pending,dialog,target=null,version=0,selected=new Set(),busy=false;
 const assignments=new Map(),request=(url,body)=>BookAPI.request(url,body?{method:'POST',body:JSON.stringify(body)}:{});
 const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.className='botao-secundario';b.onclick=action;return b;};
 function chip(label){const s=document.createElement('span');s.className='label-chip label-'+(colors[label.color]?label.color:'gray');s.textContent=label.name;return s;}
 async function refresh(){if(!pending)pending=request('/api/labels').then(rows=>{catalog=rows;updateFilters();return rows;}).finally(()=>pending=null);return pending;}
 function updateFilters(){document.querySelectorAll('select[data-label-filter]').forEach(select=>{const value=select.value;select.replaceChildren(new Option('Todas as etiquetas',''),...catalog.map(l=>new Option(l.name,l.id)));select.value=value;});}
 function filter(parent,id,onchange){const wrap=document.createElement('label');wrap.textContent='Etiqueta';const select=document.createElement('select');select.id=id;select.dataset.labelFilter='';select.append(new Option('Todas as etiquetas',''));wrap.append(select);parent.append(wrap);if(onchange)select.onchange=onchange;refresh().catch(()=>{});return select;}
 function chips(parent,id){const wrap=document.createElement('div');wrap.className='label-chips';wrap.dataset.labelCard=String(id);parent.append(wrap);paint(wrap);}
 function paint(wrap){const ids=assignments.get(wrap.dataset.labelCard)?.labelIds||[];wrap.replaceChildren(...catalog.filter(l=>ids.includes(l.id)).map(chip));}
 async function hydrate(parent){
  if(parent.id==='listaOS'&&!document.getElementById('filtroEtiquetaOS')){
   const toolbar=document.querySelector('#visaoOS .filtros-card');
   filter(toolbar,'filtroEtiquetaOS',()=>{const select=document.getElementById('filtroEtiquetaOS');BookRoutine.openServices({label:select.value});select.value='';});
  }
  const nodes=[...parent.querySelectorAll('[data-label-card]')],ids=[...new Set(nodes.map(n=>n.dataset.labelCard))];if(!ids.length)return;
  try{await refresh();for(let i=0;i<ids.length;i+=100){const rows=await request('/api/card-labels?ids='+ids.slice(i,i+100).join(','));rows.forEach(row=>assignments.set(row.id,row));}nodes.filter(n=>n.isConnected).forEach(paint);}
  catch(error){if(nodes[0]?.isConnected){nodes[0].textContent='Etiquetas indisponíveis';nodes[0].title=error.message;}}
 }
 function mountDetails(id){const parent=document.getElementById('osDetalhes'),section=document.createElement('section');section.className='card-label-section';const title=document.createElement('h3');title.textContent='Etiquetas';section.append(title);chips(section,id);section.append(button('Editar etiquetas',()=>open(id)));parent.insertBefore(section,parent.children[1]);hydrate(section);}
 function ensureDialog(){if(dialog)return;dialog=document.createElement('dialog');dialog.id='labelsDialog';dialog.className='labels-dialog';dialog.innerHTML='<h2 id="labelsTitle">Etiquetas dos cards</h2><p>Combine até 10 etiquetas por card. As etiquetas criadas ficam disponíveis para a equipe.</p><div id="labelsChoices" class="labels-choices"></div><form id="labelCreate"><h3>Criar etiqueta</h3><label>Nome<input id="labelName" maxlength="40" required autocomplete="off"></label><label>Cor<select id="labelColor"></select></label><button type="submit" class="botao-secundario">Criar etiqueta</button></form><p id="labelsStatus" role="status"></p><div id="labelsActions" class="routine-actions"></div>';dialog.setAttribute('aria-labelledby','labelsTitle');document.body.append(dialog);
  for(const [value,title]of Object.entries(colors))document.getElementById('labelColor').append(new Option(title,value));
  document.getElementById('labelCreate').onsubmit=async event=>{event.preventDefault();if(busy)return;setBusy(true);try{catalog=await request('/api/labels',{name:document.getElementById('labelName').value.trim(),color:document.getElementById('labelColor').value});document.getElementById('labelName').value='';updateFilters();choices();status('Etiqueta criada.');}catch(error){status(error.status===409?'Já existe uma etiqueta com esse nome.':error.message);}finally{setBusy(false);}};
  document.getElementById('labelsActions').append(button('Cancelar',()=>dialog.close()),button('Salvar etiquetas',save));dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 }
 function status(text){document.getElementById('labelsStatus').textContent=text;}
 function setBusy(value){busy=value;dialog.querySelectorAll('button,input,select').forEach(n=>n.disabled=value);dialog.setAttribute('aria-busy',String(value));}
 function choices(){const area=document.getElementById('labelsChoices');area.replaceChildren();for(const label of catalog){const row=document.createElement('label');row.className='label-choice';if(target){const c=document.createElement('input');c.type='checkbox';c.value=label.id;c.checked=selected.has(label.id);c.onchange=()=>{if(c.checked&&selected.size>=10){c.checked=false;status('Selecione no máximo 10 etiquetas.');return;}if(c.checked)selected.add(label.id);else selected.delete(label.id);};row.append(c);}row.append(chip(label));area.append(row);}if(!catalog.length)area.textContent='Nenhuma etiqueta criada ainda.';}
 async function open(id=null){ensureDialog();if(busy)return;target=id?String(id):null;selected=new Set();version=0;dialog.showModal();status('Carregando etiquetas…');setBusy(true);document.getElementById('labelsChoices').replaceChildren();try{await refresh();if(target){const rows=await request('/api/card-labels?ids='+target),row=rows.find(r=>r.id===target);if(!row)throw Error('Card indisponível.');version=row.version;selected=new Set(row.labelIds);}choices();status('');}catch(error){status(error.message);document.getElementById('labelsActions').lastElementChild.hidden=true;return;}finally{setBusy(false);}document.getElementById('labelsActions').lastElementChild.hidden=!target;}
 async function save(){if(busy||!target)return;setBusy(true);try{const result=await request('/api/card-labels',{id:target,version,labelIds:[...selected]});assignments.set(target,result);document.querySelectorAll('[data-label-card]').forEach(paint);dialog.close();window.BookRoutine?.load('services');}catch(error){status(error.message);}finally{setBusy(false);}}
 return {filter,chips,hydrate,mountDetails,open};
})();
