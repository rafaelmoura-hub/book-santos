const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, prepare } = require('../scripts/prepare-apartment-info-import');
test('informacoes: preserva zeros e simbolos, separa finalidades e conserva o texto sem expor senhas no relatorio', () => {
  const text =
    "*Type*\n*54* - 000042#\nSenha mestra: 000007#\nWiFi: Rede teste\nSenha: teste#'com-simbolos\n*131* - 000002#\nGovernança/Patrimônio: 000003#";
  const result = prepare(text),
    first = result.entries[0];
  assert.equal(first.hotel, 'Type');
  assert.equal(first.fields.lockPassword, '000042#');
  assert.equal(first.fields.masterPassword, '000007#');
  assert.equal(first.fields.wifiPassword, "teste#'com-simbolos");
  assert.ok(first.fields.accessNotes.includes('000042#'));
  assert.equal(result.entries[1].fields.governancePassword, '000003#');
  assert.equal(result.entries[1].fields.propertyPassword, '000003#');
  assert.ok(result.sql.includes("teste#''com-simbolos"));
  const conflict = parse('*Type*\n*54* - 000001#\nHóspede: 000002#')[0];
  assert.equal(conflict.fields.lockPassword, undefined);
  assert.ok(conflict.blockedFields.includes('lockPassword'));
  assert.ok(conflict.fields.accessNotes.includes('000002#'));
  const missing = parse('Helbor Stay:\nSenha Hóspede: 000123#')[0];
  assert.equal(missing.apartment, null);
  assert.equal(missing.ready, false);
});
test('informacoes: nao confunde uma palavra da senha de wifi com a finalidade do acesso', () => {
  const row = parse('*Type*\n*54* - 000001#\nWifi: Rede teste\nSenha: admin gov 00042')[0];
  assert.equal(row.fields.wifiPassword, 'admin gov 00042');
  assert.equal(row.fields.adminPassword, undefined);
  assert.equal(row.fields.governancePassword, undefined);
});
