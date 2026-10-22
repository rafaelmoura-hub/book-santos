const { test } = require('node:test');
const assert = require('node:assert/strict');
const Periods = require('../assets/periods');

test('períodos incluem dia e mês bissexto sem depender do fuso do navegador', () => {
  assert.deepEqual(Periods.range('dia','2024-02-29'),{start:'2024-02-29',end:'2024-03-01',label:'29/02/2024'});
  assert.deepEqual(Periods.range('mes','2024-02-29'),{start:'2024-02-01',end:'2024-03-01',label:'01/02/2024 a 29/02/2024'});
  assert.deepEqual(Periods.range('ano','2026-10-22'),{start:'2026-01-01',end:'2027-01-01',label:'01/01/2026 a 31/12/2026'});
  assert.equal(Periods.range('all').start,null);
  assert.throws(()=>Periods.range('dia','2026-02-30'));
  assert.throws(()=>Periods.range('dia','2026-13-01'));
  assert.throws(()=>Periods.range('outro','2026-01-01'));
});

test('semanas atravessam o ano e navegação mensal evita pular fevereiro', () => {
  assert.deepEqual(Periods.range('semana','2026-01-01'),{start:'2025-12-29',end:'2026-01-05',label:'29/12/2025 a 04/01/2026'});
  assert.equal(Periods.move('mes','2026-01-31',1),'2026-02-01');
  assert.equal(Periods.move('mes','2026-01-31',-1),'2025-12-01');
  assert.equal(Periods.move('semana','2026-01-04',1),'2026-01-05');
  assert.equal(Periods.move('dia','2024-03-01',-1),'2024-02-29');
  assert.match(Periods.today(),/^\d{4}-\d{2}-\d{2}$/);
});
