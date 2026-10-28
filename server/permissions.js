const TABS = ['chamados','chat','os','vistorias','condominios','estoque','financeiro','dashboard','feedbacks','avaliacoes'];
const READ = { chamados:['chamados','chat','os','condominios','dashboard'], conversasSuporte:['chat'], ordensServico:['os','vistorias','condominios','financeiro','dashboard','estoque'], vistorias:['vistorias'], estoqueBookSantos:['estoque','os'] };
const WRITE = { chamados:'chamados',conversasSuporte:'chat',ordensServico:'os',vistorias:'vistorias',estoqueBookSantos:'estoque' };
const tabs = user => user.tabs ?? TABS;
const canTab = (user, tab) => user.funcao === 'adm' && (user.mestre || tabs(user).includes(tab));
const canCollection = (user, collection, write = false) => user.funcao === 'adm'
  ? user.mestre || (write ? canTab(user, WRITE[collection]) : (READ[collection] || []).some(tab => canTab(user, tab)))
  : ['chamados','conversasSuporte'].includes(collection);
module.exports = { TABS, canTab, canCollection };
