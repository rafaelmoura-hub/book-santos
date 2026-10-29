async function entrar(event) {
    event.preventDefault();
    const mensagem = document.getElementById('mensagem');
    const button = event.target.querySelector('button');
    button.disabled = true;
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
    finally { button.disabled = false; }
}
if (location.protocol === 'file:') {
    document.querySelector('button[type="submit"]').disabled = true;
    document.getElementById('mensagem').textContent = 'Abra pelo servidor: execute npm.cmd start na pasta do projeto e acesse http://127.0.0.1:3000. O arquivo HTML sozinho não conecta ao sistema.';
}
