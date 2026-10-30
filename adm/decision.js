/* SAD operacional: regras explícitas, dados do servidor e nenhuma ação automática. */
window.BookDecision=(()=>{
 const el=id=>document.getElementById(id),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 let snapshot=null,generation=0,loaded=0,currentHotel='',timer;
 const can=tab=>BookWorkspace.can(tab),visible=()=>el('visaoDashboard')&&!el('visaoDashboard').hidden;
 const number=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
 const date=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Sem registro';
 function button(text,action){const b=node('button',text,'botao-secundario');b.type='button';b.onclick=action;return b;}
 function section(title){const s=node('section',null,'decision-section');s.append(node('h3',title));return s;}
 function table(headers,rows){const wrap=node('div',null,'decision-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));const t=node('table');const head=node('thead'),tr=node('tr');for(const h of headers){const th=node('th',h);th.scope='col';tr.append(th);}head.append(tr);t.append(head);const body=node('tbody');for(const row of rows){const r=node('tr');for(const v of row){const td=node('td');if(v instanceof Node)td.append(v);else td.textContent=v; r.append(td);}body.append(r);}t.append(body);wrap.append(t);return wrap;}
 function services(filters={},view='list'){BookRoutine.openServices({...filters,hotel:el('decisionHotel').value},view);}
 function metric(title,value){const card=node('div',null,'card');card.append(node('h3',title),node('p',number(value)));return card;}
 function render(data){
  const area=el('decisionContent');area.replaceChildren();
  const cards=node('div',null,'cards decision-metrics');
  for(const [label,value]of [['Serviços em aberto',data.services.open],['Prazo vencido',data.services.overdue],['Vencem hoje',data.services.today],['Urgentes',data.services.urgent],['Sem responsável',data.services.unassigned],['Sem prazo válido',data.services.withoutDeadline]])cards.append(metric(label,value));
  area.append(cards);
  const actions=node('div',null,'routine-actions');if(can('os')){actions.append(button('Ver serviços vencidos',()=>services({period:'late'})),button('Agenda de serviços',()=>services({},'agenda')));}if(can('financeiro'))actions.append(button('Consultar financeiro',()=>mostrarAba('financeiro')));area.append(actions);
  const queue=section('O que precisa de atenção');queue.append(node('p','Até 12 serviços. Ordem: urgentes, vencidos, de hoje, sem responsável e demais prazos. A sugestão apoia sua decisão; não altera cards.','workspace-hint'));
  if(!data.queue.length)queue.append(node('p','Nenhum serviço em aberto neste filtro.'));
  for(const row of data.queue){const card=node('article',null,'decision-priority');const h=node('h4',row.title||'Serviço #'+row.id);card.append(h,node('p',`${row.hotel} · Apto ${row.apartment||'—'} · ${BookProcesses.phaseLabel(row.phase)}`),node('p',`${row.reason} · Prazo: ${date(row.due)} · ${row.assignee}`));if(can('os'))card.append(button('Acompanhar serviço',()=>BookRoutine.openFlow('ordensServico',row.id)));queue.append(card);}area.append(queue);
  const grid=node('div',null,'decision-grid');
  const sites=section('Pendências por condomínio');sites.append(data.byHotel.length?table(['Condomínio','Em aberto','Vencidos','Urgentes'],data.byHotel.map(r=>[r.hotel&&can('os')?button(r.hotel,()=>BookRoutine.openServices({hotel:r.hotel},'list')):r.hotel||'Condomínio a conferir',number(r.open),number(r.overdue),number(r.urgent)])):node('p','Nenhuma pendência.'));grid.append(sites);
  const staff=section('Carga por responsável');staff.append(data.byAssignee.length?table(['Responsável','Em aberto','Vencidos'],data.byAssignee.map(r=>[r.id&&can('os')?button(r.name,()=>services({assignee:r.id})):r.name,number(r.open),number(r.overdue)])):node('p','Nenhuma pendência.'));grid.append(staff);
  const phases=section('Etapas dos serviços');phases.append(table(['Etapa','Quantidade'],data.byPhase.map(r=>[can('os')?button(BookProcesses.phaseLabel(r.phase),()=>services({phase:r.phase})):BookProcesses.phaseLabel(r.phase),number(r.count)])));grid.append(phases);area.append(grid);
  if(data.permissions.inspections){
   const v=section('Vistorias preventivas · ciclo de 3 meses');
   v.append(node('p',`${number(data.inspections.units)} apartamentos · ${number(data.inspections.overdue)} com prazo vencido · ${number(data.inspections.next30)} nos próximos 30 dias · ${number(data.inspections.missing)} sem data válida registrada.`));
   v.append(node('p','Próximo prazo calculado pela última vistoria válida registrada. Ausência de registro não significa vistoria vencida. Não cria uma vistoria executada nem agenda uma visita automaticamente. Até 20 unidades para conferência.','workspace-hint'));
   v.append(table(['Apartamento','Última vistoria','Próxima referência','Ação'],data.inspections.items.map(r=>[`${r.hotel} · ${r.apartment}`,date(r.last_date),r.last_date?date(r.next_due):'Conferir primeiro registro',button('Ver apartamento',()=>{mostrarAba('vistorias');selecionarHotelVistoria(r.hotel);selecionarApartamentoVistoria(r.apartment);})])));area.append(v);
  }
  if(data.permissions.stock){
   const s=section('Reposição de materiais · estoque global');s.append(node('p',`${number(data.stock.alerts)} materiais no mínimo ou sem saldo · ${number(data.stock.unconfigured)} sem mínimo configurado.`));
   s.append(node('p','Estoque é compartilhado: este bloco não muda com o filtro de condomínio. O alerta compara quantidade ≤ mínimo; sem mínimo, avisa apenas quando o saldo é zero. Até 20 itens. Não faz compras automaticamente.','workspace-hint'));
   s.append(table(['Material','Saldo','Mínimo'],data.stock.items.map(r=>[r.name||r.id,number(r.quantity),r.minimum==null?'Não configurado':number(r.minimum)])),button('Definir mínimos no estoque',()=>mostrarAba('estoque')));area.append(s);
  }
 }
 async function load(force=false){
  if(!can('dashboard'))return;
  const hotel=el('decisionHotel').value;if(!force&&snapshot&&hotel===currentHotel&&Date.now()-loaded<30000)return;
  const request=++generation;el('decisionStatus').textContent='Atualizando indicadores…';el('decisionContent').setAttribute('aria-busy','true');el('decisionExport').disabled=true;
  if(hotel!==currentHotel){snapshot=null;el('decisionContent').replaceChildren();}
  try{
   const data=await BookAPI.request('/api/decision'+(hotel?'?hotel='+encodeURIComponent(hotel):''),{timeoutMs:35000});
   if(request!==generation)return;
   if(!data?.services||!Array.isArray(data.queue)||!data.permissions||!data.inspections||!data.stock)throw Error('Resumo incompleto. Atualize para tentar novamente.');
   snapshot=data;currentHotel=hotel;loaded=Date.now();render(data);
   const stamp=new Date(data.generatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
   el('decisionStatus').textContent=`Atualizado em ${stamp} (São Paulo). Totais de todos os registros autorizados, não apenas dos cards carregados.`;el('decisionExport').disabled=false;
  }catch(error){if(request===generation){snapshot=null;el('decisionContent').replaceChildren();el('decisionStatus').textContent=error.message;}}
  finally{if(request===generation)el('decisionContent').setAttribute('aria-busy','false');}
 }
 function exportSummary(){
  if(!snapshot)return;const d=snapshot;
  const rows=[['BOOK TASK · apoio à decisão',d.referenceDate],['Condomínio',d.hotel||'Todos autorizados'],['Atualizado em',d.generatedAt],['Indicador','Quantidade']];
  for(const [key,label]of [['open','Serviços em aberto'],['overdue','Vencidos'],['today','Vencem hoje'],['urgent','Urgentes'],['unassigned','Sem responsável'],['withoutDeadline','Sem prazo válido']])rows.push([label,d.services[key]]);
  rows.push([],['Condomínio','Em aberto','Vencidos','Urgentes']);d.byHotel.forEach(r=>rows.push([r.hotel,r.open,r.overdue,r.urgent]));
  rows.push([],['Responsável','Em aberto','Vencidos']);d.byAssignee.forEach(r=>rows.push([r.name,r.open,r.overdue]));
  rows.push([],['Etapa','Quantidade']);d.byPhase.forEach(r=>rows.push([BookProcesses.phaseLabel(r.phase),r.count]));
  if(d.permissions.inspections){rows.push([],['Vistorias · ciclo trimestral','Quantidade'],['Apartamentos',d.inspections.units],['Prazo vencido',d.inspections.overdue],['Próximos 30 dias',d.inspections.next30],['Sem data registrada',d.inspections.missing]);}
  if(d.permissions.stock){rows.push([],['Estoque global','Quantidade'],['Alertas',d.stock.alerts],['Mínimos não configurados',d.stock.unconfigured]);}
  rows.push([],['Totais globais autorizados; fila limitada a 12 serviços; detalhes de vistorias e estoque limitados a 20. Não é certificação ou previsão de desempenho.']);
  const url=URL.createObjectURL(new Blob([BookProcesses.csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='book-task-indicadores-'+d.referenceDate+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function activate(){if(el('decisionLegacyCharts')?.open)BookStore.activate('dashboardCharts');load();window.BookActivity?.load();}
 function stockControls(table,data){
  const header=table.querySelector('thead tr');if(!header)return;
  const th=node('th','Mínimo / reposição');th.scope='col';header.insertBefore(th,header.lastElementChild);
  if(!data.itens?.length){const empty=table.querySelector('tbody td');if(empty)empty.colSpan++;return;}
  [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{
   const item=data.itens[i];if(!item)return;const td=node('td'),input=node('input');input.type='number';input.min='0';input.max='999999999.99';input.step='0.01';input.value=item.minimo??'';input.placeholder='Não definido';input.setAttribute('aria-label','Estoque mínimo de '+(item.nome||'material sem nome'));
   const alert=node('small',Number(item.quantidade)<=Number(item.minimo??0)?'Revisar reposição':item.minimo==null?'Mínimo não definido':'Saldo acima do mínimo');alert.className=Number(item.quantidade)<=Number(item.minimo??0)?'decision-warning':'workspace-hint';
   input.onchange=async()=>{input.disabled=true;try{await editarEstoque(item.id,'minimo',input.value);mostrarEstoque();}catch(error){input.value=item.minimo??'';alert.textContent=error.message;}finally{input.disabled=false;}};td.append(input,alert);tr.insertBefore(td,tr.lastElementChild);
  });
 }
 function init(){
  const dashboard=el('visaoDashboard'),legacy=node('details',null,'help-panel');legacy.id='decisionLegacyCharts';legacy.append(node('summary','Gráficos dos registros carregados · consulta complementar'));
  dashboard.querySelectorAll('.dashboard-painel').forEach(panel=>legacy.append(panel));dashboard.append(legacy);
  legacy.ontoggle=async()=>{if(legacy.open){BookStore.activate('dashboardCharts');await BookStore.refresh(true).catch(()=>{});atualizarDashboard();}else if(visible())BookStore.activate('dashboard');};
  const panel=node('section',null,'decision-panel');panel.setAttribute('aria-label','Apoio à decisão operacional');
  panel.append(node('h3','Prioridades da operação'),node('p','Decida o próximo passo com prazos, responsáveis e registros reais.','workspace-hint'));
  const controls=node('div',null,'routine-actions'),label=node('label','Condomínio'),select=node('select');select.id='decisionHotel';select.append(new Option('Todos autorizados',''));BookCatalog.hotels.forEach(h=>select.append(new Option(h,h)));label.append(select);controls.append(label,button('Atualizar indicadores',()=>load(true)));
  const exp=button('Exportar resumo CSV',exportSummary);exp.id='decisionExport';exp.disabled=true;controls.append(exp);select.onchange=()=>load(true);panel.append(controls);
  const status=node('p');status.id='decisionStatus';status.setAttribute('role','status');panel.append(status);const content=node('div');content.id='decisionContent';panel.append(content);dashboard.querySelector('.titulo-secao').after(panel);
  window.addEventListener('book:data',()=>{loaded=0;clearTimeout(timer);if(visible())timer=setTimeout(()=>load(true),800);});
  setInterval(()=>{if(visible()&&!document.hidden&&!document.querySelector('dialog[open],.modal[style*="block"]'))load(true);},60000);
 }
 return {init,activate,load,stockControls};
})();
