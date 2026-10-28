const failure = (status, message) => Object.assign(new Error(message), { status });

function createSupabase({ url, key, secretKey, fetchImpl = fetch }) {
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw new Error('SUPABASE_URL deve ser a URL HTTPS do projeto.');
  async function request(route, { token, method = 'GET', body, timeoutMs = 15000 } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(route, origin), {
        method, signal: AbortSignal.timeout(timeoutMs),
        headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw failure(503, 'Não foi possível conectar ao Supabase. Verifique sua conexão.'); }
    let data;
    if (response.status === 204) data = null;
    else {
      try { data = await response.json(); }
      catch { throw failure(503, 'Resposta incompleta do Supabase. Atualize os dados antes de tentar novamente.'); }
    }
    if (!response.ok) {
      if (['PGRST205', 'PGRST202', '42P01', '42703'].includes(data?.code)) throw failure(503, 'Execute primeiro a migração SQL do BOOK TESK no Supabase.');
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
        method, signal: AbortSignal.timeout(15000), headers: { apikey: secretKey, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw failure(503, 'Falha de conexão ao cadastrar a conta. Confira no painel antes de tentar novamente.'); }
    const data = await response.json().catch(() => null);
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
    notes(token) { return request('/rest/v1/book_notes?select=id,title,body,version,updated_at&order=updated_at.desc&limit=200', { token }); },
    saveNote(token, input) { return request('/rest/v1/rpc/book_save_note', { token, method: 'POST', body: {note_id:input.id,note_title:input.title,note_body:input.body,expected_version:input.version,remove_note:input.remove === true} }); },
    support(token, id, offset = 0) {
      const query = new URLSearchParams({select: id ? '*,book_support_messages(*)' : '*', order:'updated_at.desc,id.desc',limit:id?'1':'51',offset:String(offset)});
      if (id) query.set('id', `eq.${id}`);
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
    async ready() {
      await request('/auth/v1/settings');
      if (await request('/rest/v1/rpc/book_schema_version', { method: 'POST', body: {} }) !== 11) throw failure(503, 'Aplique as migrações até 202610280011_notes_support.sql antes de publicar esta versão.');
      return { ok: true };
    },
    commit(token, changes) { return request('/rest/v1/rpc/book_commit', { token, method: 'POST', body: { changes } }); },
    removeFiles(token, paths) { return request('/storage/v1/object/book-attachments', { token, method: 'DELETE', body: { prefixes: paths } }); },
    async upload(token, filename, bytes, type) {
      let response;
      try {
        response = await fetchImpl(new URL(`/storage/v1/object/book-attachments/${filename}`, origin), {
          method: 'POST', signal: AbortSignal.timeout(30000), headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': type }, body: bytes
        });
      } catch { throw failure(503, 'Falha ao enviar anexo. Tente novamente.'); }
      if (!response.ok) throw failure(502, 'O anexo não foi salvo. Confira o acesso ao hotel e a migração do Storage.');
    },
    async file(token, filename) {
      let response;
      try {
        response = await fetchImpl(new URL(`/storage/v1/object/authenticated/book-attachments/${filename}`, origin), {
          signal: AbortSignal.timeout(30000), headers: { apikey: key, Authorization: `Bearer ${token}` }
        });
      } catch { throw failure(503, 'Não foi possível carregar o anexo.'); }
      if (!response.ok) throw failure(404, 'Anexo indisponível ou sem permissão de acesso.');
      return response;
    },
    login(email, password) { return request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }); },
    refresh(refreshToken) { return request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } }); },
    async profile(token) {
      const user = await request('/auth/v1/user', { token });
      const rows = await request(`/rest/v1/book_profiles?select=id,nome,login,funcao,mestre,tabs&id=eq.${encodeURIComponent(user.id)}`, { token });
      if (!rows?.[0]) throw failure(403, 'Seu acesso ainda não foi liberado. Peça ao administrador para cadastrar seu perfil.');
      return rows[0];
    },
    users(token) { return request('/rest/v1/book_profiles?select=id,nome,login,funcao,mestre&order=nome', { token }); },
    logout(token) { return request('/auth/v1/logout?scope=local', { token, method: 'POST' }); },
    async check() { await request('/auth/v1/settings'); return { ok: true }; }
  };
  return provider;
}
module.exports = { createSupabase };
