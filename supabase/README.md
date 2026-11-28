# Book Santos

Sistema de chamados, ordens de serviço, estoque, vistorias e suporte com Supabase Auth, banco e Storage privado. O código da etapa operacional está preparado; é necessário aplicar a migração no Supabase e validar o piloto antes do uso na empresa.

## Ativação

O login do administrador já foi configurado. Para ativar os dados compartilhados, execute no SQL Editor o conteúdo de `supabase/migrations/202610170002_operations.sql`. Veja os passos e permissões em [docs/OPERACAO.md](../docs/OPERACAO.md).

Não é necessário recriar o administrador. A migração é repetível e não apaga registros. Contas novas continuam sendo provisionadas no painel do Supabase.

## Executar

Requer Node.js 24.14 ou superior da série 24. Copie `.env.example` para `.env` se ainda não existir. As configurações fornecidas contêm somente a URL e a chave pública do projeto; nunca coloque segredos em arquivos públicos.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd start
```

Abra <http://localhost:3000>. Não use Live Server nem abra o HTML diretamente. Para reiniciar após uma alteração no servidor, Ctrl+C e `npm.cmd start`. `npm.cmd run check:supabase` verifica a conexão com Auth, sem verificar migrações ou permissões.

O único pacote de desenvolvimento é PostgreSQL embutido para testes; o servidor não depende dele para iniciar. Os testes usam dados locais e respostas simuladas, sem escrever no projeto Supabase real.

## Organização

- `server/start.js`, `supabase.js`, `supabase-app.js`, `operations.js`: servidor atual, autenticação, API, validação e anexos.
- `assets/`: cliente da API, sessão e sincronização das telas.
- `adm/`, `cliente/`, `hotel/`: interfaces existentes adaptadas ao banco.
- `supabase/migrations/`: estrutura, permissões e função transacional.
- `test/`: testes de SQL, API, sessão e estado das telas.
- `docs/OPERACAO.md`: ativação, acesso por hotel, limites, piloto e operação.

## Pontos ainda pendentes

Não houve implantação nem execução remota do SQL nesta sessão. Backups agendados, alertas na hospedagem, recuperação de senha pela interface, importação dos dados antigos e testes com usuários no Supabase real ainda precisam ser concluídos. Totais e gráficos usam os registros carregados na tela; analítica global para grandes volumes não está implementada.

Os registros antigos do navegador são preservados, com opção de exportação. Antes de importar, é necessário mapear usuários e revisar duplicidades. Para colaborar pelo GitHub, use repositório privado e contas separadas; `.env`, `data/` e `node_modules/` são ignorados pelo Git. Use `npm.cmd ci` após baixar o projeto.

Referências técnicas: [funções transacionais](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [Storage privado](https://supabase.com/docs/guides/storage/security/access-control).
