async function entrar(event) {
    event.preventDefault();
    const mensagem = document.getElementById('mensagem');
    const button = event.target.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const logo = document.querySelector('.brand-logo');
    button.disabled = true;
    event.target.setAttribute('aria-busy', 'true');
    logo?.classList.add('login-loading');
    mensagem.textContent = 'Entrando...';
    try {
        const usuario = await BookAPI.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ login: document.getElementById('login').value.trim(), senha: document.getElementById('senha').value })
        });
        // The server cookie is the session; browser storage is optional.
        try { localStorage.removeItem('usuariosBookSantos'); localStorage.removeItem('usuarioLogado'); } catch {}
        location.href = usuario.funcao === 'adm' ? '/adm/admin.html' : '/cliente/cliente.html';
    } catch (error) { mensagem.textContent = error.message; }
    finally {
        logo?.classList.remove('login-loading');
        event.target.setAttribute('aria-busy', 'false');
        button.disabled = false;
    }
}
if (location.protocol === 'file:') {
    document.querySelector('button[type="submit"]').disabled = true;
    document.getElementById('mensagem').textContent = 'Abra pelo servidor: execute npm.cmd start na pasta do projeto e acesse http://127.0.0.1:3000. O arquivo HTML sozinho não conecta ao sistema.';
}
// Keep the password manager field and submission flow intact.
const passwordInput=document.getElementById('senha');
const passwordWrap=document.createElement('div');passwordWrap.className='password-field';
passwordInput.before(passwordWrap);passwordWrap.append(passwordInput);
const revealPassword=document.createElement('button');revealPassword.type='button';revealPassword.className='password-reveal';revealPassword.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';revealPassword.setAttribute('aria-label','Mostrar senha');revealPassword.setAttribute('aria-controls','senha');revealPassword.setAttribute('aria-pressed','false');
revealPassword.onclick=()=>{const show=passwordInput.type==='password';passwordInput.type=show?'text':'password';revealPassword.title=show?'Ocultar senha':'Mostrar senha';revealPassword.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');revealPassword.setAttribute('aria-pressed',String(show));};passwordWrap.append(revealPassword);
