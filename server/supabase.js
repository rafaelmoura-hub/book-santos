const failure = (status, message) => Object.assign(new Error(message), { status });

function createSupabase({ url, key, fetchImpl = fetch }) {
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw new Error('SUPABASE_URL deve ser a URL HTTPS do projeto.');
  async function request(route, { token, method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(route, origin), {
        method, signal: AbortSignal.timeout(15000),
        headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw failure(503, 'Não foi possível conectar ao Supabase. Verifique sua conexão.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (['PGRST205', 'PGRST202', '42P01'].includes(data?.code)) throw failure(503, 'Execute primeiro a migração SQL do Book Santos no Supabase.');
      if (response.status === 409 || data?.code === 'PT409') throw failure(409, data?.message || 'Registro alterado por outro usuário. Atualize e tente novamente.');
      if (data?.code === '22023') throw failure(400, data.message || 'Dados inválidos.');
      if (['23514','22P02','22003','22007','22008'].includes(data?.code)) throw failure(400, 'Registro com valores inválidos ou acima do limite de tamanho permitido.');
      if (response.status === 401 || response.status === 400 && route.startsWith('/auth/')) throw failure(401, 'E-mail ou senha inválidos, ou e-mail ainda não confirmado.');
      if (response.status === 429) throw failure(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
      throw failure(response.status === 403 ? 403 : 502, 'O Supabase recusou a operação. Verifique as permissões do projeto.');
    }
    return data;
  }
  return {
    async records(token, collection, cursor, limit = 100) {
      const query = new URLSearchParams({ select: 'id,data,owner_id,version,updated_at', collection: `eq.${collection}`, order: 'id.desc', limit: String(limit + 1) });
      if (cursor) query.set('id', `lt.${cursor}`);
      const rows = await request(`/rest/v1/book_records?${query}`, { token });
      return { rows: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null };
    },
    access(token) { return request('/rest/v1/book_hotel_access?select=hotel', { token }); },
    apartments(token) { return request('/rest/v1/book_apartments?select=hotel,apartment&order=apartment&limit=10000', { token }); },
    async ready() {
      await request('/auth/v1/settings');
      if (await request('/rest/v1/rpc/book_schema_version', { method: 'POST', body: {} }) !== 3) throw failure(503, 'Atualize as migrações do banco antes do piloto.');
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
      const rows = await request(`/rest/v1/book_profiles?select=id,nome,login,funcao,mestre&id=eq.${encodeURIComponent(user.id)}`, { token });
      if (!rows?.[0]) throw failure(403, 'Seu acesso ainda não foi liberado. Peça ao administrador para cadastrar seu perfil.');
      return rows[0];
    },
    users(token) { return request('/rest/v1/book_profiles?select=id,nome,login,funcao,mestre&order=nome', { token }); },
    logout(token) { return request('/auth/v1/logout?scope=local', { token, method: 'POST' }); },
    async check() { await request('/auth/v1/settings'); return { ok: true }; }
  };
}
module.exports = { createSupabase };
