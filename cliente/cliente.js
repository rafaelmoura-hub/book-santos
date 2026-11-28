let sessaoCliente = null;
try {
  sessaoCliente = JSON.parse(BookStore.getItem('usuarioLogado') || 'null');
} catch {
  /* sessão inválida */
}
if (!sessaoCliente || sessaoCliente.funcao !== 'cliente') location.href = '../login.html';

function lerChamados() {
  try {
    const items = JSON.parse(BookStore.getItem('chamados') || '[]');
    return Array.isArray(items) ? items : [];
  } catch (erro) {
    return [];
  }
}
function escaparHTML(valor) {
  return String(valor == null ? '' : valor).replace(
    /[&<>"']/g,
    (caractere) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere],
  );
}
async function salvarChamados(items) {
  await BookStore.setItem('chamados', JSON.stringify(items));
}

document.getElementById('hotel').addEventListener('change', function () {
  const campo = document.getElementById('apartamento');
  campo.disabled = !this.value;
  campo.innerHTML = this.value
    ? '<option value="">Selecione o apartamento</option>' +
      BookStore.apartments(this.value)
        .map((ap) => `<option value="${escaparHTML(ap)}">${escaparHTML(ap)}</option>`)
        .join('')
    : '<option value="">Selecione primeiro o hotel</option>';
});

let arquivoPreviewUrl = null;
function mostrarArquivo() {
  if (arquivoPreviewUrl) {
    URL.revokeObjectURL(arquivoPreviewUrl);
    arquivoPreviewUrl = null;
  }
  const arquivo = document.getElementById('arquivo').files[0];
  const preview = document.getElementById('preview');
  preview.innerHTML = '';
  if (!arquivo) return;
  const url = URL.createObjectURL(arquivo);
  arquivoPreviewUrl = url;
  if (arquivo.type.startsWith('image/'))
    preview.innerHTML = `<img decoding="async" loading="lazy" src="${url}" alt="Prévia da imagem">`;
  else if (arquivo.type.startsWith('video/'))
    preview.innerHTML = `<video preload="metadata" src="${url}" controls></video>`;
}

async function abrirChamado(event) {
  event.preventDefault();
  const formulario = document.getElementById('formChamado');
  if (!formulario.reportValidity()) return;
  const arquivo = document.getElementById('arquivo').files[0];
  const mensagem = document.getElementById('mensagem');
  try {
    BookStore.validateFiles([arquivo]);
    const anexoData = await new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result);
      leitor.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      leitor.readAsDataURL(arquivo);
    });
    const items = lerChamados();
    items.push({
      id: BookStore.id(),
      hotel: document.getElementById('hotel').value,
      apartamento: document.getElementById('apartamento').value,
      assunto: document.getElementById('assunto').value.trim(),
      categoria: document.getElementById('categoria').value,
      descricao: document.getElementById('descricao').value.trim(),
      prioridade: document.getElementById('prioridade').value,
      status: 'Aberto',
      data: new Date().toLocaleString('pt-BR'),
      criadaEm: new Date().toISOString(),
      criadaPor: sessaoCliente.nome,
      criadaPorLogin: sessaoCliente.login,
      anexoNome: arquivo.name,
      anexoTipo: arquivo.type,
      anexoData,
    });
    await salvarChamados(items);
    formulario.reset();
    document.getElementById('hotel').dispatchEvent(new Event('change'));
    mostrarArquivo();
    mensagem.textContent = 'Chamado salvo no servidor.';
    mostrarChamados();
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

function mostrarChamados() {
  const lista = document.getElementById('listaChamados');
  const items = lerChamados();
  const meusItems = items.filter((c) => c.criadaPorLogin === sessaoCliente.login);
  if (!meusItems.length) {
    lista.innerHTML = '<p>Nenhum chamado cadastrado.</p>';
    return;
  }
  meusItems.sort((a, b) => Number(a.status === 'Fechado') - Number(b.status === 'Fechado'));
  lista.innerHTML = meusItems
    .map(
      (c) =>
        `<article class="chamado ${c.status === 'Fechado' ? 'finalizado' : ''}"><div class="chamado-cabecalho"><strong>${escaparHTML(c.assunto || 'Chamado sem assunto')}</strong><span class="status-tag" data-state="${c.status === 'Fechado' ? 'closed' : 'open'}">${escaparHTML(c.status || 'Aberto')}</span></div><p>${escaparHTML(c.hotel)} · Apartamento ${escaparHTML(c.apartamento)}</p><details class="chamado-info"><summary>Detalhes do chamado</summary><p>Chamado #${escaparHTML(c.id)}</p><p>Categoria: ${escaparHTML(c.categoria)}</p><p>Data: ${escaparHTML(c.data)}</p></details></article>`,
    )
    .join('');
}
function sair() {
  return BookAPI.logout();
}
mostrarChamados();

const CHAVE_CHAT = 'conversasSuporte';
let intervaloChatCliente = null;
function conversasSuporte() {
  try {
    const v = JSON.parse(BookStore.getItem(CHAVE_CHAT) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
async function salvarConversasSuporte(items) {
  await BookStore.setItem(CHAVE_CHAT, JSON.stringify(items));
}
function chamadosDoCliente() {
  return lerChamados().filter((c) => c.criadaPorLogin === sessaoCliente.login);
}
function atualizarListaChamadosChat() {
  const campo = document.getElementById('chamadoChat'),
    anterior = campo.value,
    meus = chamadosDoCliente();
  campo.innerHTML =
    '<option value="">Selecione um chamado</option>' +
    meus
      .map(
        (c) =>
          `<option value="${escaparHTML(c.id)}">#${escaparHTML(c.id)} · ${escaparHTML(c.assunto || 'Chamado')}</option>`,
      )
      .join('');
  if (meus.some((c) => String(c.id) === anterior)) campo.value = anterior;
}
function alternarChatCliente() {
  const painel = document.getElementById('chatCliente');
  painel.hidden = !painel.hidden;
  if (!painel.hidden) {
    atualizarListaChamadosChat();
    if (!intervaloChatCliente) intervaloChatCliente = setInterval(renderizarConversaCliente, 1200);
    renderizarConversaCliente();
  }
}
async function selecionarConversaCliente() {
  // A conversa é criada no envio da primeira mensagem, sem gravar uma conversa
  // vazia que poderia bloquear o envio enquanto o servidor sincroniza.
  await renderizarConversaCliente();
}
async function renderizarConversaCliente() {
  if (document.getElementById('chatCliente').hidden) return;
  const id = document.getElementById('chamadoChat').value,
    area = document.getElementById('mensagensCliente');
  if (!id) {
    area.innerHTML = '<p class="chat-vazio">Selecione um chamado para ver a conversa.</p>';
    return;
  }
  const items = conversasSuporte(),
    conv = items.find((x) => String(x.chamadoId) === id && x.clienteLogin === sessaoCliente.login);
  if (conv) {
    let alterou = false;
    conv.mensagens.forEach((m) => {
      if (m.autorTipo === 'admin' && !m.lidoCliente) {
        m.lidoCliente = true;
        alterou = true;
      }
    });
    if (alterou) await salvarConversasSuporte(items);
  }
  const msgs = conv?.mensagens || [];
  area.innerHTML = msgs.length
    ? msgs
        .map(
          (m) =>
            `<div class="mensagem-chat ${m.autorTipo === 'cliente' ? 'minha-mensagem' : ''}"><strong>${escaparHTML(m.autorNome)}</strong><p>${escaparHTML(m.texto)}</p><small>${new Date(m.criadaEm).toLocaleString('pt-BR')}</small></div>`,
        )
        .join('')
    : '<p class="chat-vazio">Envie uma mensagem para iniciar a conversa.</p>';
  area.scrollTop = area.scrollHeight;
}
async function enviarMensagemCliente(event) {
  event.preventDefault();
  const chamadoId = document.getElementById('chamadoChat').value,
    campo = document.getElementById('textoCliente'),
    texto = campo.value.trim();
  if (!chamadoId || !texto) return;
  const items = conversasSuporte();
  let conv = items.find(
    (x) => String(x.chamadoId) === chamadoId && x.clienteLogin === sessaoCliente.login,
  );
  if (!conv) {
    conv = {
      chamadoId,
      clienteLogin: sessaoCliente.login,
      clienteNome: sessaoCliente.nome,
      mensagens: [],
    };
    items.push(conv);
  }
  conv.mensagens.push({
    id: String(Date.now()),
    autorTipo: 'cliente',
    autorNome: sessaoCliente.nome,
    texto,
    criadaEm: new Date().toISOString(),
    lidoAdmin: false,
    lidoCliente: true,
  });
  try {
    await salvarConversasSuporte(items);
    campo.value = '';
    renderizarConversaCliente();
  } catch (error) {
    document.getElementById('mensagensCliente').setAttribute('aria-label', error.message);
  }
}
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE_CHAT) renderizarConversaCliente();
  if (e.key === 'chamados') {
    atualizarListaChamadosChat();
    mostrarChamados();
  }
});

window.addEventListener('book:data', () => {
  mostrarChamados();
  atualizarListaChamadosChat();
  renderizarConversaCliente();
});
BookNotifications.init(sessaoCliente);

BookMobile.initClient();
