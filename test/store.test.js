const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');

test('tela aguarda confirmação e preserva versão lida para impedir sobrescrita', async () => {
  class Element {
    constructor() {
      this.style = {};
      this.children = [];
      this.tagName = 'DIV';
    }
    appendChild(child) {
      this.children.push(child);
    }
    prepend(...children) {
      this.children.unshift(...children);
    }
    setAttribute() {}
    removeAttribute() {}
    remove() {}
  }
  const local = new Map([['chamados', '[{"id":"antigo"}]']]);
  const events = new EventTarget();
  let rows = [
    {
      id: '100',
      version: 1,
      owner_id: 'owner',
      data: { id: 100, hotel: 'Unlimited', assunto: 'Original' },
    },
  ];
  let held, requestStarted, release;
  const api = {
    async request(url, options) {
      if (url === '/api/access') return ['Unlimited'];
      if (url === '/api/apartments')
        return ['1111', '901', '618'].map((apartment) => ({ hotel: 'Unlimited', apartment }));
      if (url.startsWith('/api/snapshot'))
        return JSON.parse(JSON.stringify({ chamados: { loaded: rows, cursor: null } }));
      const { changes } = JSON.parse(options.body);
      if (requestStarted) requestStarted();
      if (held)
        await new Promise((resolve) => {
          release = resolve;
        });
      for (const change of changes) {
        const old = rows.find((row) => row.id === change.id);
        if ((old?.version || 0) !== change.version)
          throw Object.assign(new Error('Conflito'), { status: 409 });
        rows = [
          { id: change.id, version: change.version + 1, owner_id: 'owner', data: change.data },
        ];
      }
      return { ok: true };
    },
  };
  let poll;
  const context = {
    document: {
      body: new Element(),
      createElement: () => new Element(),
      querySelector: () => null,
      querySelectorAll: () => [],
      activeElement: { tagName: 'DIV' },
      hidden: false,
    },
    localStorage: { getItem: (key) => local.get(key) || null },
    BookAPI: api,
    BookCatalog: { hotels: [], apartments: {} },
    crypto: webcrypto,
    Event,
    Blob,
    URL,
    console,
    setInterval: (fn) => {
      poll = fn;
    },
    setTimeout: () => {},
    alert: () => {},
    dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events),
  };
  context.window = context;
  vm.runInNewContext(readFileSync('assets/store.js', 'utf8'), context);
  const store = context.BookStore;
  await store.init({ id: 'owner', funcao: 'cliente' });
  let broadcasts = 0;
  events.addEventListener('book:data', () => broadcasts++);
  await store.refresh();
  assert.equal(broadcasts, 0, 'Uma resposta idêntica não deve reconstruir a tela.');
  assert.deepEqual(Array.from(store.apartments('Unlimited')), ['618', '901', '1111']);
  const photo = { type: 'image/jpeg', size: 512 * 1024 };
  store.validateFiles(Array(20).fill(photo));
  assert.throws(() => store.validateFiles(Array(21).fill(photo)), /20 anexos/);
  assert.throws(() => store.validateFiles([{ ...photo, size: 5 * 1024 * 1024 + 1 }]), /5 MB/);
  assert.throws(
    () => store.validateFiles(Array(3).fill({ ...photo, size: 4 * 1024 * 1024 })),
    /10 MB/,
  );
  assert.throws(() => store.validateFiles([{ ...photo, type: 'image/svg+xml' }]), /Use JPG/);
  const initial = JSON.parse(store.getItem('chamados'));
  assert.equal(initial[0].__bookVersion, 1);
  initial[0].assunto = 'Editado';
  held = true;
  const started = new Promise((resolve) => {
    requestStarted = resolve;
  });
  const pending = store.setItem('chamados', JSON.stringify(initial));
  await started;
  assert.equal(JSON.parse(store.getItem('chamados'))[0].assunto, 'Original');
  release();
  await pending;
  held = false;
  requestStarted = null;
  assert.equal(JSON.parse(store.getItem('chamados'))[0].assunto, 'Editado');
  const stale = JSON.parse(store.getItem('chamados'));
  rows[0] = { ...rows[0], version: 3, data: { ...rows[0].data, assunto: 'Outro funcionário' } };
  await store.refresh(true);
  assert.ok(broadcasts > 0, 'Uma versão nova deve atualizar a tela.');
  stale[0].assunto = 'Tentativa antiga';
  await assert.rejects(store.setItem('chamados', JSON.stringify(stale)), /Conflito/);
  assert.equal(rows[0].data.assunto, 'Outro funcionário');
  assert.equal(local.get('chamados'), '[{"id":"antigo"}]');
  const request = api.request,
    oldSnapshot = JSON.parse(JSON.stringify({ chamados: { loaded: rows, cursor: null } }));
  let finishSnapshot;
  api.request = async (url) =>
    url.startsWith('/api/snapshot')
      ? new Promise((resolve) => {
          finishSnapshot = resolve;
        })
      : request(url);
  const refreshing = store.refresh(true);
  const confirmed = { ...rows[0], version: 4, data: { ...rows[0].data, vencimento: '2099-01-01' } };
  store.includeRecord('chamados', confirmed);
  finishSnapshot(oldSnapshot);
  await refreshing;
  assert.equal(
    JSON.parse(store.getItem('chamados'))[0].vencimento,
    '2099-01-01',
    'Resposta atrasada não pode reverter a data já confirmada.',
  );
  assert.equal(JSON.parse(store.getItem('chamados'))[0].__bookVersion, 4);
  api.request = async () => ({ chamados: { loaded: [], cursor: null } });
  await store.refresh(true);
  assert.equal(
    JSON.parse(store.getItem('chamados')).length,
    0,
    'Registros ausentes do escopo autorizado não são preservados.',
  );
  let pollRequests = 0;
  api.request = async () => {
    pollRequests++;
    return { chamados: { loaded: [], cursor: null } };
  };
  context.navigator = { onLine: false };
  await poll();
  assert.equal(pollRequests, 0);
  context.navigator.onLine = true;
  context.document.hidden = true;
  await poll();
  assert.equal(pollRequests, 0);
  context.document.hidden = false;
  await poll();
  assert.ok(pollRequests > 0);
});
