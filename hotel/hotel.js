let sessaoHotel = null;
try { sessaoHotel = JSON.parse(BookStore.getItem("usuarioLogado") || "null"); } catch { /* sessão inválida */ }
if (!sessaoHotel || sessaoHotel.funcao !== "adm") location.href = "../login.html";
const ler = key => {
  try { const value = JSON.parse(BookStore.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
  catch (erro) { return []; }
};
const esc = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));


function atualizarTotais() {
  const items = ler("chamados");
  BookCatalog.hotels.forEach(h => document.getElementById("total" + h).textContent = items.filter(c => c.hotel === h).length + " chamados");
}
function formatarData(data) {
  if (!data) return "Sem data";
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : esc(data);
}
let hotelSelecionado = "", apartamentoSelecionado = "", tipoSelecionado = "";
function mostrarHistorico(hotel) {
  hotelSelecionado = hotel; apartamentoSelecionado = "";
  document.getElementById("historico").innerHTML = `<h2>${esc(hotel)} - Apartamentos</h2><div class="apartamentos">${BookStore.apartments(hotel).map(ap => `<button class="apartamento-opcao" onclick="selecionarApartamento('${ap}')">Apartamento ${ap}</button>`).join("")}</div><div id="opcoesApartamento"><p>Selecione um apartamento para escolher o que deseja visualizar.</p></div>`;
}
function selecionarApartamento(ap) {
  tipoSelecionado = "";
  apartamentoSelecionado = ap;
  document.getElementById("opcoesApartamento").innerHTML = `<h3>Apartamento ${ap}</h3><div class="opcoes-dados"><button onclick="mostrarDadosApartamento('chamados')">Chamados</button><button onclick="mostrarDadosApartamento('os')">Cards</button></div><div id="dadosApartamento"><p>Selecione chamados ou cards.</p></div>`;
}
function mostrarDadosApartamento(tipo) {
  tipoSelecionado = tipo;
  const area = document.getElementById("dadosApartamento");
  area.innerHTML = `<h4>${tipo === "chamados" ? "Chamados" : "Cards"} do condomínio ${esc(hotelSelecionado)}</h4><label class="filtro-hotel" for="filtroApartamentoHotel">Pesquisar pelo título</label><input id="filtroApartamentoHotel" type="search" placeholder="Digite o assunto do chamado ou do card" oninput="filtrarRegistrosHotel('${tipo}')"><div id="listaRegistrosHotel"></div>`;
  renderizarRegistrosHotel(tipo, "");
}
function filtrarRegistrosHotel(tipo) {
  const filtro = document.getElementById("filtroApartamentoHotel").value.trim().toLocaleLowerCase("pt-BR");
  renderizarRegistrosHotel(tipo, filtro);
}
function renderizarRegistrosHotel(tipo, filtro) {
  const area = document.getElementById("listaRegistrosHotel");
  if (!area) return;
  const chamadosAtivos = tipo === "chamados";
  const normalizar = texto => String(texto || "").toLocaleLowerCase("pt-BR");
  const items = (chamadosAtivos ? ler("chamados") : ler("ordensServico"))
    .filter(item => item.hotel === hotelSelecionado && String(item.apartamento) === apartamentoSelecionado && (!filtro || normalizar(chamadosAtivos ? item.assunto : item.titulo).includes(filtro)));
  items.sort((a, b) => Number(chamadosAtivos ? a.status === "Fechado" : a.status === "Finalizada") - Number(chamadosAtivos ? b.status === "Fechado" : b.status === "Finalizada"));
  if (!items.length) {
    area.innerHTML = `<p class="vazio">Nenhum ${chamadosAtivos ? "chamado" : "card"} encontrado com esse título.</p>`;
    return;
  }
  area.innerHTML = items.map(item => {
    const finalizado = chamadosAtivos ? item.status === "Fechado" : item.status === "Finalizada";
    const titulo = chamadosAtivos ? item.assunto : item.titulo;
    const resumo = `<summary><strong>${esc(titulo || (chamadosAtivos ? "Chamado sem assunto" : "Card sem assunto"))}</strong><span>${esc(item.hotel)} - Apartamento ${esc(item.apartamento)}</span></summary>`;
    if (chamadosAtivos) {
      const media = item.anexoTipo?.startsWith("image/") ? `<img loading="lazy" src="${esc(item.anexoData)}" alt="Anexo do chamado">` : item.anexoTipo?.startsWith("video/") ? `<video preload="metadata" src="${esc(item.anexoData)}" controls></video>` : "<p>Sem anexo.</p>";
      return `<details class="registro ${finalizado ? "finalizado" : ""}">${resumo}<div class="registro-detalhes"><h4>Chamado #${esc(item.id)}</h4><p><strong>Assunto:</strong> ${esc(item.assunto)}</p><p><strong>Categoria:</strong> ${esc(item.categoria)}</p><p><strong>Descri\u00e7\u00e3o:</strong> ${esc(item.descricao)}</p><p><strong>Status:</strong> ${esc(item.status || "Aberto")}</p><p><strong>Data:</strong> ${esc(item.data)}</p><p><strong>Arquivo:</strong> ${esc(item.anexoNome)}</p>${media}</div></details>`;
    }
    const anexos = (item.anexos || []).map(a => a.tipo?.startsWith("image/")
      ? `<p>${esc(a.nome)}</p><img loading="lazy" src="${esc(a.dados)}" alt="${esc(a.nome)}">`
      : a.tipo?.startsWith("video/") ? `<p>${esc(a.nome)}</p><video preload="metadata" src="${esc(a.dados)}" controls></video>`
      : `<p><a href="${esc(a.dados)}" download="${esc(a.nome)}">Baixar ${esc(a.nome)}</a></p>`).join("");
    const f = item.fechamento;
    const fotosFechamento = (f?.fotos || []).map(foto => `<p>${esc(foto.nome)}</p><img loading="lazy" src="${esc(foto.dados)}" alt="${esc(foto.nome)}">`).join("");
    const fechamento = f ? `<h4>Dados do fechamento</h4><p><strong>Data:</strong> ${formatarData(f.data)}</p><p><strong>Servi\u00e7o por terceiro:</strong> ${esc(f.terceiro)}</p><p><strong>Valor do servi\u00e7o:</strong> ${BookMoney.format(f.valorServico)}</p><p><strong>Tipo de material:</strong> ${esc(f.tipoMaterial)}</p><p><strong>Material:</strong> ${esc(f.descricaoMaterial || "N\u00e3o informado")}</p><p><strong>Valor do material:</strong> ${BookMoney.format(f.valorMaterial)}</p><p><strong>Respons\u00e1vel pelo pagamento:</strong> ${esc(f.responsavelPagamento)}</p><p><strong>Executado por:</strong> ${esc(f.executadoPor)}</p><p><strong>Custo total:</strong> ${BookMoney.format(f.custoTotal)}</p><p><strong>Observa\u00e7\u00e3o:</strong> ${esc(f.observacao || "Nenhuma")}</p><h4>Fotos do servi\u00e7o conclu\u00eddo</h4>${fotosFechamento || "<p>Nenhuma foto anexada.</p>"}` : "";
    const informacoesAndamento = f && !finalizado ? `<h4>Informações registradas durante o andamento</h4><p><strong>Data:</strong> ${formatarData(f.data)}</p><p><strong>Serviço por terceiro:</strong> ${esc(f.terceiro || "Não informado")}</p><p><strong>Valor do serviço:</strong> ${BookMoney.format(f.valorServico)}</p><p><strong>Tipo de material:</strong> ${esc(f.tipoMaterial || "Não informado")}</p><p><strong>Material:</strong> ${esc(f.descricaoMaterial || "Não informado")}</p><p><strong>Valor do material:</strong> ${BookMoney.format(f.valorMaterial)}</p><p><strong>Responsável pelo pagamento:</strong> ${esc(f.responsavelPagamento || "Não informado")}</p><p><strong>Executado por:</strong> ${esc(f.executadoPor || "Não informado")}</p><p><strong>Observação:</strong> ${esc(f.observacao || "Nenhuma")}</p>${fotosFechamento || "<p>Nenhuma foto anexada.</p>"}` : "";
    return `<details class="registro ${finalizado ? "finalizado" : ""}">${resumo}<div class="registro-detalhes"><h4>Card #${esc(item.id)}</h4><p><strong>Assunto:</strong> ${esc(item.titulo)}</p><p><strong>Descri\u00e7\u00e3o:</strong> ${esc(item.descricao)}</p><p><strong>Status:</strong> ${esc(item.status || "Aberta")}</p><p><strong>Vencimento:</strong> ${formatarData(item.vencimento)}</p><p><strong>Data de abertura:</strong> ${esc(item.data)}</p><p>${item.chamadoId ? `Vinculada ao chamado #${esc(item.chamadoId)}` : "Card independente"}</p>${anexos ? `<h4>Anexos</h4>${anexos}` : "<p>Sem anexos.</p>"}${informacoesAndamento}${fechamento}</div></details>`;
  }).join("");
}
function sair() { return BookAPI.logout(); }
atualizarTotais();




window.addEventListener('book:data', () => {
  atualizarTotais();
  if (!tipoSelecionado) return;
  const area = document.getElementById('listaRegistrosHotel');
  const abertos = new Set([...area.querySelectorAll('details[open]')].map(item => item.querySelector('h4')?.textContent));
  renderizarRegistrosHotel(tipoSelecionado, document.getElementById('filtroApartamentoHotel').value.trim().toLocaleLowerCase('pt-BR'));
  area.querySelectorAll('details').forEach(item => { item.open = abertos.has(item.querySelector('h4')?.textContent); });
});
