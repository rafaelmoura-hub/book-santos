window.BookFinance = (() => {
  const standard = [
    'Hóspede',
    'Proprietário',
    'Book Santos',
    'Airbnb',
    'Governança',
    'Sem responsável',
  ];
  let payer = null,
    rows = [],
    groups = [],
    cursor = null,
    generation = 0,
    busy = false;
  let controlsReady = false;
  const el = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  function selectedPeriod() {
    if (!controlsReady) {
      el('financeiroData').value = BookPeriods.today();
      controlsReady = true;
    }
    const kind = el('financeiroPeriodo').value;
    const all = kind === 'all';
    el('financeiroData').disabled = all;
    el('financeiroAnterior').disabled = all;
    el('financeiroProximo').disabled = all;
    return { kind, ...BookPeriods.range(kind, el('financeiroData').value) };
  }
  function changePeriod() {
    ++generation;
    busy = false;
    rows = [];
    groups = [];
    cursor = null;
    el('financeiroIntervalo').textContent = '';
    render();
    return load();
  }
  function move(direction) {
    try {
      el('financeiroData').value = BookPeriods.move(
        el('financeiroPeriodo').value,
        el('financeiroData').value,
        direction,
      );
      return changePeriod();
    } catch (error) {
      el('financeiroStatus').textContent = error.message;
    }
  }
  function render() {
    const categories = [null, ...new Set([...standard, ...groups.map((group) => group.payer)])];
    el('financeiroAbas').replaceChildren(
      ...categories.map((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'tab';
        button.className = category === payer ? 'ativa' : '';
        button.setAttribute('aria-selected', String(category === payer));
        const count =
          category === null
            ? groups.reduce((sum, group) => sum + Number(group.count), 0)
            : groups.find((group) => group.payer === category)?.count || 0;
        button.textContent = `${category || 'Todos'} (${count})`;
        button.onclick = () => {
          payer = category;
          rows = [];
          cursor = null;
          render();
          load();
        };
        return button;
      }),
    );
    const selected = payer === null ? groups : groups.filter((group) => group.payer === payer);
    const card = (title, value) => `<div class="card"><h3>${title}</h3><p>${esc(value)}</p></div>`;
    el('financeiroTotais').innerHTML =
      card(
        'Valor registrado',
        BookMoney.format(BookMoney.sum(selected.map((group) => group.total))),
      ) +
      card(
        'Cards finalizados',
        BookMoney.format(BookMoney.sum(selected.map((group) => group.finalized))),
      ) +
      card(
        'Valores provisórios',
        BookMoney.format(BookMoney.sum(selected.map((group) => group.pending))),
      );
    const table = rows.length
      ? `<div class="layout-table-scroll"><table class="layout-finance-table"><caption>Serviços do período e responsável selecionados</caption><thead><tr>${['Serviço', 'Imóvel', 'Pagador', 'Serviço (R$)', 'Materiais (R$)', 'Total (R$)', 'Situação'].map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr class="financeiro-card"><td><strong>${esc(row.title || 'Card sem assunto')}</strong><small>Card #${esc(row.id)} · ${esc(BookPeriods.display(row.date))}</small><details><summary>Descrição</summary><p class="financeiro-descricao">${esc(row.description || 'Sem descrição.')}</p></details></td><td>${esc(row.hotel)}<small>Apartamento ${esc(row.apartment)}</small></td><td>${esc(row.payer)}</td><td>${esc(BookMoney.format(row.service))}</td><td>${esc(BookMoney.format(row.material))}</td><td><strong>${esc(BookMoney.format(row.total))}</strong></td><td><span class="selo-status">${esc(BookProcesses.orderStatusLabel(row.status))}</span>${row.status === 'Finalizada' ? '' : '<small>Valor provisório</small>'}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vazio">Nenhum card para este responsável.</p>';
    const summary = selected.length
      ? `<aside class="layout-payer-summary"><h3>Por pagador</h3>${selected.map((group) => `<article><h4>${esc(group.payer)}</h4><p>${esc(group.count)} cards</p><p>Total registrado <strong>${esc(BookMoney.format(group.total))}</strong></p><p>Finalizado <strong>${esc(BookMoney.format(group.finalized))}</strong></p><p>Provisório <strong>${esc(BookMoney.format(group.pending))}</strong></p></article>`).join('')}</aside>`
      : '';
    el('financeiroLista').innerHTML = `<div class="layout-finance-grid">${table}${summary}</div>`;
    const headings = [...el('financeiroLista').querySelectorAll('th')].map((h) => h.textContent);
    el('financeiroLista')
      .querySelectorAll('tbody tr')
      .forEach((row) =>
        [...row.cells].forEach((cell, index) => {
          cell.dataset.label = headings[index];
          cell.setAttribute('aria-label', headings[index] + ': ' + cell.textContent);
        }),
      );
    el('financeiroMais').hidden = !cursor;
    el('financeiroMais').disabled = busy;
  }
  async function load(append = false) {
    if (append && (busy || !cursor)) return;
    let period;
    try {
      period = selectedPeriod();
    } catch (error) {
      el('financeiroStatus').textContent = error.message;
      return;
    }
    el('financeiroIntervalo').textContent = period.label;
    const current = ++generation;
    busy = true;
    const selectedPayer = payer;
    el('financeiroStatus').textContent = 'Consultando o financeiro…';
    el('financeiroMais').disabled = true;
    const query = new URLSearchParams({ period: period.kind });
    if (period.kind !== 'all') query.set('date', el('financeiroData').value);
    if (selectedPayer !== null) query.set('payer', selectedPayer);
    if (append && cursor) query.set('cursor', cursor);
    try {
      const data = await BookAPI.request(`/api/finance?${query}`, { timeoutMs: 45000 });
      if (current !== generation) return;
      if (!Array.isArray(data.groups) || !Array.isArray(data.records))
        throw new Error('Não foi possível ler o resumo financeiro.');
      groups = data.groups;
      rows = append
        ? [...new Map([...rows, ...data.records].map((row) => [row.id, row])).values()]
        : data.records;
      cursor = data.next;
      el('financeiroStatus').textContent =
        `${rows.length} ${rows.length === 1 ? 'card carregado' : 'cards carregados'}${cursor ? ' · Há mais resultados' : ''}`;
      render();
    } catch (error) {
      if (current === generation) el('financeiroStatus').textContent = error.message;
    } finally {
      if (current === generation) {
        busy = false;
        el('financeiroMais').disabled = false;
      }
    }
  }
  return { load: () => load(false), more: () => load(true), changePeriod, move };
})();
