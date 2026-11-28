/* Tela de administração: sessão, abas e inicialização. Carregado por assets/session.js depois de BookStore.init.
   As funções usadas aqui ficam nos scripts de adm/ carregados antes em admin.html (escopo global compartilhado). */
function obterSessao() {
  try {
    return JSON.parse(BookStore.getItem('usuarioLogado') || 'null');
  } catch {
    return null;
  }
}
const sessao = obterSessao();
if (!sessao || sessao.funcao !== 'adm') location.href = '../login.html';
const ehAdministradorMestre = !!sessao?.mestre;
atualizarUsuarios().catch((error) => alert(error.message));
if (ehAdministradorMestre) document.getElementById('abaUsuarios').hidden = false;
if (ehAdministradorMestre) document.getElementById('abaBackup').hidden = false;

function atualizarPainel() {
  const items = chamados();
  const totals = BookStore.totals();
  document.getElementById('total').textContent = totals?.chamados ?? items.length;
  document.getElementById('abertos').textContent =
    totals?.abertos ?? items.filter((c) => (c.status || 'Aberto') === 'Aberto').length;
  document.getElementById('andamento').textContent = totals?.ordensServico ?? osList().length;
  document.getElementById('resolvidos').textContent =
    totals?.fechados ?? items.filter((c) => c.status === 'Fechado').length;
  if (!document.getElementById('visaoChamados').hidden) mostrarChamados();
  if (!document.getElementById('visaoOS').hidden) mostrarOS();
}
function mostrarAba(aba) {
  if (['reservas', 'projetos', 'compras'].includes(aba)) return;
  if (window.BookWorkspace && aba in BookWorkspace.labels && !BookWorkspace.can(aba)) return;
  if (aba === 'suporte' && !ehAdministradorMestre) return;
  if (['usuarios', 'backup'].includes(aba) && !ehAdministradorMestre) return;
  BookStore.activate(aba);
  window.BookNavigation?.activate(aba);
  let enteredSection = null;
  [
    'chamados',
    'chat',
    'os',
    'vistorias',
    'condominios',
    'estoque',
    'financeiro',
    'usuarios',
    'dashboard',
    'backup',
    'suporte',
    'inicio',
    'feedbacks',
    'avaliacoes',
    'onboarding',
    'danos',
  ].forEach((nome) => {
    const sufixo = nome === 'os' ? 'OS' : nome[0].toUpperCase() + nome.slice(1);
    const section = document.getElementById(`visao${sufixo}`);
    if (nome === aba && section.hidden) enteredSection = section;
    section.getAnimations?.().forEach((animation) => {
      if (animation.id === 'book-tab-enter') animation.cancel();
    });
    section.hidden = nome !== aba;
    if (document.getElementById(`aba${sufixo}`))
      document.getElementById(`aba${sufixo}`).classList.toggle('ativa', nome === aba);
    if (document.getElementById(`aba${sufixo}`))
      document
        .getElementById(`aba${sufixo}`)
        .setAttribute('aria-current', nome === aba ? 'page' : 'false');
  });
  if (aba === 'os') mostrarOS();
  if (aba === 'chamados') mostrarChamados();
  if (aba === 'vistorias') atualizarTotaisVistorias();
  if (aba === 'usuarios') mostrarUsuarios();
  if (aba === 'suporte') BookWorkspace.loadMaster();
  if (aba === 'feedbacks') BookCollaboration.loadFeedbacks();
  if (aba === 'avaliacoes') BookCollaboration.loadEvaluations();
  window.BookRoutine?.activate(aba);
  if (aba === 'condominios') BookCondominios.atualizarTotais();
  if (aba === 'dashboard') {
    BookDecision.activate();
    atualizarDashboard();
  }
  if (aba === 'estoque') mostrarEstoque();
  if (aba === 'financeiro') BookFinance.load();
  if (aba === 'chat') mostrarConversasChat();
  if (enteredSection && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const animation = enteredSection.animate?.(
      [
        { opacity: 0, transform: 'translateX(32px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    if (animation) animation.id = 'book-tab-enter';
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (window.matchMedia('(max-width: 760px)').matches) {
    const suffix = aba === 'os' ? 'OS' : aba[0].toUpperCase() + aba.slice(1);
    document
      .getElementById(`aba${suffix}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
document.getElementById('osHotel').addEventListener('change', preencherApartamentos);
document.getElementById('vistoriaTipo').addEventListener('change', renderizarChecklistVistoria);
document.getElementById('vistoriaFotos').addEventListener('change', (event) => {
  const total = event.target.files.length;
  if (total > 20) event.target.value = '';
  document.getElementById('vistoriaFotosAjuda').textContent =
    `${total > 20 ? 0 : total} de 20 fotos selecionadas.`;
  if (total > 20) alert('O limite é de 20 fotos por vistoria.');
});
function sair() {
  return BookAPI.logout();
}
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE_CHAT) {
    verificarNovasMensagensChat();
    if (conversaSelecionada) renderizarMensagensAdmin();
  }
});
idsMensagensConhecidas = new Set(
  lerConversasChat().flatMap((c) => (c.mensagens || []).map((m) => m.id)),
);
atualizarBadgeChat();
BookWorkspace.init(sessao);
BookAccount.init();
BookCollaboration.init(sessao);
BookRoutine.init(sessao);
BookOnboarding.init();
BookProperty.init(sessao);
window.addEventListener('book:catalog', () => {
  if (vistoriaHotel) selecionarHotelVistoria(vistoriaHotel);
});
BookDecision.init();
BookActivity.init();
BookNotifications.init(sessao);
BookNavigation.init();
window.addEventListener('book:theme', () => {
  if (!document.getElementById('visaoDashboard').hidden) atualizarDashboard();
});

document.getElementById('masterSupportRefresh').onclick = () => BookWorkspace.loadMaster();
const primeiraAba =
  Object.keys(BookWorkspace.labels).find((tab) => BookWorkspace.can(tab)) || 'inicio';
mostrarAba(primeiraAba);
BookStore.activate(primeiraAba);
document.getElementById('osVencimento').min = dataLocalHoje();
atualizarPainel();
const abaSolicitada = {
  '#chamados': 'chamados',
  '#chat': 'chat',
  '#cards': 'os',
  '#vistorias': 'vistorias',
  '#dashboard': 'dashboard',
  '#condominios': 'condominios',
  '#estoque': 'estoque',
  '#usuarios': 'usuarios',
  '#financeiro': 'financeiro',
  '#backup': 'backup',
}[location.hash];
if (abaSolicitada) mostrarAba(abaSolicitada);

window.addEventListener('book:data', () => {
  atualizarPainel();
  if (!document.getElementById('visaoVistorias').hidden) atualizarTotaisVistorias();
  if (!document.getElementById('visaoEstoque').hidden) mostrarEstoque();
  if (!document.getElementById('visaoDashboard').hidden) atualizarDashboard();
  if (vistoriaHotel && vistoriaApartamento && !document.getElementById('visaoVistorias').hidden)
    selecionarApartamentoVistoria(vistoriaApartamento);
  verificarNovasMensagensChat();
});

BookMoney.bind(document);
