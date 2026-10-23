const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
test('ações delegadas preservam argumentos e recusam código fora da lista permitida', async () => {
  const listeners={},calls=[],errors=[];
  const context={document:{addEventListener:(type,fn)=>listeners[type]=fn,getElementById:()=>({value:'123'})},console:{error:e=>errors.push(e.message)}};
  context.window={mostrarAba:value=>calls.push(value),BookUsers:{save:()=>calls.push('salvo')}};
  vm.runInNewContext(readFileSync('assets/events.js','utf8'),context);
  async function dispatch(type,action,extra={}) {
    const element={value:'214',getAttribute:()=>action};
    const event={target:{closest:()=>element},preventDefault(){calls.push('prevented');},...extra};
    listeners[type](event);await new Promise(resolve=>setImmediate(resolve));
  }
  await dispatch('click',"mostrarAba('backup')");assert.equal(calls.at(-1),'backup');
  await dispatch('submit','BookUsers.save(event)');assert.deepEqual(calls.slice(-2),['prevented','salvo']);
  await dispatch('click',"mostrarAba('texto;com vírgula, e parênteses()')");assert.equal(calls.at(-1),'texto;com vírgula, e parênteses()');
  const before=calls.length;
  await dispatch('click',"BookAPI.request('/api/backup')");
  await dispatch('click',"constructor.constructor('alert(1)')()");
  await dispatch('click',"mostrarAba('backup');window.location='fora'");
  assert.equal(errors.length,3);assert.equal(calls.length,before+1);
  assert.ok(!/\beval\s*\(|new Function\s*\(/.test(readFileSync('assets/events.js','utf8')));
});
