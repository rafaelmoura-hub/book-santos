(async () => {
    try {
        const user = await BookAPI.request('/api/session');
        const role = location.pathname.startsWith('/cliente/') ? 'cliente' : 'adm';
        if (user.funcao !== role) { location.replace('/login.html'); return; }
        localStorage.removeItem('usuariosBookSantos');
        localStorage.setItem('usuarioLogado', JSON.stringify(user));
        await new Promise((resolve, reject) => {
            const store = document.createElement('script'); store.src = '../assets/store.js';
            store.onload = resolve; store.onerror = reject; document.body.appendChild(store);
        });
        document.body.hidden = false;
        try { await BookStore.init(user); }
        catch (error) {
            const notice = document.createElement('p'); notice.setAttribute('role', 'alert');
            notice.textContent = `${error.message} Depois de corrigir a configuração no Supabase, recarregue a página.`;
            const retry = document.createElement('button'); retry.textContent = 'Tentar novamente'; retry.onclick = () => location.reload();
            document.body.prepend(notice, retry);
            document.querySelector('main')?.setAttribute('hidden', '');
            return;
        }
        const script = document.createElement('script');
        script.src = document.body.dataset.screen;
        script.onload = () => BookStore.protectActions();
        document.body.hidden = false;
        document.body.appendChild(script);
    } catch { localStorage.removeItem('usuarioLogado'); location.replace('/login.html'); }
})();
