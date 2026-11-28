# BOOK TASK

Sistema de gestão operacional dos apartamentos da Book Santos: cards de serviço, chamados, vistorias, quebras, estoque, onboarding, financeiro, suporte e avaliações. Substitui a parte operacional que a equipe fazia no Pipefy.

## Como funciona

- **Servidor:** Node.js 24, módulo `http` puro, sem framework e sem etapa de build.
- **Telas:** HTML, CSS e JavaScript puros, carregados direto pelo navegador.
- **Dados e login:** Supabase (Auth, Postgres com RLS e Storage privado). O servidor guarda a sessão em cookie HttpOnly e fala com o Supabase; o navegador nunca recebe a chave secreta.
- **Banco:** a estrutura está em `supabase/migrations/`, numeradas. O servidor confere a versão do banco em `/ready` e os recursos recentes em `/ready/release` (hoje espera a migração 29).

## Rodar na máquina

Requer Node.js 24.14 ou superior da série 24.

```powershell
npm.cmd ci
copy .env.example .env   # só se ainda não existir
npm.cmd test
npm.cmd start
```

Abra <http://localhost:3000>. Não abra os HTML direto nem use Live Server: as telas dependem da API do servidor. No VS Code, **F5** em **BOOK TASK - abrir servidor local** sobe o servidor ou reaproveita o que já estiver na porta.

O `.env.example` traz só a URL e a chave pública do Supabase. A `SUPABASE_SECRET_KEY` (cadastro de usuários pelo site) fica apenas no servidor, nunca em arquivo do repositório.

## Comandos

| Comando | O que faz |
|---|---|
| `npm.cmd start` | Sobe o servidor (`server/start.js`). |
| `npm.cmd test` | Testes automáticos com banco Postgres embutido (PGlite) e respostas simuladas. Não toca no Supabase real. |
| `npm.cmd run test:browser` | Abre as telas no Chrome com dados simulados e confere erros e contraste. Precisa do Chrome instalado (ou `CHROME_BIN`). |
| `npm.cmd run check:supabase` | Confere Auth e versão das migrações no Supabase configurado no `.env`. |
| `npm.cmd run format` | Formata o código com Prettier. |
| `npm.cmd run format:check` | Só confere a formatação, sem alterar nada. |

## Onde fica cada coisa

```
server/
  start.js            entrada: lê a configuração e sobe o servidor
  supabase-app.js     monta o servidor e define a ordem das etapas de cada requisição
  app/                peças comuns: respostas HTTP, cabeçalhos de segurança, autenticação
  routes/             uma rota por assunto: sessão, cards, processos, colaboração,
                      catálogo, dados, financeiro, backup, IA, usuários, páginas públicas
                      e arquivos estáticos
  supabase.js         cliente do Supabase (Auth, banco, Storage)
  operations.js, processes.js, permissions.js, security.js ...
                      validação e regras de negócio usadas pelas rotas
adm/                  tela de administração; admin.js inicia a tela e os demais
                      arquivos trazem cada parte (cards, fechamento, vistorias, chat...)
cliente/              tela do cliente
hotel/                tela de condomínios (só administradores)
assets/               código comum das telas: API, sessão, catálogo, tema, celular
login.html            entrada do sistema
supabase/migrations/  estrutura do banco, em ordem
scripts/              verificações e preparo de importações (planilha, feedbacks, acessos)
test/                 testes automáticos
docs/                 documentação de cada recurso
deploy/, Dockerfile, compose.yaml, render*.yaml
                      publicação (Docker com Caddy, ou Render)
```

Regras ao mexer nas telas: os arquivos de `adm/`, `cliente/` e `hotel/` precisam ter nome só com letras minúsculas (o servidor recusa outros nomes) e entram como `<script>` no HTML da tela. Arquivo novo em `assets/` só é servido depois de entrar na lista permitida em `server/routes/static.js`.

## Mudanças no banco

1. Crie a migração nova em `supabase/migrations/` com o próximo número.
2. Rode `npm.cmd test`: os testes aplicam as migrações num Postgres local.
3. Aplique no Supabase **antes** de publicar o servidor que depende dela.
4. Confira com `npm.cmd run check:supabase` e com `/ready/release` no site publicado.

Nunca edite uma migração que já foi aplicada; crie outra.

## Publicar

- Teste por URL no Render: [docs/TESTE-RENDER.md](docs/TESTE-RENDER.md).
- Servidor próprio com Docker e HTTPS: [docs/PUBLICACAO.md](docs/PUBLICACAO.md).
- Segurança, MFA, recuperação de senha e monitoramento: [docs/SEGURANCA-OPERACAO-20261105.md](docs/SEGURANCA-OPERACAO-20261105.md).

## Documentação por assunto

- Ativação do banco e acesso por condomínio: [OPERACAO](docs/OPERACAO.md)
- Navegação e menu: [NAVEGACAO](docs/NAVEGACAO.md)
- Cards, quadro e agenda: [CARDS-AGENDA](docs/CARDS-AGENDA.md), [EDICAO-CARDS](docs/EDICAO-CARDS-20261105.md), [ETIQUETAS](docs/ETIQUETAS.md), [FILTRO-URGENCIA](docs/FILTRO-URGENCIA.md)
- Vistorias e apartamentos: [IMOVEIS-VISTORIAS](docs/IMOVEIS-VISTORIAS-20261105.md), [DATAS-VISTORIAS](docs/DATAS-VISTORIAS-20261105.md), [CATALOGO](docs/CATALOGO.md), [ONBOARDING-CATALOGO](docs/ONBOARDING-CATALOGO.md)
- Financeiro: [FINANCEIRO](docs/FINANCEIRO.md)
- Usuários e permissões: [USUARIOS-NO-SITE](docs/USUARIOS-NO-SITE.md), [ABAS-SUPORTE-NOTAS-IA](docs/ABAS-SUPORTE-NOTAS-IA.md)
- Suporte e colaboração: [COLABORACAO](docs/COLABORACAO.md)
- Backup: [BACKUP](docs/BACKUP.md)
- Importações: [IMPORTACAO-HISTORICO](docs/IMPORTACAO-HISTORICO.md), [IMPORTACAO-FEEDBACKS](docs/IMPORTACAO-FEEDBACKS.md), [IMPORTACAO-ACESSOS](docs/IMPORTACAO-ACESSOS-20261106.md)
- Privacidade e textos legais: [PRIVACIDADE-ACESSIBILIDADE](docs/PRIVACIDADE-ACESSIBILIDADE.md), [THIRD-PARTY](docs/THIRD-PARTY.md)
- Histórico de versões e migrações exigidas por cada uma: [HISTORICO-VERSOES](docs/HISTORICO-VERSOES.md)

## Cuidados

- `.env`, `data/` e `node_modules/` ficam fora do Git. Não salve exportações ou bases reais dentro do repositório.
- Testes nunca escrevem no Supabase real. Para conferir permissões de verdade, use contas de teste.
