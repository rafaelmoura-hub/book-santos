(async () => {
  const clearLegacy = () => {
    try {
      localStorage.removeItem('usuariosBookSantos');
      localStorage.removeItem('usuarioLogado');
    } catch {}
  };
  try {
    const user = await BookAPI.request('/api/session');
    const role = location.pathname.startsWith('/cliente/') ? 'cliente' : 'adm';
    if (user.funcao !== role) {
      location.replace('/login.html');
      return;
    }
    clearLegacy();
    await new Promise((resolve, reject) => {
      const store = document.createElement('script');
      store.src = '../assets/store.js';
      store.onload = resolve;
      store.onerror = () => reject(new Error('Não foi possível carregar a interface.'));
      document.body.appendChild(store);
    });
    document.body.hidden = false;
    try {
      await BookStore.init(user);
    } catch (error) {
      const notice = document.createElement('p');
      notice.setAttribute('role', 'alert');
      notice.textContent = `${error.message} Depois de corrigir a configuração no Supabase, recarregue a página.`;
      const retry = document.createElement('button');
      retry.textContent = 'Tentar novamente';
      retry.onclick = () => location.reload();
      document.body.prepend(notice, retry);
      document.querySelector('main')?.setAttribute('hidden', '');
      return;
    }
    const script = document.createElement('script');
    script.src = document.body.dataset.screen;
    script.onerror = () => {
      const notice = document.createElement('p');
      notice.setAttribute('role', 'alert');
      notice.textContent =
        'Não foi possível carregar a tela. Recarregue a página para tentar novamente.';
      document.body.prepend(notice);
      document.querySelector('main')?.setAttribute('hidden', '');
    };
    script.onload = () => BookStore.protectActions();
    document.body.hidden = false;
    document.body.appendChild(script);
  } catch (error) {
    clearLegacy();
    if ([401, 403].includes(error.status)) {
      location.replace('/login.html');
      return;
    }
    document.body.hidden = false;
    document.querySelector('main')?.setAttribute('hidden', '');
    const panel = document.createElement('section');
    panel.className = 'session-error';
    panel.setAttribute('role', 'alert');
    const title = document.createElement('h1');
    title.textContent = 'Não foi possível abrir o sistema';
    const message = document.createElement('p');
    message.textContent = error.message || 'Verifique a conexão e tente novamente.';
    const retry = document.createElement('button');
    retry.textContent = 'Tentar novamente';
    retry.onclick = () => location.reload();
    const back = document.createElement('a');
    back.href = '/login.html';
    back.textContent = 'Voltar ao login';
    panel.append(title, message, retry, back);
    document.body.prepend(panel);
    retry.focus();
  }
})();
