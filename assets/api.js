window.BookAPI = {
    async request(url, options = {}) {
        let response;
        try {
            response = await fetch(url, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
        } catch { throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'); }
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error(data.message || 'Não foi possível concluir a operação.'), { status: response.status });
        return data;
    },
    async logout() {
        try {
            await this.request('/api/logout', { method: 'POST', body: '{}' });
            localStorage.removeItem('usuarioLogado');
            location.href = '/login.html';
        } catch (error) { alert(error.message); }
    }
};
