const { uuid } = require('./workspace');
const { hotels } = require('../assets/catalog');
const fail = (message) => Object.assign(new Error(message), { status: 400 });
function validateCollaboration(kind, input, hotelsAllowed = hotels) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Dados inválidos.');
  if (kind === 'evaluations') {
    if (
      !uuid(input.id) ||
      typeof input.body !== 'string' ||
      !input.body.trim() ||
      input.body.length > 2000 ||
      (input.target && !uuid(input.target))
    )
      throw fail('Informe um comentário de até 2000 caracteres.');
    return { id: input.id, body: input.body.trim(), target: input.target || null };
  }
  if (kind === 'reminders') {
    if (
      !uuid(input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      typeof input.enabled !== 'boolean' ||
      !['once', 'daily'].includes(input.repeat) ||
      typeof input.due !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(input.due) ||
      !Number.isFinite(Date.parse(input.due))
    )
      throw fail('Informe uma data, hora e repetição válidas.');
    return {
      id: input.id,
      version: input.version,
      due: input.due,
      repeat: input.repeat,
      enabled: input.enabled,
    };
  }
  if (
    !uuid(input.id) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    !input.data ||
    Array.isArray(input.data) ||
    typeof input.data !== 'object'
  )
    throw fail('Feedback inválido.');
  const d = input.data;
  if (
    typeof d.assunto !== 'string' ||
    !d.assunto.trim() ||
    d.assunto.length > 120 ||
    !hotelsAllowed.includes(d.hotel) ||
    typeof d.apartamento !== 'string' ||
    !d.apartamento ||
    d.apartamento.length > 16 ||
    !['Crítico', 'Razoável', 'Irrelevante'].includes(d.grau) ||
    typeof d.observacoes !== 'string' ||
    d.observacoes.length > 8000 ||
    !Array.isArray(d.anexos) ||
    d.anexos.length > 20 ||
    d.anexos.some(
      (a) => !a || typeof a.nome !== 'string' || a.nome.length > 200 || typeof a.dados !== 'string',
    )
  )
    throw fail('Preencha assunto, condomínio, apartamento e grau do feedback.');
  return {
    id: input.id,
    version: input.version,
    data: {
      assunto: d.assunto.trim(),
      hotel: d.hotel,
      apartamento: d.apartamento,
      grau: d.grau,
      observacoes: d.observacoes,
      anexos: d.anexos.map((a) => ({ nome: a.nome, dados: a.dados })),
    },
  };
}
module.exports = { validateCollaboration };
