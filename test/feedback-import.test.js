const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepareFeedback,localDate,stagingBatch,MAX_BATCH_BYTES}=require('../scripts/prepare-feedback-import');
const {PGlite}=require('@electric-sql/pglite');
const sample=()=>({sha256:'b'.repeat(64),sourceFile:'avaliações.xlsx',rows:[{sourceRow:2,'Título':'1001 UQ','Fase atual':'Concluído','Etiquetas':'Alta, Baixa','Criado em':'45310.20419744213','Descrição do feedback':'Texto "original"\n<script>','Resposta Ao Cliente':'Resposta original','Responsáveis':'Pessoa original'}]});
test('feedback importado preserva dados e não inventa grau, usuário ou condomínio',()=>{
 const p=prepareFeedback(sample()),r=p.rows[0];assert.equal(r.data.hotel,'Unique Residence');assert.equal(r.data.apartamento,'1001');assert.equal(r.data.grau,'A conferir');assert.equal(r.response,'Resposta original');assert.equal(r.data.importacao.original['Responsáveis'],'Pessoa original');assert.equal(r.data.importacao.fusoFonte,'Não informado');assert.equal(r.data.anexos.length,0);assert.equal(p.rows[0].id,prepareFeedback(sample()).rows[0].id);assert.ok(p.sql.length<10000);assert.ok(!p.sql.includes('<script>'));assert.equal(localDate('2023-10-21'),'2023-10-21T00:00:00');
 const s=sample();s.rows[0]['Título']='1504 Gonzaga';assert.equal(prepareFeedback(s).rows[0].data.hotel,'Condomínio a conferir');
});
test('feedback recusa fase, data e linha duplicada inválidas',()=>{
 const s=sample();s.rows.push({...s.rows[0]});assert.throws(()=>prepareFeedback(s));s.rows.pop();s.rows[0]['Fase atual']='Outro';assert.throws(()=>prepareFeedback(s));assert.throws(()=>localDate('não é data'));
});
test('lotes SQL respeitam tamanho em bytes e preservam todas as linhas',()=>{
 const s=sample();s.rows=Array.from({length:350},(_,i)=>({...s.rows[0],sourceRow:i+2,'Descrição do feedback':"Ação '\n".repeat(200)}));
 const p=prepareFeedback(s);assert.ok(p.batches.length>1);
 for(const sql of p.batches)assert.ok(Buffer.byteLength(sql,'utf8')<=MAX_BATCH_BYTES);
 const lines=p.batches.flatMap(sql=>[...sql.matchAll(/'b{64}',(\d+),'/g)].map(m=>Number(m[1])));
 assert.deepEqual(lines,s.rows.map(r=>r.sourceRow));
});
test('lotes podem ser repetidos, preservam carga anterior e rejeitam conflito atomicamente',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("create role anon;create role authenticated;create function public.book_is_master() returns boolean language sql as $$ select false $$;");
 const s=sample();s.rows.push({...s.rows[0],sourceRow:3});const p=prepareFeedback(s);
 await db.exec(p.setup);
 await db.exec(p.batches[0]);await db.exec(p.batches[0]);
 assert.equal((await db.query('select count(*) n from public.book_history_import_stage')).rows[0].n,2);
 assert.deepEqual((await db.query('select payload::jsonb value from public.book_history_import_stage where source_line=2')).rows[0].value,p.rows[0]);
 await db.exec("delete from public.book_history_import_stage where source_line=3;update public.book_history_import_stage set payload=jsonb_set(payload::jsonb,'{response}','\"Outro texto\"')::text where source_line=2;");
 await assert.rejects(db.exec(p.batches[0]),/Carga divergente/);await db.exec('rollback');
 assert.equal((await db.query('select count(*) n from public.book_history_import_stage')).rows[0].n,1);
 await db.exec('set role authenticated');await assert.rejects(db.exec(stagingBatch(s.sha256,p.rows)),e=>e.code==='42501');await db.exec('rollback');
});
