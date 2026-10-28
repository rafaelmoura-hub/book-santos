const { COLLECTIONS } = require('./operations');
const { filePath } = require('../assets/catalog');
const OPTIONS = [...COLLECTIONS, 'cadastros', 'auditoria', 'anexos', 'colaboracao'];
function validateBackup(input) {
  const selected = input?.selected;
  if (!Array.isArray(selected) || !selected.length || selected.length > OPTIONS.length || new Set(selected).size !== selected.length || selected.some(key => !OPTIONS.includes(key)) || selected.every(key => key === 'anexos')) {
    throw Object.assign(new Error('Selecione os dados que deseja copiar.'), { status: 400 });
  }
  return selected;
}
function attachments(value, found = new Set()) {
  if (typeof value === 'string' && value.startsWith('/api/files/') && filePath(value.slice(11))) found.add(value.slice(11));
  else if (Array.isArray(value)) value.forEach(item => attachments(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => attachments(item, found));
  return [...found].sort();
}
module.exports = { OPTIONS, validateBackup, attachments };
