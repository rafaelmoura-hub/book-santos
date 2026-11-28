/* Tela de administração: aba Vistorias (checklist, histórico e registro). */
const gruposChecklistVistoria = {
  'Estrutura física': [
    'Paredes e pintura',
    'Piso e revestimentos',
    'Teto e forro',
    'Portas e fechaduras',
    'Janelas e vidros',
    'Instalações hidráulicas',
    'Instalações elétricas',
    'Banheiro e louças',
  ],
  Eletrônicos: [
    'Ar-condicionado',
    'Televisão e controle',
    'Geladeira',
    'Micro-ondas',
    'Fogão/cooktop',
    'Máquina de lavar',
    'Luminárias',
  ],
  Cozinha: [
    'Pia e torneira',
    'Armários',
    'Louças e copos',
    'Talheres e utensílios',
    'Panelas',
    'Bancada',
  ],
  Banheiro: [
    'Pia, cuba e torneira',
    'Vaso sanitário, assento e descarga',
    'Chuveiro, ducha e aquecimento',
    'Secador de cabelo',
    'Box, vidros e vedação',
    'Ralos, escoamento e sifão',
    'Vazamentos e infiltrações',
    'Piso, paredes, rejuntes e teto',
    'Espelho',
    'Bancada, armário e gavetas',
    'Iluminação, tomadas e interruptores',
    'Janela, ventilação e exaustor',
    'Ducha higiênica',
    'Toalheiros, ganchos e porta-papel',
    'Saboneteira e dispensadores',
    'Lixeira',
    'Toalhas e tapete',
  ],
  Sacada: [
    'Guarda-corpo e corrimão',
    'Piso, revestimentos e rejuntes',
    'Ralo e escoamento de água',
    'Porta de acesso, trilhos e fechaduras',
    'Fechamento de vidro e vedações',
    'Rede de proteção',
    'Paredes, teto e infiltrações',
    'Iluminação, tomadas e interruptores',
    'Mesa, cadeiras e bancos',
    'Sofá, poltronas e almofadas',
    'Churrasqueira, grelha e exaustão',
    'Pia, torneira e bancada',
    'Armários',
    'Persianas, cortinas e toldo',
    'Varal',
    'Vasos e plantas',
    'Limpeza e conservação geral',
  ],
  Móveis: [
    'Cama e colchão',
    'Sofá e poltronas',
    'Mesa e cadeiras',
    'Guarda-roupa',
    'Criados-mudos',
    'Cortinas e persianas',
  ],
};
let vistoriaHotel = '',
  vistoriaApartamento = '';
const vistorias = () => ler('vistorias');
function atualizarTotaisVistorias() {
  window.BookProperty?.refreshInspections();
  const itens = vistorias();
  BookCatalog.hotels.forEach((hotel) => {
    const total = itens.filter((item) => item.hotel === hotel).length;
    document.getElementById(`totalVistorias${hotel}`).textContent =
      `${total} ${total === 1 ? 'vistoria' : 'vistorias'}`;
  });
}
function selecionarHotelVistoria(hotel) {
  vistoriaHotel = hotel;
  document.getElementById('areaVistorias').innerHTML =
    `<h3>${escapar(hotel)} - Apartamentos</h3><div class="apartamentos-vistoria">${apartamentos(
      hotel,
    )
      .map(
        (ap) =>
          `<button type="button" data-on-click="selecionarApartamentoVistoria('${ap}')">Apartamento ${ap}</button>`,
      )
      .join(
        '',
      )}</div><div id="detalheApartamentoVistoria"><p class="vazio">Selecione um apartamento.</p></div>`;
  window.BookProperty?.decorateInspections(hotel);
}
function selecionarApartamentoVistoria(apartamento) {
  vistoriaApartamento = apartamento;
  const itens = vistorias()
    .filter((item) => item.hotel === vistoriaHotel && String(item.apartamento) === apartamento)
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const ultima = itens[0];
  document.getElementById('detalheApartamentoVistoria').innerHTML =
    `<div class="vistoria-resumo"><div><h3>Apartamento ${escapar(apartamento)}</h3><p><strong>Total de vistorias:</strong> ${itens.length}</p><p id="vistoriaDatesLoading">Consultando última e próxima vistoria…</p></div><button class="acao-principal" data-on-click="abrirFormularioVistoria()">+ Começar vistoria</button></div><button type="button" class="botao-secundario" data-on-click="abrirFormularioOS('', '${escapar(vistoriaHotel)}', '${escapar(apartamento)}')">Abrir Card para este apartamento</button><div class="historico-vistorias"><h4>Histórico de vistorias</h4>${itens.length ? itens.map(renderizarVistoria).join('') : '<p class="vazio">Nenhuma vistoria registrada neste apartamento.</p>'}</div>`;
  window.BookProperty?.decorateDetail(vistoriaHotel, apartamento);
}
function renderizarVistoria(item) {
  const checklist = Object.entries(item.checklist || {})
    .map(
      ([grupo, respostas]) =>
        `<h5>${escapar(grupo)}</h5><ul>${Object.entries(respostas)
          .map(([nome, estado]) => `<li><strong>${escapar(nome)}:</strong> ${escapar(estado)}</li>`)
          .join('')}</ul>`,
    )
    .join('');
  const fotos = (item.fotos || [])
    .map(
      (foto) =>
        `<a href="${foto.dados}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="${foto.dados}" alt="${escapar(foto.nome)}"></a>`,
    )
    .join('');
  return `<details class="vistoria-registro" data-vistoria-id="${escapar(item.id)}"><summary><strong>${formatarData(item.data)} — ${escapar(item.tipo)}</strong><span>Responsável: ${escapar(item.responsavel)}</span></summary><div class="vistoria-registro-detalhes"><p><strong>Responsável:</strong> ${escapar(item.responsavel)}</p>${checklist}<p><strong>Observações:</strong> ${escapar(item.observacoes || 'Nenhuma')}</p><p><strong>Fotos:</strong> ${(item.fotos || []).length}</p><div class="galeria-vistoria">${fotos}</div><button type="button" class="botao-secundario" data-on-click="BookRoutine.openFlow('vistorias','${Number(item.id)}')">Acompanhamento e serviço desta vistoria</button></div></details>`;
}
async function abrirFormularioVistoria() {
  try {
    await atualizarUsuarios();
  } catch (erro) {
    alert('Não foi possível carregar os administradores. Tente abrir a vistoria novamente.');
    return;
  }
  document.getElementById('formVistoria').reset();
  const responsavel = document.getElementById('vistoriaResponsavel');
  responsavel.replaceChildren(
    new Option('Selecione o administrador', ''),
    ...usuariosQueFinalizam()
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((usuario) => new Option(usuario.nome, usuario.login)),
  );
  if (!responsavel.options[1]) {
    alert('Nenhum administrador disponível para realizar a vistoria.');
    return;
  }
  document.getElementById('vistoriaData').value = dataLocalHoje();
  document.getElementById('vistoriaLocal').textContent =
    `${vistoriaHotel} — Apartamento ${vistoriaApartamento}`;
  document.getElementById('vistoriaFotosAjuda').textContent = '0 de 20 fotos selecionadas.';
  renderizarChecklistVistoria();
  document.getElementById('vistoriaModal').style.display = 'block';
}
function renderizarChecklistVistoria() {
  const simplificada = document.getElementById('vistoriaTipo').value === 'Simplificada';
  document.getElementById('gruposVistoria').innerHTML = Object.entries(gruposChecklistVistoria)
    .map(([grupo, itens]) => {
      const lista = simplificada
        ? itens.slice(0, grupo === 'Banheiro' || grupo === 'Sacada' ? 4 : 2)
        : itens;
      return `<fieldset class="grupo-checklist"><legend>${escapar(grupo)}</legend>${lista.map((nome, i) => `<label>${escapar(nome)}<select name="check-${Object.keys(gruposChecklistVistoria).indexOf(grupo)}-${i}" data-grupo="${escapar(grupo)}" data-item="${escapar(nome)}" required><option value="">Selecione</option><option>Em ordem</option><option>Com problema</option><option>Não se aplica</option></select></label>`).join('')}</fieldset>`;
    })
    .join('');
}
function fecharVistoriaModal() {
  document.getElementById('vistoriaModal').style.display = 'none';
}
async function salvarVistoria(event) {
  event.preventDefault();
  const responsavel = usuariosQueFinalizam().find(
    (usuario) => usuario.login === document.getElementById('vistoriaResponsavel').value,
  );
  if (!responsavel) {
    alert('Selecione o administrador que realizou a vistoria.');
    return;
  }
  const arquivos = [...document.getElementById('vistoriaFotos').files];
  BookStore.validateFiles(arquivos);
  if (arquivos.length > 20) {
    alert('Selecione no máximo 20 fotos por vistoria.');
    return;
  }
  return Promise.all(
    arquivos.map(
      (arquivo) =>
        new Promise((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve({ nome: arquivo.name, dados: leitor.result });
          leitor.onerror = () => reject(new Error('Falha ao ler uma foto.'));
          leitor.readAsDataURL(arquivo);
        }),
    ),
  )
    .then(async (fotos) => {
      const checklist = {};
      document.querySelectorAll('#gruposVistoria select').forEach((campo) => {
        checklist[campo.dataset.grupo] ||= {};
        checklist[campo.dataset.grupo][campo.dataset.item] = campo.value;
      });
      const item = {
        id: BookStore.id(),
        hotel: vistoriaHotel,
        apartamento: vistoriaApartamento,
        data: document.getElementById('vistoriaData').value,
        responsavel: responsavel.nome,
        responsavelLogin: responsavel.login,
        tipo: document.getElementById('vistoriaTipo').value,
        inspectionTrack: document.getElementById('vistoriaTrack').value,
        checklist,
        observacoes: document.getElementById('vistoriaObservacoes').value.trim(),
        fotos,
      };
      const itens = vistorias();
      itens.push(item);
      try {
        await BookStore.setItem('vistorias', JSON.stringify(itens));
      } catch (erro) {
        return;
      }
      fecharVistoriaModal();
      atualizarTotaisVistorias();
      selecionarApartamentoVistoria(vistoriaApartamento);
    })
    .catch(() => alert('Não foi possível ler uma das fotos selecionadas.'));
}
