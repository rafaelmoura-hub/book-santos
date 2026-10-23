window.BookUsers = (() => {
  let users = [], editing = null, saving = false, canCreate = false, loaded = false, loading = null;
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render() {
    const query = el('buscaUsuario').value.trim().toLocaleLowerCase('pt-BR');
    const selected = users.filter(user => `${user.nome} ${user.login}`.toLocaleLowerCase('pt-BR').includes(query));
    el('listaUsuarios').innerHTML = selected.map(user => {
      const card = document.createElement('article');
      card.className = 'chamado usuario-card';
      const hotels = user.mestre ? 'Todos os condomínios' : (user.book_hotel_access || []).map(row => row.hotel).join(', ') || 'Sem acesso aos condomínios';
      card.innerHTML = `<div><strong>${esc(user.nome)}</strong><p>${esc(user.login)}</p><p><b>Função:</b> ${user.mestre ? 'Administrador mestre' : user.funcao === 'adm' ? 'Administrador' : 'Cliente'}</p><p><b>Acesso:</b> ${esc(hotels)}</p></div>`;
      if (user.mestre) {
        const badge = document.createElement('span'); badge.className = 'selo-status'; badge.textContent = 'Conta protegida'; card.appendChild(badge);
      } else {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'botao-secundario'; button.textContent = 'Editar permissões';
        button.dataset.userId = user.id; card.appendChild(button);
      }
      return card.outerHTML;
    }).join('') || '<p class="vazio">Nenhum usuário encontrado.</p>';
    el('listaUsuarios').querySelectorAll('button[data-user-id]').forEach(button => { button.onclick = () => open(button.dataset.userId); });
  }
  function load() {
    if (loading) return loading;
    loading = loadOnce().finally(() => { loading = null; });
    return loading;
  }
  async function loadOnce() {
    el('novoUsuario').disabled = true;
    el('novoUsuario').textContent = 'Carregando usuários…';
    el('novoUsuario').setAttribute('aria-busy', 'true');
    el('usuariosStatus').textContent = 'Carregando usuários…';
    try {
      const data = await BookAPI.request('/api/manage/users', { timeoutMs: 30000 });
      if (!Array.isArray(data?.users)) throw new Error('Não foi possível ler a lista de usuários. Recarregue a página.');
      users = data.users; canCreate = data.canCreate === true; loaded = true;
      el('usuariosStatus').textContent = `${users.length} usuário(s) cadastrado(s).${canCreate ? '' : ' Cadastro de contas indisponível: confira SUPABASE_SECRET_KEY no Render e publique a configuração.'}`;
      render();
      return true;
    } catch (error) {
      loaded = false;
      el('usuariosStatus').textContent = error.message;
      return false;
    } finally {
      el('novoUsuario').disabled = false;
      el('novoUsuario').textContent = '+ Novo usuário';
      el('novoUsuario').removeAttribute('aria-busy');
    }
  }
  async function open(id) {
    if (saving) return;
    if (!loaded && !await load()) return;
    if (!id && !canCreate) {
      el('usuariosStatus').textContent = 'Cadastro de contas indisponível: confira SUPABASE_SECRET_KEY no Render e publique a configuração. A chave deve começar com sb_secret_.';
      return;
    }
    editing = id ? users.find(user => user.id === id) : null;
    if (id && (!editing || editing.mestre) || !id && !canCreate) return;
    el('formUsuario').reset();
    el('usuarioErro').textContent = '';
    el('usuarioTitulo').textContent = editing ? 'Editar usuário e permissões' : 'Novo usuário';
    el('usuarioNome').value = editing?.nome || '';
    el('usuarioEmail').value = editing?.login || '';
    el('usuarioEmail').disabled = !!editing;
    el('usuarioSenhaLabel').hidden = !!editing;
    el('usuarioSenha').disabled = !!editing;
    el('usuarioSenha').required = !editing;
    el('usuarioFuncao').value = editing?.funcao || 'cliente';
    for (const hotel of BookCatalog.hotels) el(`usuario${hotel}`).checked = !!editing?.book_hotel_access?.some(row => row.hotel === hotel);
    el('usuarioModal').style.display = 'block';
    el('usuarioNome').focus();
  }
  function close() {
    if (saving) return;
    el('usuarioSenha').value = '';
    el('usuarioModal').style.display = 'none';
    el('novoUsuario').focus();
  }
  async function save(event) {
    event.preventDefault();
    if (saving || !el('formUsuario').reportValidity()) return;
    const input = { nome: el('usuarioNome').value.trim(), funcao: el('usuarioFuncao').value, hotels: BookCatalog.hotels.filter(hotel => el(`usuario${hotel}`).checked) };
    if (editing) { input.id = editing.id; input.version = editing.version; }
    else { input.login = el('usuarioEmail').value.trim(); input.senha = el('usuarioSenha').value; }
    saving = true;
    el('salvarUsuario').disabled = true; el('cancelarUsuario').disabled = true;
    el('usuarioErro').textContent = 'Salvando…';
    let confirmed = false;
    try { await BookAPI.request('/api/manage/users', { method: 'POST', body: JSON.stringify(input), timeoutMs: 120000 }); confirmed = true; }
    catch (error) { el('usuarioErro').textContent = error.message; }
    finally {
      saving = false; el('salvarUsuario').disabled = false; el('cancelarUsuario').disabled = false;
      // Keep passwords out of the page after any submission attempt.
      el('usuarioSenha').value = ''; delete input.senha;
    }
    if (confirmed) {
      close(); await load();
      try { await atualizarUsuarios(); } catch { /* List will refresh on the next visit. */ }
    }
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && el('usuarioModal').style.display === 'block') close(); });
  return { load, render, open, close, save };
})();
