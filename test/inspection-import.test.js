const {test}=require('node:test');
const assert=require('node:assert/strict');
const {excelDate,prepare}=require('../scripts/prepare-inspection-import');
const source=()=>({sha256:'a'.repeat(64),sourceFile:'Controle teste.xlsx',date1904:false,sheets:[{name:'VISTORIAS',rows:[{line:1,values:{}},{line:2,values:{A:'101.0',B:'Unlimited   ',C:'46000',G:'46090',E:'46001',F:'Completa',D:"O'Connor"}}]},{name:'GOV UNIQUE',rows:[{line:1,values:{}},{line:2,values:{A:'101.0',B:'Unlimited',C:'46000',G:'46045',F:'Simplificada'}}]}]});
test('planilha de vistorias preserva datas explicitas e separa governanca de 45 dias',()=>{
 const result=prepare(source());assert.equal(result.rows.length,2);assert.equal(result.rows[0].apartment,'101');assert.equal(result.rows[0].hotel,'Unlimited');assert.equal(result.rows[0].interval_days,90);assert.equal(result.rows[1].interval_days,45);assert.equal(result.rows[1].track,'governance');assert.equal(result.rows[0].next_date,excelDate(46090));assert.equal(result.rows[0].responsible,"O'Connor");assert.ok(result.sql.includes("O''Connor"));assert.ok(!result.sql.includes('insert into public.book_records'));
 assert.equal(excelDate(1,true),'1904-01-02');assert.equal(excelDate(25569),'1970-01-01');
 const duplicate=source();duplicate.sheets[0].rows.push({...duplicate.sheets[0].rows[1],line:3});assert.throws(()=>prepare(duplicate),/duplicado/);
 const invalid=source();invalid.sheets[0].rows[1].values.G='45999';assert.throws(()=>prepare(invalid),/invertidas/);
});
