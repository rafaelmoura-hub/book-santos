/* Shared server-backed state. No operational records are written to localStorage. */
window.BookStore = (() => {
    const keys = ['chamados', 'ordensServico', 'vistorias', 'estoqueBookSantos', 'conversasSuporte'];
    const cache = new Map();
    const pages = new Map();
    const cursors = new Map();
    let user, busy = false, refreshing = false, status, toolbar;
    let apartmentCatalog = [];
    const apartments = hotel => apartmentCatalog.filter(row => row.hotel === hotel).map(row => row.apartment);
    const clone = value => JSON.parse(JSON.stringify(value));
    const notify = () => window.dispatchEvent(new Event('book:data'));
    function message(text, error = false) {
        if (status) { status.textContent = text; status.style.color = error ? '#a61b1b' : '#154b35'; }
    }
    function rows(key) { return cache.get(key) || []; }
    function recordId(key, data) {
        if (key === 'estoqueBookSantos') return 'singleton';
        if (key === 'conversasSuporte') {
            const ticket = rows('chamados').find(row => String(row.id) === String(data.chamadoId));
            if (!ticket) throw new Error('Carregue o chamado antes de abrir a conversa.');
            data.hotel = ticket.data.hotel;
            return `${ticket.owner_id}::${data.chamadoId}`;
        }
        return String(data.id);
    }
    async function refresh(force = false) {
        if (refreshing || busy || !force && (document.hidden || document.querySelector('.modal[style*="block"]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))) return;
        refreshing = true;
        try {
            const result = await BookAPI.request(`/api/snapshot?pages=${encodeURIComponent(JSON.stringify(Object.fromEntries(pages)))}`);
            for (const [key, data] of Object.entries(result)) { cache.set(key, data.loaded); cursors.set(key, data.cursor); }
            message(`Dados sincronizados às ${new Date().toLocaleTimeString('pt-BR')}. Totais e filtros consideram os registros carregados.${[...cursors.values()].some(Boolean) ? ' Há registros anteriores: use Carregar mais.' : ''}`);
        } catch (error) { message(error.message, true); if (force) throw error; }
        finally { refreshing = false; }
        notify();
    }
    function getItem(key) {
        if (!keys.includes(key)) return localStorage.getItem(key);
        if (key === 'estoqueBookSantos') return JSON.stringify({ ...(rows(key)[0]?.data || { colunas: [], itens: [] }), __bookVersion: rows(key)[0]?.version || 0 });
        return JSON.stringify(rows(key).map(row => ({ ...row.data, __bookVersion: row.version })));
    }
    async function setItem(key, serialized) {
        if (!keys.includes(key)) throw new Error('Coleção inválida.');
        if (busy || refreshing) throw new Error('Aguarde a sincronização atual e tente novamente.');
        const parsed = JSON.parse(serialized);
        const data = key === 'estoqueBookSantos' ? [parsed] : parsed;
        const changes = data.map(raw => {
            const { __bookVersion, ...item } = raw;
            const id = recordId(key, item);
            const old = rows(key).find(row => row.id === id);
            return JSON.stringify(old?.data) === JSON.stringify(item) ? null : { collection: key, id, data: item, version: __bookVersion ?? old?.version ?? 0 };
        }).filter(Boolean);
        if (!changes.length) return;
        busy = true;
        message('Salvando no servidor…');
        document.body.setAttribute('aria-busy', 'true');
        const blocker = document.createElement('div');
        blocker.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:wait;background:#ffffff33';
        blocker.setAttribute('aria-label', 'Salvando, aguarde');
        document.body.appendChild(blocker);
        let committed = false;
        try {
            await BookAPI.request('/api/data', { method: 'POST', body: JSON.stringify({ changes }) });
            committed = true;
            // Preserve confirmed records even if the subsequent network refresh fails.
            const next = clone(rows(key));
            for (const change of changes) {
                const index = next.findIndex(row => row.id === change.id);
                const row = { id: change.id, data: change.data, version: change.version + 1, owner_id: next[index]?.owner_id || user.id };
                if (index < 0) next.unshift(row); else next[index] = row;
            }
            cache.set(key, next);
        } catch (error) {
            message(error.message, true);
            alert(error.message);
            throw error;
        } finally {
            busy = false; blocker.remove(); document.body.removeAttribute('aria-busy');
        }
        if (committed) {
            try { await refresh(true); }
            catch { message('Gravação confirmada. Falha ao atualizar a tela; clique em Atualizar antes de editar novamente.', true); }
        }
    }
    async function init(profile) {
        user = profile;
        toolbar = document.createElement('aside');
        toolbar.style.cssText = 'padding:12px;background:#eef5ff;border-bottom:1px solid #b8c9e3;font:14px system-ui;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
        status = document.createElement('span'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        toolbar.appendChild(status);
        const action = (label, fn) => {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.style.cssText = 'padding:8px;cursor:pointer';
            button.onclick = async () => { button.disabled = true; try { await fn(); } catch (error) { message(error.message, true); } finally { button.disabled = false; } };
            toolbar.appendChild(button);
        };
        action('Atualizar', () => refresh(true));
        action('Carregar mais', async () => {
            for (const [key, cursor] of cursors) if (cursor) {
                if ((pages.get(key) || 1) >= 20) throw new Error('Limite de 2000 registros por coleção nesta tela. Consulte o histórico no banco.');
                pages.set(key, (pages.get(key) || 1) + 1);
            }
            await refresh(true);
        });
        action('Exportar dados antigos deste navegador', () => {
            const legacy = Object.fromEntries(keys.map(key => [key, JSON.parse(localStorage.getItem(key) || 'null')]));
            const url = URL.createObjectURL(new Blob([JSON.stringify(legacy, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'book-santos-dados-antigos.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        document.body.prepend(toolbar);
        message('Carregando dados do Supabase…');
        await refresh(true);
        const hotels = await BookAPI.request('/api/access');
        apartmentCatalog = await BookAPI.request('/api/apartments');
        document.querySelectorAll('#hotel option, #osHotel option').forEach(option => { if (option.value && !hotels.includes(option.value)) option.remove(); });
        setInterval(() => refresh(), 15000);
        window.addEventListener('unhandledrejection', event => { event.preventDefault(); message(event.reason?.message || 'Falha na operação.', true); });
    }
    function validateFiles(files) {
        if (files.length > 20 || files.some(file => file.size > 5 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) throw new Error('Use até 20 anexos, com até 5 MB por arquivo e 10 MB no total.');
        const types = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'];
        if (files.some(file => !types.includes(file.type))) throw new Error('Use JPG, PNG, WEBP, GIF, MP4, WEBM ou PDF.');
    }
    function protectActions() {
        for (const name of ['abrirChamado','salvarOS','salvarRascunhoFechamentoOS','salvarFechamentoOS','salvarVistoria','enviarMensagemCliente','enviarMensagemAdmin']) {
            const original = window[name];
            if (typeof original !== 'function') continue;
            let running = false;
            window[name] = async (...args) => {
                args[0]?.preventDefault?.();
                if (running) return;
                running = true;
                const button = args[0]?.target?.querySelector?.('button[type="submit"]');
                if (button) button.disabled = true;
                try { return await original(...args); }
                catch (error) { message(error.message, true); }
                finally { running = false; if (button) button.disabled = false; }
            };
        }
    }
    return { init, getItem, setItem, refresh, validateFiles, protectActions, apartments, id: () => Date.now() * 1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 1000 };
})();
