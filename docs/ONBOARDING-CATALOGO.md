# Onboarding e catálogo de imóveis

O Onboarding passa a cadastrar novos condomínios e apartamentos. Os dados são salvos no Supabase e reutilizados pela aba Condomínios, cards, vistorias, feedbacks, reservas e permissões de usuários. Não cria uma segunda lista de imóveis.

## Como usar

- Novo condomínio: informe o nome e, opcionalmente, seus apartamentos.
- Apartamentos em condomínio existente: selecione um condomínio autorizado e informe as novas unidades.
- Separe os apartamentos por vírgula, ponto e vírgula ou linha. Até 100 por envio; letras são convertidas para maiúsculas. Exemplo: `101, 102, 194A`.
- A confirmação atualiza as listas da sessão sem precisar recarregar. Outras sessões recebem o catálogo atualizado ao recarregar o site.

Nomes usam letras, números, espaços, ponto, hífen, sublinhado e parênteses, de 2 a 100 caracteres. Apartamentos usam letras, números e hífen, até 16 caracteres. Não há coleta de novos dados pessoais neste cadastro.

Um condomínio novo fica autorizado para o administrador que o criou e para o mestre. O mestre pode liberar outros usuários na aba Usuários. Ter acesso ao Onboarding não permite adicionar unidades aos condomínios de outras pessoas. O banco verifica a aba e o acesso, mesmo em chamadas diretas às funções SQL.

Não há exclusão ou renomeação neste fluxo. Se um apartamento do lote já existir, nenhum apartamento daquele envio é inserido. Nomes de condomínios repetidos, inclusive variando maiúsculas/minúsculas, são recusados. Os registros anteriores do Onboarding continuam disponíveis em **Histórico de integrações**, na mesma aba.

## Banco e publicação

Execute `supabase/migrations/202610290016_onboarding_catalog.sql` no SQL Editor do Supabase, após a migração 15. A migração preserva apartamentos, registros e permissões existentes, troca a lista fixa por um cadastro com integridade referencial e registra auditoria de inclusão. Os backups com **Cadastros** incluem também condomínios sem unidades e a auditoria do catálogo.

A versão anterior do banco continua permitindo abrir o site. Antes da migração 16, o novo cadastro informa a migração necessária e não simula um salvamento. Não é necessário alterar chaves ou variáveis do Render.

## Validação

Testes de API, validação e PostgreSQL isolado: acesso por aba e condomínio, duplicatas, reversão integral de lote, leitura restrita, migração repetida, criação de cards e liberação de usuário para um condomínio novo. O teste de Chrome usa dados simulados para cadastrar condomínio e unidade e conferir as listas de Condomínios, vistorias, cards e permissões. A aplicação no Supabase real depende de executar a migração acima.
