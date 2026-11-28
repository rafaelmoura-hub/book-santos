/* Delegated actions with a small, explicit grammar; no eval or inline scripts. */
(function () {
  const actions = new Set([
    'entrar',
    'sair',
    'mostrarAba',
    'abrirFormularioOS',
    'mostrarOS',
    'ativarNotificacoesChat',
    'enviarMensagemAdmin',
    'adicionarColunaEstoque',
    'adicionarLinhaEstoque',
    'selecionarHotelVistoria',
    'atualizarDashboard',
    'mostrarUsuarios',
    'fecharModal',
    'salvarOS',
    'abrirFechamentoOS',
    'fecharVistoriaModal',
    'salvarVistoria',
    'salvarFechamentoOS',
    'atualizarCustoTotal',
    'atualizarCamposMaterial',
    'adicionarMaterialOS',
    'salvarRascunhoFechamentoOS',
    'removerColunaEstoque',
    'editarEstoque',
    'removerLinhaEstoque',
    'abrirChamado',
    'alterarStatus',
    'abrirOS',
    'alterarStatusOS',
    'atualizarMateriaisOS',
    'selecionarApartamentoVistoria',
    'abrirFormularioVistoria',
    'abrirConversaChat',
    'mostrarArquivo',
    'alternarChatCliente',
    'selecionarConversaCliente',
    'enviarMensagemCliente',
    'mostrarHistorico',
    'selecionarApartamento',
    'mostrarDadosApartamento',
    'filtrarRegistrosHotel',
    'BookCondominios.mostrarHistorico',
    'BookCondominios.selecionarApartamento',
    'BookCondominios.mostrarDadosApartamento',
    'BookCondominios.filtrarRegistrosHotel',
    'BookFinance.load',
    'BookFinance.changePeriod',
    'BookFinance.move',
    'BookFinance.more',
    'BookUsers.render',
    'BookUsers.close',
    'BookUsers.save',
  ]);
  actions.add('BookCondominios.filtrarLista');
  actions.add('BookRoutine.openFlow');
  actions.add('BookRoutine.filterServicesFromList');
  function split(source, separator) {
    const parts = [];
    let start = 0,
      depth = 0,
      quote = '',
      escaped = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === separator && depth === 0) {
        parts.push(source.slice(start, i));
        start = i + 1;
      }
    }
    if (quote || depth !== 0) throw Error('Ação malformada.');
    parts.push(source.slice(start));
    return parts.filter((part) => part.trim());
  }
  function argument(raw, element, event) {
    const value = raw.trim();
    if (value === 'event') return event;
    if (value === 'this.value') return element.value;
    if (value === "document.getElementById('fechamentoIdOS').value")
      return document.getElementById('fechamentoIdOS').value;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (value === 'true' || value === 'false') return value === 'true';
    if (value === 'null') return null;
    if (value.startsWith('"')) return JSON.parse(value);
    if (value.startsWith("'") && value.endsWith("'")) {
      const inner = value.slice(1, -1);
      let text = '';
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '\\') {
          const c = inner[++i];
          if (!["'", '"', '\\', 'n', 'r', 't'].includes(c)) throw Error('Argumento inválido.');
          text += { n: '\n', r: '\r', t: '\t' }[c] ?? c;
        } else {
          if (inner[i] === "'") throw Error('Argumento inválido.');
          text += inner[i];
        }
      }
      return text;
    }
    throw Error('Argumento não permitido.');
  }
  async function execute(source, element, event) {
    if (
      source.startsWith("if(event.key==='Enter'||event.key===' '){event.preventDefault();") &&
      source.endsWith('}')
    ) {
      if (!['Enter', ' '].includes(event.key) || event.target !== element) return;
      event.preventDefault();
      source = source.slice(
        "if(event.key==='Enter'||event.key===' '){event.preventDefault();".length,
        -1,
      );
    }
    for (const part of split(source, ';')) {
      const statement = part.trim();
      if (statement === 'event.stopPropagation()') {
        event.stopPropagation();
        continue;
      }
      if (statement === 'this.parentElement.remove()') {
        element.parentElement.remove();
        continue;
      }
      const close =
        /^document\.getElementById\('(osModal|osDetalhesModal|fechamentoModal)'\)\.style\.display='none'$/.exec(
          statement,
        );
      if (close) {
        document.getElementById(close[1]).style.display = 'none';
        continue;
      }
      const call = /^([A-Za-z][\w]*(?:\.[A-Za-z][\w]*)?)\((.*)\)$/.exec(statement);
      if (!call || !actions.has(call[1])) throw Error('Ação não permitida.');
      const names = call[1].split('.');
      const owner = names.length === 2 ? window[names[0]] : window;
      const fn = owner?.[names.at(-1)];
      if (typeof fn !== 'function') throw Error('Aguarde o carregamento da página.');
      await fn.apply(
        owner,
        split(call[2], ',').map((value) => argument(value, element, event)),
      );
    }
  }
  const searchTimers = new WeakMap();
  for (const type of ['click', 'change', 'input', 'submit', 'keydown'])
    document.addEventListener(type, (event) => {
      const element = event.target.closest?.(`[data-on-${type}]`);
      if (!element) return;
      if (type === 'submit') event.preventDefault();
      const run = () =>
        execute(element.getAttribute(`data-on-${type}`), element, event).catch((error) => {
          console.error(error);
        });
      if (type === 'input' && element.type === 'search') {
        clearTimeout(searchTimers.get(element));
        searchTimers.set(element, setTimeout(run, 120));
      } else run();
    });
})();
