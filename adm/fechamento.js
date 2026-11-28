/* Tela de administração: fechamento de cards (executor, materiais do estoque, custos e fotos). */
function preencherExecutores(selecionado = '') {
  const campo = document.getElementById('fechamentoExecutadoPor');
  campo.innerHTML =
    '<option value="">Selecione o executor</option>' +
    usuariosQueFinalizam()
      .map(
        (usuario) =>
          `<option value="${escapar(usuario.login)}" ${usuario.login === selecionado || usuario.nome === selecionado ? 'selected' : ''}>${escapar(usuario.nome)}</option>`,
      )
      .join('');
}
function atualizarCustoTotal() {
  const servico = document.getElementById('fechamentoValorServico').value || '0.00';
  const material = document.getElementById('fechamentoValorMaterial').value || '0.00';
  try {
    document.getElementById('fechamentoCustoTotal').value = BookMoney.sum([servico, material]);
  } catch {
    document.getElementById('fechamentoCustoTotal').value = '';
  }
}
function abrirFechamentoOS(id) {
  if (osList().find((o) => o.id == id)?.importacao?.parcial) {
    alert('Histórico parcial: dados de fechamento não foram fornecidos.');
    return;
  }
  const o = osList().find((item) => item.id == id);
  if (!o) return;
  const formulario = document.getElementById('formFechamentoOS');
  formulario.reset();
  formulario.dataset.version = String(o.__bookVersion);
  document.getElementById('fechamentoValorMaterial').disabled = false;
  document.getElementById('fechamentoValorMaterial').required = true;
  document.getElementById('fechamentoDescricaoMaterial').required = true;
  document.getElementById('fechamentoIdOS').value = String(id);
  const dados = o.fechamento || {};
  document.getElementById('fechamentoData').value = dados.data || dataLocalHoje();
  document.getElementById('fechamentoTerceiro').value = dados.terceiro || '';
  document.getElementById('fechamentoValorServico').value = BookMoney.decimal(dados.valorServico);
  document.getElementById('fechamentoTipoMaterial').value = dados.tipoMaterial || '';
  document.getElementById('fechamentoValorMaterial').value = BookMoney.decimal(dados.valorMaterial);
  document.getElementById('fechamentoDescricaoMaterial').value = dados.descricaoMaterial || '';
  document.getElementById('fechamentoResponsavelPagamento').value =
    dados.responsavelPagamento || '';
  document.getElementById('fechamentoObservacao').value = dados.observacao || '';
  preencherExecutores(o.fechamento?.executadoPor || '');
  document.getElementById('fechamentoCustoTotal').value = BookMoney.decimal(dados.custoTotal);
  renderizarMateriaisOS(dados.materiais || []);
  atualizarCamposMaterial();
  document.getElementById('osDetalhesModal').style.display = 'none';
  document.getElementById('fechamentoModal').style.display = 'block';
}
function renderizarMateriaisOS(materiais = []) {
  const area = document.getElementById('materiaisOS'),
    dados = lerEstoque();
  area.dataset.hadMaterials = materiais.some((material) => material.id) ? 'true' : 'false';
  area.innerHTML = materiais
    .map(
      (m, i) =>
        `<div class="linha-material-os"><select aria-label="Material do estoque" data-on-change="atualizarMateriaisOS()"><option value="">Selecione um material</option>${dados.itens.map((item) => `<option value="${escapar(item.id)}" ${item.id === m.id ? 'selected' : ''}>${escapar(item.nome || 'Material sem nome')} (estoque: ${Number(item.quantidade) || 0})</option>`).join('')}</select><input aria-label="Quantidade usada" type="number" min="0.01" step="0.01" value="${Number(m.quantidade) || 1}" data-on-input="atualizarMateriaisOS()"><button type="button" class="botao-remover" data-on-click="this.parentElement.remove();atualizarMateriaisOS()">Remover</button></div>`,
    )
    .join('');
  atualizarMateriaisOS();
}
function adicionarMaterialOS() {
  const atuais = [...document.querySelectorAll('#materiaisOS .linha-material-os')].map((l) => ({
    id: l.querySelector('select').value,
    quantidade: Number(l.querySelector('input').value),
  }));
  atuais.push({ id: '', quantidade: 1 });
  renderizarMateriaisOS(atuais);
}
function obterMateriaisOS() {
  return [...document.querySelectorAll('#materiaisOS .linha-material-os')]
    .map((l) => ({
      id: l.querySelector('select').value,
      quantidade: Number(l.querySelector('input').value) || 0,
    }))
    .filter((m) => m.id && m.quantidade > 0);
}
function atualizarMateriaisOS() {
  const estoque = lerEstoque(),
    usados = obterMateriaisOS();
  const area = document.getElementById('materiaisOS'),
    campo = document.getElementById('fechamentoValorMaterial');
  if (usados.length || area.dataset.hadMaterials === 'true') {
    campo.value = BookMoney.materials(
      usados.map((m) => ({
        valor: estoque.itens.find((i) => i.id === m.id)?.valor || '0.00',
        quantidade: m.quantidade,
      })),
    );
  }
  area.dataset.hadMaterials = usados.length ? 'true' : 'false';
  campo.readOnly = usados.length > 0;
  if (usados.length)
    document.getElementById('fechamentoDescricaoMaterial').value = usados
      .map(
        (m) => `${estoque.itens.find((i) => i.id === m.id)?.nome || 'Material'}: ${m.quantidade}`,
      )
      .join('; ');
  atualizarCustoTotal();
}
function aplicarConsumoEstoque(order, novos) {
  order.fechamento ||= {};
  order.fechamento.materiais = novos;
  return true;
}
function atualizarCamposMaterial() {
  const nenhum = document.getElementById('fechamentoTipoMaterial').value === 'Nenhum';
  const valor = document.getElementById('fechamentoValorMaterial');
  const descricao = document.getElementById('fechamentoDescricaoMaterial');
  valor.required = !nenhum;
  descricao.required = !nenhum;
  valor.disabled = nenhum;
  if (nenhum) {
    valor.value = '0.00';
    descricao.value = '';
  } else if (obterMateriaisOS().length) atualizarMateriaisOS();
  atualizarCustoTotal();
}
async function salvarRascunhoFechamentoOS() {
  const items = osList(),
    order = items.find((o) => o.id == document.getElementById('fechamentoIdOS').value);
  if (!order) return;
  const arquivos = [...document.getElementById('fechamentoFotos').files];
  BookStore.validateFiles(arquivos);
  order.__bookVersion = Number(document.getElementById('formFechamentoOS').dataset.version);
  return Promise.all(
    arquivos.map(
      (arquivo) =>
        new Promise((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () =>
            resolve({ nome: arquivo.name, tipo: arquivo.type, dados: leitor.result });
          leitor.onerror = () => reject(new Error('Falha ao ler uma foto.'));
          leitor.readAsDataURL(arquivo);
        }),
    ),
  )
    .then(async (fotos) => {
      const login = document.getElementById('fechamentoExecutadoPor').value;
      const materiaisSelecionados =
        document.getElementById('fechamentoTipoMaterial').value === 'Nenhum'
          ? []
          : obterMateriaisOS();
      if (!aplicarConsumoEstoque(order, materiaisSelecionados)) return;
      order.fechamento = {
        ...(order.fechamento || {}),
        data: document.getElementById('fechamentoData').value,
        terceiro: document.getElementById('fechamentoTerceiro').value,
        valorServico: BookMoney.parse(
          document.getElementById('fechamentoValorServico').value || '0.00',
        ),
        tipoMaterial: document.getElementById('fechamentoTipoMaterial').value,
        valorMaterial: BookMoney.parse(
          document.getElementById('fechamentoValorMaterial').value || '0.00',
        ),
        descricaoMaterial: document.getElementById('fechamentoDescricaoMaterial').value.trim(),
        responsavelPagamento: document.getElementById('fechamentoResponsavelPagamento').value,
        executadoPor: usuariosQueFinalizam().find((usuario) => usuario.login === login)?.nome || '',
        executadoPorLogin: login,
        custoTotal: BookMoney.parse(
          document.getElementById('fechamentoCustoTotal').value || '0.00',
        ),
        observacao: document.getElementById('fechamentoObservacao').value.trim(),
        fotos: [...(order.fechamento?.fotos || []), ...fotos],
        atualizadaEm: new Date().toISOString(),
      };
      if (BookProcesses.date(order.fechamento.data)) order.vencimento = order.fechamento.data;
      order.status = 'Em andamento';
      try {
        await BookStore.setItem('ordensServico', JSON.stringify(items));
      } catch (erro) {
        return;
      }
      document.getElementById('fechamentoFotos').value = '';
      document.getElementById('fechamentoModal').style.display = 'none';
      document.getElementById('osDetalhesModal').style.display = 'block';
      atualizarPainel();
      abrirOS(order.id);
    })
    .catch(() => alert('Não foi possível ler uma das fotos selecionadas.'));
}
async function salvarFechamentoOS(event) {
  event.preventDefault();
  const items = osList(),
    order = items.find((o) => o.id == document.getElementById('fechamentoIdOS').value);
  if (!order) return;
  const arquivos = [...document.getElementById('fechamentoFotos').files];
  BookStore.validateFiles(arquivos);
  order.__bookVersion = Number(document.getElementById('formFechamentoOS').dataset.version);
  return Promise.all(
    arquivos.map(
      (arquivo) =>
        new Promise((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () =>
            resolve({ nome: arquivo.name, tipo: arquivo.type, dados: leitor.result });
          leitor.onerror = () => reject(new Error('Falha ao ler uma foto.'));
          leitor.readAsDataURL(arquivo);
        }),
    ),
  )
    .then(async (fotos) => {
      const materiaisSelecionados =
        document.getElementById('fechamentoTipoMaterial').value === 'Nenhum'
          ? []
          : obterMateriaisOS();
      if (!aplicarConsumoEstoque(order, materiaisSelecionados)) return;
      order.fechamento = {
        data: document.getElementById('fechamentoData').value,
        terceiro: document.getElementById('fechamentoTerceiro').value,
        valorServico: BookMoney.parse(
          document.getElementById('fechamentoValorServico').value || '0.00',
        ),
        valorMaterial: BookMoney.parse(
          document.getElementById('fechamentoValorMaterial').value || '0.00',
        ),
        descricaoMaterial: document.getElementById('fechamentoDescricaoMaterial').value.trim(),
        responsavelPagamento: document.getElementById('fechamentoResponsavelPagamento').value,
        tipoMaterial: document.getElementById('fechamentoTipoMaterial').value,
        executadoPor:
          usuariosQueFinalizam().find(
            (usuario) => usuario.login === document.getElementById('fechamentoExecutadoPor').value,
          )?.nome || '',
        executadoPorLogin: document.getElementById('fechamentoExecutadoPor').value,
        finalizadaEm: new Date().toISOString(),
        custoTotal: BookMoney.parse(
          document.getElementById('fechamentoCustoTotal').value || '0.00',
        ),
        observacao: document.getElementById('fechamentoObservacao').value.trim(),
        fotos: [...(order.fechamento?.fotos || []), ...fotos],
        materiais: materiaisSelecionados,
      };
      if (BookProcesses.date(order.fechamento.data)) order.vencimento = order.fechamento.data;
      order.status = 'Finalizada';
      order.fechadaEm = order.fechamento.finalizadaEm;
      try {
        await BookStore.setItem('ordensServico', JSON.stringify(items));
      } catch (erro) {
        return;
      }
      document.getElementById('fechamentoModal').style.display = 'none';
      document.getElementById('osDetalhesModal').style.display = 'block';
      atualizarPainel();
      abrirOS(order.id);
    })
    .catch(() => alert('Não foi possível ler uma das fotos selecionadas.'));
}
