# BOOK TASK

Menu organizado por rotinas, com grupos expansíveis e permissões preservadas: [mapa da navegação](docs/NAVEGACAO.md). Não requer migração do banco.

Visão geral com apoio à decisão, preventivas trimestrais e mínimos de estoque: [comparação e uso](docs/SAD-REFERENCIAS.md). Os novos indicadores precisam de `supabase/migrations/202610290015_decision.sql` após a 14. O restante da aplicação continua compatível com banco na versão 14. CNPJ informado: **08.941.697/0001-07**; demais dados legais aguardam confirmação.

Revisão de abertura, privacidade, acessibilidade e desempenho: [orientações e pendências](docs/PRIVACIDADE-ACESSIBILIDADE.md). Documentos públicos em `/legal/privacidade`, `/legal/termos`, `/legal/cookies`, `/legal/reembolso`, `/legal/lgpd` e `/legal/empresa`. Sem migração nova. Dados legais da empresa aguardam confirmação; configure `BOOK_COMPANY_NAME`, `BOOK_COMPANY_CNPJ`, `BOOK_COMPANY_ADDRESS` e `BOOK_PRIVACY_EMAIL` no servidor.

Rotina adaptada à demonstração da equipe: Reservas, Onboarding, Projetos, Compras e Danos, com melhorias em Cards, Vistorias, Feedbacks e Avaliações. Veja [análise e uso](docs/ROTINA-BOOK-TESK.md). Esta versão requer as migrações **13 e 14**, em ordem, após a versão 12; não publique o servidor antes de confirmar a versão 14 no banco.

Suporte com contadores e notificações, lembretes em notas, Feedbacks e Avaliações da equipe: veja [ativação e uso](docs/COLABORACAO.md). Esta versão exige `supabase/migrations/202610280013_collaboration.sql` após as migrações anteriores, antes de publicar o servidor.

Permissões por aba, notas privadas, suporte ao mestre e assistente de IA com ações revisáveis: veja [ativação e uso](docs/ABAS-SUPORTE-NOTAS-IA.md). Antes do deploy, aplique em ordem as migrações `202610280010_permissions.sql`, `202610280011_notes_support.sql` e `202610280012_security.sql`. Veja também a [revisão de segurança](docs/SEGURANCA-20261028.md).

Interface simplificada e melhorias de fluidez: veja [visual e desempenho](docs/VISUAL-DESEMPENHO.md). Esta atualização preserva as funções existentes e não exige migração nova do banco.

Backup no HD externo, proteção do catálogo e melhorias de segurança: aplique as migrações `202610230008_backup.sql` e `202610230009_hardening.sql`, nessa ordem, **antes de publicar esta versão**. Veja [como usar o backup](docs/BACKUP.md) e [configuração de segurança e sessões persistidas](docs/MELHORIAS-SEGURANCA.md).

Histórico financeiro por dia, semana, mês ou ano: aplique `202610220006_finance_history.sql` após a migração financeira anterior. Os filtros usam horário de São Paulo e abrangem tanto os cards quanto os totais por responsável.

Financeiro: resumo por responsável pelo pagamento, com valores monetários de duas casas decimais. Ative a migração `202610220005_finance.sql` e consulte [docs/FINANCEIRO.md](docs/FINANCEIRO.md).

Gestão de usuários pelo site e navegação unificada: veja [docs/USUARIOS-NO-SITE.md](docs/USUARIOS-NO-SITE.md). A ativação requer a migração `202610220004_user_management.sql` e, para criar novas contas, `SUPABASE_SECRET_KEY` configurada somente no servidor. As instruções antigas abaixo sobre gestão exclusiva pelo painel foram substituídas por esse fluxo.

## Piloto com publicação

Para testar com três pessoas sem comprar domínio, siga [docs/TESTE-RENDER.md](docs/TESTE-RENDER.md). O `render.yaml` prepara um serviço de testes com URL HTTPS fornecida pelo Render e mantém o Supabase atual.

O pacote de publicação com Docker e HTTPS está em [docs/PUBLICACAO.md](docs/PUBLICACAO.md). Antes de usar esta versão, aplique também `supabase/migrations/202610220003_pilot.sql` após as duas migrações anteriores. Ela adiciona o cadastro de apartamentos e validações no banco; as telas consultam esse cadastro. O pacote ainda precisa ser instalado e validado em uma hospedagem real.

`npm.cmd run check:supabase` agora confere Auth e a versão da migração. `/health` verifica o processo; `/ready` consulta Auth e versão do banco. As instruções antigas abaixo sobre checar somente Auth foram substituídas por esse comportamento.

Sistema de chamados, ordens de serviço, estoque, vistorias e suporte com Supabase Auth, banco e Storage privado. O código da etapa operacional está preparado; é necessário aplicar a migração no Supabase e validar o piloto antes do uso na empresa.

## Ativação

O login do administrador já foi configurado. Para ativar os dados compartilhados, execute no SQL Editor o conteúdo de `supabase/migrations/202610170002_operations.sql`. Veja os passos e permissões em [docs/OPERACAO.md](docs/OPERACAO.md).

Não é necessário recriar o administrador. A migração é repetível e não apaga registros. Contas novas continuam sendo provisionadas no painel do Supabase.

## Executar

Requer Node.js 24.14 ou superior da série 24. Copie `.env.example` para `.env` se ainda não existir. As configurações fornecidas contêm somente a URL e a chave pública do projeto; nunca coloque segredos em arquivos públicos.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd start
```

Abra <http://localhost:3000>. Não use Live Server nem abra o HTML diretamente. Para reiniciar após uma alteração no servidor, Ctrl+C e `npm.cmd start`. `npm.cmd run check:supabase` verifica a conexão com Auth e a versão esperada das migrações. Permissões e fluxos devem ser conferidos também com contas de teste.

No VS Code, pressione **F5** e selecione **BOOK TASK - abrir servidor local**. A tarefa inicia o servidor quando necessário ou reutiliza o que já estiver na porta 3000. O navegador abre `http://127.0.0.1:3000`; a configuração anterior de porta 8080 foi substituída. Se mudar `PORT` no ambiente, ajuste também a URL em `.vscode/launch.json`.

O único pacote de desenvolvimento é PostgreSQL embutido para testes; o servidor não depende dele para iniciar. Os testes usam dados locais e respostas simuladas, sem escrever no projeto Supabase real.

## Organização

- `server/start.js`, `supabase.js`, `supabase-app.js`, `operations.js`: servidor atual, autenticação, API, validação e anexos.
- `assets/`: cliente da API, sessão e sincronização das telas.
- `adm/`, `cliente/`, `hotel/`: interfaces existentes adaptadas ao banco.
- `supabase/migrations/`: estrutura, permissões e função transacional.
- `test/`: testes de SQL, API, sessão e estado das telas.
- `docs/OPERACAO.md`: ativação, acesso por hotel, limites, piloto e operação.

Os arquivos SQLite `server/index.js`, `database.js`, `passwords.js` e `setup.js` foram preservados como implementação anterior e não são usados por `npm start`. Não execute o servidor antigo para usar as telas atuais.

## Pontos ainda pendentes

Não houve implantação nem execução remota do SQL nesta sessão. Backups agendados, alertas na hospedagem, recuperação de senha pela interface, importação dos dados antigos e testes com usuários no Supabase real ainda precisam ser concluídos. Totais e gráficos usam os registros carregados na tela; analítica global para grandes volumes não está implementada.

Os registros antigos do navegador são preservados, com opção de exportação. Antes de importar, é necessário mapear usuários e revisar duplicidades. Para colaborar pelo GitHub, use repositório privado e contas separadas; `.env`, `data/` e `node_modules/` são ignorados pelo Git. Use `npm.cmd ci` após baixar o projeto.

Referências técnicas: [funções transacionais](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [Storage privado](https://supabase.com/docs/guides/storage/security/access-control).
