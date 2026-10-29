const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hotels, apartments, filePath } = require('../assets/catalog');
const { validateUser } = require('../server/users');
const { validateChanges, storeAttachments } = require('../server/operations');

test('catálogo aceita os 17 condomínios nas permissões, registros e anexos', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(hotels.length,17);
  assert.equal(Object.values(apartments).flat().length,126);
  validateUser({id,version:1,nome:'Gestor',funcao:'adm',hotels});
  for (const hotel of hotels) {
    const change = {collection:'chamados',id:'1',version:0,data:{hotel,apartamento:apartments[hotel][0],anexoData:`/api/files/${id}/${hotel}/${id}`}};
    validateChanges([change],{funcao:'adm'});
    await storeAttachments([change],{id},()=>assert.fail('Sem upload para anexo existente'));
    assert.equal(filePath(`${id}/${hotel}/${id}`),true);
  }
  assert.equal(filePath(`${id}/Novo Condomínio/${id}`),true,'O formato aceita nomes novos; a autorização pertence às políticas do banco.');
  assert.equal(filePath(`${id}/../${id}`),false);
  assert.equal(filePath(`${id}/Outro/extra/${id}`),false);
});
