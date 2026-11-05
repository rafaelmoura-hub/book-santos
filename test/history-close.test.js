const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('historico: encerra somente a planilha completa, preserva recusas, fonte e backup; repetir nao altera versoes',{skip:!fs.existsSync('artifacts/pipefy-import-12598/05-ENCERRAR-HISTORICO.sql')},async()=>{
 const db=new PGlite();await db.waitReady;
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table public.book_profiles(id uuid primary key,mestre boolean);insert into public.book_profiles values('11111111-1111-4111-8111-111111111111',true);
 create table public.book_records(collection text,id text,data jsonb,version bigint default 1,updated_at timestamptz default now(),primary key(collection,id));
 create table public.book_flow_meta(source text,record_id text,phase text,data jsonb,version bigint default 1,updated_at timestamptz default now(),primary key(source,record_id));
 create table public.book_audit(actor_id uuid,collection text,record_id text,old_data jsonb,new_data jsonb);
 insert into public.book_records(collection,id,data) select 'ordensServico',n::text,jsonb_build_object('titulo','Original','status',case when n<=451 then 'Recusada' when n<=648 then 'Em andamento' else 'Finalizada' end,'importacao',jsonb_build_object('hash','601ec831b323ce8e2d09b6f1450ef278972d853f94209cc7a42a642efe46690c','faseOriginal',case when n<=451 then 'Cancelado' when n<=648 then 'Novo' else 'Resolvido' end)) from generate_series(1,12598) n;
 insert into public.book_records(collection,id,data) values('ordensServico','externo','{"status":"Aberta","titulo":"Nao alterar"}');`);
 await db.exec(`create function public.book_validate_record() returns trigger language plpgsql as $validation$begin raise sqlstate '22023' using message='Apartamento não cadastrado neste hotel.';end$validation$;create trigger book_validate_record before insert or update on public.book_records for each row execute function public.book_validate_record();`);
 await assert.rejects(db.exec("update book_records set data=data||'{\"status\":\"Finalizada\"}' where id='452'"),e=>e.code==='22023');
 const sql=fs.readFileSync('artifacts/pipefy-import-12598/05-ENCERRAR-HISTORICO.sql','utf8');await db.exec(sql);
 assert.equal((await db.query("select tgenabled from pg_trigger where tgname='book_validate_record'")).rows[0].tgenabled,'O');
 await assert.rejects(db.exec("update book_records set version=version+1 where id='externo'"),e=>e.code==='22023');
 assert.deepEqual((await db.query("select data->>'status' status,count(*)::integer n from book_records where id<>'externo' group by 1 order by 1")).rows,[{status:'Finalizada',n:12147},{status:'Recusada',n:451}]);
 assert.equal((await db.query("select data->>'status' status from book_records where id='externo'")).rows[0].status,'Aberta');
 assert.equal((await db.query('select count(*)::integer n from book_audit')).rows[0].n,197);
 assert.equal((await db.query('select count(*)::integer n from book_history_state_backups')).rows[0].n,12598);
 assert.equal((await db.query("select count(*)::integer n from book_audit where (old_data-'status') is distinct from (new_data-'status')")).rows[0].n,0);
 const before=(await db.query('select sum(version)::integer n from book_records')).rows[0].n;await db.exec(sql);assert.equal((await db.query('select sum(version)::integer n from book_records')).rows[0].n,before);assert.equal((await db.query('select count(*)::integer n from book_audit')).rows[0].n,197);
 await db.exec("delete from book_records where id='1'");await assert.rejects(db.exec(sql),/Carga incompleta/);await db.exec('rollback');assert.equal((await db.query('select count(*)::integer n from book_audit')).rows[0].n,197);
 }finally{await db.close();}
});
