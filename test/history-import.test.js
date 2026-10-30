const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare}=require('../scripts/prepare-history-import');
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
