# Permissões, cards, suporte, notas e IA

## Ativação no Supabase

Esta versão requer as migrações anteriores até 9. Antes de publicar o novo servidor:

1. Abra o projeto correto em Supabase → SQL Editor → New query.
2. Execute todo o arquivo `supabase/migrations/202610280010_permissions.sql`.
3. Em uma nova consulta, execute todo o arquivo `supabase/migrations/202610280011_notes_support.sql`.
4. Execute `select public.book_schema_version();`. O resultado deve ser **11**.
5. Publique a nova versão do servidor e entre novamente no site.

As migrações são transacionais e podem ser reaplicadas. Não apagam registros anteriores. Preserve o backup habitual antes da atualização. O servidor verifica a versão em `/ready` para evitar publicar funcionalidades sem as tabelas necessárias.

## Abas de administradores

O mestre escolhe as abas no cadastro e na edição de usuários quando a função é Administrador. Os administradores já existentes mantêm as abas anteriores por padrão. O mestre mantém acesso integral; Usuários e Backup continuam exclusivos do mestre. Nenhuma aba selecionada deixa apenas os atalhos do topo e a tela de orientação de acesso.

Ocultar menus não é a proteção: API e funções PostgreSQL também conferem as permissões. As telas compartilham alguns dados necessários: por exemplo, Cards consulta estoque para materiais, e Condomínios consulta chamados e cards. Permissão de consulta a esses dados não concede permissão para alterá-los. Os valores de um card continuam presentes nos detalhes do próprio card; a aba Financeiro controla a consulta do relatório financeiro.

## Reabrir cards

Na lista de Cards, troque Finalizada por Em andamento, ou abra os detalhes e clique em **Reabrir card para corrigir**. Informe o motivo. Somente administradores com acesso a Cards e ao condomínio podem reabrir. A operação verifica a versão e registra autor, horário, motivo e versões anterior/nova na auditoria. O fechamento e os anexos são preservados. A reabertura não devolve nem consome materiais; uma alteração posterior no fechamento aplica somente a diferença de consumo.

## Suporte

Administradores têm um atalho Suporte no topo. Cada problema gera um chamado com assunto e conversa. Somente solicitante e mestre podem ler ou responder. O mestre também tem a aba **Suporte**, com os chamados recebidos, e pode fechar ou reabrir a conversa. O solicitante não envia novas mensagens em chamados fechados. A conversa aberta consulta novas mensagens a cada 15 segundos e também oferece Atualizar. As listas oferecem paginação; o limite é de 20 novos chamados/dia por pessoa e 1.000 mensagens por chamado.

O Chat antigo continua atendendo os chamados operacionais dos clientes. O novo suporte trata problemas de utilização do sistema entre administradores e mestre.

## Notas

O ícone de bloco de notas abre notas individuais com título e texto. É possível criar, selecionar, editar e excluir. Cada usuário tem até 200 notas com até 20.000 caracteres cada. O salvamento é explícito: **Salvar nota**. O banco valida proprietário e versão, e o mestre não lê as notas pessoais de outros administradores pela aplicação. Ao descartar alterações, a tela pede confirmação.

As tabelas novas precisam fazer parte da rotina de backup completo do banco. O exportador antigo da aba Backup não inclui as tabelas de notas e suporte; não use apenas esse exportador como backup desses novos recursos.

## Chat de IA integrado

O botão IA abre um chat com OpenAI, Gemini ou Claude. Informe a sua **chave de API** e um modelo disponível na conta do provedor. Não é login do ChatGPT/Gemini/Claude e não aproveita automaticamente a assinatura de seus aplicativos. A cobrança é feita pelo provedor na conta da chave informada.

A chave passa pelo servidor somente para a chamada e não é gravada em banco, armazenamento local, logs ou sessão. Ao fechar o painel, o campo da chave é apagado. Somente o texto digitado e as mensagens recentes desse chat são enviados ao provedor: nenhum cadastro, condomínio, nota ou registro é anexado automaticamente. Sem ferramentas de alteração do sistema. A resposta aparece como texto, sem executar HTML. As regras de retenção do próprio provedor continuam aplicáveis.

O chat mantém o histórico apenas enquanto esta página estiver aberta. Use Nova conversa para limpar. São enviados no máximo 19 turnos recentes, com limites de tamanho, até 1.500 tokens de saída e 5 chamadas/minuto por usuário. Não há repetição automática de chamadas cobradas. Se houver falha após o envio, confira o uso no provedor antes de repetir. O campo Modelo pode ser ajustado se um modelo sair de linha ou não estiver liberado na conta.

Documentação dos adaptadores:

- OpenAI Responses: https://developers.openai.com/api/docs/guides/text
- Gemini generateContent: https://ai.google.dev/api/generate-content
- Claude Messages: https://platform.claude.com/docs/en/build-with-claude/working-with-messages

Os testes usam respostas simuladas de IA e não fazem chamadas cobradas. Uma chave válida deve ser testada no painel com uma mensagem curta antes de disponibilizar a integração para a equipe.
