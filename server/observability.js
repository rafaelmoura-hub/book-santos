const {performance}=require('node:perf_hooks');
function createObservability({clock=Date.now,logger=console}={}){
 const routes=new Map(),started=clock(),pending=new Map();let sharedReads=0;
 const safeRoute=raw=>{const path=raw.split('?')[0];if(path.startsWith('/api/files/'))return '/api/files/:file';if(path.length>100||!/^[\w/.-]+$/.test(path))return '/other';return path;};
 function track(req,res){const start=performance.now(),route=safeRoute(req.url);res.once('finish',()=>{const ms=performance.now()-start,key=req.method+' '+route,row=routes.get(key)||{requests:0,errors:0,slow:0,totalMs:0,maxMs:0};row.requests++;row.errors+=Number(res.statusCode>=500);row.slow+=Number(ms>=1500);row.totalMs+=ms;row.maxMs=Math.max(row.maxMs,ms);if(routes.size<200||routes.has(key))routes.set(key,row);if(ms>=1500)logger.warn(JSON.stringify({event:'slow_request',route,status:res.statusCode,duration_ms:Math.round(ms)}));});}
 function read(key,fn){if(pending.has(key)){sharedReads++;return pending.get(key);}if(pending.size>=500)return Promise.resolve().then(fn);const promise=Promise.resolve().then(fn).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});pending.set(key,promise);return promise;}
 function snapshot(){return {uptimeSeconds:Math.floor((clock()-started)/1000),memoryMB:Math.round(process.memoryUsage().rss/1048576),sharedReads,routes:[...routes].map(([route,v])=>({route,requests:v.requests,errors:v.errors,slow:v.slow,averageMs:Math.round(v.totalMs/v.requests),maxMs:Math.round(v.maxMs)})).sort((a,b)=>b.maxMs-a.maxMs).slice(0,30)};}
 return {track,read,snapshot};
}
module.exports={createObservability};
