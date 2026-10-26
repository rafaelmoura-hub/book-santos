window.BookFinance = (() => {
  const standard = ['Hóspede','Proprietário','Book Santos','Airbnb','Governança','Sem responsável'];
  let payer = null, rows = [], groups = [], cursor = null, generation = 0, busy = false;
  let controlsReady = false;
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function selectedPeriod() {
    if (!controlsReady) { el('financeiroData').value = BookPeriods.today(); controlsReady = true; }
    const kind = el('financeiroPeriodo').value;
    const all = kind === 'all';
    el('financeiroData').disabled = all;
    el('financeiroAnterior').disabled = all;
    el('financeiroProximo').disabled = all;
    return {kind,...BookPeriods.range(kind,el('financeiroData').value)};
  }
  function changePeriod() {
    ++generation; busy = false;
    rows = []; groups = []; cursor = null;
    el('financeiroIntervalo').textContent = '';
    render();
    return load();
  }
  function move(direction) {
    try {
      el('financeiroData').value = BookPeriods.move(el('financeiroPeriodo').value,el('financeiroData').value,direction);
      return changePeriod();
    } catch (error) { el('financeiroStatus').textContent = error.message; }
  }
  function render() {
    const categories = [null,...new Set([...standard,...groups.map(group => group.payer)])];
    el('financeiroAbas').replaceChildren(...categories.map(category => {
      const button = document.createElement('button'); button.type = 'button'; button.role = 'tab';
      button.className = category === payer ? 'ativa' : '';
      button.setAttribute('aria-selected', String(category === payer));
      const count = category === null ? groups.reduce((sum, group) => sum + Number(group.count),0) : groups.find(group => group.payer === category)?.count || 0;
      button.textContent = `${category || 'Todos'} (${count})`;
      button.onclick = () => { payer = category; rows = []; cursor = null; render(); load(); };
      return button;
    }));
    const selected = payer === null ? groups : groups.filter(group => group.payer === payer);
    const card = (title, value) => `<div class="card"><h3>${title}</h3><p>${esc(value)}</p></div>`;
    el('financeiroTotais').innerHTML = card('Valor registrado',BookMoney.format(BookMoney.sum(selected.map(group=>group.total)))) + card('Cards finalizados',BookMoney.format(BookMoney.sum(selected.map(group=>group.finalized)))) + card('Valores provisórios',BookMoney.format(BookMoney.sum(selected.map(group=>group.pending))));
    el('financeiroLista').innerHTML = rows.map(row => `<article class="chamado financeiro-card"><div class="os-topo"><strong>${esc(row.title || 'Card sem assunto')}</strong><span class="selo-status">${esc(row.status)}</span></div><p><b>Condomínio:</b> ${esc(row.hotel)} · <b>Apartamento:</b> ${esc(row.apartment)}</p><p><b>Responsável pelo pagamento:</b> ${esc(row.payer)}</p><p class="financeiro-descricao">${esc(row.description || 'Sem descrição.')}</p><dl><div><dt>Serviço</dt><dd>${esc(BookMoney.format(row.service))}</dd></div><div><dt>Material</dt><dd>${esc(BookMoney.format(row.material))}</dd></div><div><dt>Valor total</dt><dd>${esc(BookMoney.format(row.total))}</dd></div></dl><p><b>Data:</b> ${esc(BookPeriods.display(row.date))}</p><small>Card #${esc(row.id)}${row.status === 'Finalizada' ? '' : ' · Valor provisório'}</small></article>`).join('') || '<p class="vazio">Nenhum card para este responsável.</p>';
    el('financeiroMais').hidden = !cursor;
    el('financeiroMais').disabled = busy;
  }
  async function load(append = false) {
    if (append && (busy || !cursor)) return;
    let period;
    try { period = selectedPeriod(); }
    catch (error) { el('financeiroStatus').textContent = error.message; return; }
    el('financeiroIntervalo').textContent = period.label;
    const current = ++generation; busy = true;
    const selectedPayer = payer;
    el('financeiroStatus').textContent = 'Consultando o financeiro…';
    el('financeiroMais').disabled = true;
    const query = new URLSearchParams({period:period.kind});
    if (period.kind !== 'all') query.set('date',el('financeiroData').value);
    if (selectedPayer !== null) query.set('payer',selectedPayer);
    if (append && cursor) query.set('cursor',cursor);
    try {
      const data = await BookAPI.request(`/api/finance?${query}`,{timeoutMs:45000});
      if (current !== generation) return;
      if (!Array.isArray(data.groups) || !Array.isArray(data.records)) throw new Error('Não foi possível ler o resumo financeiro.');
      groups = data.groups;
      rows = append ? [...new Map([...rows,...data.records].map(row=>[row.id,row])).values()] : data.records;
      cursor = data.next;
      el('financeiroStatus').textContent = `${rows.length} ${rows.length === 1 ? 'card carregado' : 'cards carregados'}${cursor ? ' · Há mais resultados' : ''}`;
      render();
    } catch (error) { if (current === generation) el('financeiroStatus').textContent = error.message; }
    finally { if (current === generation) { busy = false; el('financeiroMais').disabled = false; } }
  }
  return { load: () => load(false), more: () => load(true), changePeriod, move };
})();
