const {randomBytes,createHash}=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(value).digest('hex');
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const code=value=>typeof value==='string'&&/^\d{6,10}$/.test(value);
function createAuthSecurity({provider,sessions,clock=Date.now,requireAdminMfa=false,recoveryEnabled=false,maxSessions=5000,sessionsPerUser=5}){
 const limits=new Map();
 function limit(key,max=5,ms=900000){const now=clock();for(const [k,v]of limits)if(v.until<now)limits.delete(k);const item=limits.get(key)||{count:0,until:now+ms};if(item.count>=max)throw fail(429,'Muitas tentativas. Aguarde antes de tentar novamente.');item.count++;limits.set(key,item);}
 function rotate(auth,user,cookie,oldId){const token=randomBytes(32).toString('hex');sessions.delete(oldId);sessions.set(hash(token),{mfaVerified:true,userId:user.id,accessToken:auth.access_token,refreshToken:auth.refresh_token,authExpires:clock()+(Number(auth.expires_in)||3600)*1000,expires:clock()+8*3600000,issuedAt:clock()});cookie(token,8*3600);return {...user,provider:'supabase'};}
 async function login(auth,user,cookie,oldId){
  const verified=user.funcao==='adm'&&provider.mfaFactors?(await provider.mfaFactors(auth.access_token)).filter(f=>f.status==='verified'&&f.factor_type==='totp'):[];
  if(!verified.length&&!requireAdminMfa)return null;
  if(user.funcao!=='adm')return null;
  const previous=[...sessions].filter(([,value])=>value.userId===user.id).sort((a,b)=>a[1].expires-b[1].expires);
  while(previous.length>=sessionsPerUser)sessions.delete(previous.shift()[0]);
  if(sessions.size>=maxSessions)throw fail(503,'Capacidade de sessões atingida. Aguarde antes de entrar novamente.');
  const token=randomBytes(32).toString('hex');sessions.delete(oldId);
  sessions.set(hash(token),{userId:user.id,accessToken:auth.access_token,refreshToken:auth.refresh_token,authExpires:clock()+300000,expires:clock()+300000,issuedAt:clock(),pendingMfa:true,factorId:verified[0]?.id});cookie(token,300);
  return {mfaRequired:!!verified.length,mfaEnrollRequired:!verified.length};
 }
 async function handle({route,req,session,sessionId,user,readBody,cookie,json}){
  if(!route.startsWith('/api/auth/'))return false;
  if(route.startsWith('/api/auth/recovery')&&!recoveryEnabled)throw fail(503,'A recuperação de senha precisa ser habilitada pelo responsável após configurar o e-mail.');
  const now=clock();
  if(route==='/api/auth/recovery'&&req.method==='POST'){
   limit('recovery-ip:'+req.socket.remoteAddress,20,3600000);const input=await readBody(req,4096);
   if(!email(input?.email))throw fail(400,'Informe um e-mail válido.');const address=input.email.trim().toLowerCase();limit('recovery:'+hash(address),3,3600000);
   try{await provider.recoverPassword(address);}catch{console.error(JSON.stringify({event:'recovery_delivery_failed'}));}
   json(200,{ok:true,message:'Se houver uma conta com esse e-mail, você receberá as instruções de recuperação.'});return true;
  }
  if(route==='/api/auth/recovery/complete'&&req.method==='POST'){
   limit('reset-ip:'+req.socket.remoteAddress,20);const input=await readBody(req,8192);
   if(!email(input?.email)||!code(input?.code)||typeof input.password!=='string'||input.password.length<12||input.password.length>100)throw fail(400,'Informe e-mail, código e uma senha de 12 a 100 caracteres.');
   limit('reset:'+hash(input.email.trim().toLowerCase()));
   let recovered;try{recovered=await provider.verifyRecovery(input.email.trim().toLowerCase(),input.code);}catch{throw fail(401,'Código inválido ou expirado. Solicite outro código.');}
   if(typeof recovered?.user?.id!=='string'||!recovered.user.id||typeof recovered.access_token!=='string'||!recovered.access_token)throw fail(503,'Não foi possível confirmar a recuperação. Solicite outro código.');
   const factor=provider.mfaFactors?(await provider.mfaFactors(recovered.access_token)).find(f=>f.status==='verified'&&f.factor_type==='totp'):null;
   if(factor){if(!code(input.mfaCode))throw fail(400,'Solicite outro código de e-mail e inclua também o código do autenticador.');try{recovered={...recovered,...await provider.mfaVerify(recovered.access_token,factor.id,input.mfaCode)};}catch{throw fail(401,'Código do autenticador inválido. Solicite outro código de e-mail e tente novamente.');}}
   try{await provider.updatePassword(recovered.access_token,input.password);await provider.logoutAll(recovered.access_token);}finally{for(const [id,item]of sessions)if(item.userId===recovered.user?.id)sessions.delete(id);}
   cookie('',0);json(200,{ok:true});return true;
  }
  if(!session||session.expires<=now)throw fail(401,'Entre novamente para continuar.');
  const profile=user||await provider.profile(session.accessToken);
  if(profile.id!==session.userId||profile.funcao!=='adm')throw fail(403,'Somente administradores.');
  if(route==='/api/auth/security'&&req.method==='GET'&&!session.pendingMfa){json(200,{mfaEnabled:(await provider.mfaFactors(session.accessToken)).some(f=>f.status==='verified'),requireAdminMfa});return true;}
  if(req.method!=='POST')throw fail(405,'Método não permitido.');
  limit('mfa:'+sessionId,10);const input=await readBody(req,4096);
  if(route==='/api/auth/mfa/cancel'){
   if(session.enrollment){const own=(await provider.mfaFactors(session.accessToken)).find(f=>f.id===session.enrollment);if(own?.status==='verified')throw fail(409,'O autenticador já foi ativado. Entre novamente.');if(own)await provider.mfaRemove(session.accessToken,own.id);delete session.enrollment;}
   if(session.pendingMfa){sessions.delete(sessionId);cookie('',0);await provider.logout(session.accessToken).catch(()=>{});}else sessions.persist?.();json(200,{ok:true});return true;
  }
  if(route==='/api/auth/mfa/enroll'){
   if(!session.pendingMfa&&(!session.issuedAt||now-session.issuedAt>300000))throw fail(401,'Entre novamente antes de ativar a verificação em duas etapas.');
   if((await provider.mfaFactors(session.accessToken)).some(f=>f.status==='verified'))throw fail(409,'A verificação em duas etapas já está ativa.');
   const factor=await provider.mfaEnroll(session.accessToken);session.enrollment=factor.id;sessions.persist?.();json(200,{id:factor.id,secret:factor.totp.secret});return true;
  }
  if(route==='/api/auth/mfa/verify'||route==='/api/auth/mfa/confirm'){
   const factor=route.endsWith('/confirm')?session.enrollment:session.pendingMfa&&session.factorId;
   if(!factor||!code(input?.code))throw fail(400,'Informe o código do aplicativo autenticador.');
   let auth;try{auth=await provider.mfaVerify(session.accessToken,factor,input.code);}catch{throw fail(401,'Código inválido ou expirado.');}
   json(200,rotate(auth,profile,cookie,sessionId));return true;
  }
  throw fail(404,'Operação não encontrada.');
 }
 return {login,handle};
}
module.exports={createAuthSecurity};
