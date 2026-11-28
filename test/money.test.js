const { test } = require('node:test');
const assert = require('node:assert/strict');
const Money = require('../assets/money');
const { validateChanges } = require('../server/operations');

test('dinheiro soma centavos exatos, formata BRL e valida casas decimais', () => {
  assert.equal(Money.sum(['0.10', '0.20']), '0.30');
  assert.equal(Money.sum(Array(1000).fill('0.01')), '10.00');
  assert.equal(Money.parse('1234,56'), '1234.56');
  assert.equal(Money.decimal(0), '0.00');
  assert.equal(Money.decimal(1.005), '1.01');
  assert.equal(Money.format('1234.56'), 'R$\u00a01.234,56');
  assert.equal(Money.format('10000000000000.12'), 'R$\u00a010.000.000.000.000,12');
  assert.throws(() => Money.parse('1.005'), /duas casas/);
  assert.throws(() => Money.parse('-0.01'));
  assert.throws(() => Money.parse('Infinity'));
  assert.throws(() => Money.parse('1000000000000.00'), /limite/);
  assert.equal(
    Money.materials([
      { valor: '0.01', quantidade: '0.5' },
      { valor: '0.01', quantidade: '0.5' },
    ]),
    '0.01',
  );
  assert.equal(
    Money.materials([
      { valor: '2.35', quantidade: '1.50' },
      { valor: '0.10', quantidade: '2' },
    ]),
    '3.73',
  );
});

test('API aceita centavos decimais e rejeita precisão extra ou valor negativo', () => {
  const change = (valor) => ({
    collection: 'estoqueBookSantos',
    id: 'singleton',
    version: 0,
    data: { itens: [{ id: 'a', quantidade: 1, valor }], colunas: [] },
  });
  assert.equal(validateChanges([change('0.29')], { funcao: 'adm' })[0].data.itens[0].valor, 0.29);
  assert.throws(
    () => validateChanges([change('1.005')], { funcao: 'adm' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () => validateChanges([change(-1)], { funcao: 'adm' }),
    (error) => error.status === 400,
  );
});
