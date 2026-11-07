// Local only: synthetic accounts/data. Never sends load to the deployed site.
const {once}=require('node:events');
const {performance}=require('node:perf_hooks');
const {createSupabaseApp}=require('../server/supabase-app');
async function run(){
 const profile={id:'11111111-1111-4111-8111-111111111111',nome:'Teste',login:'load@example.invalid',funcao:'adm',mestre:false,tabs:['vistorias']};
 const provider={login:async()=>({access_token:'synthetic'}),profile:async()=>profile,access:async()=>[{hotel:'Teste'}],inspectionCoverage:async()=>({rows:Array.from({length:128},(_,i)=>({hotel:'Teste',apartment:String(i+1),status:'current'})),counts:{total:128,current:128,missing:0,overdue:0}})};
 const server=createSupabaseApp(provider);server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:profile.login,senha:'synthetic'})});
  if(!login.ok)throw Error('Falha no login simulado');
  const headers={Cookie:login.headers.get('set-cookie').split(';')[0]},times=[];let failures=0;
  await Promise.all(Array.from({length:10},async()=>{for(let i=0;i<20;i++){const start=performance.now();const r=await fetch(base+'/api/inspections/coverage',{headers});const data=await r.json();times.push(performance.now()-start);if(!r.ok||data.rows?.length!==128)failures++;}}));
  times.sort((a,b)=>a-b);console.log(JSON.stringify({environment:'local, synthetic provider, one session',concurrency:10,requests:times.length,failures,p50ms:Math.round(times[Math.ceil(times.length*.5)-1]),p95ms:Math.round(times[Math.ceil(times.length*.95)-1]),maxMs:Math.round(times.at(-1)),productionCapacityVerified:false}));
  if(failures)process.exitCode=1;
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)run().catch(()=>{console.error('Falha na verificacao local de carga.');process.exitCode=1;});
module.exports={run};
