const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { save, verify } = require('../adm/backup');
const { validateBackup, attachments } = require('../server/backup');
const { createSupabaseApp } = require('../server/supabase-app');
const id = '11111111-1111-4111-8111-111111111111';
function directory() {
  const files = new Map(), folders = new Map();
  return { files, folders,
    async getFileHandle(name, options={}) {
      if(!options.create && !files.has(name))throw Error('Arquivo ausente');
      return { async createWritable(){return {async write(bytes){files.set(name,Buffer.from(bytes));},async close(){},async abort(){}};},async getFile(){return new Blob([files.get(name)]);} };
    },
    async getDirectoryHandle(name, options={}) { if(!folders.has(name)){if(!options.create)throw Error('Pasta ausente');folders.set(name,directory());}return folders.get(name); }
  };
}
test('backup copia dados e anexos, verifica hashes e detecta alterações e interrupções', async () => {
  const source=`${id}/Be Urban/${id}`;
  const target=directory();
  const exported={format:'book-santos-backup',version:1,selected:['chamados','anexos'],data:{records:[{data:{hotel:'Be Urban',anexoData:`/api/files/${source}`}}]},files:[source]};
  const download=async()=>({bytes:Buffer.from('imagem de teste'),type:'image/jpeg'});
  const manifest=await save(target,exported,download);
  assert.equal(manifest.complete,true);assert.equal(manifest.files.length,2);
  await verify(target);
  target.folders.get('anexos').files.set(manifest.files[1].name.split('/')[1],Buffer.from('alterado'));
  await assert.rejects(verify(target),/alterado ou incompleto/);
  const partial=directory();
  await assert.rejects(save(partial,exported,async()=>{throw Error('HD desconectado');}),/HD desconectado/);
  assert.equal(JSON.parse(partial.files.get('manifesto.json')).complete,false);
  await assert.rejects(verify(partial),/incompleto/);
  const stopped=directory(), controller=new AbortController();
  await assert.rejects(save(stopped,exported,async()=>{controller.abort();return download();},{signal:controller.signal}),error=>error.name==='AbortError');
  assert.equal(JSON.parse(stopped.files.get('manifesto.json')).complete,false);
  const unsafe=directory();
  await save(unsafe,{...exported,files:[]},download);
  const altered=JSON.parse(unsafe.files.get('manifesto.json'));altered.files.push({name:'../fora'});
  unsafe.files.set('manifesto.json',Buffer.from(JSON.stringify(altered)));
  await assert.rejects(verify(unsafe),/Caminho inválido/);
});
test('opções de backup são limitadas e referências de arquivos são deduplicadas', () => {
  assert.throws(()=>validateBackup({selected:['anexos']}));
  assert.throws(()=>validateBackup({selected:['senhas']}));
  assert.throws(()=>validateBackup({selected:['chamados','chamados']}));
  const link=`/api/files/${id}/Be Urban/${id}`;
  assert.deepEqual(attachments({a:link,b:[link,'/api/files/../../.env']}),[link.slice(11)]);
});
test('backup e catálogo: bloqueio sem sessão, por função e por opções', async t => {
  let role='cliente', master=false, backups=0;
  const provider={async login(){return {access_token:'token'};},async profile(){return {id,funcao:role,mestre:master};},async access(){return [{hotel:'Be Urban'}];},async backup(token,selected){backups++;return {records:Array.from({length:125},(_,i)=>({id:String(i),data:{anexoData:`/api/files/${id}/Be Urban/${id}`}}))};}};
  const server=createSupabaseApp(provider);server.listen(0,'127.0.0.1');await once(server,'listening');
  provider.apartments=async()=>[{hotel:'Be Urban',apartment:'214'}];
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'test@example.com',senha:'senha'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const request=(selected,session=cookie)=>fetch(base+'/api/backup',{method:'POST',headers:{'Content-Type':'application/json',Cookie:session},body:JSON.stringify({selected})});
  assert.equal((await fetch(base+'/assets/catalog.js',{redirect:'manual'})).status,302);
  const catalog=await fetch(base+'/assets/catalog.js',{headers:{Cookie:cookie}});
  const text=await catalog.text();assert.ok(text.includes('Be Urban'));assert.ok(!text.includes('Lume Alto'));
  assert.match(catalog.headers.get('content-security-policy'),/script-src-attr 'none'/);
  assert.equal((await request(['chamados'],'')).status,401);
  assert.equal((await request(['chamados'])).status,403);
  role='adm';assert.equal((await request(['chamados'])).status,403);
  master=true;assert.equal((await request(['senhas'])).status,400);
  const result=await (await request(['chamados','anexos'])).json();assert.equal(result.data.records.length,125);assert.equal(result.files.length,1);
  const noPhotos=await (await request(['chamados'])).json();assert.deepEqual(noPhotos.files,[]);
  assert.equal((await request(['chamados'])).status,429);assert.equal(backups,2);
  provider.records=async(token,collection)=>({rows:[{id:'1',data:{hotel:'Be Urban'}}],next:null});
  provider.counts=async()=>({chamados:999,abertos:900,fechados:99,ordensServico:200});
  const snapshot=await (await fetch(base+'/api/snapshot?collections='+encodeURIComponent(JSON.stringify(['chamados'])),{headers:{Cookie:cookie}})).json();
  assert.deepEqual(Object.keys(snapshot).sort(),['__counts','chamados']);assert.equal(snapshot.__counts.chamados,999);
  role='cliente';master=false;
  assert.equal((await fetch(base+'/api/snapshot?collections='+encodeURIComponent(JSON.stringify(['vistorias'])),{headers:{Cookie:cookie}})).status,400);
});
