/* Tela de administração: aba Chamados (lista, status e detalhe). */
function mostrarChamados() {
  const area = document.getElementById('listaChamados'),
    items = chamados();
  items.sort((a, b) => Number(a.status === 'Fechado') - Number(b.status === 'Fechado'));
  area.innerHTML = items.length
    ? items
        .map(
          (c) =>
            `<article class="chamado linha-chamado ${c.status === 'Fechado' ? 'finalizado' : ''}" data-on-click="abrirChamado(${Number(c.id)})"><div><strong>${escapar(c.assunto || 'Chamado sem assunto')}</strong><span>${escapar(c.hotel)} - Apartamento ${escapar(c.apartamento)}</span></div><select aria-label="Status" data-on-click="event.stopPropagation()" data-on-change="alterarStatus(${Number(c.id)},this.value)"><option ${(c.status || 'Aberto') === 'Aberto' ? 'selected' : ''}>Aberto</option><option ${c.status === 'Fechado' ? 'selected' : ''}>Fechado</option></select></article>`,
        )
        .join('')
    : '<p class="vazio">Nenhum chamado cadastrado.</p>';
}
async function alterarStatus(id, status) {
  const items = chamados(),
    item = items.find((c) => c.id == id);
  if (item) {
    item.status = status;
    if (status === 'Fechado') item.fechadaEm = new Date().toISOString();
    else delete item.fechadaEm;
    await BookStore.setItem('chamados', JSON.stringify(items));
  }
  atualizarPainel();
}
function abrirChamado(id) {
  const c = chamados().find((item) => item.id == id);
  if (!c) return;
  const anexo = c.anexoTipo?.startsWith('image/')
    ? `<img decoding="async" loading="lazy" src="${c.anexoData}" alt="Anexo">`
    : c.anexoTipo?.startsWith('video/')
      ? `<video preload="metadata" src="${c.anexoData}" controls></video>`
      : 'Sem anexo';
  document.getElementById('detalhes').innerHTML =
    `<h2>Chamado #${c.id}</h2><p><b>Hotel:</b> ${escapar(c.hotel)}</p><p><b>Apartamento:</b> ${escapar(c.apartamento)}</p><p><b>Assunto:</b> ${escapar(c.assunto)}</p><p><b>Categoria:</b> ${escapar(c.categoria)}</p><p><b>Descri\u00e7\u00e3o:</b> ${escapar(c.descricao)}</p><p><b>Status:</b> ${escapar(c.status || 'Aberto')}</p><p><b>Data:</b> ${escapar(c.data)}</p><p><b>Arquivo:</b> ${escapar(c.anexoNome)}</p>${anexo}<p><button data-on-click="abrirFormularioOS(${Number(c.id)})">Abrir Card para este chamado</button></p>`;
  document.getElementById('modal').style.display = 'block';
}
function fecharModal() {
  document.getElementById('modal').style.display = 'none';
}
