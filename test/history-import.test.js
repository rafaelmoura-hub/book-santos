const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare,locationFromTitle}=require('../scripts/prepare-history-import');
const report=()=>({sha256:'a'.repeat(64),sourceFile:'relatório.xlsx',rows:[{sourceRow:2,title:"Título '; select 1; --",phase:'Novo',creator:'Equipe',createdLocal:'2024-06-15T10:20:00',createdOriginal:'45458.4'}]});
test('importação preserva a fonte sem inventar imóvel, prazos, custos ou IDs de usuários',()=>{
 const r=prepare(report());assert.equal(r.cards[0].status,'Aberta');assert.equal(r.cards[0].importacao.parcial,true);assert.equal(r.cards[0].importacao.fusoFonte,'Não informado');
 for(const k of ['vencimento','fechamento','responsavelLogin','prioridade','criadaPorLogin'])assert.equal(r.cards[0][k],undefined);
 assert.equal(r.cards[0].titulo,report().rows[0].title);assert.ok(Number.isSafeInteger(Number(r.cards[0].id)));assert.ok(r.sql.includes("Título ''; select 1; --"));assert.ok(!r.sql.includes('__PAYLOAD__'));assert.ok(!r.sql.includes('__REPORT_FUNCTIONS__'));
});
test('importação recusa fases desconhecidas, linhas duplicadas e arquivos sem identificação',()=>{
 let d=report();d.rows[0].phase='Inventada';assert.throws(()=>prepare(d),/Linha inválida/);
 d=report();d.rows.push({...d.rows[0]});assert.throws(()=>prepare(d),/Linha inválida/);
 d=report();d.sha256='';assert.throws(()=>prepare(d),/inválido/);
});
test('número inicial identifica apartamento e somente a sigla UQ confirma Unique Residence',()=>{
 for(const title of ['1001 UQ - Reparo','1001UQ: Reparo','UQ 1001 - Reparo','apto. 1001 uq - Reparo'])assert.deepEqual(locationFromTitle(title),{hotel:'Unique Residence',apartment:'1001',code:'UQ'});
 assert.deepEqual(locationFromTitle('194A - Reparo'),{hotel:null,apartment:'194A',code:null});
 assert.deepEqual(locationFromTitle('904 E - Reparo'),{hotel:null,apartment:'904',code:null});
 assert.deepEqual(locationFromTitle('904 U - Reparo'),{hotel:null,apartment:'904',code:null});
 assert.equal(locationFromTitle('Trocar 2 lâmpadas').apartment,null);
 assert.equal(locationFromTitle('Comprar buquê').hotel,null);
 assert.equal(locationFromTitle('20261030 - Reparo').apartment,null);
});
