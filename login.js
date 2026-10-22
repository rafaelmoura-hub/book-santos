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
        localStorage.removeItem('usuariosBookSantos');
        localStorage.setItem('usuarioLogado', JSON.stringify(usuario));
        location.href = usuario.funcao === 'adm' ? '/adm/admin.html' : '/cliente/cliente.html';
    } catch (error) { mensagem.textContent = error.message; }
    finally { button.disabled = false; }
}
