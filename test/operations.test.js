const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateChanges, fileBuffer, storeAttachments } = require('../server/operations');
test('recusa do card exige motivo e não aceita texto vazio ou excessivo',()=>{
 const changes=motivoRecusa=>[{collection:'ordensServico',id:'123',version:0,data:{hotel:'Unlimited',status:'Recusada',motivoRecusa}}];
 for(const reason of [undefined,'','  ', 'x'.repeat(2001)])assert.throws(()=>validateChanges(changes(reason),{funcao:'adm',mestre:true}),/motivo/);
 assert.doesNotThrow(()=>validateChanges(changes('Serviço recusado pelo responsável'),{funcao:'adm',mestre:true}));
});

test('validação da API não permite coleção privada, lote duplicado ou versão inválida', () => {
  const change = {collection:'chamados',id:'123',version:0,data:{hotel:'Unlimited'}};
  assert.equal(validateChanges([change],{funcao:'cliente'}).length,1);
  assert.throws(()=>validateChanges([change,change],{funcao:'adm'}),/duplicado/);
  assert.throws(()=>validateChanges([{...change,collection:'estoqueBookSantos'}],{funcao:'cliente'}),/Acesso/);
  assert.throws(()=>validateChanges([{...change,version:-1}],{funcao:'adm'}),/inválida/);
});

test('anexos têm limite e assinatura; texto não pode virar HTML executável', async () => {
  assert.throws(()=>fileBuffer('data:image/svg+xml;base64,PHN2Zz4='),/Formato/);
  assert.throws(()=>fileBuffer('data:image/png;base64,PHNjcmlwdD4='),/conteúdo/);
  const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64');
  const uploads=[];
  const records=await storeAttachments([{data:{hotel:'Unlimited',anexoData:png}}],{id:'user'},async(...args)=>uploads.push(args));
  assert.equal(uploads.length,1);
  assert.match(records[0].data.anexoData,/^\/api\/files\/user\/Unlimited\//);
  await assert.rejects(storeAttachments([{data:{hotel:'Unlimited',anexoData:'javascript:alert(1)'}}],{id:'user'},async()=>{}),/externos/);
});
