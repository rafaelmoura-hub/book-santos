/* Shared server-backed state. No operational records are written to localStorage. */
window.BookStore = (() => {
    const keys = ['chamados', 'ordensServico', 'vistorias', 'estoqueBookSantos', 'conversasSuporte'];
    const cache = new Map();
    const pages = new Map();
    const cursors = new Map();
    let user, busy = false, refreshing = false, status, toolbar, moreButton;
    let apartmentCatalog = [];
    let totals = null, activeCollections = keys;
    const attachmentFields = new Map();
    function setupAttachments() {
        document.querySelectorAll('input[type="file"]').forEach(input => {
            if(attachmentFields.has(input))return;
            const list = document.createElement('div');
            list.className = 'attachment-list'; list.setAttribute('aria-live', 'polite');
            input.closest('label')?.insertAdjacentElement('afterend', list) || input.insertAdjacentElement('afterend', list);
            let urls = [];
            const render = () => {
                urls.forEach(url => URL.revokeObjectURL(url)); urls = []; list.replaceChildren();
                [...input.files].forEach((file, index) => {
                    const row = document.createElement('div'); row.className = 'attachment-row';
                    const info = document.createElement('div');
                    const name = document.createElement('strong'); name.textContent = file.name;
                    const state = document.createElement('small'); state.className = 'attachment-state';
                    state.textContent = `${(file.size / 1024 / 1024).toLocaleString('pt-BR', {maximumFractionDigits: 2})} MB · Selecionado para envio`;
                    const progress = document.createElement('progress'); progress.hidden = true;
                    progress.setAttribute('aria-label', `Enviando ${file.name}`);
                    info.append(name, state, progress);
                    if (file.type.startsWith('image/')) {
                        const img = document.createElement('img'); img.alt = `Prévia de ${file.name}`;
                        const url = URL.createObjectURL(file); urls.push(url); img.src = url;
                        row.append(img);
                    }
                    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'attachment-remove'; remove.textContent = 'Remover';
                    remove.setAttribute('aria-label', `Remover ${file.name}`);
                    remove.addEventListener('click', event => {
                        event.preventDefault(); event.stopPropagation(); if (busy) return;
                        const selection = new DataTransfer();
                        [...input.files].forEach((item, position) => { if (position !== index) selection.items.add(item); });
                        input.files = selection.files; input.dispatchEvent(new Event('change', {bubbles: true}));
                    });
                    row.append(info, remove); list.append(row);
                });
            };
            input.addEventListener('change', render);
            input.form?.addEventListener('reset', () => setTimeout(render, 0));
            attachmentFields.set(input, list);
        });
    }
    function attachmentStatus(key, text, sending) {
        const ids = { chamados: ['arquivo'], ordensServico: ['osAnexos', 'fechamentoFotos'], vistorias: ['vistoriaFotos'] };
        for (const [input, list] of attachmentFields) {
            if (!ids[key]?.includes(input.id)) continue;
            list.dataset.sending = String(sending);
            list.querySelectorAll('.attachment-state').forEach(label => { label.textContent = text; });
            list.querySelectorAll('progress').forEach(progress => { progress.hidden = !sending; });
            list.querySelectorAll('button').forEach(button => { button.disabled = sending; });
        }
    }
    function activate(tab) {
        if(['onboarding','danos'].includes(tab)){activeCollections=[];return;}
        const groups = { chamados: ['chamados'], chat: ['chamados','conversasSuporte'], os: ['ordensServico','chamados','estoqueBookSantos'], vistorias: ['vistorias','ordensServico'], condominios: ['chamados','ordensServico'], estoque: ['estoqueBookSantos','ordensServico'], dashboard: [], dashboardCharts:['chamados','ordensServico'], financeiro: [], usuarios: [], backup: [], feedbacks:[],avaliacoes:[],suporte:[],inicio:[] };
        activeCollections = groups[tab] || keys;
    }
    const apartments = hotel => apartmentCatalog.filter(row => row.hotel === hotel).map(row => row.apartment).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    function applyCatalog(hotels,catalog){
        const compare=(a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'});
        apartmentCatalog=catalog;
        BookCatalog.hotels=[...new Set(hotels)].sort(compare);
        BookCatalog.apartments=Object.fromEntries(BookCatalog.hotels.map(h=>[h,apartments(h)]));
        document.querySelectorAll('.hoteis,.hoteis-vistoria').forEach(list=>{
            const inspection=list.classList.contains('hoteis-vistoria');list.replaceChildren();
            for(const hotel of BookCatalog.hotels){
                const card=document.createElement(inspection?'button':'article');card.className=inspection?'hotel-vistoria':'hotel';card.dataset.hotel=hotel;
                if(inspection)card.type='button';else{card.tabIndex=0;card.setAttribute('role','button');}
                const title=document.createElement(inspection?'strong':'h2');title.textContent=hotel;card.append(title);
                if(!inspection){const count=document.createElement('p'),n=apartments(hotel).length;count.textContent=n+' '+(n===1?'apartamento':'apartamentos');card.append(count);}
                const total=document.createElement(inspection?'span':'p');total.id=(inspection?'totalVistorias':'total')+hotel;total.textContent=inspection?'0 vistorias':'0 chamados';card.append(total);
                const open=()=>inspection?window.selecionarHotelVistoria(hotel):window.BookCondominios?BookCondominios.mostrarHistorico(hotel):window.mostrarHistorico(hotel);
                card.onclick=open;if(!inspection)card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};list.append(card);
            }
        });
        document.querySelectorAll('#hotel,#osHotel,#feedbackHotel,#processHotel,#decisionHotel,select[id^="routine-"][id$="-hotel"],#onboardingExisting').forEach(select=>{
            const value=select.value,placeholder=select.options[0]?.textContent||'Selecione';select.replaceChildren(new Option(placeholder,''));
            for(const hotel of BookCatalog.hotels)select.append(new Option(hotel,hotel));select.value=value;
        });
        const fieldset=document.querySelector('#formUsuario .usuario-hoteis');
        if(fieldset){const selected=new Set([...fieldset.querySelectorAll('input:checked')].map(input=>input.id));fieldset.querySelectorAll('label').forEach(label=>label.remove());for(const hotel of BookCatalog.hotels){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='usuario'+hotel;input.checked=selected.has(input.id);label.append(input,document.createTextNode(' '+hotel));fieldset.append(label);}}
    }
    async function refreshCatalog(){
        const [hotels,catalog]=await Promise.all([BookAPI.request('/api/access'),BookAPI.request('/api/apartments')]);
        applyCatalog(hotels,catalog);window.dispatchEvent(new Event('book:catalog'));notify();
    }
    const clone = value => JSON.parse(JSON.stringify(value));
    const notify = () => window.dispatchEvent(new Event('book:data'));
    function message(text, error = false) {
        if (status) {
            status.textContent = error ? text : /^(Salvando|Carregando)/.test(text) ? text.replace(/no servidor.*/, '…') : 'Atualizado';
            status.title = text;
            status.setAttribute('data-state', error ? 'error' : 'ok');
        }
    }
    function rows(key) { return cache.get(key) || []; }
    function includeRecord(key,row){
        if(!keys.includes(key)||!row||typeof row.id!=='string'||!row.data||!Number.isSafeInteger(Number(row.version)))throw new Error('Registro inválido.');
        const current=rows(key),index=current.findIndex(item=>item.id===row.id),next=[...current];if(index<0)next.push(row);else next[index]=row;cache.set(key,next);
    }
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
        if (!force && !activeCollections.length) return;
        if (refreshing || busy || !force && (document.hidden || document.querySelector('.modal[style*="block"],dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))) return;
        refreshing = true;
        let changed = false;
        try {
            const filter = force ? '' : `&collections=${encodeURIComponent(JSON.stringify(activeCollections))}`;
            const result = await BookAPI.request(`/api/snapshot?pages=${encodeURIComponent(JSON.stringify(Object.fromEntries(pages)))}${filter}`, { timeoutMs: 30000 });
            for (const [key, data] of Object.entries(result)) {
                if (key === '__counts') { if (JSON.stringify(totals) !== JSON.stringify(data)) changed = true; totals = data; continue; }
                const previous = cache.get(key);
                const different = force || !previous || previous.length !== data.loaded.length || cursors.get(key) !== data.cursor || data.loaded.some((row, index) => row.id !== previous[index]?.id || row.version !== previous[index]?.version || row.updated_at !== previous[index]?.updated_at);
                if (different) { cache.set(key, data.loaded); cursors.set(key, data.cursor); changed = true; }
            }
            if (moreButton) moreButton.hidden = ![...cursors.values()].some(Boolean);
            message(`Atualizado às ${new Date().toLocaleTimeString('pt-BR')}. Filtros e gráficos usam os registros carregados.${[...cursors.values()].some(Boolean) ? ' Use Carregar mais para consultar registros anteriores.' : ''}`);
        } catch (error) { message(error.message, true); if (force) throw error; }
        finally { refreshing = false; }
        if (changed) notify();
    }
    function getItem(key) {
        if (key === 'usuarioLogado') return JSON.stringify(user || null);
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
        attachmentStatus(key, 'Enviando arquivos… Aguarde a confirmação.', true);
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
            attachmentStatus(key, 'Envio confirmado.', false);
            // Preserve confirmed records even if the subsequent network refresh fails.
            const next = clone(rows(key));
            for (const change of changes) {
                const index = next.findIndex(row => row.id === change.id);
                const row = { id: change.id, data: change.data, version: change.version + 1, owner_id: next[index]?.owner_id || user.id };
                if (index < 0) next.unshift(row); else next[index] = row;
            }
            cache.set(key, next);
        } catch (error) {
            attachmentStatus(key, 'Envio não confirmado. Confira a mensagem e tente novamente.', false);
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
        setupAttachments();
        user = profile;
        if (profile.funcao === 'cliente') activeCollections = ['chamados', 'conversasSuporte'];
        toolbar = document.createElement('aside');
        toolbar.className = 'sync-toolbar';
        status = document.createElement('span'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        toolbar.appendChild(status);
        const action = (label, fn) => {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.onclick = async () => { button.disabled = true; try { await fn(); } catch (error) { message(error.message, true); } finally { button.disabled = false; } };
            toolbar.appendChild(button);
            return button;
        };
        action('Atualizar', () => refresh(true));
        moreButton = action('Carregar mais', async () => {
            for (const [key, cursor] of cursors) if (cursor) {
                if ((pages.get(key) || 1) >= 20) throw new Error('Limite de 2000 registros por coleção nesta tela. Consulte o histórico no banco.');
                pages.set(key, (pages.get(key) || 1) + 1);
            }
            await refresh(true);
        });
        const exportButton = action('Exportar dados antigos deste navegador', () => {
            const legacy = Object.fromEntries(keys.map(key => [key, JSON.parse(localStorage.getItem(key) || 'null')]));
            const url = URL.createObjectURL(new Blob([JSON.stringify(legacy, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'book-santos-dados-antigos.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        const tools = document.createElement('details'); tools.className = 'sync-tools';
        const summary = document.createElement('summary'); summary.textContent = 'Opções';
        tools.appendChild(summary); tools.appendChild(exportButton);
        const help = document.createElement('p'); help.textContent = 'Filtros e gráficos usam os registros carregados. Use Carregar mais para consultar o histórico anterior.'; tools.appendChild(help);
        toolbar.appendChild(tools);
        document.body.prepend(toolbar);
        message('Carregando dados do Supabase…');
        const [, hotels, catalog] = await Promise.all([refresh(true), BookAPI.request('/api/access'), BookAPI.request('/api/apartments')]);
        applyCatalog(hotels,catalog);
        document.querySelectorAll('[data-hotel]').forEach(card => { card.hidden = !hotels.includes(card.dataset.hotel); });
        document.querySelectorAll('#hotel option, #osHotel option').forEach(option => { if (option.value && !hotels.includes(option.value)) option.remove(); });
        const compare = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
        document.querySelectorAll('.hoteis, .hoteis-vistoria').forEach(list => {
            [...list.querySelectorAll('[data-hotel]')].sort((a, b) => compare(a.dataset.hotel, b.dataset.hotel)).forEach(card => list.appendChild(card));
        });
        document.querySelectorAll('#hotel, #osHotel').forEach(select => {
            [...select.options].filter(option => option.value).sort((a, b) => compare(a.textContent, b.textContent)).forEach(option => select.appendChild(option));
        });
        setInterval(() => refresh(), 15000);
        document.addEventListener?.('visibilitychange', () => { if (!document.hidden) refresh(); });
        window.addEventListener('unhandledrejection', event => { event.preventDefault(); message(event.reason?.message || 'Falha na operação.', true); });
    }
    function validateFiles(files) {
        if (files.length > 20 || files.some(file => file.size > 5 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) throw new Error('Use até 20 anexos, com até 5 MB por arquivo e 10 MB no total.');
        const types = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'];
        if (files.some(file => !types.includes(file.type))) throw new Error('Use JPG, PNG, WEBP, GIF, MP4, WEBM ou PDF.');
    }
    function protectActions() {
        for (const name of ['abrirChamado','alterarStatusOS','salvarOS','salvarRascunhoFechamentoOS','salvarFechamentoOS','salvarVistoria','enviarMensagemCliente','enviarMensagemAdmin']) {
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
    return { init, getItem, setItem, refresh, refreshCatalog, validateFiles, protectActions, apartments, activate, setupAttachments, includeRecord, totals: () => totals, id: () => Date.now() * 1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 1000 };
})();
