/* Tela de administração: aba Estoque (materiais e colunas extras). */
const CHAVE_ESTOQUE = 'estoqueBookSantos';
const lerEstoque = () => {
  try {
    const dados = JSON.parse(BookStore.getItem(CHAVE_ESTOQUE) || 'null');
    return dados && Array.isArray(dados.itens) ? dados : { colunas: [], itens: [] };
  } catch {
    return { colunas: [], itens: [] };
  }
};
async function salvarEstoque(dados) {
  await BookStore.setItem(CHAVE_ESTOQUE, JSON.stringify(dados));
}
function mostrarEstoque() {
  const dados = lerEstoque(),
    colunas = dados.colunas || [],
    tabela = document.getElementById('tabelaEstoque');
  tabela.innerHTML = `<thead><tr><th>Material</th><th>Quantidade</th><th>Valor unitário (R$)</th>${colunas.map((c) => `<th>${escapar(c.nome)} <button class="remover-coluna" title="Remover coluna" data-on-click="removerColunaEstoque('${escapar(c.id)}')">×</button></th>`).join('')}<th>Ações</th></tr></thead><tbody>${dados.itens.map((item) => `<tr><td><input aria-label="Nome do material" value="${escapar(item.nome)}" data-on-change="editarEstoque('${escapar(item.id)}','nome',this.value)"></td><td><input aria-label="Quantidade" type="number" min="0" step="0.01" value="${Number(item.quantidade) || 0}" data-on-change="editarEstoque('${escapar(item.id)}','quantidade',this.value)"></td><td><input aria-label="Valor unitário" type="number" min="0" step="0.01" data-money value="${BookMoney.decimal(item.valor)}" data-on-change="editarEstoque('${escapar(item.id)}','valor',this.value)"></td>${colunas.map((c) => `<td><input aria-label="${escapar(c.nome)}" value="${escapar(item.extra?.[c.id] || '')}" data-on-change="editarEstoque('${escapar(item.id)}','extra:${escapar(c.id)}',this.value)"></td>`).join('')}<td><button class="botao-remover" data-on-click="removerLinhaEstoque('${escapar(item.id)}')">Apagar</button></td></tr>`).join('') || `<tr><td colspan="${4 + colunas.length}">Nenhum material cadastrado. Use “+ Material” para começar.</td></tr>`}</tbody>`;
  BookMoney.bind(tabela);
  BookDecision.stockControls(tabela, dados);
}
async function adicionarLinhaEstoque() {
  const d = lerEstoque();
  d.itens.push({
    id: String(Date.now()) + Math.random().toString(16).slice(2),
    nome: '',
    quantidade: 0,
    valor: '0.00',
    extra: {},
  });
  await salvarEstoque(d);
  mostrarEstoque();
}
async function editarEstoque(id, campo, valor) {
  const d = lerEstoque(),
    item = d.itens.find((i) => i.id === id);
  if (!item) return;
  if (campo.startsWith('extra:')) {
    item.extra ||= {};
    item.extra[campo.slice(6)] = valor;
  } else if (campo === 'minimo' && valor === '') delete item.minimo;
  else
    item[campo] =
      campo === 'nome' ? valor : campo === 'valor' ? BookMoney.parse(valor) : Number(valor);
  await salvarEstoque(d);
}
async function removerLinhaEstoque(id) {
  const emUso = osList().some((o) => (o.fechamento?.materiais || []).some((m) => m.id === id));
  if (emUso) {
    alert('Este material já foi usado em uma O.S. e não pode ser removido.');
    return;
  }
  const d = lerEstoque();
  if (!confirm('Apagar este material do estoque?')) return;
  d.itens = d.itens.filter((i) => i.id !== id);
  await salvarEstoque(d);
  mostrarEstoque();
}
async function adicionarColunaEstoque() {
  const nome = prompt('Nome da nova coluna:');
  if (!nome?.trim()) return;
  const d = lerEstoque();
  d.colunas.push({ id: String(Date.now()), nome: nome.trim() });
  await salvarEstoque(d);
  mostrarEstoque();
}
async function removerColunaEstoque(id) {
  const d = lerEstoque();
  d.colunas = d.colunas.filter((c) => c.id !== id);
  d.itens.forEach((i) => {
    if (i.extra) delete i.extra[id];
  });
  await salvarEstoque(d);
  mostrarEstoque();
}
