const fail = message => Object.assign(new Error(message), { status: 400 });
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function validateWorkspace(kind, input) {
  if (!input || !uuid(input.id) || !Number.isSafeInteger(input.version) || input.version < 0) throw fail('Identificador ou versão inválidos.');
  if (kind === 'notes') {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || typeof input.body !== 'string' || input.body.length > 20000 || input.remove !== undefined && typeof input.remove !== 'boolean') throw fail('Informe título e texto válidos para a nota.');
    return {id:input.id,version:input.version,title:input.title.trim(),body:input.body,remove:input.remove === true};
  }
  if (typeof input.body !== 'string' || input.body.length > 4000 || typeof input.subject !== 'string' || input.subject.length > 120 || !input.version && (!input.subject.trim() || !input.body.trim()) || input.version && !input.body.trim() && !input.status || input.status !== undefined && !['Aberto','Fechado'].includes(input.status)) throw fail('Informe assunto e mensagem válidos.');
  return {id:input.id,version:input.version,subject:input.subject.trim(),body:input.body.trim(),...(input.status ? {status:input.status} : {})};
}
module.exports = { uuid, validateWorkspace };
