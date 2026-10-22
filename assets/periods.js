(function (root, factory) {
  const periods = factory();
  if (typeof module === 'object' && module.exports) module.exports = periods;
  else root.BookPeriods = periods;
})(typeof window === 'undefined' ? globalThis : window, () => {
  const iso = date => date.toISOString().slice(0,10);
  function parse(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error('Selecione uma data de referência válida.');
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || iso(date) !== value || date.getUTCFullYear() > 9998) throw new Error('Selecione uma data de referência válida.');
    return date;
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const field = name => parts.find(part => part.type === name).value;
    return `${field('year')}-${field('month')}-${field('day')}`;
  }
  const display = value => value ? value.split('-').reverse().join('/') : 'Sem data';
  function range(kind = 'all', reference) {
    if (!['all','dia','semana','mes','ano'].includes(kind)) throw new Error('Período inválido.');
    if (kind === 'all') return {start:null,end:null,label:'Todo o histórico'};
    const start = parse(reference), end = parse(reference);
    if (kind === 'dia') end.setUTCDate(end.getUTCDate()+1);
    if (kind === 'semana') {
      start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
      end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate()+7);
    }
    if (kind === 'mes') {
      start.setUTCDate(1); end.setTime(start.getTime()); end.setUTCMonth(end.getUTCMonth()+1);
    }
    if (kind === 'ano') {
      start.setUTCMonth(0,1); end.setTime(start.getTime()); end.setUTCFullYear(end.getUTCFullYear()+1);
    }
    const last = new Date(end); last.setUTCDate(last.getUTCDate()-1);
    return {start:iso(start),end:iso(end),label:kind === 'dia' ? display(iso(start)) : `${display(iso(start))} a ${display(iso(last))}`};
  }
  function move(kind, reference, direction) {
    if (![1,-1].includes(direction)) throw new Error('Navegação inválida.');
    const selected = range(kind,reference);
    if (kind === 'all') return reference;
    const date = parse(selected.start);
    if (kind === 'dia') date.setUTCDate(date.getUTCDate()+direction);
    if (kind === 'semana') date.setUTCDate(date.getUTCDate()+direction*7);
    if (kind === 'mes') date.setUTCMonth(date.getUTCMonth()+direction);
    if (kind === 'ano') date.setUTCFullYear(date.getUTCFullYear()+direction);
    return iso(parse(iso(date)));
  }
  return {range,move,today,display};
});
