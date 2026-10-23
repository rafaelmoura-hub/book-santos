const { hotels } = require('../assets/catalog');
const fail = (status, message) => Object.assign(new Error(message), { status });
function validateUser(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    typeof input.nome !== 'string' || !input.nome.trim() || input.nome.trim().length > 120 ||
    !['adm','cliente'].includes(input.funcao) || input.mestre !== undefined ||
    !Array.isArray(input.hotels) || input.hotels.length > hotels.length || input.hotels.some(h => !hotels.includes(h)) || new Set(input.hotels).size !== input.hotels.length) throw fail(400, 'Informe nome, função e condomínios válidos.');
  const editing = input.id !== undefined;
  if (editing) {
    if (typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.id) || !Number.isSafeInteger(input.version) || input.version < 1 || input.senha !== undefined || input.login !== undefined) throw fail(400, 'Edição inválida. E-mail e senha não são alterados neste formulário.');
  } else if (typeof input.login !== 'string' || input.login.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.login.trim()) || typeof input.senha !== 'string' || input.senha.length < 12 || input.senha.length > 100) throw fail(400, 'Informe e-mail e senha de 12 a 100 caracteres.');
  return { nome: input.nome.trim(), funcao: input.funcao, hotels: input.hotels, ...(editing ? { id: input.id, version: input.version } : { login: input.login.trim().toLowerCase(), senha: input.senha }) };
}
module.exports = { validateUser };
