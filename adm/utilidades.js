/* Tela de administração: leitura das coleções, escape de HTML e formatação de datas e valores. */
const apartamentos = (hotel) => BookStore.apartments(hotel);
const ler = (key) => {
  try {
    const value = JSON.parse(BookStore.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (erro) {
    return [];
  }
};
const chamados = () => ler('chamados');
const osList = () => ler('ordensServico');
const escapar = (value) =>
  String(value || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function formatarData(data) {
  if (!data) return 'Sem data';
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : escapar(data);
}
function dataLocalHoje() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}
function formatarMoeda(valor) {
  return BookMoney.format(valor);
}
