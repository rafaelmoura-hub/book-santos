/* Reuses the existing append-only flow comments and audited card records. */
window.BookActivity=(()=>{
 const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const post=(url,data)=>BookAPI.request(url,{method:'POST',body:JSON.stringify(data)});
 const labels={created:'Cards criados no período',closed:'Cards fechados no período',overdue:'Cards vencidos agora',comments:'Comentários no período',rescheduledWithoutComment:'Prazo alterado sem comentário no dia',inspections:'Vistorias feitas no período',postponed:'Cards postergados no período'};
 let version=0,report=null,selected='created',lastKey='',loaded=0,requestId=0,timer;
 function button(text,action){const b=node('button',text);b.type='button';b.className='botao-secundario';b.onclick=action;return b;}
 function field(label,id,type='date'){const l=node('label',label),i=node('input');i.id=id;i.type=type;l.append(i);return l;}
 function choose(label,id,options){const l=node('label',label),s=node('select');s.id=id;for(const [v,t] of options)s.append(new Option(t,v));l.append(s);return l;}
 function filters(){return {start:el('activityStart').value,end:el('activityEnd').value,group:el('activityGroup').value,hotel:el('decisionHotel').value,urgency:el('activityUrgency').value,assignees:[...el('activityAssignees').selectedOptions].map(o=>o.value)};}
 function table(headers,rows){const wrap=node('div');wrap.className='decision-table-wrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));const t=node('table'),head=node('thead'),tr=node('tr');headers.forEach(h=>{const th=node('th',h);th.scope='col';tr.append(th);});head.append(tr);const body=node('tbody');rows.forEach(row=>{const r=node('tr');row.forEach(v=>{const td=node('td');v instanceof Node?td.append(v):td.textContent=v;r.append(td);});body.append(r);});t.append(head,body);wrap.append(t);return wrap;}
 function render(){
  const content=el('activityContent');content.replaceChildren();const cards=node('div');cards.className='cards decision-metrics';
  for(const [key,label] of Object.entries(labels)){const c=node('div');c.className='card';c.append(node('h3',label),node('p',Number(report.metrics[key]||0).toLocaleString('pt-BR')),button('Ver registros',()=>{selected=key;details();}));cards.append(c);}content.append(cards);
  const series=node('details');series.className='help-panel';series.append(node('summary','Distribuição por período'));
  series.append(node('p','Distribuição conta eventos; os indicadores de cards contam cards distintos. Reaberturas e novas conclusões podem produzir mais de um evento para o mesmo card.','workspace-hint'));
  series.append(table(['Período','Indicador','Eventos'],report.series.map(s=>[BookPeriods.display(s.period),labels[s.kind],s.count])));content.append(series);
 }
 function details(){
  let dialog=el('activityRecordsDialog');if(!dialog){dialog=node('dialog');dialog.id='activityRecordsDialog';dialog.className='collaboration-dialog routine-dialog';dialog.setAttribute('aria-labelledby','activityRecordsTitle');document.body.append(dialog);}
  const heading=node('div');heading.className='titulo-secao';const title=node('h2',labels[selected]);title.id='activityRecordsTitle';heading.append(title,button('Fechar',()=>dialog.close()));
  const area=node('section');area.id='activityDetails';const status=node('p');status.id='activityRecordsStatus';status.setAttribute('role','status');dialog.replaceChildren(heading,status,area);
  const kind=selected,rows=report.items.filter(r=>r.kind===kind);area.append(node('p','Até 100 ocorrências mais recentes deste indicador. Os totais incluem todos os registros autorizados.'));
  area.append(rows.length?table(['Card / vistoria','Condomínio / apartamento','Data','Detalhe'],rows.map(r=>[button(r.title||'#'+r.id,async()=>{
   if(dialog.getAttribute('aria-busy')==='true')return;dialog.setAttribute('aria-busy','true');status.textContent='Abrindo registro…';
   try{
    const source=kind==='inspections'?'vistorias':'ordensServico',d=await BookAPI.request('/api/processes/flow?source='+source+'&id='+encodeURIComponent(r.id));
    BookStore.includeRecord(source,d.record);
    if(kind==='inspections'){
     if(!BookWorkspace.can('vistorias'))throw Error('Seu usuário não possui acesso à aba de vistorias.');
     mostrarAba('vistorias');selecionarHotelVistoria(r.hotel);selecionarApartamentoVistoria(String(r.apartment));
     const entry=[...document.querySelectorAll('.vistoria-registro')].find(n=>n.dataset.vistoriaId===String(r.id));if(entry){entry.open=true;entry.scrollIntoView({block:'center'});entry.querySelector('summary')?.focus();}
    }else abrirOS(r.id);
    dialog.close();
   }catch(error){status.textContent=error.message;}
   finally{dialog.setAttribute('aria-busy','false');}
  }),r.hotel+' · '+(r.apartment||''),BookPeriods.display(r.event_day),r.detail||'—'])):node('p','Nenhum registro neste filtro.'));
  if(!dialog.open)dialog.showModal();
 }
 async function load(force=false){
  if(!el('activityStart')||!BookWorkspace.can('dashboard'))return;const f=filters(),key=JSON.stringify(f);if(!force&&report&&key===lastKey&&Date.now()-loaded<30000)return;
  const id=++requestId;el('activityStatus').textContent='Atualizando análise por período…';el('activityContent').setAttribute('aria-busy','true');
  if(key!==lastKey)el('activityContent').replaceChildren();
  try{BookPeriods.range('dia',f.start);BookPeriods.range('dia',f.end);if(f.start>f.end)throw Error('A data inicial deve ser anterior à final.');const data=await BookAPI.request('/api/decision/activity?filters='+encodeURIComponent(key));if(id!==requestId)return;report=data;lastKey=key;loaded=Date.now();render();el('activityStatus').textContent='Período de '+BookPeriods.display(f.start)+' a '+BookPeriods.display(f.end)+'. Vencidos agora considera a data atual de São Paulo.';}
  catch(error){if(id===requestId){report=null;el('activityContent').replaceChildren();el('activityStatus').textContent=error.message;}}
  finally{if(id===requestId)el('activityContent').setAttribute('aria-busy','false');}
 }
 function init(){
  const panel=node('section');panel.className='decision-panel';panel.append(node('h3','Análise por período'));
  const form=node('form');form.className='activity-filters';form.append(field('De','activityStart'),field('Até','activityEnd'),choose('Agrupar por','activityGroup',[['day','Dia'],['week','Semana'],['month','Mês'],['year','Ano']]),choose('Urgência','activityUrgency',[['','Todas'],['Normal','Baixa'],['Alta','Média'],['Urgente','Alta']]),choose('Responsáveis (seleção múltipla)','activityAssignees',[['','Sem responsável']]));
  el('visaoDashboard').querySelector('.decision-panel').before(panel);panel.append(form);form.prepend(el('decisionHotel').closest('label'));
  el('activityAssignees').multiple=true;el('activityAssignees').size=4;[...el('activityAssignees').options].forEach(o=>o.selected=false);
  const submit=node('button','Aplicar filtros');submit.type='submit';submit.className='acao-principal';form.append(submit);form.onsubmit=e=>{e.preventDefault();load(true);};
  const shortcuts=node('div');shortcuts.className='routine-actions';for(const [kind,label] of [['dia','Hoje'],['semana','Semana atual'],['mes','Mês atual'],['ano','Ano atual']])shortcuts.append(button(label,()=>{const range=BookPeriods.range(kind,BookPeriods.today());el('activityStart').value=range.start;el('activityEnd').value=new Date(Date.parse(range.end)-86400000).toISOString().slice(0,10);load(true);}));
  shortcuts.append(button('Limpar filtros',()=>{el('activityUrgency').value='';[...el('activityAssignees').options].forEach(o=>o.selected=false);el('decisionHotel').value='';el('decisionHotel').dispatchEvent(new Event('change'));const r=BookPeriods.range('mes',BookPeriods.today());el('activityStart').value=r.start;el('activityEnd').value=BookPeriods.today();load(true);}));panel.append(shortcuts);
  const status=node('p');status.id='activityStatus';status.setAttribute('role','status');const content=node('div');content.id='activityContent';panel.append(status,content);
  const help=node('details');help.className='help-panel';help.append(node('summary','Como os indicadores são contados'),node('p','Fechados inclui finalizados e recusados. Remarcações sem comentário consideram o mesmo card e dia, por qualquer participante. O período usa datas de São Paulo. Responsável e urgência são os atuais; vistorias não usam urgência. Sem seleção de responsável, considera todos. O painel de prioridades abaixo mostra a situação atual. Eventos antigos só são contados quando registrados no banco.'));panel.insertBefore(help,content);
  el('activityStart').value=BookPeriods.range('mes',BookPeriods.today()).start;el('activityEnd').value=BookPeriods.today();el('activityGroup').value='week';
  BookAPI.request('/api/users').then(users=>users.filter(u=>u.funcao==='adm').forEach(u=>el('activityAssignees').append(new Option(u.nome,u.login)))).catch(()=>{status.textContent='Não foi possível listar responsáveis. Você pode atualizar a página para tentar novamente.';});
  el('decisionHotel').addEventListener('change',()=>load(true));window.addEventListener('book:data',()=>{loaded=0;clearTimeout(timer);if(!el('visaoDashboard').hidden)timer=setTimeout(()=>load(true),800);});
 }
 async function openCard(id){
  const generation=++version,host=node('section');host.className='card-activity';host.id='cardActivity';host.append(node('h3','Comentários e informações do card'));el('osDetalhes').append(host);
  const status=node('p');status.setAttribute('role','status');host.append(status);const history=node('div');host.append(history);let before=null,busy=false;
  const more=button('Atividades anteriores',()=>read(true));more.hidden=true;host.append(more);
  async function read(append=false){try{const data=await BookAPI.request('/api/processes/flow?source=ordensServico&id='+encodeURIComponent(id)+(append&&before?'&before='+encodeURIComponent(before):''));if(generation!==version)return;if(!append)history.replaceChildren();const events=data.events.slice(0,50);for(const e of events){const row=node('article');row.className='routine-event';row.append(node('strong',(e.action==='Comentário'?'Comentário':e.action)+' · '+e.actor_name),node('small',new Date(e.created_at).toLocaleString('pt-BR')),node('p',e.body||e.current?.phase||''));history.append(row);}if(!history.children.length)history.append(node('p','Nenhum comentário ou atividade registrada.'));before=events.at(-1)?.id;more.hidden=data.events.length<=50;status.textContent='';}catch(error){if(generation===version)status.textContent=error.message;}}
  if(BookWorkspace.can('os')){
   const form=node('form'),label=node('label','Adicionar comentário'),text=node('textarea');text.required=true;text.maxLength=2000;text.rows=3;label.append(text);const send=node('button','Publicar comentário');send.type='submit';send.className='acao-principal';form.append(label,send);host.insertBefore(form,status);
   form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;send.disabled=true;status.textContent='Publicando…';try{await post('/api/processes/comment',{source:'ordensServico',id:String(id),body:text.value.trim()});text.value='';await read();window.dispatchEvent(new Event('book:data'));}catch(error){status.textContent=error.message;}finally{busy=false;send.disabled=false;}};
   const card=osList().find(r=>String(r.id)===String(id));if(card&&!['Finalizada','Recusada'].includes(card.status)){
    const schedule=node('details');schedule.append(node('summary','Alterar vencimento'));const sf=node('form'),dateLabel=node('label','Novo vencimento'),date=node('input');date.type='date';date.required=true;date.value=card.vencimento||'';dateLabel.append(date);const reasonLabel=node('label','Comentário sobre a alteração (opcional)'),reason=node('textarea');reason.maxLength=2000;reason.rows=2;reasonLabel.append(reason);const save=node('button','Salvar novo prazo');save.type='submit';save.className='botao-secundario';sf.append(dateLabel,reasonLabel,save);schedule.append(sf);host.insertBefore(schedule,status);
    sf.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=true;status.textContent='Salvando prazo…';try{const d=await BookAPI.request('/api/processes/flow?source=ordensServico&id='+encodeURIComponent(id));if(d.record.data.vencimento!==card.vencimento)throw Error('O prazo mudou. Reabra o card antes de salvar.');await post('/api/cards/schedule',{id:String(id),version:Number(d.recordVersion),due:date.value,comment:reason.value.trim()});const saved=await BookAPI.request('/api/processes/flow?source=ordensServico&id='+encodeURIComponent(id));BookStore.includeRecord('ordensServico',saved.record);window.dispatchEvent(new Event('book:data'));abrirOS(id);}catch(error){status.textContent=error.message;}finally{busy=false;save.disabled=false;}};
   }
  }
  await read();
 }
 return {init,load,openCard};
})();
