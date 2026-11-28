/* Tela de administração: gráficos legados do painel (cards e chamados por período e usuário). */
function dataRegistro(valor) {
  if (!valor) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(valor))) return new Date(valor);
  const m = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
function dataEfetiva(item, tipo) {
  const finalizada = tipo === 'os' ? item.status === 'Finalizada' : item.status === 'Fechado';
  if (tipo === 'os')
    return (
      dataRegistro(
        finalizada
          ? item.fechamento?.finalizadaEm || item.fechamento?.data
          : item.abertaEm || item.data,
      ) || dataRegistro(item.data)
    );
  return dataRegistro(
    finalizada ? item.fechadaEm || item.criadaEm || item.data : item.criadaEm || item.data,
  );
}
function criarIntervalos(periodo) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (periodo === 'diario')
    return Array.from({ length: 14 }, (_, i) => {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 13 + i);
      return {
        inicio,
        fim: new Date(inicio.getTime() + 86400000),
        nome: `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`,
      };
    });
  if (periodo === 'semanal') {
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, i) => {
      const inicio = new Date(segunda);
      inicio.setDate(inicio.getDate() - 49 + i * 7);
      return {
        inicio,
        fim: new Date(inicio.getTime() + 7 * 86400000),
        nome: `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`,
      };
    });
  }
  if (periodo === 'mensal')
    return Array.from({ length: 12 }, (_, i) => {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1);
      return {
        inicio,
        fim: new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1),
        nome: `${String(inicio.getMonth() + 1).padStart(2, '0')}/${String(inicio.getFullYear()).slice(-2)}`,
      };
    });
  return Array.from({ length: 5 }, (_, i) => {
    const ano = hoje.getFullYear() - 4 + i;
    return { inicio: new Date(ano, 0, 1), fim: new Date(ano + 1, 0, 1), nome: String(ano) };
  });
}
function preencherUsuariosGrafico(id) {
  const campo = document.getElementById(id),
    anterior = campo.value;
  const usuarios = lerUsuarios()
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  campo.innerHTML =
    '<option value="todos">Todos os usuários</option><option value="sem-usuario">Sem usuário associado</option>' +
    usuarios
      .map(
        (usuario) =>
          `<option value="${escapar(usuario.login)}">${escapar(usuario.nome)} (${escapar(usuario.funcao === 'adm' ? 'Administrador' : 'Cliente')})</option>`,
      )
      .join('');
  if (['todos', 'sem-usuario', ...usuarios.map((usuario) => usuario.login)].includes(anterior))
    campo.value = anterior;
}
function usuarioAssociado(item, tipo) {
  if (tipo === 'chamados') return { login: item.criadaPorLogin || '', nome: item.criadaPor || '' };
  if (item.status === 'Finalizada') {
    const login = item.fechamento?.executadoPorLogin || '',
      nome = item.fechamento?.executadoPor || '';
    const usuarioLegado =
      !login && nome ? lerUsuarios().find((usuario) => usuario.nome === nome) : null;
    return { login: login || usuarioLegado?.login || '', nome };
  }
  return { login: item.criadaPorLogin || '', nome: item.criadaPor || '' };
}
function filtrarPorUsuario(items, tipo, selecao) {
  if (selecao === 'todos') return items;
  return items.filter((item) => {
    const associado = usuarioAssociado(item, tipo);
    if (selecao === 'sem-usuario') return !associado.login && !associado.nome;
    if (associado.login) return associado.login === selecao;
    const escolhido = lerUsuarios().find((usuario) => usuario.login === selecao);
    return !!escolhido && associado.nome === escolhido.nome;
  });
}
function desenharGrafico(dados, rotulos, tipo) {
  const palette = getComputedStyle(document.documentElement);
  const cores = [
      palette.getPropertyValue('--chart-blue').trim() || '#0b5978',
      palette.getPropertyValue('--chart-green').trim() || '#198668',
    ],
    nomes =
      window.__dashboardTipo === 'chamados' ? ['Abertos', 'Fechados'] : ['Abertas', 'Finalizadas'],
    totais = dados.map((s) => s.reduce((a, b) => a + b, 0));
  if (tipo === 'pizza') {
    const soma = totais[0] + totais[1],
      a = soma ? (totais[0] / soma) * 100 : 50;
    return `<div class="pizza-wrap"><div class="pizza" style="background:${soma ? `conic-gradient(${cores[0]} 0 ${a}%,${cores[1]} ${a}% 100%)` : '#e5e9f0'}"></div><ul><li><i style="background:${cores[0]}"></i>${nomes[0]}: ${totais[0]}</li><li><i style="background:${cores[1]}"></i>${nomes[1]}: ${totais[1]}</li></ul></div>`;
  }
  const max = Math.max(1, ...dados.flat()),
    cap = tipo === 'coluna' ? 8 : 12;
  const labels = rotulos
    .map(
      (r, i) =>
        `<span title="${r}">${rotulos.length > cap && i % Math.ceil(rotulos.length / cap) ? '' : r}</span>`,
    )
    .join('');
  const colunas = rotulos
    .map(
      (r, i) =>
        `<div class="grafico-ponto" title="${r}: ${nomes[0]} ${dados[0][i]}, ${nomes[1]} ${dados[1][i]}"><div class="grafico-barras"><i style="height:${Math.max(2, (dados[0][i] / max) * 100)}%;background:${cores[0]}"></i><i style="height:${Math.max(2, (dados[1][i] / max) * 100)}%;background:${cores[1]}"></i></div></div>`,
    )
    .join('');
  if (tipo === 'coluna')
    return `<div class="grafico-colunas"><div class="grafico-coluna-itens">${colunas}</div><div class="grafico-rotulos">${labels}</div></div><p class="legenda-grafico"><i style="background:${cores[0]}"></i>${nomes[0]} <i style="background:${cores[1]}"></i>${nomes[1]}</p>`;
  const linhas = dados
    .map((serie, si) => {
      const pontos = serie
        .map(
          (v, i) =>
            `${40 + (rotulos.length === 1 ? 460 : (i / (rotulos.length - 1)) * 920)},${205 - (v / max) * 175}`,
        )
        .join(' ');
      return (
        `<polyline points="${pontos}" fill="none" stroke="${cores[si]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        serie
          .map(
            (v, i) =>
              `<circle cx="${40 + (rotulos.length === 1 ? 460 : (i / (rotulos.length - 1)) * 920)}" cy="${205 - (v / max) * 175}" r="4" fill="${cores[si]}"/>`,
          )
          .join('')
      );
    })
    .join('');
  return `<div class="grafico-linhas"><svg viewBox="0 0 1000 230" role="img" aria-label="Tendência por período"><line x1="30" y1="205" x2="970" y2="205" class="grafico-grade"/>${linhas}</svg><div class="grafico-rotulos">${labels}</div></div><p class="legenda-grafico"><i style="background:${cores[0]}"></i>${nomes[0]} <i style="background:${cores[1]}"></i>${nomes[1]}</p>`;
}
function atualizarPainelDashboard(tipo, periodoId, usuarioId, graficoId, resumoId, areaId) {
  const todosItems = tipo === 'os' ? osList() : chamados();
  preencherUsuariosGrafico(usuarioId);
  const items = filtrarPorUsuario(todosItems, tipo, document.getElementById(usuarioId).value);
  const intervalos = criarIntervalos(document.getElementById(periodoId).value),
    dados = [intervalos.map(() => 0), intervalos.map(() => 0)];
  items.forEach((item) => {
    const data = dataEfetiva(item, tipo);
    if (!data || Number.isNaN(data.getTime())) return;
    const n = intervalos.findIndex((p) => data >= p.inicio && data < p.fim);
    if (n >= 0) dados[item.status === (tipo === 'os' ? 'Finalizada' : 'Fechado') ? 1 : 0][n]++;
  });
  const nomes = tipo === 'os' ? ['abertas', 'finalizadas'] : ['abertos', 'fechados'],
    totais = dados.map((s) => s.reduce((a, b) => a + b, 0));
  const geralAbertos = items.filter(
    (item) => item.status !== (tipo === 'os' ? 'Finalizada' : 'Fechado'),
  ).length;
  const geralFinalizados = items.length - geralAbertos;
  document.getElementById(resumoId).textContent =
    `No período: ${totais[0] + totais[1]} total · ${totais[0]} ${nomes[0]} · ${totais[1]} ${nomes[1]} · Selecionados: ${items.length} (${geralAbertos} abertos, ${geralFinalizados} finalizados/fechados) · Geral: ${todosItems.length}`;
  window.__dashboardTipo = tipo;
  document.getElementById(areaId).innerHTML = desenharGrafico(
    dados,
    intervalos.map((p) => p.nome),
    document.getElementById(graficoId).value,
  );
}
function atualizarDashboard() {
  if (!document.getElementById('decisionLegacyCharts')?.open) return;
  atualizarPainelDashboard(
    'os',
    'periodoOS',
    'usuarioOS',
    'tipoGraficoOS',
    'resumoDashboardOS',
    'graficoOS',
  );
  atualizarPainelDashboard(
    'chamados',
    'periodoChamados',
    'usuarioChamados',
    'tipoGraficoChamados',
    'resumoDashboardChamados',
    'graficoChamados',
  );
}
