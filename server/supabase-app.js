const {createObservability}=require('./observability');
const {createAuthSecurity}=require('./auth-security');
const { hotels, filePath } = require('../assets/catalog');
const http = require('node:http');
const path = require('node:path');
const { asset, acceptsGzip } = require('./static-assets');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { COLLECTIONS, validId, validateChanges, storeAttachments } = require('./operations');
const { validateUser } = require('./users');
const Periods = require('../assets/periods');
const { validateBackup, attachments } = require('./backup');
const { sessionStore } = require('./session-store');
const { canTab, canCollection } = require('./permissions');
const { uuid, validateWorkspace } = require('./workspace');
const { generateAI } = require('./ai');
const { createAgent } = require('./ai-agent');
const { boundedBytes,requireJSON,validateProfile } = require('./security');
const {validateCollaboration}=require('./collaboration');
const {validateProcess,validateFlow}=require('./processes');
const {definitions:processDefinitions,flowPhases}=require('../assets/processes');
const { renderLegal, legalConfig } = require('./legal');
const {validateCatalog,visibleHotels}=require('./catalog-management');
const ROOT = path.resolve(__dirname, '..');
const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = token => createHash('sha256').update(token).digest('hex');

async function readBody(req, limit = 15 * 1024 * 1024) {
  const declared=req.headers['content-length'];
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw fail(413,'Requisição acima do tamanho permitido.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Requisição acima do tamanho permitido.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'JSON inválido.'); }
}

function createSupabaseApp(provider, { secure = false, publicOrigin, clock = Date.now, sessionKey, sessionFile, aiGenerate = generateAI, requireAdminMfa=false, recoveryEnabled=false, maxSessions = 5000, sessionsPerUser = 5 } = {}) {
  if(!Number.isSafeInteger(maxSessions)||maxSessions<1||!Number.isSafeInteger(sessionsPerUser)||sessionsPerUser<1)throw new Error('Limites de sessão inválidos.');
  // Tokens stay on the server; optional encrypted storage preserves a single instance's sessions.
  const sessions = sessionStore({ key: sessionKey, filename: sessionFile, clock });
  const authSecurity=createAuthSecurity({provider,sessions,clock,requireAdminMfa,recoveryEnabled,maxSessions,sessionsPerUser});
  const attempts = new Map();
  const writes = new Map();
  const metrics=createObservability({clock});
  const agent = createAgent({clock});
  const inFlight=new Map();let readyCheck,readyUntil=0,releaseCheck,releaseUntil=0;
  const cookieName=secure?'__Host-book_session':'book_session';
  const server=http.createServer({maxHeaderSize:16384,requestTimeout:60000,headersTimeout:15000,keepAliveTimeout:5000},async (req, res) => {
    metrics.track(req,res);
    const now = clock();
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.on('finish', () => {
      if (res.statusCode >= 500) console.error(JSON.stringify({ event: 'http_error', requestId, status: res.statusCode, duration_ms: clock() - now }));
    });
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    for (const [key, value] of writes) if (value.until <= now) writes.delete(key);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies','none');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    const cookie = (token, age) => res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`);
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if ((route === '/legal' || route.startsWith('/legal/')) && ['GET','HEAD'].includes(req.method)) {
        const html=renderLegal(route === '/legal' ? 'privacidade' : route.slice(7), legalConfig());
        if(!html)throw fail(404,'Documento não encontrado.');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(req.method==='HEAD'?undefined:html);
      }
      if (route === '/health' && req.method === 'GET') return json(200, { status: 'ok', version:'20261107-ready8' });
      if (route === '/ready/release' && req.method === 'GET') {
        if(clock()>=releaseUntil){
          if(!releaseCheck)releaseCheck=Promise.resolve().then(()=>provider.ready({release:true})).then(()=>{releaseUntil=clock()+10000;}).finally(()=>{releaseCheck=null;});
          await releaseCheck;
        }
        return json(200,{status:'ok',scope:'release',release:29});
      }
      if (route === '/ready' && req.method === 'GET') {
        if(clock()>=readyUntil){
          if(!readyCheck)readyCheck=Promise.resolve().then(()=>provider.ready()).then(()=>{readyUntil=clock()+10000;}).finally(()=>{readyCheck=null;});
          await readyCheck;
        }
        return json(200, { status: 'ok', scope:'connectivity' });
      }
      if (!['GET', 'HEAD'].includes(req.method) && (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && req.headers.origin !== (publicOrigin || `${secure ? 'https' : 'http'}://${req.headers.host}`))) throw fail(403, 'Origem não permitida.');
      if(route.startsWith('/api/')&&!['GET','HEAD'].includes(req.method))requireJSON(req);
      const token = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`).exec(req.headers.cookie || '')?.[1];
      const sessionId = token ? digest(token) : null;
      const session = sessions.get(sessionId);
      if(route.startsWith('/api/auth/')){await authSecurity.handle({route,req,session,sessionId,readBody,cookie,json});return;}
      if (route === '/api/login' && req.method === 'POST') {
        // Socket limit is deliberately generous for a shared reverse proxy.
        // Account counters cannot be bypassed by spoofing forwarded headers.
        const ip = `ip:${req.socket.remoteAddress}`;
        const traffic = attempts.get(ip) || { count: 0, until: now + 60000 };
        if (traffic.count >= 300) throw fail(429, 'Muitas tentativas. Aguarde um minuto.');
        traffic.count++; attempts.set(ip, traffic);
        const input = await readBody(req, 16384);
        if (typeof input?.login !== 'string' || input.login.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.login.trim()) || typeof input.senha !== 'string' || !input.senha || input.senha.length > 100) throw fail(400, 'Informe seu e-mail e senha.');
        const account = digest(input.login.trim().toLowerCase());
        const attempt = attempts.get(account) || { count: 0, until: now + 900000 };
        if (attempt.count >= 10) throw fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
        attempt.count++; attempts.set(account, attempt);
        const auth = await provider.login(input.login.trim().toLowerCase(), input.senha);
        let user;
        try { user = validateProfile(await provider.profile(auth.access_token)); }
        catch (error) { await provider.logout(auth.access_token).catch(() => {}); throw error; }
        const challenge=await authSecurity.login(auth,user,cookie,sessionId);if(challenge)return json(200,challenge);
        const freshToken = randomBytes(32).toString('hex');
        const lifetime = 8 * 3600;
        sessions.delete(sessionId);
        const previous=[...sessions].filter(([,value])=>value.userId===user.id).sort((a,b)=>a[1].expires-b[1].expires);
        while(previous.length>=sessionsPerUser)sessions.delete(previous.shift()[0]);
        if(sessions.size>=maxSessions){await provider.logout(auth.access_token).catch(()=>{});throw fail(503,'Capacidade de sessões atingida. Aguarde antes de entrar novamente.');}
        sessions.set(digest(freshToken), { issuedAt:now,userId: user.id, accessToken: auth.access_token, refreshToken: auth.refresh_token, authExpires: now + (Number(auth.expires_in) || 3600) * 1000, expires: now + lifetime * 1000 });
        attempts.delete(account);
        cookie(freshToken, lifetime);
        return json(200, { ...user, provider: 'supabase' });
      }
      if (route === '/api/logout' && req.method === 'POST') {
        sessions.delete(sessionId); cookie('', 0);
        if (session) await provider.logout(session.accessToken).catch(() => {});
        return json(200, { ok: true });
      }
      const protectedFile = /^\/(adm|hotel|cliente)\//.test(route) || route === '/assets/catalog.js';
      let user;
      if (route.startsWith('/api/') || protectedFile) {
        if (session&&!session.pendingMfa) {
          if(route.startsWith('/api/')){
            const count=inFlight.get(sessionId)||0;if(count>=12)throw fail(429,'Há muitas solicitações em andamento. Aguarde alguns segundos.');
            inFlight.set(sessionId,count+1);let released=false;
            const release=()=>{if(released)return;released=true;const next=(inFlight.get(sessionId)||1)-1;if(next)inFlight.set(sessionId,next);else inFlight.delete(sessionId);};
            res.once('finish',release);res.once('close',release);
          }
          try {
            if (session.refreshToken && session.authExpires < now + 30000) {
              if (!session.refreshing) session.refreshing = provider.refresh(session.refreshToken).then(auth => {
                session.accessToken = auth.access_token; session.refreshToken = auth.refresh_token;
                session.authExpires = clock() + (Number(auth.expires_in) || 3600) * 1000;
                sessions.persist?.();
              }).finally(() => { session.refreshing = null; });
              await session.refreshing;
            }
            user = validateProfile(await provider.profile(session.accessToken));
            if(user.mfaRequired||requireAdminMfa&&user.funcao==='adm'&&!session.mfaVerified)throw fail(401,'Confirme o c\u00f3digo do autenticador ao entrar novamente.');
            if(user.id!==session.userId||sessions.get(sessionId)!==session)throw fail(401,'A sessão mudou. Entre novamente para continuar.');
          }
          catch (error) {
            if ([401, 403].includes(error.status)) { sessions.delete(sessionId); cookie('', 0); }
            throw error;
          }
        }
        if (!user) {
          if (protectedFile) { res.writeHead(302, { Location: '/login.html' }); return res.end(); }
          throw fail(401, 'Entre novamente para continuar.');
        }
      }
      const read=(key,fn)=>metrics.read(sessionId+':'+key,fn);
      if(route==='/api/system/status'&&req.method==='GET'){if(!user.mestre||user.funcao!=='adm')throw fail(403,'Somente o mestre.');return json(200,metrics.snapshot());}
      if (route === '/api/session' && req.method === 'GET') return json(200, { ...user, provider: 'supabase' });
      if(route==='/api/decision/activity'&&req.method==='GET'){
        if(!canTab(user,'dashboard'))throw fail(403,'Sem acesso à visão geral.');
        let filters;try{filters=JSON.parse(url.searchParams.get('filters')||'{}');}catch{throw fail(400,'Filtros inválidos.');}
        if(!filters||Array.isArray(filters)||typeof filters!=='object'||Object.keys(filters).some(k=>!['start','end','group','hotel','urgency','assignees'].includes(k))||!Array.isArray(filters.assignees)||filters.assignees.length>100||filters.assignees.some(v=>typeof v!=='string'||v.length>200)||!['day','week','month','year'].includes(filters.group)||!['','Normal','Alta','Urgente'].includes(filters.urgency)||typeof filters.hotel!=='string'||filters.hotel.length>100)throw fail(400,'Filtros inválidos.');
        try{Periods.range('dia',filters.start);Periods.range('dia',filters.end);}catch{throw fail(400,'Datas inválidas.');}
        if(filters.start>filters.end||(Date.parse(filters.end)-Date.parse(filters.start))/86400000>7300)throw fail(400,'Selecione um período de até 20 anos.');
        if(filters.hotel&&!(await visibleHotels(provider,session.accessToken,user)).includes(filters.hotel))throw fail(403,'Sem acesso ao condomínio.');
        return json(200,await read('activity:'+JSON.stringify(filters),()=>provider.activity(session.accessToken,filters)));
      }
      if(['/api/labels','/api/card-labels'].includes(route)){
        if(user.funcao!=='adm'||!canTab(user,'os'))throw fail(403,'Sem acesso aos cards.');
        if(req.method==='GET'){
          if(route==='/api/labels')return json(200,await provider.labels(session.accessToken));
          const ids=(url.searchParams.get('ids')||'').split(',');
          if(ids.length>100||ids.some(id=>!/^\d{1,16}$/.test(id)))throw fail(400,'Cards inválidos.');
          return json(200,await provider.cardLabels(session.accessToken,ids));
        }
        if(req.method!=='POST')throw fail(405,'Método não permitido.');
        const key='labels:'+user.id,quota=writes.get(key)||{count:0,until:now+60000};
        if(quota.count>=40)throw fail(429,'Aguarde antes de salvar novamente.');quota.count++;writes.set(key,quota);
        const input=await readBody(req,8192);
        if(route==='/api/labels'){
          if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>40||!['teal','blue','purple','pink','orange','green','gray'].includes(input.color))throw fail(400,'Nome ou cor da etiqueta inválidos.');
          return json(200,await provider.labels(session.accessToken,{name:input.name.trim(),color:input.color}));
        }
        if(!input||typeof input.id!=='string'||!/^\d{1,16}$/.test(input.id)||!Number.isSafeInteger(input.version)||input.version<0||!Array.isArray(input.labelIds)||input.labelIds.length>10||new Set(input.labelIds).size!==input.labelIds.length||input.labelIds.some(id=>!uuid(id)))throw fail(400,'Etiquetas inválidas.');
        return json(200,await provider.assignLabels(session.accessToken,input));
      }
      if(route==='/api/cards/schedule'&&req.method==='POST'){
        if(!canTab(user,'os'))throw fail(403,'Sem acesso aos cards.');
        const key='schedule:'+user.id,quota=writes.get(key)||{count:0,until:now+60000};if(quota.count>=20)throw fail(429,'Aguarde antes de remarcar novamente.');quota.count++;writes.set(key,quota);
        const input=await readBody(req,8192);
        if(!input||typeof input.id!=='string'||!/^\d{1,16}$/.test(input.id)||!Number.isSafeInteger(input.version)||input.version<1||typeof input.comment!=='string'||input.comment.length>2000)throw fail(400,'Remarcação inválida.');
        try{Periods.range('dia',input.due);}catch{throw fail(400,'Data inválida.');}
        await provider.scheduleCard(session.accessToken,input);return json(200,{ok:true});
      }
      if(route==='/api/decision' && req.method==='GET'){
        if(!canTab(user,'dashboard'))throw fail(403,'Sem acesso à visão geral.');
        const hotel=url.searchParams.get('hotel');
        if(hotel && !(await visibleHotels(provider,session.accessToken,user)).includes(hotel))throw fail(403,'Sem acesso a este condomínio.');
        try{return json(200,await read('decision:'+hotel,()=>provider.decision(session.accessToken,hotel)));}
        catch(error){if(error.status===503)throw fail(503,'Painel SAD indisponível. Se ainda não aplicada, execute a migração 202610290015_decision.sql. As outras abas continuam disponíveis.');throw error;}
      }
      if(['/api/processes','/api/processes/services','/api/processes/flow','/api/processes/comment','/api/processes/service','/api/processes/receive'].includes(route)){
        if(user.funcao!=='adm')throw fail(403,'Somente administradores.');
        const validSource=(source,id)=>['process',...Object.keys(flowPhases)].includes(source)&&typeof id==='string'&&(['process','feedbacks'].includes(source)?uuid(id):/^\d{1,16}$/.test(id));
        const flowAllowed=(source,writing=false)=>source==='process'?Object.entries(processDefinitions).some(([kind,definition])=>canTab(user,definition.tab||kind)):source==='feedbacks'?canTab(user,'feedbacks'):canCollection(user,source,writing);
        if(req.method==='GET'){
          if(route==='/api/processes/flow'){const source=url.searchParams.get('source'),id=url.searchParams.get('id'),before=url.searchParams.get('before');if(!validSource(source,id)||before&&!/^\d{1,16}$/.test(before))throw fail(400,'Registro inválido.');if(!flowAllowed(source))throw fail(403,'Sem acesso ao acompanhamento.');return json(200,await provider.flowDetails(session.accessToken,source,id,before));}
          if(!['/api/processes','/api/processes/services'].includes(route))throw fail(405,'Método inválido.');
          const kind=url.searchParams.get('kind'),offset=Number(url.searchParams.get('offset')||0);let filters;
          if(route==='/api/processes'&&['reservas','projetos','compras','onboarding'].includes(kind))throw fail(410,'Este processo foi removido. Onboarding está disponível apenas para cadastro de imóveis.');
          try{filters=JSON.parse(url.searchParams.get('filters')||'{}');}catch{throw fail(400,'Filtros inválidos.');}
          if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).some(k=>!['search','phase','assignee','hotel','period','label','urgency'].includes(k))||Object.values(filters).some(v=>typeof v!=='string'||v.length>200)||filters.label&&(!route.endsWith('/services')||!uuid(filters.label))||filters.urgency&&(!route.endsWith('/services')||!['Normal','Alta','Urgente','unknown'].includes(filters.urgency))||filters.assignee&&!uuid(filters.assignee)||filters.period&&!['all','today','week','late'].includes(filters.period))throw fail(400,'Filtros inválidos.');
          const tab=route.endsWith('/services')?'os':processDefinitions[kind]?.tab||kind;
          if(route==='/api/processes'&&!Object.hasOwn(processDefinitions,kind))throw fail(400,'Processo inválido.');
          if(!canTab(user,tab))throw fail(403,'Sem acesso a esta aba.');
          return json(200,route.endsWith('/services')?await read('services:'+offset+JSON.stringify(filters),()=>provider.servicePage(session.accessToken,offset,filters)):await provider.processes(session.accessToken,kind,offset,filters));
        }
        if(req.method!=='POST')throw fail(405,'Método inválido.');
        const key='routine:'+user.id,quota=writes.get(key)||{count:0,until:now+60000};if(quota.count>=40)throw fail(429,'Aguarde antes de salvar novamente.');quota.count++;writes.set(key,quota);
        const input=await readBody(req);
        if(route==='/api/processes'){
          if(['reservas','projetos','compras','onboarding'].includes(input?.kind))throw fail(410,'Este processo foi removido. Use o cadastro de imóveis no Onboarding.');
          const valid=validateProcess(input),definition=processDefinitions[valid.kind];
          if(!canTab(user,definition.tab||valid.kind))throw fail(403,'Sem acesso a esta aba.');
          if(valid.hotel){const allowed=await visibleHotels(provider,session.accessToken,user);if(!allowed.includes(valid.hotel))throw fail(403,'Sem acesso ao condomínio.');}
          else if(!definition.global||valid.apartment||valid.data.anexos.length)throw fail(400,'Selecione condomínio e apartamento para anexar arquivos.');
          const paths=[];try{const prepared=await storeAttachments([{data:{...valid.data,hotel:valid.hotel}}],user,(p,b,t)=>provider.upload(session.accessToken,p,b,t),paths);const {hotel,...data}=prepared[0].data;await provider.saveProcess(session.accessToken,{...valid,data});}
          catch(error){if(paths.length)await provider.removeFiles(session.accessToken,paths).catch(()=>{});throw error;}
        }else if(route==='/api/processes/flow'){const valid=validateFlow(input);if(!flowAllowed(valid.source,true))throw fail(403,'Sem acesso para alterar o acompanhamento.');await provider.saveFlow(session.accessToken,valid);}
        else if(route==='/api/processes/comment'){
          if(!validSource(input?.source,input?.id)||typeof input.body!=='string'||!input.body.trim()||input.body.length>2000)throw fail(400,'Comentário inválido.');if(!flowAllowed(input.source,true))throw fail(403,'Sem acesso para comentar.');await provider.flowComment(session.accessToken,{source:input.source,id:input.id,body:input.body.trim()});
        }else if(route==='/api/processes/service'){
          if(!canTab(user,'os'))throw fail(403,'Sem acesso a Cards.');if(!['process','vistorias'].includes(input?.source)||!validSource(input.source,input.id)||!Number.isSafeInteger(input.version)||input.version<1||typeof input.recordId!=='string'||!/^\d{1,16}$/.test(input.recordId))throw fail(400,'Vínculo inválido.');return json(200,{id:await provider.processService(session.accessToken,input)});
        }else if(route==='/api/processes/receive'){
          if(!canTab(user,'compras')||!canTab(user,'estoque'))throw fail(403,'Exige acesso a Compras e Estoque.');if(!uuid(input?.id)||!Number.isSafeInteger(input.version)||input.version<1||!Number.isSafeInteger(input.stockVersion)||input.stockVersion<1||typeof input.materialId!=='string'||!/^[\w-]{1,100}$/.test(input.materialId)||typeof input.quantity!=='number'||!Number.isFinite(input.quantity)||input.quantity<=0||input.quantity>10000)throw fail(400,'Recebimento inválido.');await provider.receivePurchase(session.accessToken,input);
        }else throw fail(405,'Método inválido.');
        return json(200,{ok:true});
      }
      if(route==='/api/notifications'&&req.method==='GET')return json(200,await provider.notifications(session.accessToken));
      if(['/api/workspace/support-summary','/api/workspace/support-read','/api/workspace/reminders','/api/workspace/reminders-due','/api/workspace/reminders-ack','/api/feedbacks','/api/feedbacks/service','/api/evaluations'].includes(route)){
        if(user.funcao!=='adm')throw fail(403,'Somente administradores.');
        if(route.startsWith('/api/feedbacks')&&!canTab(user,'feedbacks')||route==='/api/evaluations'&&!canTab(user,'avaliacoes'))throw fail(403,'Sem acesso a esta aba.');
        if(route==='/api/workspace/support-summary'){if(!user.mestre)throw fail(403,'Somente o mestre.');if(req.method!=='GET')throw fail(405,'Método inválido.');return json(200,await provider.supportSummary(session.accessToken));}
        if(req.method==='GET'){
          const offset=Number(url.searchParams.get('offset')||0),before=url.searchParams.get('before');
          if(!Number.isSafeInteger(offset)||offset<0||offset>100000||before&&!Number.isFinite(Date.parse(before)))throw fail(400,'Consulta inválida.');
          if(route==='/api/workspace/reminders')return json(200,await provider.reminders(session.accessToken));
          if(route==='/api/feedbacks'){const grade=url.searchParams.get('grade');if(grade&&!['Crítico','Razoável','Irrelevante','Alta','Média','Baixa','A conferir','Não informado'].includes(grade))throw fail(400,'Grau inválido.');return json(200,await provider.feedbacks(session.accessToken,offset,grade));}
          if(route==='/api/evaluations'){const beforeId=url.searchParams.get('beforeId');if(!!before!==!!beforeId||beforeId&&!uuid(beforeId)||before&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(before))throw fail(400,'Página inválida.');return json(200,await provider.evaluations(session.accessToken,before,beforeId));}
          throw fail(405,'Método inválido.');
        }
        if(req.method!=='POST')throw fail(405,'Método inválido.');
        const quotaKey='collaboration:'+user.id,quota=writes.get(quotaKey)||{count:0,until:now+60000};
        if(quota.count>=60)throw fail(429,'Aguarde antes de enviar novamente.');quota.count++;writes.set(quotaKey,quota);
        const input=await readBody(req);
        if(route==='/api/workspace/reminders-due')return json(200,await provider.dueReminders(session.accessToken));
        if(route==='/api/workspace/reminders-ack'){
          if(!uuid(input?.id)||typeof input.due!=='string'||!Number.isFinite(Date.parse(input.due)))throw fail(400,'Lembrete inválido.');
          await provider.ackReminder(session.accessToken,input.id,input.due);return json(200,{ok:true});
        }
        if(route==='/api/workspace/support-read'){
          if(!uuid(input?.id)||typeof input.seen!=='string'||!Number.isFinite(Date.parse(input.seen)))throw fail(400,'Leitura inválida.');
          await provider.supportRead(session.accessToken,input.id,input.seen);
        }else if(route==='/api/workspace/reminders')await provider.saveReminder(session.accessToken,validateCollaboration('reminders',input));
        else if(route==='/api/evaluations')await provider.sendEvaluation(session.accessToken,validateCollaboration('evaluations',input));
        else if(route==='/api/feedbacks/service'){
          if(!canTab(user,'os'))throw fail(403,'Sem permissão para criar cards de serviço.');
          if(!uuid(input?.id)||!Number.isSafeInteger(input.version)||input.version<1||typeof input.recordId!=='string'||!/^\d{1,16}$/.test(input.recordId))throw fail(400,'Card inválido.');
          return json(200,{id:await provider.feedbackService(session.accessToken,input)});
        }else{
          const allowed=await visibleHotels(provider,session.accessToken,user),valid=validateCollaboration('feedbacks',input,[...hotels,...allowed]);
          if(!allowed.includes(valid.data.hotel))throw fail(403,'Sem acesso ao condomínio.');
          if(Buffer.byteLength(JSON.stringify(valid.data,(k,v)=>typeof v==='string'&&v.startsWith('data:')?'[anexo]':v))>128*1024)throw fail(413,'Feedback acima do limite.');
          const uploaded=[];let committed=false;
          try{
            const prepared=await storeAttachments([{data:valid.data}],user,(p,b,t)=>provider.upload(session.accessToken,p,b,t),uploaded);
            await provider.saveFeedback(session.accessToken,{...valid,data:prepared[0].data});committed=true;
          }finally{if(!committed&&uploaded.length)await provider.removeFiles(session.accessToken,uploaded).catch(()=>{});}
        }
        return json(200,{ok:true});
      }
      if((route==='/api/ai'||route==='/api/ai/actions')&&req.method==='POST'){
        if(user.funcao!=='adm')throw fail(403,'Disponível somente para administradores.');
        const context={provider,token:session.accessToken,user,session:sessionId,invalidateUser:id=>{for(const [key,value]of sessions)if(value.userId===id)sessions.delete(key);}};
        const executing=route==='/api/ai/actions';
        const key=`${executing?'ai-actions':'ai'}:${user.id}`,quota=writes.get(key)||{count:0,until:now+60000};
        if(quota.count>=(executing?20:5))throw fail(429,'Aguarde um minuto antes de enviar outra solicitação à IA.');
        quota.count++;writes.set(key,quota);
        if(executing){
          const input=await readBody(req,4096);if(!uuid(input?.id))throw fail(400,'Proposta inválida.');
          return json(200,await agent.execute(input.id,context));
        }
        return json(200,await agent.run(await readBody(req,150000),context,aiGenerate));
      }
      if(route==='/api/orders/edit'){
        if(user.funcao!=='adm'||!canTab(user,'os'))throw fail(403,'Sem acesso para editar cards.');
        if(req.method!=='POST')throw fail(405,'Método inválido.');
        const input=await readBody(req,25000);
        if(typeof input.id!=='string'||!/^\d{1,16}$/.test(input.id)||!Number.isSafeInteger(input.version)||input.version<1||!input.document||Array.isArray(input.document)||typeof input.document!=='object'||Object.entries(input.document).some(([k,v])=>!['titulo','descricao','prioridade','vencimento'].includes(k)||typeof v!=='string'||v.length>10000)||input.document.prioridade&&!['Normal','Alta','Urgente'].includes(input.document.prioridade))throw fail(400,'Edição inválida.');
        return json(200,await provider.editOrder(session.accessToken,input));
      }
      if (route === '/api/orders/reopen' || route === '/api/workspace/notes' || route === '/api/workspace/support') {
        if (user.funcao !== 'adm') throw fail(403, 'Disponível somente para administradores.');
        if (route === '/api/orders/reopen' && !canTab(user, 'os')) throw fail(403, 'Sem permissão para reabrir cards.');
        const kind = route.endsWith('/notes') ? 'notes' : 'support';
        if (req.method === 'GET' && route !== '/api/orders/reopen') {
          const id = url.searchParams.get('id');
          const offset = Number(url.searchParams.get('offset') || 0);
          if (id && !uuid(id) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw fail(400, 'Consulta inválida.');
          const filter=url.searchParams.get('status');if(filter&&!['Aberto','Fechado'].includes(filter))throw fail(400,'Status inválido.');
          return json(200, kind === 'notes' ? await provider.notes(session.accessToken) : await provider.support(session.accessToken, id, offset,filter));
        }
        if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
        const quotaKey = `workspace:${user.id}`, quota = writes.get(quotaKey) || {count:0,until:now+60000};
        if (quota.count >= 30) throw fail(429, 'Aguarde um minuto antes de salvar novamente.');
        quota.count++; writes.set(quotaKey,quota);
        const input = await readBody(req, 100000);
        if (route === '/api/orders/reopen') {
          if (!input || !/^[0-9]{1,16}$/.test(input.id) || !Number.isSafeInteger(input.version) || input.version < 1 || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 1000) throw fail(400, 'Informe card, versão e motivo válidos.');
          await provider.reopenOrder(session.accessToken, {id:input.id,version:input.version,reason:input.reason.trim()});
        } else {
          const valid = validateWorkspace(kind, input);
          if (kind === 'support' && valid.status && !user.mestre) throw fail(403, 'Somente o mestre altera o status do suporte.');
          if (kind === 'notes') await provider.saveNote(session.accessToken, valid);
          else await provider.sendSupport(session.accessToken, valid);
        }
        return json(200, {ok:true});
      }
      if (route === '/api/backup' && req.method === 'POST') {
        if (user.funcao !== 'adm' || !user.mestre) throw fail(403, 'Somente o administrador mestre pode fazer backup.');
        const selected = validateBackup(await readBody(req, 4096));
        const quotaKey = `backup:${user.id}`;
        const quota = writes.get(quotaKey) || { count: 0, until: now + 60000 };
        if (quota.count >= 2) throw fail(429, 'Aguarde um minuto antes de iniciar outro backup.');
        quota.count++; writes.set(quotaKey, quota);
        const data = await provider.backup(session.accessToken, selected);
        if (!data || !Array.isArray(data.records)) throw fail(502, 'O servidor não confirmou os dados do backup. Nenhuma cópia completa foi gerada.');
        return json(200, { format: 'book-santos-backup', version: 1, selected, data, files: selected.includes('anexos') ? attachments(data) : [] });
      }
      if (route === '/api/finance' && req.method === 'GET') {
        if (!canTab(user, 'financeiro')) throw fail(403, 'Sem acesso ao financeiro.');
        if (user.funcao !== 'adm') throw fail(403, 'Financeiro disponível somente para administradores.');
        const payer = url.searchParams.get('payer');
        const cursor = url.searchParams.get('cursor');
        if (payer && payer.length > 200 || cursor && !validId(cursor)) throw fail(400, 'Consulta financeira inválida.');
        let period;
        try { period = Periods.range(url.searchParams.get('period') || 'all', url.searchParams.get('date')); }
        catch (error) { throw fail(400, error.message); }
        return json(200, await provider.finance(session.accessToken, payer, cursor, period.start, period.end));
      }
      if (route === '/api/manage/users') {
        if (user.funcao !== 'adm' || !user.mestre) throw fail(403, 'Somente o administrador mestre pode gerenciar usuários.');
        if (req.method === 'GET') return json(200, { users: await provider.managedUsers(session.accessToken), canCreate: provider.canCreateUsers === true });
        if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
        const key = `manage:${user.id}`;
        const quota = writes.get(key) || { count: 0, until: now + 60000 };
        if (quota.count >= 10) throw fail(429, 'Aguarde um minuto antes de gerenciar mais contas.');
        quota.count++; writes.set(key, quota);
        const input = validateUser(await readBody(req, 16384),await visibleHotels(provider,session.accessToken,user));
        await provider.saveUser(session.accessToken, input);
        if (input.id) for (const [key, value] of sessions) if (value.userId === input.id) sessions.delete(key);
        return json(200, { ok: true });
      }
      if(['/api/apartment-info','/api/onboarding/remove','/api/inspections/coverage'].includes(route)){
        const tab=route==='/api/apartment-info'?'condominios':route==='/api/onboarding/remove'?'onboarding':'vistorias';
        if(user.funcao!=='adm'||!canTab(user,tab))throw fail(403,'Sem acesso a esta operação.');
        if(route==='/api/inspections/coverage'){if(req.method!=='GET')throw fail(405,'Método inválido.');return json(200,await provider.inspectionCoverage(session.accessToken));}
        if(!['GET','POST'].includes(req.method)||route==='/api/onboarding/remove'&&req.method!=='POST')throw fail(405,'Método inválido.');
        const input=req.method==='GET'?{hotel:url.searchParams.get('hotel'),apartment:url.searchParams.get('apartment')}:await readBody(req,45000);
        if(typeof input.hotel!=='string'||input.hotel.length>100||!input.hotel||input.apartment!=null&&(typeof input.apartment!=='string'||!/^[A-Za-z0-9 -]{1,20}$/.test(input.apartment))||route==='/api/apartment-info'&&!input.apartment)throw fail(400,'Imóvel inválido.');
        if(!(await visibleHotels(provider,session.accessToken,user)).includes(input.hotel))throw fail(403,'Sem acesso ao condomínio.');
        if(route==='/api/onboarding/remove'){if(input.confirm!==input.hotel+(input.apartment?' / '+input.apartment:''))throw fail(400,'Confirme o imóvel que deseja remover.');return json(200,await provider.removeCatalog(session.accessToken,input));}
        if(req.method==='POST'&&(!Number.isSafeInteger(input.version)||input.version<0||!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields)||Object.entries(input.fields).some(([k,v])=>!['lockPassword','safePassword','wifiName','wifiPassword','masterPassword','cleaningPassword','governancePassword','propertyPassword','adminPassword','accessNotes'].includes(k)||typeof v!=='string'||v.length>(k==='accessNotes'?6000:256))))throw fail(400,'Informações inválidas.');
        return json(200,await provider.apartmentInfo(session.accessToken,req.method==='GET'?{hotel:input.hotel,apartment:input.apartment}:input));
      }
      if (route === '/api/apartments' && req.method === 'GET') return json(200, await provider.apartments(session.accessToken));
      if (route === '/api/access' && req.method === 'GET') return json(200,await visibleHotels(provider,session.accessToken,user));
      if(route==='/api/onboarding/catalog'&&req.method==='POST'){
        if(!canTab(user,'onboarding'))throw fail(403,'Sem acesso ao Onboarding.');
        const input=validateCatalog(await readBody(req,16384));
        if(input.kind==='apartments'&&!(await visibleHotels(provider,session.accessToken,user)).includes(input.hotel))throw fail(403,'Sem acesso ao condomínio.');
        const quotaKey='catalog:'+user.id,quota=writes.get(quotaKey)||{count:0,until:now+60000};
        if(quota.count>=20)throw fail(429,'Aguarde um minuto antes de cadastrar novamente.');quota.count++;writes.set(quotaKey,quota);
        if(!provider.saveCatalog)throw fail(503,'Aplique a migração 202610290016_onboarding_catalog.sql no Supabase.');
        return json(200,await provider.saveCatalog(session.accessToken,input));
      }
      if (route === '/api/snapshot' && req.method === 'GET') {
        let pages;
        try { pages = JSON.parse(url.searchParams.get('pages') || '{}'); }
        catch { throw fail(400, 'Paginação inválida.'); }
        if (!pages || Array.isArray(pages) || typeof pages !== 'object' || Object.values(pages).some(count => !Number.isInteger(count) || count < 1 || count > 20)) throw fail(400, 'Use entre 1 e 20 páginas por coleção.');
        const permitted = COLLECTIONS.filter(key => canCollection(user, key));
        let active = permitted;
        if (url.searchParams.has('collections')) {
          try { active = JSON.parse(url.searchParams.get('collections')); } catch { throw fail(400, 'Coleções inválidas.'); }
          if (!Array.isArray(active) || active.length > COLLECTIONS.length || new Set(active).size !== active.length || active.some(key => !COLLECTIONS.includes(key))) throw fail(400, 'Coleções inválidas.');
          if(user.funcao!=='adm'&&active.some(key=>!permitted.includes(key)))throw fail(400,'Coleções inválidas.');
          active = active.filter(key => permitted.includes(key));
        }
        const result = await Promise.all(active.map(async key => {
          let cursor = null; const loaded = [];
          for (let page = 0; page < (pages[key] || 1); page++) {
            const result = await read('records:'+key+':'+cursor,()=>provider.records(session.accessToken,key,cursor));
            loaded.push(...result.rows); cursor = result.next;
            if (!cursor) break;
          }
          return [key, { loaded, cursor }];
        }));
        const snapshot = Object.fromEntries(result);
        if (provider.counts && user.funcao === 'adm') snapshot.__counts = await provider.counts(session.accessToken);
        return json(200, snapshot);
      }
      if (route === '/api/data' && req.method === 'GET') {
        const collection = url.searchParams.get('collection');
        const cursor = url.searchParams.get('cursor');
        if (!COLLECTIONS.includes(collection) || cursor && !validId(cursor)) throw fail(400, 'Consulta inválida.');
        if (!canCollection(user, collection)) throw fail(403, 'Sem acesso a esta aba.');
        if (user.funcao !== 'adm' && !['chamados', 'conversasSuporte'].includes(collection)) throw fail(403, 'Acesso negado.');
        return json(200, await provider.records(session.accessToken, collection, cursor));
      }
      if (route === '/api/data' && req.method === 'POST') {
        const quota = writes.get(user.id) || { count: 0, until: now + 60000 };
        if (quota.count >= 60) throw fail(429, 'Limite de gravações atingido. Aguarde um minuto.');
        quota.count++; writes.set(user.id, quota);
        const raw = await readBody(req);
        const changes = validateChanges(raw?.changes, user,[...hotels,...await visibleHotels(provider,session.accessToken,user)]);
        const uploadedPaths = [];
        try {
          const prepared = await storeAttachments(changes, user, (filename, bytes, type) => provider.upload(session.accessToken, filename, bytes, type), uploadedPaths);
          await provider.commit(session.accessToken, prepared);
        } catch (error) {
          if (uploadedPaths.length) await provider.removeFiles(session.accessToken, uploadedPaths).catch(() => console.error(JSON.stringify({ event: 'attachment_cleanup_pending', requestId })));
          throw error;
        }
        return json(200, { ok: true });
      }
      if (route.startsWith('/api/files/') && req.method === 'GET') {
        const filename = decodeURIComponent(route.slice('/api/files/'.length));
        if (!filePath(filename)) throw fail(400, 'Caminho de anexo inválido.');
        const file = await provider.file(session.accessToken, filename);
        const bytes = await boundedBytes(file);
        const type=(file.headers.get('content-type')||'').split(';')[0].toLowerCase();
        const safeType=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'].includes(type)?type:'application/octet-stream';
        res.writeHead(200, { 'Content-Type': safeType, 'Content-Length': bytes.length, 'Content-Security-Policy': "default-src 'none'; sandbox",...(safeType==='application/octet-stream'?{'Content-Disposition':'attachment; filename="anexo"'}:{}) });
        return res.end(bytes);
      }
      if (route === '/api/users' && req.method === 'GET') {
        if (user.funcao !== 'adm') throw fail(403, 'Acesso negado.');
        return json(200, await provider.users(session.accessToken));
      }
      if (route === '/api/users' || route.startsWith('/api/users/')) throw fail(403, 'Gerencie as contas em Authentication → Users e os perfis em book_profiles no painel Supabase.');
      if (route.startsWith('/api/')) throw fail(404, 'Rota não encontrada.');
      if (route === '/assets/catalog.js' && req.method === 'GET') {
        const visible=await visibleHotels(provider,session.accessToken,user);
        const rows=await provider.apartments(session.accessToken);
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(`window.BookCatalog = ${JSON.stringify({ hotels: visible, apartments: Object.fromEntries(visible.map(hotel => [hotel,rows.filter(r=>r.hotel===hotel).map(r=>r.apartment)])) })};`);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Método não permitido.');
      if (/^\/hotel\/(hotel\.html)?$/.test(route)) { res.writeHead(302, { Location: '/adm/admin.html#condominios' }); return res.end(); }
      const file = route === '/' ? '/login.html' : route;
      if (!/^\/(login\.(html|css|js)|assets\/(api|session|store|money|periods|catalog|events|notifications|processes|accessibility|legal|theme|mobile|auth|dictation)\.js|assets\/(ui|legal|brand|layout|mobile)\.css|assets\/book-task-logo\.png|assets\/login-skyline\.svg|(adm|cliente|hotel)\/[a-z]+\.(html|css|js))$/.test(file)) throw fail(404, 'Arquivo não encontrado.');
      if (/^\/(adm|hotel)\//.test(file) && user?.funcao !== 'adm' || /^\/cliente\//.test(file) && user?.funcao !== 'cliente') {
        res.writeHead(302, { Location: '/login.html' }); return res.end();
      }
      // Only allowlisted application files reach this cache, after access checks.
      const content = await asset(path.join(ROOT, file));
      res.setHeader('Vary','Accept-Encoding');
      if (/\.(css|js|png|svg)$/.test(file)) {
        const etag = content.etag;
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
        if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      }
      const zipped=content.gzip && acceptsGzip(req.headers['accept-encoding']);
      const bytes=zipped?content.gzip:content.bytes;
      const contentType=path.extname(file)==='.png'?'image/png':`${{ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg':'image/svg+xml' }[path.extname(file)]}; charset=utf-8`;
      res.writeHead(200, { 'Content-Type':contentType, 'Content-Length':bytes.length, ...(zipped?{'Content-Encoding':'gzip'}:{}) });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if(error.status===413){res.setHeader('Connection','close');req.resume();}
      json(error.status || (error.code === 'ENOENT' ? 404 : 500), { message: error.status ? error.message : 'Não foi possível concluir a operação.' });
    }
  });
  server.maxHeadersCount=64;server.maxRequestsPerSocket=100;server.maxConnections=256;
  return server;
}
module.exports = { createSupabaseApp };
