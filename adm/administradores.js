/* Tela de administração: lista de usuários em cache e administradores que executam serviços. */
let usuariosCache = [];
const lerUsuarios = () => usuariosCache;
async function atualizarUsuarios() {
  usuariosCache = await BookAPI.request('/api/users');
}
async function mostrarUsuarios(abrirCadastro = false) {
  if (!ehAdministradorMestre) return;
  try {
    if (!window.BookUsers)
      throw new Error(
        'O formulário de usuários não carregou. Atualize a página com Ctrl + Shift + R.',
      );
    if ((await BookUsers.load()) && abrirCadastro) await BookUsers.open();
  } catch (error) {
    document.getElementById('usuariosStatus').textContent = error.message;
  }
}
function usuariosQueFinalizam() {
  return lerUsuarios().filter((usuario) => usuario.funcao === 'adm');
}
