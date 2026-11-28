/* Tela de administração: cards (ordens de serviço): formulário, lista, detalhe, status e edição. */
function preencherApartamentos() {
  const hotel = document.getElementById('osHotel').value;
  const unidades = apartamentos(hotel);
  const campo = document.getElementById('osApartamento');
  campo.disabled = !hotel || !unidades.length;
  campo.innerHTML =
    `<option value="">${!hotel ? 'Selecione primeiro o condomínio' : unidades.length ? 'Selecione o apartamento' : 'Nenhum apartamento cadastrado'}</option>` +
    unidades.map((a) => `<option value="${escapar(a)}">${escapar(a)}</option>`).join('');
}
function abrirFormularioOS(
  chamadoId = '',
  hotelPreselecionado = '',
  apartamentoPreselecionado = '',
) {
  fecharModal();
  document.getElementById('formOS').reset();
  const c = chamadoId ? chamados().find((item) => item.id == chamadoId) : null;
  document.getElementById('osChamado').value = chamadoId || '';
  document.getElementById('osHotel').value = c?.hotel || hotelPreselecionado || '';
  preencherApartamentos();
  document.getElementById('osResponsavel').innerHTML =
    '<option value="">Selecione o responsável</option>' +
    usuariosQueFinalizam()
      .map(
        (usuario) => `<option value="${escapar(usuario.login)}">${escapar(usuario.nome)}</option>`,
      )
      .join('');
  if (c || apartamentoPreselecionado)
    document.getElementById('osApartamento').value = c?.apartamento || apartamentoPreselecionado;
  document.getElementById('osModal').style.display = 'block';
}
async function salvarOS(event) {
  event.preventDefault();
  const arquivos = [...document.getElementById('osAnexos').files];
  BookStore.validateFiles(arquivos);
  if (
    arquivos.some((arquivo) => arquivo.size > 5 * 1024 * 1024) ||
    arquivos.reduce((total, arquivo) => total + arquivo.size, 0) > 10 * 1024 * 1024
  ) {
    alert('Cada anexo pode ter até 5 MB e o conjunto até 10 MB.');
    return;
  }
  return Promise.all(
    arquivos.map(
      (arquivo) =>
        new Promise((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () =>
            resolve({ nome: arquivo.name, tipo: arquivo.type, dados: leitor.result });
          leitor.onerror = () => reject(new Error('Falha ao ler um anexo.'));
          leitor.readAsDataURL(arquivo);
        }),
    ),
  )
    .then(async (anexos) => {
      const order = {
        id: BookStore.id(),
        chamadoId: document.getElementById('osChamado').value || null,
        hotel: document.getElementById('osHotel').value,
        apartamento: document.getElementById('osApartamento').value,
        titulo: document.getElementById('osTitulo').value.trim(),
        descricao: document.getElementById('osDescricao').value.trim(),
        prioridade: document.getElementById('osPrioridade').value,
        responsavelLogin: document.getElementById('osResponsavel').value,
        anexos,
        status: 'Aberta',
        vencimento: document.getElementById('osVencimento').value,
        data: new Date().toLocaleString('pt-BR'),
        abertaEm: new Date().toISOString(),
        criadaPor: sessao.nome,
        criadaPorLogin: sessao.login,
      };
      const items = osList();
      items.push(order);
      try {
        await BookStore.setItem('ordensServico', JSON.stringify(items));
      } catch (erro) {
        return;
      }
      document.getElementById('osModal').style.display = 'none';
      atualizarPainel();
    })
    .catch(() => alert('Não foi possível ler um dos anexos selecionados.'));
}
function opcoesStatusOS(status) {
  return ['Aberta', 'Em andamento', 'Recusada', 'Finalizada']
    .map(
      (value) =>
        `<option value="${value}" ${status === value ? 'selected' : ''}>${BookProcesses.orderStatusLabel(value)}</option>`,
    )
    .join('');
}
function mostrarOS() {
  const area = document.getElementById('listaOS');
  if (!area) return;
  const filtro =
    document.getElementById('filtroApartamento')?.value.trim().toLocaleLowerCase('pt-BR') || '';
  const filtroStatus = document.getElementById('filtroStatusOS')?.value || '';
  const items = osList().filter(
    (o) =>
      (!filtro || String(o.apartamento).toLocaleLowerCase('pt-BR').includes(filtro)) &&
      (!filtroStatus || (o.status || 'Aberta') === filtroStatus),
  );
  const andamento = items.filter((o) => o.status === 'Em andamento').length;
  const resumo = document.getElementById('resumoListaOS');
  if (resumo) resumo.textContent = `${items.length} cards exibidos · ${andamento} em andamento`;
  const ordemStatus = { 'Em andamento': 0, Aberta: 1, Recusada: 2, Finalizada: 3 };
  items.sort(
    (a, b) =>
      (ordemStatus[a.status || 'Aberta'] ?? 1) - (ordemStatus[b.status || 'Aberta'] ?? 1) ||
      String(a.vencimento || '9999-12-31').localeCompare(String(b.vencimento || '9999-12-31')),
  );
  area.innerHTML = items.length
    ? items
        .map((o) => {
          const finalizada = o.status === 'Finalizada',
            status = o.status || 'Aberta';
          const vencida = BookProcesses.deadlineState(o, BookPeriods.today()) === 'late';
          return `<article class="chamado card-os ${finalizada ? 'finalizado' : ''}" data-on-click="abrirOS(${Number(o.id)})" role="button" tabindex="0" data-on-keydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirOS(${Number(o.id)})}"><div class="os-topo"><strong>Card #${escapar(o.id)}</strong><span class="selo-status ${finalizada ? 'selo-finalizado' : ''}">${escapar(BookProcesses.orderStatusLabel(status))}</span></div><p>${escapar(o.hotel)} - Apartamento ${escapar(o.apartamento)}</p><h3>${escapar(o.titulo)}</h3><div class="label-chips" data-label-card="${escapar(o.id)}"></div><p>Urgência: ${escapar(o.importacao?.parcial && !o.prioridadeDefinidaPeloAdmin ? 'Não informada' : BookProcesses.urgencyBadge(o.prioridade))} &middot; Respons&aacute;vel: ${escapar(o.responsavelLogin || 'A definir')}</p><p>${escapar(o.descricao)}</p><p class="vencimento deadline deadline-${BookProcesses.deadlineState(o, BookPeriods.today())}"><strong>Vencimento:</strong> ${formatarData(o.vencimento)}${vencida ? ' - Vencida' : ''}</p>${o.chamadoId ? `<small>Vinculada ao chamado #${escapar(o.chamadoId)}</small>` : '<small>Card independente</small>'}<label class="status-os" data-on-click="event.stopPropagation()">Status do card<select ${o.importacao?.parcial ? 'disabled' : ''} data-on-change="alterarStatusOS(${Number(o.id)},this.value)">${opcoesStatusOS(status)}</select></label></article>`;
        })
        .join('')
    : '<p class="vazio">Nenhum card encontrado para esse apartamento.</p>';
  BookLabels.hydrate(area);
}
function abrirOS(id) {
  const o = osList().find((item) => item.id == id);
  if (!o) return;
  document.getElementById('fechamentoIdOS').value = String(o.id);
  const chamadoVinculado = o.chamadoId ? chamados().find((c) => c.id == o.chamadoId) : null;
  const vinculo = o.chamadoId
    ? `<p><b>Chamado vinculado:</b> #${escapar(o.chamadoId)}${chamadoVinculado ? ` - ${escapar(chamadoVinculado.assunto)}` : ''}</p>`
    : '<p>Card independente</p>';
  const anexos =
    Array.isArray(o.anexos) && o.anexos.length
      ? o.anexos
          .map((a) => {
            if (a.tipo?.startsWith('image/'))
              return `<figure><img decoding="async" loading="lazy" src="${a.dados}" alt="${escapar(a.nome)}"><figcaption>${escapar(a.nome)}</figcaption></figure>`;
            if (a.tipo?.startsWith('video/'))
              return `<p>${escapar(a.nome)}<video preload="metadata" src="${a.dados}" controls></video></p>`;
            return `<p><a href="${a.dados}" download="${escapar(a.nome)}">Baixar ${escapar(a.nome)}</a></p>`;
          })
          .join('')
      : '<p>Nenhum anexo neste card</p>';
  const fotosFechamento = (o.fechamento?.fotos || [])
    .map(
      (f) =>
        `<figure><img decoding="async" loading="lazy" src="${f.dados}" alt="${escapar(f.nome)}"><figcaption>${escapar(f.nome)}</figcaption></figure>`,
    )
    .join('');
  const fechamento = o.fechamento
    ? `<h3>Dados do fechamento</h3><p><b>Data de fechamento:</b> ${formatarData(o.fechamento.data)}</p><p><b>Serviço executado por terceiro:</b> ${escapar(o.fechamento.terceiro)}</p><p><b>Valor do serviço:</b> ${formatarMoeda(o.fechamento.valorServico)}</p><p><b>Tipo de material:</b> ${escapar(o.fechamento.tipoMaterial)}</p><p><b>Valor do material:</b> ${formatarMoeda(o.fechamento.valorMaterial)}</p><p><b>Descrição do material:</b> ${escapar(o.fechamento.descricaoMaterial || 'Não informado')}</p><p><b>Responsável pelo pagamento:</b> ${escapar(o.fechamento.responsavelPagamento)}</p><p><b>Quem executou:</b> ${escapar(o.fechamento.executadoPor)}</p><p><b>Custo total:</b> ${formatarMoeda(o.fechamento.custoTotal)}</p><p><b>Observações:</b> ${escapar(o.fechamento.observacao || 'Nenhuma')}</p><h4>Fotos do serviço concluído</h4>${fotosFechamento || '<p>Nenhuma foto anexada.</p>'}`
    : `<p>${o.status === 'Finalizada' ? 'Sem dados de fechamento registrados para este card.' : 'Este card ainda não foi finalizado.'}</p>`;
  document.getElementById('osDetalhes').innerHTML =
    `<h2>${escapar(o.titulo || 'Card')}</h2><p><b>Card #:</b> ${escapar(o.id)}</p><p><b>Hotel:</b> ${escapar(o.hotel)}</p><p><b>Apartamento:</b> ${escapar(o.apartamento)}</p><p><b>Descrição:</b> ${escapar(o.descricao)}</p><label>Status do card<select id="osDetalheStatus" data-on-change="alterarStatusOS(${Number(o.id)},this.value)" ${BookWorkspace.can('os') && !o.importacao?.parcial ? '' : 'disabled'}>${opcoesStatusOS(o.status || 'Aberta')}</select></label>${o.motivoRecusa ? `<p><b>${o.status === 'Recusada' ? 'Motivo da recusa' : 'Último motivo de recusa'}:</b> ${escapar(o.motivoRecusa)}</p>` : ''}<p><b>Abertura:</b> ${escapar(o.data)}</p><p class="deadline deadline-${BookProcesses.deadlineState(o, BookPeriods.today())}"><b>Vencimento:</b> ${formatarData(o.vencimento)}</p><p><b>Urgência:</b> ${escapar(o.importacao?.parcial && !o.prioridadeDefinidaPeloAdmin ? 'Não informada' : BookProcesses.urgencyBadge(o.prioridade))}</p>${vinculo}<h3>Anexos e arquivos</h3>${anexos}${fechamento}`;
  let editButton = document.getElementById('botaoEditarOS');
  if (!editButton) {
    editButton = document.createElement('button');
    editButton.id = 'botaoEditarOS';
    editButton.type = 'button';
    editButton.className = 'acao-principal';
    editButton.textContent = 'Editar card';
    document.getElementById('osDetalhes').after(editButton);
  }
  editButton.hidden = !BookWorkspace.can('os');
  editButton.onclick = () => editarDadosOS(String(o.id));
  BookLabels.mountDetails(String(o.id));
  const botaoFechamento = document.getElementById('botaoFinalizarOS');
  botaoFechamento.hidden = o.status === 'Finalizada';
  if (o.importacao?.parcial) botaoFechamento.hidden = true;
  if (!BookWorkspace.can('os')) botaoFechamento.hidden = true;
  let reabrir = document.getElementById('botaoReabrirOS');
  if (!reabrir) {
    reabrir = document.createElement('button');
    reabrir.id = 'botaoReabrirOS';
    reabrir.type = 'button';
    reabrir.className = 'acao-principal';
    reabrir.textContent = 'Reabrir card para corrigir';
    reabrir.onclick = async () => {
      await alterarStatusOS(document.getElementById('fechamentoIdOS').value, 'Em andamento');
      abrirOS(document.getElementById('fechamentoIdOS').value);
    };
    botaoFechamento.after(reabrir);
  }
  reabrir.hidden = o.status !== 'Finalizada' || !BookWorkspace.can('os') || !!o.importacao?.parcial;
  botaoFechamento.textContent =
    o.status === 'Em andamento' || o.fechamento
      ? 'Preencher/editar informações do serviço'
      : 'Registrar informações e finalizar o card';
  document.getElementById('osDetalhesModal').style.display = 'block';
  window.BookRoutine?.orderOpened(String(o.id));
}
async function alterarStatusOS(id, status) {
  const items = osList(),
    order = items.find((o) => o.id == id);
  if (!order) return;
  if (order.importacao?.parcial) {
    alert('Histórico parcial: os dados do imóvel ainda precisam de conferência.');
    mostrarOS();
    return;
  }
  if (!['Aberta', 'Em andamento', 'Recusada', 'Finalizada'].includes(status)) {
    alert('Status inválido.');
    mostrarOS();
    return;
  }
  if (order.status === status) return;
  const wasOpen = document.getElementById('osDetalhesModal').style.display === 'block';
  if (!BookWorkspace.can('os')) {
    alert('Sem permissão para alterar cards.');
    mostrarOS();
    return;
  }
  if (order.status === 'Finalizada' && status !== 'Finalizada') {
    if (status !== 'Em andamento') {
      alert('Reabra o card como Andamento para corrigir o fechamento.');
      mostrarOS();
      if (wasOpen) abrirOS(id);
      return;
    }
    const reason = prompt('Motivo da reabertura do card (3 a 1000 caracteres):');
    if (!reason?.trim()) {
      mostrarOS();
      if (wasOpen) abrirOS(id);
      return;
    }
    try {
      await BookAPI.request('/api/orders/reopen', {
        method: 'POST',
        body: JSON.stringify({
          id: String(order.id),
          version: order.__bookVersion,
          reason: reason.trim(),
        }),
      });
      await BookStore.refresh(true);
      atualizarPainel();
    } catch (error) {
      alert(error.message);
    }
    mostrarOS();
    if (wasOpen) abrirOS(id);
    return;
  }
  if (status === 'Finalizada') {
    abrirFechamentoOS(id);
    mostrarOS();
    return;
  }
  if (status === 'Recusada') {
    const motivo = prompt(
      'Motivo da recusa do card (3 a 2000 caracteres):',
      order.motivoRecusa || '',
    );
    if (motivo === null) {
      mostrarOS();
      if (wasOpen) abrirOS(id);
      return;
    }
    if (motivo.trim().length < 3 || motivo.trim().length > 2000) {
      alert('Informe um motivo de 3 a 2000 caracteres.');
      mostrarOS();
      if (wasOpen) abrirOS(id);
      return;
    }
    order.motivoRecusa = motivo.trim();
  }
  order.status = status;
  try {
    await BookStore.setItem('ordensServico', JSON.stringify(items));
    atualizarPainel();
    if (wasOpen) abrirOS(id);
  } catch (error) {
    alert(error.message);
    mostrarOS();
    if (wasOpen) abrirOS(id);
  }
}
function editarDadosOS(id) {
  const order = osList().find((item) => String(item.id) === String(id));
  if (!order || !BookWorkspace.can('os')) return;
  let dialog = document.getElementById('editarCardDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'editarCardDialog';
    dialog.className = 'workspace-dialog';
    document.body.append(dialog);
  }
  dialog.innerHTML =
    '<form><h2>Editar card</h2><p>Status e histórico de origem são preservados.</p><label>Título<input name="titulo" required maxlength="200"></label><label>Descrição<textarea name="descricao" maxlength="10000"></textarea></label><label>Urgência<select name="prioridade"><option value="">Não informada</option><option value="Urgente">🔴⚠️ Alta</option><option value="Alta">🟡⚠️ Média</option><option value="Normal">🟢⚠️ Baixa</option></select></label><label>Vencimento<input name="vencimento" type="date"></label><p role="status"></p><button type="button">Cancelar</button><button type="submit">Salvar alterações</button></form>';
  const form = dialog.querySelector('form');
  for (const key of ['titulo', 'descricao', 'prioridade', 'vencimento'])
    form.elements[key].value = order[key] || '';
  form.querySelector('[type=button]').onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    if (submit.disabled) return;
    submit.disabled = true;
    const document = {
      titulo: form.elements.titulo.value.trim(),
      descricao: form.elements.descricao.value.trim(),
      vencimento: form.elements.vencimento.value,
    };
    if (form.elements.prioridade.value) document.prioridade = form.elements.prioridade.value;
    try {
      const row = await BookAPI.request('/api/orders/edit', {
        method: 'POST',
        body: JSON.stringify({ id: String(order.id), version: order.__bookVersion, document }),
      });
      BookStore.includeRecord('ordensServico', row);
      dialog.close();
      atualizarPainel();
      abrirOS(id);
    } catch (error) {
      form.querySelector('[role=status]').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
  dialog.showModal();
}
