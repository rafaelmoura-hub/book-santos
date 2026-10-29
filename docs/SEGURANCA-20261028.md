# Revisão de segurança — BOOK TASK

## Alterações

- Servidor exige JSON nas operações de escrita e verifica origem. Cookies em HTTPS usam o prefixo `__Host-`, HttpOnly, Secure e SameSite=Strict. Sessões são limitadas a cinco por pessoa e vinculadas à identidade autenticada; mudança de identidade invalida a sessão.
- Cabeçalhos protegem contra enquadramento e interpretação de arquivos como código. Há limites de conexões, cabeçalhos, tempo de requisição e operações simultâneas por sessão. Prontidão compartilha verificações simultâneas e mantém resultado positivo por dez segundos.
- Downloads e respostas do Supabase têm limites durante a leitura, mesmo sem Content-Length. Chamadas com credenciais recusam redirecionamentos. Conteúdo de tipo desconhecido é entregue como download.
- Metadados têm limite por registro na API e no banco: 128 KiB, ou 512 KiB para estoque. Os arquivos ficam separados no Storage. Registros históricos maiores são preservados; uma edição deve respeitar o limite. Os limites existentes de fotos/anexos não foram ampliados.
- A migração 12 acrescenta políticas restritivas de leitura de perfis e anexos. Administradores recebem perfis necessários ao trabalho; anexos de terceiros precisam estar vinculados a registros acessíveis. Inserir a URL de um arquivo na descrição não concede acesso. Uploads exigem acesso operacional.
- Confirmações da IA passam pela mesma autorização e auditoria das alterações manuais. A versão de estoque revisada é conferida dentro da transação que grava os dados, impedindo mudança de preço entre a conferência e a gravação. A IA continua exigindo revisão e confirmação da proposta.
- O servidor SQLite antigo e seu assistente de configuração recusam execução direta em modo de produção. Use `npm start`, com Supabase.

## Ativação

Após as migrações anteriores até 9, execute no SQL Editor do projeto correto, nesta ordem:

1. `202610280010_permissions.sql`
2. `202610280011_notes_support.sql`
3. `202610280012_security.sql`

Confirme `select public.book_schema_version();` retornando **12**, execute `npm.cmd run check:supabase` e então publique o servidor. Entre novamente: o nome do cookie HTTPS foi alterado. As migrações são transacionais e repetíveis. Mantenha uma cópia de segurança antes de atualizar.

O código local não aplica migrações automaticamente nem muda configurações administrativas de hospedagem/Auth. Sem acesso SQL administrativo, a ativação no banco online depende desses passos. O PR permanece em rascunho até essa ativação.

## Validação e limites da revisão

Os testes automatizados exercitam RLS em PostgreSQL local, anexos inacessíveis por aba, tentativa de vincular arquivo indevido, limites de tamanho, versões de estoque, sessão, origem e JSON obrigatório. O navegador testa os fluxos com Supabase e IA simulados; não faz chamadas de IA pagas nem altera dados reais. A auditoria de dependências é um retrato das vulnerabilidades conhecidas no momento da execução.

Esta revisão não equivale a um teste de invasão da infraestrutura online. Configure HTTPS e as variáveis de produção conforme [publicação](PUBLICACAO.md), mantenha o Node atualizado e teste restauração de banco e fotos. O exportador da interface não substitui uma cópia SQL completa, incluindo notas e suporte. Limites em memória são por processo: múltiplas instâncias exigem controle compartilhado ou proteção na hospedagem. MFA do painel Supabase/GitHub e políticas de Auth precisam ser configurados nessas contas; não foram alterados por este código.

Referências: [OWASP: prevenção de CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Supabase: funções e privilégios](https://supabase.com/docs/guides/database/functions).
