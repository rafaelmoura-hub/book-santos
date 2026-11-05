const failure = (status, message) => Object.assign(new Error(message), { status });
const {boundedBytes}=require('./security');

function createSupabase({ url, key, secretKey, fetchImpl = fetch }) {
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw new Error('SUPABASE_URL deve ser a URL HTTPS do projeto.');
  async function request(route, { token, method = 'GET', body, timeoutMs = 15000 } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(route, origin), {
        method, signal: AbortSignal.timeout(timeoutMs), redirect:'error',
        headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw failure(503, 'Não foi possível conectar ao Supabase. Verifique sua conexão.'); }
    let data;
    if (response.status === 204) data = null;
    else {
      try { data = JSON.parse((await boundedBytes(response,16*1024*1024)).toString('utf8')); }
      catch { throw failure(503, 'Resposta incompleta do Supabase. Atualize os dados antes de tentar novamente.'); }
    }
    if (!response.ok) {
      if(data?.code==='23505')throw failure(409,'Já existe um registro com esse identificador ou código. Confira a lista antes de tentar novamente.');
      if (['PGRST205', 'PGRST202', '42P01', '42703'].includes(data?.code)) throw failure(503, 'Execute primeiro a migração SQL do BOOK TASK no Supabase.');
      if (response.status === 409 || data?.code === 'PT409') throw failure(409, data?.message || 'Registro alterado por outro usuário. Atualize e tente novamente.');
      if (data?.code === '22023') throw failure(400, data.message || 'Dados inválidos.');
      if (data?.code === '42501') throw failure(403, 'Sem permissão para esta operação.');
      if (['23514','22P02','22003','22007','22008'].includes(data?.code)) throw failure(400, 'Registro com valores inválidos ou acima do limite de tamanho permitido.');
      if (response.status === 401 || response.status === 400 && route.startsWith('/auth/')) throw failure(401, 'E-mail ou senha inválidos, ou e-mail ainda não confirmado.');
      if (response.status === 429) throw failure(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
      throw failure(response.status === 403 ? 403 : 502, 'O Supabase recusou a operação. Verifique as permissões do projeto.');
    }
    return data;
  }
  async function adminRequest(route, { method, body }) {
    if (!secretKey?.startsWith('sb_secret_')) throw failure(503, 'O cadastro de contas ainda não foi habilitado pelo responsável pelo sistema.');
    let response;
    try {
      response = await fetchImpl(new URL(route, origin), {
        method, signal: AbortSignal.timeout(15000), redirect:'error', headers: { apikey: secretKey, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw failure(503, 'Falha de conexão ao cadastrar a conta. Confira no painel antes de tentar novamente.'); }
    let data;
    try{data=response.status===204?null:JSON.parse((await boundedBytes(response,1024*1024)).toString('utf8'));}
    catch{throw failure(503,'Resposta incompleta ao cadastrar a conta. Confira no painel antes de tentar novamente.');}
    if (!response.ok) {
      if (['email_exists','email_conflict','user_already_exists'].includes(data?.code) || response.status === 409) throw failure(409, 'Já existe uma conta com esse e-mail.');
      if (response.status === 422 || response.status === 400) throw failure(400, 'O cadastro foi recusado. Confira o e-mail e os requisitos de senha.');
      throw failure(502, 'Não foi possível cadastrar a conta. Confira a configuração administrativa.');
    }
    return data;
  }
  const manageProfile = (token, id, input, version) => request('/rest/v1/rpc/book_manage_user', { token, method: 'POST', body: { target_id: id, display_name: input.nome, role_name: input.funcao, hotels: input.hotels, expected_version: version, ...(input.tabs !== undefined ? { selected_tabs: input.tabs } : {}) } });
  async function ensureMaster(token) {
    const profile = await provider.profile(token);
    if (profile.funcao !== 'adm' || !profile.mestre) throw failure(403, 'Somente o administrador mestre pode gerenciar usuários.');
  }
  const provider = {
    async activity(token,filters){
      if(await request('/rest/v1/rpc/book_schema_version',{token,method:'POST',body:{}})<19)throw failure(503,'Aplique a migração 202610300019_activity.sql para os indicadores por período.');
      return request('/rest/v1/rpc/book_activity_snapshot',{token,method:'POST',body:{filters},timeoutMs:30000});
    },
    async scheduleCard(token,input){
      if(await request('/rest/v1/rpc/book_schema_version',{token,method:'POST',body:{}})<19)throw failure(503,'Aplique a migração 202610300019_activity.sql para remarcar cards com histórico.');
      return request('/rest/v1/rpc/book_card_schedule',{token,method:'POST',body:{target_id:input.id,expected_version:input.version,due_date:input.due,comment_body:input.comment||''}});
    },
    decision(token,hotel){return request('/rest/v1/rpc/book_decision_snapshot',{token,method:'POST',body:{site:hotel||null},timeoutMs:30000});},
    processes(token,kind,offset,filters){return request('/rest/v1/rpc/book_process_page',{token,method:'POST',body:{process_kind:kind,page_offset:offset,filters}});},
    labels(token,input={}){return request('/rest/v1/rpc/book_labels_catalog',{token,method:'POST',body:{new_name:input.name??null,new_color:input.color??null}});},
    cardLabels(token,ids){return request('/rest/v1/rpc/book_labels_read',{token,method:'POST',body:{card_ids:ids}});},
    assignLabels(token,input){return request('/rest/v1/rpc/book_labels_assign',{token,method:'POST',body:{target_id:input.id,expected_version:input.version,selected_ids:input.labelIds}});},
    async servicePage(token,offset,filters){
      if(await request('/rest/v1/rpc/book_schema_version',{token,method:'POST',body:{}})<17)throw failure(503,'Aplique a migração 202610290017_simplify.sql para usar as quatro etapas do quadro.');
      return request('/rest/v1/rpc/book_service_page',{token,method:'POST',body:{page_offset:offset,filters}});
    },
    saveProcess(token,input){return request('/rest/v1/rpc/book_process_save',{token,method:'POST',body:{process_id:input.id,process_kind:input.kind,expected_version:input.version,site:input.hotel,unit:input.apartment,new_phase:input.phase,document:input.data}});},
    flowDetails(token,source,id,before){return request('/rest/v1/rpc/book_flow_details',{token,method:'POST',body:{source_name:source,target_id:id,before_id:before||null}});},
    saveFlow(token,input){return request('/rest/v1/rpc/book_flow_save',{token,method:'POST',body:{source_name:input.source,target_id:input.id,expected_version:input.version,expected_record_version:input.recordVersion,new_phase:input.phase,document:input.data}});},
    flowComment(token,input){return request('/rest/v1/rpc/book_flow_comment',{token,method:'POST',body:{source_name:input.source,target_id:input.id,message_body:input.body}});},
    processService(token,input){return request('/rest/v1/rpc/book_process_service',{token,method:'POST',body:{source_name:input.source,target_id:input.id,expected_version:input.version,record_id:input.recordId}});},
    receivePurchase(token,input){return request('/rest/v1/rpc/book_purchase_receive',{token,method:'POST',body:{process_id:input.id,expected_version:input.version,stock_version:input.stockVersion,material_id:input.materialId,quantity:input.quantity}});},
    aiCommit(token,changes,stockVersion=null){return request('/rest/v1/rpc/book_ai_commit',{token,method:'POST',body:{changes,expected_stock_version:stockVersion}});},
    async record(token,collection,id) {
      const query=new URLSearchParams({select:'id,data,owner_id,version,hotel',collection:`eq.${collection}`,id:`eq.${id}`,limit:'1'});
      return (await request(`/rest/v1/book_records?${query}`,{token}))[0]||null;
    },
    searchRecords(token,collection,filters={}) {
      const query=new URLSearchParams({select:'id,data,owner_id,version,hotel',collection:`eq.${collection}`,order:'id.desc',limit:String(filters.limit||20)});
      if(filters.cursor)query.set('id',`lt.${filters.cursor}`);
      for(const key of ['hotel','apartamento','status'])if(filters[key])query.set(`data->>${key}`,`eq.${filters[key]}`);
      return request(`/rest/v1/book_records?${query}`,{token});
    },
    notes(token) { return request('/rest/v1/book_notes?select=id,title,body,version,updated_at&order=updated_at.desc&limit=200', { token }); },
    notifications(token){return request('/rest/v1/rpc/book_notifications',{token,method:'POST',body:{}});},
    supportRead(token,id,seen){return request('/rest/v1/rpc/book_support_read',{token,method:'POST',body:{target_ticket:id,seen_at:seen}});},
    supportSummary(token){return request('/rest/v1/rpc/book_support_summary',{token,method:'POST',body:{}});},
    reminders(token){return request('/rest/v1/book_reminders?select=*&order=due_at&limit=200',{token});},
    dueReminders(token){return request('/rest/v1/rpc/book_due_reminders',{token,method:'POST',body:{}});},
    ackReminder(token,id,due){return request('/rest/v1/rpc/book_ack_reminder',{token,method:'POST',body:{target_note:id,delivered_due:due}});},
    saveReminder(token,input){return request('/rest/v1/rpc/book_save_reminder',{token,method:'POST',body:{target_note:input.id,expected_version:input.version,next_due:input.due,repeat_mode:input.repeat,is_enabled:input.enabled}});},
    async feedbacks(token,offset=0,grade){const query=new URLSearchParams({select:'*',order:'created_at.desc,id.desc',limit:'51',offset:String(offset)});if(grade)query.set('data->>grau','eq.'+grade);const rows=await request('/rest/v1/book_feedbacks?'+query,{token});if(!rows.length)return rows;const q=new URLSearchParams({select:'record_id,phase',source:'eq.feedbacks',record_id:'in.('+rows.map(r=>r.id).join(',')+')',limit:'51'});const meta=await request('/rest/v1/book_flow_meta?'+q,{token});return rows.map(r=>({...r,flowPhase:meta.find(m=>m.record_id===r.id)?.phase||'Feedback'}));},
    saveFeedback(token,input){return request('/rest/v1/rpc/book_save_feedback',{token,method:'POST',body:{feedback_id:input.id,expected_version:input.version,document:input.data}});},
    feedbackService(token,input){return request('/rest/v1/rpc/book_feedback_service',{token,method:'POST',body:{feedback_id:input.id,expected_version:input.version,record_id:input.recordId}});},
    evaluations(token,before,beforeId){const q=new URLSearchParams({select:'*',order:'created_at.desc,id.desc',limit:'51'});if(before&&beforeId)q.set('or',`(created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId}))`);return request('/rest/v1/book_team_messages?'+q,{token});},
    sendEvaluation(token,input){return request('/rest/v1/rpc/book_team_send',{token,method:'POST',body:{message_id:input.id,message_body:input.body,target_user:input.target}});},
    saveNote(token, input) { return request('/rest/v1/rpc/book_save_note', { token, method: 'POST', body: {note_id:input.id,note_title:input.title,note_body:input.body,expected_version:input.version,remove_note:input.remove === true} }); },
    support(token, id, offset = 0, status) {
      const query = new URLSearchParams({select: id ? '*,book_support_messages(*)' : '*', order:'updated_at.desc,id.desc',limit:id?'1':'51',offset:String(offset)});
      if (id) query.set('id', `eq.${id}`);
      if(status)query.set('status','eq.'+status);
      return request(`/rest/v1/book_support_tickets?${query}`, { token });
    },
    sendSupport(token, input) { return request('/rest/v1/rpc/book_support_send', { token, method:'POST',body:{ticket_id:input.id,subject:input.subject || '',body:input.body || '',expected_version:input.version,new_status:input.status || null} }); },
    reopenOrder(token, input) { return request('/rest/v1/rpc/book_reopen_order', { token, method:'POST',body:{record_id:input.id,expected_version:input.version,reason:input.reason} }); },
    backup(token, selected) { return request('/rest/v1/rpc/book_backup', { token, method: 'POST', body: { selected }, timeoutMs: 120000 }); },
    async finance(token, payer, cursor, start, end) {
      const result = await request('/rest/v1/rpc/book_finance_history', { token, method: 'POST', body: { payer: payer || null, cursor_id: cursor || null, page_size: 50, start_date: start || null, end_date: end || null } });
      result.records = result.records.map(row => ({ ...row, hotel: row.hotel === 'Unique' ? 'Unique Residence' : row.hotel }));
      return result;
    },
    counts(token) { return request('/rest/v1/rpc/book_counts', { token, method: 'POST', body: {} }); },
    canCreateUsers: !!secretKey?.startsWith('sb_secret_'),
    async managedUsers(token) {
      await ensureMaster(token);
      return request('/rest/v1/book_profiles?select=id,nome,login,funcao,mestre,version,tabs,book_hotel_access(hotel)&order=nome&limit=10000', { token });
    },
    async saveUser(token, input) {
      await ensureMaster(token);
      if (input.id) return manageProfile(token, input.id, input, input.version);
      // Probe the new RPC with the caller's identity before creating an Auth account.
      await request('/rest/v1/book_profiles?select=version&limit=1', { token });
      const created = await adminRequest('/auth/v1/admin/users', { method: 'POST', body: { email: input.login, password: input.senha, email_confirm: true } });
      const id = created?.id;
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw failure(502, 'A conta não pôde ser confirmada. Confira no painel antes de tentar novamente.');
      try { await manageProfile(token, id, input, 0); }
      catch (error) {
        // A timeout can mean the transaction committed: do not delete a valid account.
        let profiles;
        try { profiles = await request(`/rest/v1/book_profiles?select=id&id=eq.${id}`, { token }); }
        catch { throw failure(503, 'Não foi possível confirmar o cadastro. Atualize a lista antes de tentar novamente.'); }
        if (profiles?.length) return;
        try { await adminRequest(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }); }
        catch { throw failure(503, 'Conta criada sem perfil. O responsável precisa concluir a liberação no Supabase.'); }
        throw error;
      }
    },
    async records(token, collection, cursor, limit = 100) {
      const query = new URLSearchParams({ select: 'id,data,owner_id,version,updated_at', collection: `eq.${collection}`, order: 'id.desc', limit: String(limit + 1) });
      if (cursor) query.set('id', `lt.${cursor}`);
      const rows = await request(`/rest/v1/book_records?${query}`, { token });
      return { rows: rows.slice(0, limit).map(row => row.data?.hotel === 'Unique' ? { ...row, hotel: row.hotel === 'Unique' ? 'Unique Residence' : row.hotel, data: { ...row.data, hotel: 'Unique Residence' } } : row), next: rows.length > limit ? rows[limit - 1].id : null };
    },
    async access(token) { return (await request('/rest/v1/book_hotel_access?select=hotel', { token })).map(row => ({ ...row, hotel: row.hotel === 'Unique' ? 'Unique Residence' : row.hotel })); },
    apartments(token) { return request('/rest/v1/book_apartments?select=hotel,apartment&order=apartment&limit=10000', { token }); },
    async condominiums(token) {
      // Older schemas can still open the existing app until migration 16 is applied.
      const version=await request('/rest/v1/rpc/book_schema_version',{token,method:'POST',body:{}});
      if(version<16)return [...new Set((await this.apartments(token)).map(r=>r.hotel))].map(name=>({name}));
      return request('/rest/v1/book_condominiums?select=name&name=neq.Unique&order=name&limit=10000',{token});
    },
    async saveCatalog(token,input){
      if(await request('/rest/v1/rpc/book_schema_version',{token,method:'POST',body:{}})<16)throw failure(503,'Aplique a migração 202610290016_onboarding_catalog.sql no Supabase para habilitar o cadastro.');
      return request('/rest/v1/rpc/book_catalog_add',{token,method:'POST',body:{entry_kind:input.kind,site_name:input.hotel,units:input.apartments}});
    },
    async ready() {
      await request('/auth/v1/settings');
if (![14,15,16,17,18,19].includes(await request('/rest/v1/rpc/book_schema_version', { method: 'POST', body: {} }))) throw failure(503, 'Aplique as migrações até 202610280014_routine.sql antes de publicar esta versão. O painel SAD utiliza também a migração 15.');
      return { ok: true };
    },
    async commit(token, changes) {
      if(changes.some(c=>c.collection==='ordensServico'&&c.data?.status==='Recusada')&&await request('/rest/v1/rpc/book_schema_version',{token,method:'POST',body:{}})<18)throw failure(503,'Aplique a migração 202610290018_card_states.sql para usar os quatro status do card.');
      return request('/rest/v1/rpc/book_commit', { token, method: 'POST', body: { changes } });
    },
    removeFiles(token, paths) { return request('/storage/v1/object/book-attachments', { token, method: 'DELETE', body: { prefixes: paths } }); },
    async upload(token, filename, bytes, type) {
      let response;
      try {
        response = await fetchImpl(new URL(`/storage/v1/object/book-attachments/${filename}`, origin), {
          method: 'POST', signal: AbortSignal.timeout(30000), redirect:'error', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': type }, body: bytes
        });
      } catch { throw failure(503, 'Falha ao enviar anexo. Tente novamente.'); }
      if (!response.ok) throw failure(502, 'O anexo não foi salvo. Confira o acesso ao hotel e a migração do Storage.');
    },
    async file(token, filename) {
      let response;
      try {
        response = await fetchImpl(new URL(`/storage/v1/object/authenticated/book-attachments/${filename}`, origin), {
          signal: AbortSignal.timeout(30000), redirect:'error', headers: { apikey: key, Authorization: `Bearer ${token}` }
        });
      } catch { throw failure(503, 'Não foi possível carregar o anexo.'); }
      if (!response.ok) throw failure(404, 'Anexo indisponível ou sem permissão de acesso.');
      return response;
    },
    recoverPassword(email){return request('/auth/v1/recover',{method:'POST',body:{email}});},
    verifyRecovery(email,token){return request('/auth/v1/verify',{method:'POST',body:{email,token,type:'recovery'}});},
    updatePassword(token,password){return request('/auth/v1/user',{token,method:'PUT',body:{password}});},
    logoutAll(token){return request('/auth/v1/logout?scope=global',{token,method:'POST'});},
    async mfaFactors(token){const user=await request('/auth/v1/user',{token});return user.factors||[];},
    async mfaEnroll(token){await request('/rest/v1/rpc/book_mfa_allowed',{token,method:'POST',body:{}});return request('/auth/v1/factors',{token,method:'POST',body:{factor_type:'totp',friendly_name:'BOOK TASK '+Date.now()}});},
    mfaRemove(token,id){return request('/auth/v1/factors/'+encodeURIComponent(id),{token,method:'DELETE'});},
    async mfaVerify(token,id,code){const challenge=await request('/auth/v1/factors/'+encodeURIComponent(id)+'/challenge',{token,method:'POST',body:{}});return request('/auth/v1/factors/'+encodeURIComponent(id)+'/verify',{token,method:'POST',body:{challenge_id:challenge.id,code}});},
    login(email, password) { return request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }); },
    refresh(refreshToken) { return request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } }); },
    async profile(token) {
      const user = await request('/auth/v1/user', { token });
      const rows = await request(`/rest/v1/book_profiles?select=id,nome,login,funcao,mestre,tabs&id=eq.${encodeURIComponent(user.id)}`, { token });
      if (!rows?.[0]) throw failure(403, 'Seu acesso ainda não foi liberado. Peça ao administrador para cadastrar seu perfil.');
      const result=rows[0];
      const factors=user.factors||[];let aal;try{aal=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aal;}catch{}
      Object.defineProperty(result,'mfaRequired',{value:result.funcao==='adm'&&factors.some(f=>f.status==='verified'&&f.factor_type==='totp')&&aal!=='aal2'});
      return result;
    },
    users(token) { return request('/rest/v1/book_profiles?select=id,nome,login,funcao,mestre&order=nome', { token }); },
    logout(token) { return request('/auth/v1/logout?scope=local', { token, method: 'POST' }); },
    async check() { await request('/auth/v1/settings'); return { ok: true }; }
  };
  return provider;
}
module.exports = { createSupabase };
