/* Tela de administração: chat de suporte com os clientes e avisos de novas mensagens. */
const CHAVE_CHAT = 'conversasSuporte';
let conversaSelecionada = '';
let idsMensagensConhecidas = new Set();
function lerConversasChat() {
  try {
    const v = JSON.parse(BookStore.getItem(CHAVE_CHAT) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
async function salvarConversasChat(items) {
  await BookStore.setItem(CHAVE_CHAT, JSON.stringify(items));
}
function chaveConversaChat(c) {
  return `${c.clienteLogin}::${c.chamadoId}`;
}
function totalNaoLidasChat() {
  return lerConversasChat().reduce(
    (n, c) =>
      n + (c.mensagens || []).filter((m) => m.autorTipo === 'cliente' && !m.lidoAdmin).length,
    0,
  );
}
function atualizarBadgeChat() {
  const total = totalNaoLidasChat(),
    badge = document.getElementById('chatBadge');
  badge.hidden = !total;
  badge.textContent = total > 99 ? '99+' : String(total);
}
function mostrarConversasChat() {
  const area = document.getElementById('listaConversasChat'),
    conversas = lerConversasChat()
      .slice()
      .sort((a, b) =>
        String(b.mensagens?.at(-1)?.criadaEm || '').localeCompare(
          String(a.mensagens?.at(-1)?.criadaEm || ''),
        ),
      );
  area.innerHTML = conversas.length
    ? conversas
        .map((c) => {
          const ultima = c.mensagens?.at(-1),
            naoLidas = (c.mensagens || []).filter(
              (m) => m.autorTipo === 'cliente' && !m.lidoAdmin,
            ).length,
            key = chaveConversaChat(c);
          return `<button type="button" class="item-conversa-chat ${key === conversaSelecionada ? 'selecionada' : ''}" data-on-click="${escapar(`abrirConversaChat(${JSON.stringify(c.clienteLogin)},${JSON.stringify(c.chamadoId)})`)}"><strong>${escapar(c.clienteNome || c.clienteLogin)}</strong><span>Chamado #${escapar(c.chamadoId)}</span><small>${escapar(ultima?.texto || 'Sem mensagens')}</small>${naoLidas ? `<i>${naoLidas}</i>` : ''}</button>`;
        })
        .join('')
    : '<p class="chat-vazio">Nenhuma conversa iniciada pelos clientes.</p>';
  atualizarBadgeChat();
  if (conversaSelecionada) renderizarMensagensAdmin();
}
async function abrirConversaChat(login, id) {
  conversaSelecionada = `${login}::${id}`;
  const items = lerConversasChat(),
    c = items.find((x) => chaveConversaChat(x) === conversaSelecionada);
  if (c) {
    c.mensagens.forEach((m) => {
      if (m.autorTipo === 'cliente') m.lidoAdmin = true;
    });
    await salvarConversasChat(items);
  }
  const chamado = chamados().find((x) => String(x.id) === String(id));
  document.getElementById('cabecalhoConversaChat').innerHTML =
    `<strong>${escapar(c?.clienteNome || login)}</strong><span>Chamado #${escapar(id)} · ${escapar(chamado?.assunto || 'Chamado')}</span>`;
  document.getElementById('textoAdmin').disabled = false;
  document.getElementById('enviarAdmin').disabled = false;
  mostrarConversasChat();
  renderizarMensagensAdmin();
}
function renderizarMensagensAdmin() {
  const area = document.getElementById('mensagensAdmin'),
    c = lerConversasChat().find((x) => chaveConversaChat(x) === conversaSelecionada);
  if (!c) {
    area.innerHTML = '<p class="chat-vazio">Selecione uma conversa para ver as mensagens.</p>';
    return;
  }
  area.innerHTML = c.mensagens.length
    ? c.mensagens
        .map(
          (m) =>
            `<div class="mensagem-chat ${m.autorTipo === 'admin' ? 'minha-mensagem' : ''}"><strong>${escapar(m.autorNome)}</strong><p>${escapar(m.texto)}</p><small>${new Date(m.criadaEm).toLocaleString('pt-BR')}</small></div>`,
        )
        .join('')
    : '<p class="chat-vazio">Envie uma resposta para iniciar a conversa.</p>';
  area.scrollTop = area.scrollHeight;
}
async function enviarMensagemAdmin(event) {
  event.preventDefault();
  const campo = document.getElementById('textoAdmin'),
    texto = campo.value.trim();
  if (!conversaSelecionada || !texto) return;
  const items = lerConversasChat(),
    c = items.find((x) => chaveConversaChat(x) === conversaSelecionada);
  if (!c) return;
  c.mensagens.push({
    id: String(Date.now()),
    autorTipo: 'admin',
    autorNome: sessao.nome || 'Suporte',
    texto,
    criadaEm: new Date().toISOString(),
    lidoAdmin: true,
    lidoCliente: false,
  });
  try {
    await salvarConversasChat(items);
    campo.value = '';
    mostrarConversasChat();
    renderizarMensagensAdmin();
  } catch (error) {
    return;
  }
}
let avisoChatTimer = null;
function exibirAvisoChat(texto) {
  const aviso = document.getElementById('avisoChat');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(avisoChatTimer);
  avisoChatTimer = setTimeout(() => (aviso.hidden = true), 6500);
}
function verificarNovasMensagensChat() {
  const conversas = lerConversasChat();
  let novas = [];
  conversas.forEach((c) =>
    (c.mensagens || []).forEach((m) => {
      if (!idsMensagensConhecidas.has(m.id)) {
        idsMensagensConhecidas.add(m.id);
        if (m.autorTipo === 'cliente') novas.push({ c, m });
      }
    }),
  );
  if (novas.length) {
    const { c, m } = novas.at(-1);
    exibirAvisoChat(
      `Nova mensagem de ${c.clienteNome || c.clienteLogin} · Chamado #${c.chamadoId}`,
    );
  }
  atualizarBadgeChat();
  if (document.getElementById('visaoChat') && !document.getElementById('visaoChat').hidden)
    mostrarConversasChat();
}
function ativarNotificacoesChat() {
  if (!('Notification' in window)) {
    alert('Este navegador não oferece notificações do sistema.');
    return;
  }
  Notification.requestPermission().then((p) =>
    alert(p === 'granted' ? 'Notificações ativadas.' : 'Permissão de notificações não concedida.'),
  );
}
