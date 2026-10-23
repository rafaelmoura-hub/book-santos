const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const catalog = require('../assets/catalog');

test('cards: mudar condomínio preenche apartamentos e remove a seleção anterior', () => {
  const fields = new Map();
  const get = id => {
    if (!fields.has(id)) fields.set(id, {value:'',style:{},disabled:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},set innerHTML(value){this.html=value;this.value='';},get innerHTML(){return this.html;}});
    return fields.get(id);
  };
  get('formOS').reset=()=>{for(const field of fields.values())field.value='';};
  const context = {document:{getElementById:get},apartamentos:h=>catalog.apartments[h]||[],escapar:String,fecharModal(){},chamados:()=>[{id:101,hotel:'Be Urban',apartamento:'214'}],usuariosQueFinalizam:()=>[]};
  const source=readFileSync('adm/admin.js','utf8');
  vm.runInNewContext(source.slice(source.indexOf('function preencherApartamentos()'),source.indexOf('async function salvarOS(')),context);
  context.abrirFormularioOS();
  assert.equal(get('osApartamento').disabled,true);
  assert.equal(typeof get('osHotel').listeners.change,'function');
  for(const hotel of catalog.hotels){
    get('osApartamento').value='antigo';get('osHotel').value=hotel;get('osHotel').listeners.change();
    const options=[...get('osApartamento').innerHTML.matchAll(/<option value="([^"]+)">/g)].map(m=>m[1]);
    assert.deepEqual(options,catalog.apartments[hotel]);
    assert.equal(get('osApartamento').value,'');assert.equal(get('osApartamento').disabled,false);
  }
  context.abrirFormularioOS(101);
  assert.equal(get('osHotel').value,'Be Urban');assert.equal(get('osApartamento').value,'214');
  context.abrirFormularioOS('','Lume Alto da Boa Vista','194A');
  assert.equal(get('osApartamento').value,'194A');
  get('osHotel').value='Sem cadastro';get('osHotel').listeners.change();
  assert.equal(get('osApartamento').disabled,true);
  assert.match(get('osApartamento').innerHTML,/Nenhum apartamento cadastrado/);
});

test('chat: selecionar chamado não grava conversa vazia antes do primeiro envio', async () => {
  const source=readFileSync('cliente/cliente.js','utf8');
  let renders=0;
  const context={renderizarConversaCliente:async()=>{renders++;}};
  vm.runInNewContext(source.slice(source.indexOf('async function selecionarConversaCliente()'),source.indexOf('async function renderizarConversaCliente()')),context);
  await context.selecionarConversaCliente();
  assert.equal(renders,1);
});
