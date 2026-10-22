(function (root, factory) {
  const money = factory();
  if (typeof module === 'object' && module.exports) module.exports = money;
  else root.BookMoney = money;
})(typeof window === 'undefined' ? globalThis : window, () => {
  const MAX = 99999999999999n;
  function parts(value) {
    const text = String(value ?? '0').trim().replace(',', '.') || '0';
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match) throw new Error('Informe um valor decimal válido, maior ou igual a zero.');
    let scale = (match[2] || '').length - Number(match[3] || 0);
    if (Math.abs(scale) > 20 || text.length > 60) throw new Error('Valor acima da precisão permitida.');
    let units = BigInt(match[1] + (match[2] || ''));
    if (scale < 0) { units *= 10n ** BigInt(-scale); scale = 0; }
    return { units, scale };
  }
  function cents(value, strict = false) {
    const { units, scale } = parts(value);
    if (scale <= 2) return units * 10n ** BigInt(2 - scale);
    const divisor = 10n ** BigInt(scale - 2);
    if (strict && units % divisor) throw new Error('Valores de dinheiro devem ter no máximo duas casas decimais.');
    return (units + divisor / 2n) / divisor;
  }
  const fromCents = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
  const decimal = value => fromCents(cents(value));
  function parse(value) {
    const amount = cents(value, true);
    if (amount > MAX) throw new Error('Valor monetário acima do limite permitido.');
    return fromCents(amount);
  }
  const sum = values => fromCents(values.reduce((total, value) => total + cents(value), 0n));
  function materials(items) {
    const lines = items.map(item => ({ price: cents(item.valor), ...parts(item.quantidade) }));
    const scale = Math.max(0, ...lines.map(line => line.scale));
    const divisor = 10n ** BigInt(scale);
    const total = lines.reduce((value, line) => value + line.price * line.units * 10n ** BigInt(scale - line.scale), 0n);
    return fromCents((total + divisor / 2n) / divisor);
  }
  function format(value) {
    const amount = cents(value);
    return `R$\u00a0${(amount / 100n).toLocaleString('pt-BR')},${String(amount % 100n).padStart(2, '0')}`;
  }
  function bind(container) {
    container.querySelectorAll('input[data-money]').forEach(input => {
      if (input.dataset.moneyBound) return;
      input.dataset.moneyBound = 'true';
      input.addEventListener('input', () => input.setCustomValidity(''));
      input.addEventListener('blur', () => {
        if (!input.value) return;
        try { input.value = parse(input.value); input.setCustomValidity(''); }
        catch (error) { input.setCustomValidity(error.message); }
      });
    });
  }
  return { parse, decimal, format, sum, materials, bind };
});
