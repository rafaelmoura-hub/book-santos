const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');

test('tela aguarda confirmação e preserva versão lida para impedir sobrescrita', async () => {
  class Element {
    constructor() { this.style={}; this.children=[]; this.tagName='DIV'; }
    appendChild(child) { this.children.push(child); }
    prepend(...children) { this.children.unshift(...children); }
    setAttribute() {} removeAttribute() {} remove() {}
  }
  const local = new Map([['chamados','[{"id":"antigo"}]']]);
  const events = new EventTarget();
  let rows=[{id:'100',version:1,owner_id:'owner',data:{id:100,hotel:'Unlimited',assunto:'Original'}}];
  let held, requestStarted, release;
  const api={async request(url,options) {
    if(url==='/api/access') return ['Unlimited'];
    if(url==='/api/apartments') return [{hotel:'Unlimited',apartment:'1111'}];
    if(url.startsWith('/api/snapshot')) return JSON.parse(JSON.stringify({chamados:{loaded:rows,cursor:null}}));
    const {changes}=JSON.parse(options.body);
    if(requestStarted) requestStarted();
    if(held) await new Promise(resolve=>{release=resolve;});
    for(const change of changes) {
      const old=rows.find(row=>row.id===change.id);
      if((old?.version||0)!==change.version) throw Object.assign(new Error('Conflito'),{status:409});
      rows=[{id:change.id,version:change.version+1,owner_id:'owner',data:change.data}];
    }
    return {ok:true};
  }};
  const context={
    document:{body:new Element(),createElement:()=>new Element(),querySelector:()=>null,querySelectorAll:()=>[],activeElement:{tagName:'DIV'},hidden:false},
    localStorage:{getItem:key=>local.get(key)||null},BookAPI:api,crypto:webcrypto,Event,Blob,URL,console,
    setInterval:()=>{},setTimeout:()=>{},alert:()=>{},
    dispatchEvent:events.dispatchEvent.bind(events),addEventListener:events.addEventListener.bind(events)
  };
  context.window=context;
  vm.runInNewContext(readFileSync('assets/store.js','utf8'),context);
  const store=context.BookStore;
  await store.init({id:'owner',funcao:'cliente'});
  const initial=JSON.parse(store.getItem('chamados'));
  assert.equal(initial[0].__bookVersion,1);
  initial[0].assunto='Editado';
  held=true;
  const started=new Promise(resolve=>{requestStarted=resolve;});
  const pending=store.setItem('chamados',JSON.stringify(initial));
  await started;
  assert.equal(JSON.parse(store.getItem('chamados'))[0].assunto,'Original');
  release(); await pending; held=false; requestStarted=null;
  assert.equal(JSON.parse(store.getItem('chamados'))[0].assunto,'Editado');
  const stale=JSON.parse(store.getItem('chamados'));
  rows[0]={...rows[0],version:3,data:{...rows[0].data,assunto:'Outro funcionário'}};
  await store.refresh(true);
  stale[0].assunto='Tentativa antiga';
  await assert.rejects(store.setItem('chamados',JSON.stringify(stale)),/Conflito/);
  assert.equal(rows[0].data.assunto,'Outro funcionário');
  assert.equal(local.get('chamados'),'[{"id":"antigo"}]');
});
