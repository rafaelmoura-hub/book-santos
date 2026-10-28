function obterSessao() {
  try { return JSON.parse(BookStore.getItem("usuarioLogado") || "null"); } catch { return null; }
}
const sessao = obterSessao();
if (!sessao || sessao.funcao !== "adm") location.href = "../login.html";
const ehAdministradorMestre = !!sessao?.mestre;
let usuariosCache = [];
const lerUsuarios = () => usuariosCache;
async function atualizarUsuarios() {
  usuariosCache = await BookAPI.request('/api/users');
}
atualizarUsuarios().catch(error => alert(error.message));
if (ehAdministradorMestre) document.getElementById("abaUsuarios").hidden = false;
if (ehAdministradorMestre) document.getElementById("abaBackup").hidden = false;

const apartamentos = hotel => BookStore.apartments(hotel);
const ler = key => {
  try {
    const value = JSON.parse(BookStore.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  }
  catch (erro) { return []; }
};
const chamados = () => ler("chamados");
const osList = () => ler("ordensServico");
const CHAVE_ESTOQUE = "estoqueBookSantos";
const lerEstoque = () => { try { const dados = JSON.parse(BookStore.getItem(CHAVE_ESTOQUE) || "null"); return dados && Array.isArray(dados.itens) ? dados : { colunas: [], itens: [] }; } catch { return { colunas: [], itens: [] }; } };
async function salvarEstoque(dados) { await BookStore.setItem(CHAVE_ESTOQUE, JSON.stringify(dados)); }
const escapar = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function atualizarPainel() {
  const items = chamados();
  const totals = BookStore.totals();
  document.getElementById("total").textContent = totals?.chamados ?? items.length;
  document.getElementById("abertos").textContent = totals?.abertos ?? items.filter(c => (c.status || "Aberto") === "Aberto").length;
  document.getElementById("andamento").textContent = totals?.ordensServico ?? osList().length;
  document.getElementById("resolvidos").textContent = totals?.fechados ?? items.filter(c => c.status === "Fechado").length;
  if (!document.getElementById('visaoChamados').hidden) mostrarChamados();
  if (!document.getElementById('visaoOS').hidden) mostrarOS();
}
function mostrarAba(aba) {
  if (window.BookWorkspace && aba in BookWorkspace.labels && !BookWorkspace.can(aba)) return;
  if (aba==='suporte'&&!ehAdministradorMestre) return;
  if (["usuarios", "backup"].includes(aba) && !ehAdministradorMestre) return;
  BookStore.activate(aba);
  ["chamados", "chat", "os", "vistorias", "condominios", "estoque", "financeiro", "usuarios", "dashboard", "backup", "suporte", "inicio", "feedbacks", "avaliacoes"].forEach(nome => {
    const sufixo = nome === "os" ? "OS" : nome[0].toUpperCase() + nome.slice(1);
    document.getElementById(`visao${sufixo}`).hidden = nome !== aba;
    if (document.getElementById(`aba${sufixo}`)) document.getElementById(`aba${sufixo}`).classList.toggle("ativa", nome === aba);
    if (document.getElementById(`aba${sufixo}`)) document.getElementById(`aba${sufixo}`).setAttribute('aria-current', nome === aba ? 'page' : 'false');
  });
  if (aba === "os") mostrarOS();
  if (aba === "chamados") mostrarChamados();
  if (aba === "vistorias") atualizarTotaisVistorias();
  if (aba === "usuarios") mostrarUsuarios();
  if (aba === 'suporte') BookWorkspace.loadMaster();
  if(aba==='feedbacks')BookCollaboration.loadFeedbacks();
  if(aba==='avaliacoes')BookCollaboration.loadEvaluations();
  if (aba === "condominios") BookCondominios.atualizarTotais();
  if (aba === "dashboard") atualizarDashboard();
  if (aba === "estoque") mostrarEstoque();
  if (aba === "financeiro") BookFinance.load();
  if (aba === "chat") mostrarConversasChat();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (window.matchMedia('(max-width: 760px)').matches) {
    const suffix = aba === 'os' ? 'OS' : aba[0].toUpperCase() + aba.slice(1);
    document.getElementById(`aba${suffix}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function mostrarEstoque() {
  const dados = lerEstoque(), colunas = dados.colunas || [], tabela = document.getElementById("tabelaEstoque");
  tabela.innerHTML = `<thead><tr><th>Material</th><th>Quantidade</th><th>Valor unitário (R$)</th>${colunas.map(c => `<th>${escapar(c.nome)} <button class="remover-coluna" title="Remover coluna" data-on-click="removerColunaEstoque('${escapar(c.id)}')">×</button></th>`).join("")}<th>Ações</th></tr></thead><tbody>${dados.itens.map(item => `<tr><td><input aria-label="Nome do material" value="${escapar(item.nome)}" data-on-change="editarEstoque('${escapar(item.id)}','nome',this.value)"></td><td><input aria-label="Quantidade" type="number" min="0" step="0.01" value="${Number(item.quantidade)||0}" data-on-change="editarEstoque('${escapar(item.id)}','quantidade',this.value)"></td><td><input aria-label="Valor unitário" type="number" min="0" step="0.01" data-money value="${BookMoney.decimal(item.valor)}" data-on-change="editarEstoque('${escapar(item.id)}','valor',this.value)"></td>${colunas.map(c => `<td><input aria-label="${escapar(c.nome)}" value="${escapar(item.extra?.[c.id] || "")}" data-on-change="editarEstoque('${escapar(item.id)}','extra:${escapar(c.id)}',this.value)"></td>`).join("")}<td><button class="botao-remover" data-on-click="removerLinhaEstoque('${escapar(item.id)}')">Apagar</button></td></tr>`).join("") || `<tr><td colspan="${4+colunas.length}">Nenhum material cadastrado. Use “+ Material” para começar.</td></tr>`}</tbody>`;
  BookMoney.bind(tabela);
}
async function adicionarLinhaEstoque() { const d=lerEstoque(); d.itens.push({id:String(Date.now())+Math.random().toString(16).slice(2),nome:"",quantidade:0,valor:"0.00",extra:{}}); await salvarEstoque(d); mostrarEstoque(); }
async function editarEstoque(id,campo,valor) { const d=lerEstoque(), item=d.itens.find(i=>i.id===id); if(!item)return; if(campo.startsWith("extra:")){item.extra ||= {}; item.extra[campo.slice(6)]=valor;} else item[campo]=campo==="nome"?valor:campo==="valor"?BookMoney.parse(valor):Number(valor)||0; await salvarEstoque(d); }
async function removerLinhaEstoque(id) { const emUso=osList().some(o=>(o.fechamento?.materiais||[]).some(m=>m.id===id)); if(emUso){alert("Este material já foi usado em uma O.S. e não pode ser removido.");return;} const d=lerEstoque(); if(!confirm("Apagar este material do estoque?"))return; d.itens=d.itens.filter(i=>i.id!==id); await salvarEstoque(d); mostrarEstoque(); }
async function adicionarColunaEstoque() { const nome=prompt("Nome da nova coluna:"); if(!nome?.trim())return; const d=lerEstoque(); d.colunas.push({id:String(Date.now()),nome:nome.trim()}); await salvarEstoque(d); mostrarEstoque(); }
async function removerColunaEstoque(id) { const d=lerEstoque(); d.colunas=d.colunas.filter(c=>c.id!==id); d.itens.forEach(i=>{if(i.extra)delete i.extra[id];}); await salvarEstoque(d); mostrarEstoque(); }

async function mostrarUsuarios(abrirCadastro = false) {
  if (!ehAdministradorMestre) return;
  try {
    if (!window.BookUsers) throw new Error('O formulário de usuários não carregou. Atualize a página com Ctrl + Shift + R.');
    if (await BookUsers.load() && abrirCadastro) await BookUsers.open();
  } catch (error) {
    document.getElementById('usuariosStatus').textContent = error.message;
  }
}
function usuariosQueFinalizam() { return lerUsuarios().filter(usuario => usuario.funcao === "adm"); }
function preencherExecutores(selecionado = "") {
  const campo = document.getElementById("fechamentoExecutadoPor");
  campo.innerHTML = '<option value="">Selecione o executor</option>' + usuariosQueFinalizam().map(usuario => `<option value="${escapar(usuario.login)}" ${usuario.login === selecionado || usuario.nome === selecionado ? "selected" : ""}>${escapar(usuario.nome)}</option>`).join("");
}
function formatarData(data) {
  if (!data) return "Sem data";
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : escapar(data);
}
function mostrarChamados() {
  const area = document.getElementById("listaChamados"), items = chamados();
  items.sort((a, b) => Number(a.status === "Fechado") - Number(b.status === "Fechado"));
  area.innerHTML = items.length ? items.map(c => `<article class="chamado linha-chamado ${c.status === "Fechado" ? "finalizado" : ""}" data-on-click="abrirChamado(${Number(c.id)})"><div><strong>${escapar(c.assunto || "Chamado sem assunto")}</strong><span>${escapar(c.hotel)} - Apartamento ${escapar(c.apartamento)}</span></div><select aria-label="Status" data-on-click="event.stopPropagation()" data-on-change="alterarStatus(${Number(c.id)},this.value)"><option ${((c.status || "Aberto")==="Aberto")?"selected":""}>Aberto</option><option ${c.status==="Fechado"?"selected":""}>Fechado</option></select></article>`).join("") : "<p class=\"vazio\">Nenhum chamado cadastrado.</p>";
}
async function alterarStatus(id, status) {
  const items = chamados(), item = items.find(c => c.id == id);
  if (item) { item.status = status; if (status === "Fechado") item.fechadaEm = new Date().toISOString(); else delete item.fechadaEm; await BookStore.setItem("chamados", JSON.stringify(items)); }
  atualizarPainel();
}
function abrirChamado(id) {
  const c = chamados().find(item => item.id == id); if (!c) return;
  const anexo = c.anexoTipo?.startsWith("image/") ? `<img decoding="async" loading="lazy" src="${c.anexoData}" alt="Anexo">` : c.anexoTipo?.startsWith("video/") ? `<video preload="metadata" src="${c.anexoData}" controls></video>` : "Sem anexo";
  document.getElementById("detalhes").innerHTML = `<h2>Chamado #${c.id}</h2><p><b>Hotel:</b> ${escapar(c.hotel)}</p><p><b>Apartamento:</b> ${escapar(c.apartamento)}</p><p><b>Assunto:</b> ${escapar(c.assunto)}</p><p><b>Categoria:</b> ${escapar(c.categoria)}</p><p><b>Descri\u00e7\u00e3o:</b> ${escapar(c.descricao)}</p><p><b>Status:</b> ${escapar(c.status || "Aberto")}</p><p><b>Data:</b> ${escapar(c.data)}</p><p><b>Arquivo:</b> ${escapar(c.anexoNome)}</p>${anexo}<p><button data-on-click="abrirFormularioOS(${Number(c.id)})">Abrir Card para este chamado</button></p>`;
  document.getElementById("modal").style.display = "block";
}
function fecharModal() { document.getElementById("modal").style.display = "none"; }
function preencherApartamentos() {
  const hotel = document.getElementById("osHotel").value;
  const unidades = apartamentos(hotel);
  const campo = document.getElementById("osApartamento");
  campo.disabled = !hotel || !unidades.length;
  campo.innerHTML = `<option value="">${!hotel ? "Selecione primeiro o condomínio" : unidades.length ? "Selecione o apartamento" : "Nenhum apartamento cadastrado"}</option>` + unidades.map(a => `<option value="${escapar(a)}">${escapar(a)}</option>`).join("");
}
document.getElementById("osHotel").addEventListener("change", preencherApartamentos);
function abrirFormularioOS(chamadoId = "", hotelPreselecionado = "", apartamentoPreselecionado = "") {
  fecharModal(); document.getElementById("formOS").reset();
  const c = chamadoId ? chamados().find(item => item.id == chamadoId) : null;
  document.getElementById("osChamado").value = chamadoId || "";
  document.getElementById("osHotel").value = c?.hotel || hotelPreselecionado || "";
  preencherApartamentos();
  document.getElementById('osResponsavel').innerHTML = '<option value="">Selecione o responsável</option>' + usuariosQueFinalizam().map(usuario => `<option value="${escapar(usuario.login)}">${escapar(usuario.nome)}</option>`).join('');
  if (c || apartamentoPreselecionado) document.getElementById("osApartamento").value = c?.apartamento || apartamentoPreselecionado;
  document.getElementById("osModal").style.display = "block";
}
async function salvarOS(event) {
  event.preventDefault();
  const arquivos = [...document.getElementById("osAnexos").files];
  BookStore.validateFiles(arquivos);
  if (arquivos.some(arquivo => arquivo.size > 5 * 1024 * 1024) || arquivos.reduce((total, arquivo) => total + arquivo.size, 0) > 10 * 1024 * 1024) {
    alert("Cada anexo pode ter até 5 MB e o conjunto até 10 MB.");
    return;
  }
  return Promise.all(arquivos.map(arquivo => new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: arquivo.name, tipo: arquivo.type, dados: leitor.result });
    leitor.onerror = () => reject(new Error("Falha ao ler um anexo."));
    leitor.readAsDataURL(arquivo);
  }))).then(async anexos => {
    const order = { id: BookStore.id(), chamadoId: document.getElementById("osChamado").value || null,
      hotel: document.getElementById("osHotel").value, apartamento: document.getElementById("osApartamento").value,
      titulo: document.getElementById("osTitulo").value.trim(), descricao: document.getElementById("osDescricao").value.trim(),
      prioridade: document.getElementById('osPrioridade').value, responsavelLogin: document.getElementById('osResponsavel').value,
      anexos, status: "Aberta", vencimento: document.getElementById("osVencimento").value, data: new Date().toLocaleString("pt-BR"), abertaEm: new Date().toISOString(), criadaPor: sessao.nome, criadaPorLogin: sessao.login };
    const items = osList(); items.push(order);
    try { await BookStore.setItem("ordensServico", JSON.stringify(items)); }
    catch (erro) { return; }
    document.getElementById("osModal").style.display = "none"; atualizarPainel();
  }).catch(() => alert("Não foi possível ler um dos anexos selecionados."));
}
function mostrarOS() {
  const area = document.getElementById("listaOS"); if (!area) return;
  const filtro = document.getElementById("filtroApartamento")?.value.trim().toLocaleLowerCase('pt-BR') || "";
  const filtroStatus = document.getElementById("filtroStatusOS")?.value || "";
  const items = osList().filter(o => (!filtro || String(o.apartamento).toLocaleLowerCase('pt-BR').includes(filtro)) && (!filtroStatus || (o.status || "Aberta") === filtroStatus));
  const andamento = items.filter(o => o.status === "Em andamento").length;
  const resumo = document.getElementById("resumoListaOS");
  if (resumo) resumo.textContent = `${items.length} cards exibidos · ${andamento} em andamento`;
  const ordemStatus = { "Em andamento": 0, "Aberta": 1, "Finalizada": 2 };
  items.sort((a, b) => (ordemStatus[a.status || "Aberta"] ?? 1) - (ordemStatus[b.status || "Aberta"] ?? 1) || String(a.vencimento || "9999-12-31").localeCompare(String(b.vencimento || "9999-12-31")));
  area.innerHTML = items.length ? items.map(o => {
    const finalizada = o.status === "Finalizada", status = o.status || "Aberta";
    const vencida = !finalizada && o.vencimento && o.vencimento < dataLocalHoje();
    return `<article class="chamado card-os ${finalizada ? "finalizado" : ""}" data-on-click="abrirOS(${Number(o.id)})" role="button" tabindex="0" data-on-keydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirOS(${Number(o.id)})}"><div class="os-topo"><strong>Card #${escapar(o.id)}</strong><span class="selo-status ${finalizada ? "selo-finalizado" : ""}">${escapar(status)}</span></div><p>${escapar(o.hotel)} - Apartamento ${escapar(o.apartamento)}</p><h3>${escapar(o.titulo)}</h3><p>Prioridade: ${escapar(o.prioridade || "Normal")} &middot; Respons&aacute;vel: ${escapar(o.responsavelLogin || "A definir")}</p><p>${escapar(o.descricao)}</p><p class="vencimento ${vencida ? "vencida" : ""}"><strong>Vencimento:</strong> ${formatarData(o.vencimento)}${vencida ? " - Vencida" : ""}</p>${o.chamadoId ? `<small>Vinculada ao chamado #${escapar(o.chamadoId)}</small>` : "<small>Card independente</small>"}<label class="status-os" data-on-click="event.stopPropagation()">Status do card<select data-on-change="alterarStatusOS(${Number(o.id)},this.value)"><option value="Aberta" ${status === "Aberta" ? "selected" : ""}>Aberta</option><option value="Em andamento" ${status === "Em andamento" ? "selected" : ""}>Em andamento</option><option value="Finalizada" ${finalizada ? "selected" : ""}>Finalizada</option></select></label></article>`;
  }).join("") : "<p class=\"vazio\">Nenhum card encontrado para esse apartamento.</p>";
}
function dataLocalHoje() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}
function abrirOS(id) {
  const o = osList().find(item => item.id == id); if (!o) return;
  document.getElementById("fechamentoIdOS").value = String(o.id);
  const chamadoVinculado = o.chamadoId ? chamados().find(c => c.id == o.chamadoId) : null;
  const vinculo = o.chamadoId ? `<p><b>Chamado vinculado:</b> #${escapar(o.chamadoId)}${chamadoVinculado ? ` - ${escapar(chamadoVinculado.assunto)}` : ""}</p>` : "<p>Card independente</p>";
  const anexos = Array.isArray(o.anexos) && o.anexos.length ? o.anexos.map(a => {
    if (a.tipo?.startsWith("image/")) return `<figure><img decoding="async" loading="lazy" src="${a.dados}" alt="${escapar(a.nome)}"><figcaption>${escapar(a.nome)}</figcaption></figure>`;
    if (a.tipo?.startsWith("video/")) return `<p>${escapar(a.nome)}<video preload="metadata" src="${a.dados}" controls></video></p>`;
    return `<p><a href="${a.dados}" download="${escapar(a.nome)}">Baixar ${escapar(a.nome)}</a></p>`;
  }).join("") : "<p>Nenhum anexo neste card</p>";
  const fotosFechamento = (o.fechamento?.fotos || []).map(f => `<figure><img decoding="async" loading="lazy" src="${f.dados}" alt="${escapar(f.nome)}"><figcaption>${escapar(f.nome)}</figcaption></figure>`).join("");
  const fechamento = o.fechamento ? `<h3>Dados do fechamento</h3><p><b>Data de fechamento:</b> ${formatarData(o.fechamento.data)}</p><p><b>Serviço executado por terceiro:</b> ${escapar(o.fechamento.terceiro)}</p><p><b>Valor do serviço:</b> ${formatarMoeda(o.fechamento.valorServico)}</p><p><b>Tipo de material:</b> ${escapar(o.fechamento.tipoMaterial)}</p><p><b>Valor do material:</b> ${formatarMoeda(o.fechamento.valorMaterial)}</p><p><b>Descrição do material:</b> ${escapar(o.fechamento.descricaoMaterial || "Não informado")}</p><p><b>Responsável pelo pagamento:</b> ${escapar(o.fechamento.responsavelPagamento)}</p><p><b>Quem executou:</b> ${escapar(o.fechamento.executadoPor)}</p><p><b>Custo total:</b> ${formatarMoeda(o.fechamento.custoTotal)}</p><p><b>Observações:</b> ${escapar(o.fechamento.observacao || "Nenhuma")}</p><h4>Fotos do serviço concluído</h4>${fotosFechamento || "<p>Nenhuma foto anexada.</p>"}` : `<p>${o.status === "Finalizada" ? "Sem dados de fechamento registrados para este card." : "Este card ainda não foi finalizado."}</p>`;
  document.getElementById("osDetalhes").innerHTML = `<h2>${escapar(o.titulo || "Card")}</h2><p><b>Card #:</b> ${escapar(o.id)}</p><p><b>Hotel:</b> ${escapar(o.hotel)}</p><p><b>Apartamento:</b> ${escapar(o.apartamento)}</p><p><b>Descrição:</b> ${escapar(o.descricao)}</p><p><b>Status:</b> ${escapar(o.status || "Aberta")}</p><p><b>Abertura:</b> ${escapar(o.data)}</p><p><b>Vencimento:</b> ${formatarData(o.vencimento)}</p>${vinculo}<h3>Anexos e arquivos</h3>${anexos}${fechamento}`;
  const botaoFechamento = document.getElementById("botaoFinalizarOS");
  botaoFechamento.hidden = o.status === "Finalizada";
  if (!BookWorkspace.can('os')) botaoFechamento.hidden = true;
  let reabrir=document.getElementById('botaoReabrirOS');
  if(!reabrir){reabrir=document.createElement('button');reabrir.id='botaoReabrirOS';reabrir.type='button';reabrir.className='acao-principal';reabrir.textContent='Reabrir card para corrigir';reabrir.onclick=async()=>{await alterarStatusOS(document.getElementById('fechamentoIdOS').value,'Em andamento');abrirOS(document.getElementById('fechamentoIdOS').value);};botaoFechamento.after(reabrir);}
  reabrir.hidden=o.status!=='Finalizada'||!BookWorkspace.can('os');
  botaoFechamento.textContent = o.status === "Em andamento" || o.fechamento ? "Preencher/editar informações do serviço" : "Registrar informações e finalizar o card";
  document.getElementById("osDetalhesModal").style.display = "block";
}
function formatarMoeda(valor) { return BookMoney.format(valor); }
function atualizarCustoTotal() {
  const servico = document.getElementById("fechamentoValorServico").value || "0.00";
  const material = document.getElementById("fechamentoValorMaterial").value || "0.00";
  try { document.getElementById("fechamentoCustoTotal").value = BookMoney.sum([servico, material]); }
  catch { document.getElementById("fechamentoCustoTotal").value = ""; }
}
function abrirFechamentoOS(id) {
  const o = osList().find(item => item.id == id); if (!o) return;
  const formulario = document.getElementById("formFechamentoOS"); formulario.reset();
  formulario.dataset.version = String(o.__bookVersion);
  document.getElementById("fechamentoValorMaterial").disabled = false;
  document.getElementById("fechamentoValorMaterial").required = true;
  document.getElementById("fechamentoDescricaoMaterial").required = true;
  document.getElementById("fechamentoIdOS").value = String(id);
  const dados = o.fechamento || {};
  document.getElementById("fechamentoData").value = dados.data || dataLocalHoje();
  document.getElementById("fechamentoTerceiro").value = dados.terceiro || "";
  document.getElementById("fechamentoValorServico").value = BookMoney.decimal(dados.valorServico);
  document.getElementById("fechamentoTipoMaterial").value = dados.tipoMaterial || "";
  document.getElementById("fechamentoValorMaterial").value = BookMoney.decimal(dados.valorMaterial);
  document.getElementById("fechamentoDescricaoMaterial").value = dados.descricaoMaterial || "";
  document.getElementById("fechamentoResponsavelPagamento").value = dados.responsavelPagamento || "";
  document.getElementById("fechamentoObservacao").value = dados.observacao || "";
  preencherExecutores(o.fechamento?.executadoPor || "");
  document.getElementById("fechamentoCustoTotal").value = BookMoney.decimal(dados.custoTotal);
  renderizarMateriaisOS(dados.materiais || []);
  atualizarCamposMaterial();
  document.getElementById("osDetalhesModal").style.display = "none";
  document.getElementById("fechamentoModal").style.display = "block";
}
function renderizarMateriaisOS(materiais = []) {
  const area=document.getElementById("materiaisOS"), dados=lerEstoque();
  area.dataset.hadMaterials = materiais.some(material => material.id) ? 'true' : 'false';
  area.innerHTML=materiais.map((m,i)=>`<div class="linha-material-os"><select aria-label="Material do estoque" data-on-change="atualizarMateriaisOS()"><option value="">Selecione um material</option>${dados.itens.map(item=>`<option value="${escapar(item.id)}" ${item.id===m.id?"selected":""}>${escapar(item.nome||"Material sem nome")} (estoque: ${Number(item.quantidade)||0})</option>`).join("")}</select><input aria-label="Quantidade usada" type="number" min="0.01" step="0.01" value="${Number(m.quantidade)||1}" data-on-input="atualizarMateriaisOS()"><button type="button" class="botao-remover" data-on-click="this.parentElement.remove();atualizarMateriaisOS()">Remover</button></div>`).join(""); atualizarMateriaisOS();
}
function adicionarMaterialOS() { const atuais=[...document.querySelectorAll("#materiaisOS .linha-material-os")].map(l=>({id:l.querySelector("select").value,quantidade:Number(l.querySelector("input").value)})); atuais.push({id:"",quantidade:1}); renderizarMateriaisOS(atuais); }
function obterMateriaisOS() { return [...document.querySelectorAll("#materiaisOS .linha-material-os")].map(l=>({id:l.querySelector("select").value,quantidade:Number(l.querySelector("input").value)||0})).filter(m=>m.id&&m.quantidade>0); }
function atualizarMateriaisOS() {
 const estoque=lerEstoque(), usados=obterMateriaisOS();
 const area=document.getElementById('materiaisOS'), campo=document.getElementById('fechamentoValorMaterial');
 if(usados.length || area.dataset.hadMaterials === 'true') {
   campo.value=BookMoney.materials(usados.map(m=>({valor:estoque.itens.find(i=>i.id===m.id)?.valor || "0.00",quantidade:m.quantidade})));
 }
 area.dataset.hadMaterials = usados.length ? 'true' : 'false';
 campo.readOnly = usados.length > 0;
 if(usados.length) document.getElementById("fechamentoDescricaoMaterial").value=usados.map(m=>`${estoque.itens.find(i=>i.id===m.id)?.nome||"Material"}: ${m.quantidade}`).join("; ");
 atualizarCustoTotal();
}
function aplicarConsumoEstoque(order, novos) {
  order.fechamento ||= {};
  order.fechamento.materiais = novos;
  return true;
}
function atualizarCamposMaterial() {
  const nenhum = document.getElementById("fechamentoTipoMaterial").value === "Nenhum";
  const valor = document.getElementById("fechamentoValorMaterial");
  const descricao = document.getElementById("fechamentoDescricaoMaterial");
  valor.required = !nenhum; descricao.required = !nenhum;
  valor.disabled = nenhum;
  if (nenhum) { valor.value = "0.00"; descricao.value = ""; }
  else if (obterMateriaisOS().length) atualizarMateriaisOS();
  atualizarCustoTotal();
}
async function salvarRascunhoFechamentoOS() {
  const items = osList(), order = items.find(o => o.id == document.getElementById("fechamentoIdOS").value);
  if (!order) return;
  const arquivos = [...document.getElementById("fechamentoFotos").files];
  BookStore.validateFiles(arquivos);
  order.__bookVersion = Number(document.getElementById('formFechamentoOS').dataset.version);
  return Promise.all(arquivos.map(arquivo => new Promise((resolve, reject) => {
    const leitor = new FileReader(); leitor.onload = () => resolve({ nome: arquivo.name, tipo: arquivo.type, dados: leitor.result });
    leitor.onerror = () => reject(new Error("Falha ao ler uma foto.")); leitor.readAsDataURL(arquivo);
  }))).then(async fotos => {
    const login = document.getElementById("fechamentoExecutadoPor").value;
    const materiaisSelecionados = document.getElementById("fechamentoTipoMaterial").value === "Nenhum" ? [] : obterMateriaisOS();
    if (!aplicarConsumoEstoque(order, materiaisSelecionados)) return;
    order.fechamento = { ...(order.fechamento || {}), data: document.getElementById("fechamentoData").value,
      terceiro: document.getElementById("fechamentoTerceiro").value, valorServico: BookMoney.parse(document.getElementById("fechamentoValorServico").value || "0.00"),
      tipoMaterial: document.getElementById("fechamentoTipoMaterial").value, valorMaterial: BookMoney.parse(document.getElementById("fechamentoValorMaterial").value || "0.00"),
      descricaoMaterial: document.getElementById("fechamentoDescricaoMaterial").value.trim(), responsavelPagamento: document.getElementById("fechamentoResponsavelPagamento").value,
      executadoPor: usuariosQueFinalizam().find(usuario => usuario.login === login)?.nome || "", executadoPorLogin: login,
      custoTotal: BookMoney.parse(document.getElementById("fechamentoCustoTotal").value || "0.00"), observacao: document.getElementById("fechamentoObservacao").value.trim(),
      fotos: [...(order.fechamento?.fotos || []), ...fotos], atualizadaEm: new Date().toISOString() };
    order.status = "Em andamento";
    try { await BookStore.setItem("ordensServico", JSON.stringify(items)); }
    catch (erro) { return; }
    document.getElementById("fechamentoFotos").value = "";
    document.getElementById("fechamentoModal").style.display = "none";
    document.getElementById("osDetalhesModal").style.display = "block";
    atualizarPainel(); abrirOS(order.id);
  }).catch(() => alert("Não foi possível ler uma das fotos selecionadas."));
}
async function salvarFechamentoOS(event) {
  event.preventDefault();
  const items = osList(), order = items.find(o => o.id == document.getElementById("fechamentoIdOS").value);
  if (!order) return;
  const arquivos = [...document.getElementById("fechamentoFotos").files];
  BookStore.validateFiles(arquivos);
  order.__bookVersion = Number(document.getElementById('formFechamentoOS').dataset.version);
  return Promise.all(arquivos.map(arquivo => new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: arquivo.name, tipo: arquivo.type, dados: leitor.result });
    leitor.onerror = () => reject(new Error("Falha ao ler uma foto."));
    leitor.readAsDataURL(arquivo);
  }))).then(async fotos => {
    const materiaisSelecionados = document.getElementById("fechamentoTipoMaterial").value === "Nenhum" ? [] : obterMateriaisOS();
    if (!aplicarConsumoEstoque(order, materiaisSelecionados)) return;
    order.fechamento = {
      data: document.getElementById("fechamentoData").value,
      terceiro: document.getElementById("fechamentoTerceiro").value,
      valorServico: BookMoney.parse(document.getElementById("fechamentoValorServico").value || "0.00"),
      valorMaterial: BookMoney.parse(document.getElementById("fechamentoValorMaterial").value || "0.00"),
      descricaoMaterial: document.getElementById("fechamentoDescricaoMaterial").value.trim(),
      responsavelPagamento: document.getElementById("fechamentoResponsavelPagamento").value,
      tipoMaterial: document.getElementById("fechamentoTipoMaterial").value,
      executadoPor: usuariosQueFinalizam().find(usuario => usuario.login === document.getElementById("fechamentoExecutadoPor").value)?.nome || "",
      executadoPorLogin: document.getElementById("fechamentoExecutadoPor").value,
      finalizadaEm: new Date().toISOString(),
      custoTotal: BookMoney.parse(document.getElementById("fechamentoCustoTotal").value || "0.00"),
      observacao: document.getElementById("fechamentoObservacao").value.trim(),
      fotos: [...(order.fechamento?.fotos || []), ...fotos],
      materiais: materiaisSelecionados
    };
    order.status = "Finalizada";
    order.fechadaEm = order.fechamento.finalizadaEm;
    try { await BookStore.setItem("ordensServico", JSON.stringify(items)); }
    catch (erro) { return; }
    document.getElementById("fechamentoModal").style.display = "none";
    document.getElementById("osDetalhesModal").style.display = "block";
    atualizarPainel(); abrirOS(order.id);
  }).catch(() => alert("Não foi possível ler uma das fotos selecionadas."));
}
async function alterarStatusOS(id, status) {
  const items = osList(), order = items.find(o => o.id == id);
  if (!order) return;
  if (!BookWorkspace.can('os')) { alert('Sem permissão para alterar cards.'); mostrarOS(); return; }
  if (order.status==='Finalizada'&&status!=='Finalizada') {
    if(status!=='Em andamento'){alert('Reabra o card como Em andamento para corrigir o fechamento.');mostrarOS();return;}
    const reason=prompt('Motivo da reabertura do card (3 a 1000 caracteres):');
    if(!reason?.trim()){mostrarOS();return;}
    try{await BookAPI.request('/api/orders/reopen',{method:'POST',body:JSON.stringify({id:String(order.id),version:order.__bookVersion,reason:reason.trim()})});await BookStore.refresh(true);atualizarPainel();}
    catch(error){alert(error.message);}
    mostrarOS();return;
  }
  if (status === "Finalizada") { abrirFechamentoOS(id); mostrarOS(); return; }
  order.status = status;
  await BookStore.setItem("ordensServico", JSON.stringify(items));
  atualizarPainel();
}
const gruposChecklistVistoria = {
  "Estrutura física": ["Paredes e pintura", "Piso e revestimentos", "Teto e forro", "Portas e fechaduras", "Janelas e vidros", "Instalações hidráulicas", "Instalações elétricas", "Banheiro e louças"],
  "Eletrônicos": ["Ar-condicionado", "Televisão e controle", "Geladeira", "Micro-ondas", "Fogão/cooktop", "Máquina de lavar", "Luminárias"],
  "Cozinha": ["Pia e torneira", "Armários", "Louças e copos", "Talheres e utensílios", "Panelas", "Bancada"],
  "Banheiro": ["Pia, cuba e torneira", "Vaso sanitário, assento e descarga", "Chuveiro, ducha e aquecimento", "Secador de cabelo", "Box, vidros e vedação", "Ralos, escoamento e sifão", "Vazamentos e infiltrações", "Piso, paredes, rejuntes e teto", "Espelho", "Bancada, armário e gavetas", "Iluminação, tomadas e interruptores", "Janela, ventilação e exaustor", "Ducha higiênica", "Toalheiros, ganchos e porta-papel", "Saboneteira e dispensadores", "Lixeira", "Toalhas e tapete"],
  "Sacada": ["Guarda-corpo e corrimão", "Piso, revestimentos e rejuntes", "Ralo e escoamento de água", "Porta de acesso, trilhos e fechaduras", "Fechamento de vidro e vedações", "Rede de proteção", "Paredes, teto e infiltrações", "Iluminação, tomadas e interruptores", "Mesa, cadeiras e bancos", "Sofá, poltronas e almofadas", "Churrasqueira, grelha e exaustão", "Pia, torneira e bancada", "Armários", "Persianas, cortinas e toldo", "Varal", "Vasos e plantas", "Limpeza e conservação geral"],
  "Móveis": ["Cama e colchão", "Sofá e poltronas", "Mesa e cadeiras", "Guarda-roupa", "Criados-mudos", "Cortinas e persianas"]
};
let vistoriaHotel = "", vistoriaApartamento = "";
const vistorias = () => ler("vistorias");
function atualizarTotaisVistorias() {
  const itens = vistorias();
  BookCatalog.hotels.forEach(hotel => {
    const total = itens.filter(item => item.hotel === hotel).length;
    document.getElementById(`totalVistorias${hotel}`).textContent = `${total} ${total === 1 ? "vistoria" : "vistorias"}`;
  });
}
function selecionarHotelVistoria(hotel) {
  vistoriaHotel = hotel;
  document.getElementById("areaVistorias").innerHTML = `<h3>${escapar(hotel)} - Apartamentos</h3><div class="apartamentos-vistoria">${apartamentos(hotel).map(ap => `<button type="button" data-on-click="selecionarApartamentoVistoria('${ap}')">Apartamento ${ap}</button>`).join("")}</div><div id="detalheApartamentoVistoria"><p class="vazio">Selecione um apartamento.</p></div>`;
}
function selecionarApartamentoVistoria(apartamento) {
  vistoriaApartamento = apartamento;
  const itens = vistorias().filter(item => item.hotel === vistoriaHotel && String(item.apartamento) === apartamento)
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
  const ultima = itens[0];
  document.getElementById("detalheApartamentoVistoria").innerHTML = `<div class="vistoria-resumo"><div><h3>Apartamento ${escapar(apartamento)}</h3><p><strong>Total de vistorias:</strong> ${itens.length}</p><p><strong>Última vistoria:</strong> ${ultima ? `${formatarData(ultima.data)} — ${escapar(ultima.responsavel)}` : "Ainda não há vistorias"}</p></div><button class="acao-principal" data-on-click="abrirFormularioVistoria()">+ Começar vistoria</button></div><button type="button" class="botao-secundario" data-on-click="abrirFormularioOS('', '${escapar(vistoriaHotel)}', '${escapar(apartamento)}')">Abrir Card para este apartamento</button><div class="historico-vistorias"><h4>Histórico de vistorias</h4>${itens.length ? itens.map(renderizarVistoria).join("") : '<p class="vazio">Nenhuma vistoria registrada neste apartamento.</p>'}</div>`;
}
function renderizarVistoria(item) {
  const checklist = Object.entries(item.checklist || {}).map(([grupo, respostas]) => `<h5>${escapar(grupo)}</h5><ul>${Object.entries(respostas).map(([nome, estado]) => `<li><strong>${escapar(nome)}:</strong> ${escapar(estado)}</li>`).join("")}</ul>`).join("");
  const fotos = (item.fotos || []).map(foto => `<a href="${foto.dados}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="${foto.dados}" alt="${escapar(foto.nome)}"></a>`).join("");
  return `<details class="vistoria-registro"><summary><strong>${formatarData(item.data)} — ${escapar(item.tipo)}</strong><span>Responsável: ${escapar(item.responsavel)}</span></summary><div class="vistoria-registro-detalhes"><p><strong>Responsável:</strong> ${escapar(item.responsavel)}</p>${checklist}<p><strong>Observações:</strong> ${escapar(item.observacoes || "Nenhuma")}</p><p><strong>Fotos:</strong> ${(item.fotos || []).length}</p><div class="galeria-vistoria">${fotos}</div><button type="button" class="botao-secundario" data-on-click="abrirFormularioOS('', '${escapar(item.hotel)}', '${escapar(item.apartamento)}')">Abrir Card deste apartamento</button></div></details>`;
}
async function abrirFormularioVistoria() {
  try { await atualizarUsuarios(); }
  catch (erro) { alert('Não foi possível carregar os administradores. Tente abrir a vistoria novamente.'); return; }
  document.getElementById("formVistoria").reset();
  const responsavel = document.getElementById('vistoriaResponsavel');
  responsavel.replaceChildren(new Option('Selecione o administrador', ''), ...usuariosQueFinalizam()
    .slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(usuario => new Option(usuario.nome, usuario.login)));
  if (!responsavel.options[1]) { alert('Nenhum administrador disponível para realizar a vistoria.'); return; }
  document.getElementById("vistoriaData").value = dataLocalHoje();
  document.getElementById("vistoriaLocal").textContent = `${vistoriaHotel} — Apartamento ${vistoriaApartamento}`;
  document.getElementById("vistoriaFotosAjuda").textContent = "0 de 20 fotos selecionadas.";
  renderizarChecklistVistoria();
  document.getElementById("vistoriaModal").style.display = "block";
}
function renderizarChecklistVistoria() {
  const simplificada = document.getElementById("vistoriaTipo").value === "Simplificada";
  document.getElementById("gruposVistoria").innerHTML = Object.entries(gruposChecklistVistoria).map(([grupo, itens]) => {
    const lista = simplificada ? itens.slice(0, grupo === 'Banheiro' || grupo === 'Sacada' ? 4 : 2) : itens;
    return `<fieldset class="grupo-checklist"><legend>${escapar(grupo)}</legend>${lista.map((nome, i) => `<label>${escapar(nome)}<select name="check-${Object.keys(gruposChecklistVistoria).indexOf(grupo)}-${i}" data-grupo="${escapar(grupo)}" data-item="${escapar(nome)}" required><option value="">Selecione</option><option>Em ordem</option><option>Com problema</option><option>Não se aplica</option></select></label>`).join("")}</fieldset>`;
  }).join("");
}
function fecharVistoriaModal() { document.getElementById("vistoriaModal").style.display = "none"; }
async function salvarVistoria(event) {
  event.preventDefault();
  const responsavel = usuariosQueFinalizam().find(usuario => usuario.login === document.getElementById('vistoriaResponsavel').value);
  if (!responsavel) { alert('Selecione o administrador que realizou a vistoria.'); return; }
  const arquivos = [...document.getElementById("vistoriaFotos").files];
  BookStore.validateFiles(arquivos);
  if (arquivos.length > 20) { alert("Selecione no máximo 20 fotos por vistoria."); return; }
  return Promise.all(arquivos.map(arquivo => new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve({ nome: arquivo.name, dados: leitor.result });
    leitor.onerror = () => reject(new Error("Falha ao ler uma foto."));
    leitor.readAsDataURL(arquivo);
  }))).then(async fotos => {
    const checklist = {};
    document.querySelectorAll("#gruposVistoria select").forEach(campo => {
      checklist[campo.dataset.grupo] ||= {};
      checklist[campo.dataset.grupo][campo.dataset.item] = campo.value;
    });
    const item = { id: BookStore.id(), hotel: vistoriaHotel, apartamento: vistoriaApartamento,
      data: document.getElementById("vistoriaData").value, responsavel: responsavel.nome, responsavelLogin: responsavel.login,
      tipo: document.getElementById("vistoriaTipo").value, checklist,
      observacoes: document.getElementById("vistoriaObservacoes").value.trim(), fotos };
    const itens = vistorias(); itens.push(item);
    try { await BookStore.setItem("vistorias", JSON.stringify(itens)); }
    catch (erro) { return; }
    fecharVistoriaModal(); atualizarTotaisVistorias(); selecionarApartamentoVistoria(vistoriaApartamento);
  }).catch(() => alert("Não foi possível ler uma das fotos selecionadas."));
}
document.getElementById("vistoriaTipo").addEventListener("change", renderizarChecklistVistoria);
document.getElementById("vistoriaFotos").addEventListener("change", event => {
  const total = event.target.files.length;
  if (total > 20) event.target.value = "";
  document.getElementById("vistoriaFotosAjuda").textContent = `${total > 20 ? 0 : total} de 20 fotos selecionadas.`;
  if (total > 20) alert("O limite é de 20 fotos por vistoria.");
});
function dataRegistro(valor) {
  if (!valor) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(valor))) return new Date(valor);
  const m = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
function dataEfetiva(item, tipo) {
  const finalizada = tipo === "os" ? item.status === "Finalizada" : item.status === "Fechado";
  if (tipo === "os") return dataRegistro(finalizada ? (item.fechamento?.finalizadaEm || item.fechamento?.data) : (item.abertaEm || item.data)) || dataRegistro(item.data);
  return dataRegistro(finalizada ? (item.fechadaEm || item.criadaEm || item.data) : (item.criadaEm || item.data));
}
function criarIntervalos(periodo) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (periodo === "diario") return Array.from({ length: 14 }, (_, i) => { const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 13 + i); return { inicio, fim: new Date(inicio.getTime() + 86400000), nome: `${String(inicio.getDate()).padStart(2, "0")}/${String(inicio.getMonth() + 1).padStart(2, "0")}` }; });
  if (periodo === "semanal") { const segunda = new Date(hoje); segunda.setDate(hoje.getDate() - (hoje.getDay() + 6) % 7); return Array.from({ length: 8 }, (_, i) => { const inicio = new Date(segunda); inicio.setDate(inicio.getDate() - 49 + i * 7); return { inicio, fim: new Date(inicio.getTime() + 7 * 86400000), nome: `${String(inicio.getDate()).padStart(2, "0")}/${String(inicio.getMonth() + 1).padStart(2, "0")}` }; }); }
  if (periodo === "mensal") return Array.from({ length: 12 }, (_, i) => { const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1); return { inicio, fim: new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1), nome: `${String(inicio.getMonth() + 1).padStart(2, "0")}/${String(inicio.getFullYear()).slice(-2)}` }; });
  return Array.from({ length: 5 }, (_, i) => { const ano = hoje.getFullYear() - 4 + i; return { inicio: new Date(ano, 0, 1), fim: new Date(ano + 1, 0, 1), nome: String(ano) }; });
}
function preencherUsuariosGrafico(id) {
  const campo = document.getElementById(id), anterior = campo.value;
  const usuarios = lerUsuarios().slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  campo.innerHTML = '<option value="todos">Todos os usuários</option><option value="sem-usuario">Sem usuário associado</option>' + usuarios.map(usuario => `<option value="${escapar(usuario.login)}">${escapar(usuario.nome)} (${escapar(usuario.funcao === "adm" ? "Administrador" : "Cliente")})</option>`).join("");
  if (["todos", "sem-usuario", ...usuarios.map(usuario => usuario.login)].includes(anterior)) campo.value = anterior;
}
function usuarioAssociado(item, tipo) {
  if (tipo === "chamados") return { login: item.criadaPorLogin || "", nome: item.criadaPor || "" };
  if (item.status === "Finalizada") {
    const login = item.fechamento?.executadoPorLogin || "", nome = item.fechamento?.executadoPor || "";
    const usuarioLegado = !login && nome ? lerUsuarios().find(usuario => usuario.nome === nome) : null;
    return { login: login || usuarioLegado?.login || "", nome };
  }
  return { login: item.criadaPorLogin || "", nome: item.criadaPor || "" };
}
function filtrarPorUsuario(items, tipo, selecao) {
  if (selecao === "todos") return items;
  return items.filter(item => {
    const associado = usuarioAssociado(item, tipo);
    if (selecao === "sem-usuario") return !associado.login && !associado.nome;
    if (associado.login) return associado.login === selecao;
    const escolhido = lerUsuarios().find(usuario => usuario.login === selecao);
    return !!escolhido && associado.nome === escolhido.nome;
  });
}
function desenharGrafico(dados, rotulos, tipo) {
  const cores = ["#0803b8", "#18a874"], nomes = window.__dashboardTipo === "chamados" ? ["Abertos", "Fechados"] : ["Abertas", "Finalizadas"], totais = dados.map(s => s.reduce((a, b) => a + b, 0));
  if (tipo === "pizza") {
    const soma = totais[0] + totais[1], a = soma ? totais[0] / soma * 100 : 50;
    return `<div class="pizza-wrap"><div class="pizza" style="background:${soma ? `conic-gradient(${cores[0]} 0 ${a}%,${cores[1]} ${a}% 100%)` : "#e5e9f0"}"></div><ul><li><i style="background:${cores[0]}"></i>${nomes[0]}: ${totais[0]}</li><li><i style="background:${cores[1]}"></i>${nomes[1]}: ${totais[1]}</li></ul></div>`;
  }
  const max = Math.max(1, ...dados.flat()), cap = tipo === "coluna" ? 8 : 12;
  const labels = rotulos.map((r, i) => `<span title="${r}">${rotulos.length > cap && i % Math.ceil(rotulos.length / cap) ? "" : r}</span>`).join("");
  const colunas = rotulos.map((r, i) => `<div class="grafico-ponto" title="${r}: ${nomes[0]} ${dados[0][i]}, ${nomes[1]} ${dados[1][i]}"><div class="grafico-barras"><i style="height:${Math.max(2, dados[0][i] / max * 100)}%;background:${cores[0]}"></i><i style="height:${Math.max(2, dados[1][i] / max * 100)}%;background:${cores[1]}"></i></div></div>`).join("");
  if (tipo === "coluna") return `<div class="grafico-colunas"><div class="grafico-coluna-itens">${colunas}</div><div class="grafico-rotulos">${labels}</div></div><p class="legenda-grafico"><i style="background:${cores[0]}"></i>${nomes[0]} <i style="background:${cores[1]}"></i>${nomes[1]}</p>`;
  const linhas = dados.map((serie, si) => { const pontos = serie.map((v, i) => `${40 + (rotulos.length === 1 ? 460 : i / (rotulos.length - 1) * 920)},${205 - v / max * 175}`).join(" "); return `<polyline points="${pontos}" fill="none" stroke="${cores[si]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` + serie.map((v, i) => `<circle cx="${40 + (rotulos.length === 1 ? 460 : i / (rotulos.length - 1) * 920)}" cy="${205 - v / max * 175}" r="4" fill="${cores[si]}"/>`).join(""); }).join("");
  return `<div class="grafico-linhas"><svg viewBox="0 0 1000 230" role="img" aria-label="Tendência por período"><line x1="30" y1="205" x2="970" y2="205" class="grafico-grade"/>${linhas}</svg><div class="grafico-rotulos">${labels}</div></div><p class="legenda-grafico"><i style="background:${cores[0]}"></i>${nomes[0]} <i style="background:${cores[1]}"></i>${nomes[1]}</p>`;
}
function atualizarPainelDashboard(tipo, periodoId, usuarioId, graficoId, resumoId, areaId) {
  const todosItems = tipo === "os" ? osList() : chamados();
  preencherUsuariosGrafico(usuarioId);
  const items = filtrarPorUsuario(todosItems, tipo, document.getElementById(usuarioId).value);
  const intervalos = criarIntervalos(document.getElementById(periodoId).value), dados = [intervalos.map(() => 0), intervalos.map(() => 0)];
  items.forEach(item => { const data = dataEfetiva(item, tipo); if (!data || Number.isNaN(data.getTime())) return; const n = intervalos.findIndex(p => data >= p.inicio && data < p.fim); if (n >= 0) dados[item.status === (tipo === "os" ? "Finalizada" : "Fechado") ? 1 : 0][n]++; });
  const nomes = tipo === "os" ? ["abertas", "finalizadas"] : ["abertos", "fechados"], totais = dados.map(s => s.reduce((a, b) => a + b, 0));
  const geralAbertos = items.filter(item => item.status !== (tipo === "os" ? "Finalizada" : "Fechado")).length;
  const geralFinalizados = items.length - geralAbertos;
  document.getElementById(resumoId).textContent = `No período: ${totais[0] + totais[1]} total · ${totais[0]} ${nomes[0]} · ${totais[1]} ${nomes[1]} · Selecionados: ${items.length} (${geralAbertos} abertos, ${geralFinalizados} finalizados/fechados) · Geral: ${todosItems.length}`;
  window.__dashboardTipo = tipo;
  document.getElementById(areaId).innerHTML = desenharGrafico(dados, intervalos.map(p => p.nome), document.getElementById(graficoId).value);
}
function atualizarDashboard() {
  atualizarPainelDashboard("os", "periodoOS", "usuarioOS", "tipoGraficoOS", "resumoDashboardOS", "graficoOS");
  atualizarPainelDashboard("chamados", "periodoChamados", "usuarioChamados", "tipoGraficoChamados", "resumoDashboardChamados", "graficoChamados");
}
function sair() { return BookAPI.logout(); }
const CHAVE_CHAT = "conversasSuporte";
let conversaSelecionada = "";
let idsMensagensConhecidas = new Set();
function lerConversasChat() { try { const v=JSON.parse(BookStore.getItem(CHAVE_CHAT)||"[]"); return Array.isArray(v)?v:[]; } catch { return []; } }
async function salvarConversasChat(items) { await BookStore.setItem(CHAVE_CHAT,JSON.stringify(items)); }
function chaveConversaChat(c) { return `${c.clienteLogin}::${c.chamadoId}`; }
function totalNaoLidasChat() { return lerConversasChat().reduce((n,c)=>n+(c.mensagens||[]).filter(m=>m.autorTipo==="cliente"&&!m.lidoAdmin).length,0); }
function atualizarBadgeChat() { const total=totalNaoLidasChat(),badge=document.getElementById("chatBadge"); badge.hidden=!total; badge.textContent=total>99?"99+":String(total); }
function mostrarConversasChat() {
 const area=document.getElementById("listaConversasChat"), conversas=lerConversasChat().slice().sort((a,b)=>String(b.mensagens?.at(-1)?.criadaEm||"").localeCompare(String(a.mensagens?.at(-1)?.criadaEm||"")));
 area.innerHTML=conversas.length?conversas.map(c=>{const ultima=c.mensagens?.at(-1),naoLidas=(c.mensagens||[]).filter(m=>m.autorTipo==="cliente"&&!m.lidoAdmin).length,key=chaveConversaChat(c);return `<button type="button" class="item-conversa-chat ${key===conversaSelecionada?"selecionada":""}" data-on-click="${escapar(`abrirConversaChat(${JSON.stringify(c.clienteLogin)},${JSON.stringify(c.chamadoId)})`)}"><strong>${escapar(c.clienteNome||c.clienteLogin)}</strong><span>Chamado #${escapar(c.chamadoId)}</span><small>${escapar(ultima?.texto||"Sem mensagens")}</small>${naoLidas?`<i>${naoLidas}</i>`:""}</button>`;}).join(""):'<p class="chat-vazio">Nenhuma conversa iniciada pelos clientes.</p>';
 atualizarBadgeChat(); if(conversaSelecionada)renderizarMensagensAdmin();
}
async function abrirConversaChat(login,id) { conversaSelecionada=`${login}::${id}`; const items=lerConversasChat(),c=items.find(x=>chaveConversaChat(x)===conversaSelecionada); if(c){c.mensagens.forEach(m=>{if(m.autorTipo==="cliente")m.lidoAdmin=true;});await salvarConversasChat(items);} const chamado=chamados().find(x=>String(x.id)===String(id));document.getElementById("cabecalhoConversaChat").innerHTML=`<strong>${escapar(c?.clienteNome||login)}</strong><span>Chamado #${escapar(id)} · ${escapar(chamado?.assunto||"Chamado")}</span>`;document.getElementById("textoAdmin").disabled=false;document.getElementById("enviarAdmin").disabled=false;mostrarConversasChat();renderizarMensagensAdmin(); }
function renderizarMensagensAdmin() { const area=document.getElementById("mensagensAdmin"),c=lerConversasChat().find(x=>chaveConversaChat(x)===conversaSelecionada);if(!c){area.innerHTML='<p class="chat-vazio">Selecione uma conversa para ver as mensagens.</p>';return;}area.innerHTML=c.mensagens.length?c.mensagens.map(m=>`<div class="mensagem-chat ${m.autorTipo==="admin"?"minha-mensagem":""}"><strong>${escapar(m.autorNome)}</strong><p>${escapar(m.texto)}</p><small>${new Date(m.criadaEm).toLocaleString("pt-BR")}</small></div>`).join(""):'<p class="chat-vazio">Envie uma resposta para iniciar a conversa.</p>';area.scrollTop=area.scrollHeight; }
async function enviarMensagemAdmin(event) { event.preventDefault();const campo=document.getElementById("textoAdmin"),texto=campo.value.trim();if(!conversaSelecionada||!texto)return;const items=lerConversasChat(),c=items.find(x=>chaveConversaChat(x)===conversaSelecionada);if(!c)return;c.mensagens.push({id:String(Date.now()),autorTipo:"admin",autorNome:sessao.nome||"Suporte",texto,criadaEm:new Date().toISOString(),lidoAdmin:true,lidoCliente:false});try{await salvarConversasChat(items);campo.value="";mostrarConversasChat();renderizarMensagensAdmin();}catch(error){return;} }
let avisoChatTimer=null;
function exibirAvisoChat(texto) { const aviso=document.getElementById("avisoChat");aviso.textContent=texto;aviso.hidden=false;clearTimeout(avisoChatTimer);avisoChatTimer=setTimeout(()=>aviso.hidden=true,6500); }
function verificarNovasMensagensChat() { const conversas=lerConversasChat();let novas=[];conversas.forEach(c=>(c.mensagens||[]).forEach(m=>{if(!idsMensagensConhecidas.has(m.id)){idsMensagensConhecidas.add(m.id);if(m.autorTipo==="cliente")novas.push({c,m});}}));if(novas.length){const {c,m}=novas.at(-1);exibirAvisoChat(`Nova mensagem de ${c.clienteNome||c.clienteLogin} · Chamado #${c.chamadoId}`);}atualizarBadgeChat();if(document.getElementById("visaoChat")&&!document.getElementById("visaoChat").hidden)mostrarConversasChat(); }
function ativarNotificacoesChat() { if(!("Notification"in window)){alert("Este navegador não oferece notificações do sistema.");return;}Notification.requestPermission().then(p=>alert(p==="granted"?"Notificações ativadas.":"Permissão de notificações não concedida.")); }
window.addEventListener("storage",e=>{if(e.key===CHAVE_CHAT){verificarNovasMensagensChat();if(conversaSelecionada)renderizarMensagensAdmin();}});
idsMensagensConhecidas=new Set(lerConversasChat().flatMap(c=>(c.mensagens||[]).map(m=>m.id)));
atualizarBadgeChat();
BookWorkspace.init(sessao);
BookCollaboration.init(sessao);
BookNotifications.init(sessao);
document.getElementById('masterSupportRefresh').onclick=()=>BookWorkspace.loadMaster();
const primeiraAba=Object.keys(BookWorkspace.labels).find(tab=>BookWorkspace.can(tab))||'inicio';
mostrarAba(primeiraAba);
BookStore.activate(primeiraAba);
document.getElementById("osVencimento").min = dataLocalHoje();
atualizarPainel();
const abaSolicitada = ({ "#chamados": "chamados", "#chat": "chat", "#cards": "os", "#vistorias": "vistorias", "#dashboard": "dashboard", "#condominios": "condominios", "#estoque": "estoque", "#usuarios": "usuarios", "#financeiro": "financeiro", "#backup": "backup" })[location.hash];
if (abaSolicitada) mostrarAba(abaSolicitada);



window.addEventListener('book:data', () => {
  atualizarPainel();
  if (!document.getElementById('visaoVistorias').hidden) atualizarTotaisVistorias();
  if (!document.getElementById('visaoEstoque').hidden) mostrarEstoque();
  if (!document.getElementById('visaoDashboard').hidden) atualizarDashboard();
  if (vistoriaHotel && vistoriaApartamento && !document.getElementById('visaoVistorias').hidden) selecionarApartamentoVistoria(vistoriaApartamento);
  verificarNovasMensagensChat();
});

BookMoney.bind(document);
