window.BookAPI = {
    async request(url, options = {}) {
        const { timeoutMs, ...fetchOptions } = options;
        const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
        const signal = timeout && options.signal ? AbortSignal.any([timeout, options.signal]) : timeout || options.signal;
        let response;
        let data;
        try {
            response = await fetch(url, { ...fetchOptions, signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
            data = await response.json();
        } catch (error) {
            if (timeout?.aborted) throw new Error(options.method && options.method !== 'GET' ? 'O servidor demorou a responder. Não foi possível confirmar a gravação; atualize a lista antes de tentar novamente.' : 'O servidor demorou a responder. Tente atualizar novamente.');
            if (response) throw new Error('O servidor retornou uma resposta inesperada. Atualize a página e tente novamente.');
            throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
        }
        if (!response.ok) throw Object.assign(new Error(data?.message || 'Não foi possível concluir a operação.'), { status: response.status });
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
