const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepareFeedback,localDate}=require('../scripts/prepare-feedback-import');
const sample=()=>({sha256:'b'.repeat(64),sourceFile:'avaliações.xlsx',rows:[{sourceRow:2,'Título':'1001 UQ','Fase atual':'Concluído','Etiquetas':'Alta, Baixa','Criado em':'45310.20419744213','Descrição do feedback':'Texto "original"\n<script>','Resposta Ao Cliente':'Resposta original','Responsáveis':'Pessoa original'}]});
test('feedback importado preserva dados e não inventa grau, usuário ou condomínio',()=>{
 const p=prepareFeedback(sample()),r=p.rows[0];assert.equal(r.data.hotel,'Unique Residence');assert.equal(r.data.apartamento,'1001');assert.equal(r.data.grau,'A conferir');assert.equal(r.response,'Resposta original');assert.equal(r.data.importacao.original['Responsáveis'],'Pessoa original');assert.equal(r.data.importacao.fusoFonte,'Não informado');assert.equal(r.data.anexos.length,0);assert.equal(p.rows[0].id,prepareFeedback(sample()).rows[0].id);assert.ok(p.sql.length<10000);assert.ok(!p.sql.includes('<script>'));assert.equal(localDate('2023-10-21'),'2023-10-21T00:00:00');
 const s=sample();s.rows[0]['Título']='1504 Gonzaga';assert.equal(prepareFeedback(s).rows[0].data.hotel,'Condomínio a conferir');
});
test('feedback recusa fase, data e linha duplicada inválidas',()=>{
 const s=sample();s.rows.push({...s.rows[0]});assert.throws(()=>prepareFeedback(s));s.rows.pop();s.rows[0]['Fase atual']='Outro';assert.throws(()=>prepareFeedback(s));assert.throws(()=>localDate('não é data'));
});
