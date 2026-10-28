# Permissões, cards, suporte, notas e IA

## Ativação no Supabase

Esta versão requer as migrações anteriores até 9. Antes de publicar o novo servidor:

1. Abra o projeto correto em Supabase → SQL Editor → New query.
2. Execute todo o arquivo `supabase/migrations/202610280010_permissions.sql`.
3. Em uma nova consulta, execute todo o arquivo `supabase/migrations/202610280011_notes_support.sql`.
4. Em uma nova consulta, execute todo o arquivo `supabase/migrations/202610280012_security.sql`.
5. Execute `supabase/migrations/202610280013_collaboration.sql` para ativar notificações, lembretes, Feedbacks e Avaliações.
6. Execute `select public.book_schema_version();`. O resultado deve ser **13**.
7. Publique a nova versão do servidor e entre novamente no site. Veja [as novas funções](COLABORACAO.md).

As migrações são transacionais e podem ser reaplicadas. Não apagam registros anteriores. Preserve o backup habitual antes da atualização. O servidor verifica a versão em `/ready` para evitar publicar funcionalidades sem as tabelas necessárias.

## Abas de administradores

IA, Suporte e Notas abrem um painel lateral à direita. Use os atalhos do topo ou as abas internas para alternar entre as ferramentas. Em telas grandes, o conteúdo do site se ajusta para continuar acessível ao lado do painel; em celulares, o painel ocupa a tela. Feche pelo botão Fechar ou pela tecla Escape. A troca entre ferramentas preserva rascunhos de notas e mensagens; fechar com alterações pendentes pede confirmação. A chave da IA é apagada ao sair do painel da IA. A conexão com o provedor pode ser expandida em “Conexão com a IA”. Essa mudança de interface não requer migração adicional.

O mestre escolhe as abas no cadastro e na edição de usuários quando a função é Administrador. Os administradores já existentes mantêm as abas anteriores por padrão. O mestre mantém acesso integral; Usuários e Backup continuam exclusivos do mestre. Nenhuma aba selecionada deixa apenas os atalhos do topo e a tela de orientação de acesso.

Ocultar menus não é a proteção: API e funções PostgreSQL também conferem as permissões. As telas compartilham alguns dados necessários: por exemplo, Cards consulta estoque para materiais, e Condomínios consulta chamados e cards. Permissão de consulta a esses dados não concede permissão para alterá-los. Os valores de um card continuam presentes nos detalhes do próprio card; a aba Financeiro controla a consulta do relatório financeiro.

## Reabrir cards

Na lista de Cards, troque Finalizada por Em andamento, ou abra os detalhes e clique em **Reabrir card para corrigir**. Informe o motivo. Somente administradores com acesso a Cards e ao condomínio podem reabrir. A operação verifica a versão e registra autor, horário, motivo e versões anterior/nova na auditoria. O fechamento e os anexos são preservados. A reabertura não devolve nem consome materiais; uma alteração posterior no fechamento aplica somente a diferença de consumo.

## Suporte

Administradores têm um atalho Suporte no topo. Cada problema gera um chamado com assunto e conversa. Somente solicitante e mestre podem ler ou responder. O mestre também tem a aba **Suporte**, com os chamados recebidos, e pode fechar ou reabrir a conversa. O solicitante não envia novas mensagens em chamados fechados. A conversa aberta consulta novas mensagens a cada 15 segundos e também oferece Atualizar. As listas oferecem paginação; o limite é de 20 novos chamados/dia por pessoa e 1.000 mensagens por chamado.

O Chat antigo continua atendendo os chamados operacionais dos clientes. O novo suporte trata problemas de utilização do sistema entre administradores e mestre.

## Notas

O ícone de bloco de notas abre notas individuais com título e texto. É possível criar, selecionar, editar e excluir. Cada usuário tem até 200 notas com até 20.000 caracteres cada. O salvamento é explícito: **Salvar nota**. O banco valida proprietário e versão, e o mestre não lê as notas pessoais de outros administradores pela aplicação. Ao descartar alterações, a tela pede confirmação.

Com a migração 13, o grupo Colaboração da aba Backup inclui suporte e as notas/lembretes do próprio mestre. Notas privadas de outros usuários precisam da rotina de backup completo do banco; veja [backup e privacidade](BACKUP.md).

## Chat de IA integrado

O botão IA abre um chat com OpenAI, Gemini ou Claude. Informe a sua **chave de API** e um modelo disponível na conta do provedor. Não é login do ChatGPT/Gemini/Claude e não aproveita automaticamente a assinatura de seus aplicativos. A cobrança é feita pelo provedor na conta da chave informada.

A chave passa pelo servidor somente para a chamada e não é gravada em banco, armazenamento local, logs ou sessão. Ao fechar o painel, o campo da chave é apagado. O provedor recebe o texto digitado, as mensagens recentes, as instruções das ferramentas e os dados consultados conforme o pedido e as permissões da pessoa. Dados de registros e notas são tratados como conteúdo não confiável, não como instruções. A resposta aparece como texto, sem executar HTML. As regras de retenção do próprio provedor continuam aplicáveis.

O chat mantém o histórico apenas enquanto esta página estiver aberta. Use Nova conversa para limpar. São enviados no máximo 19 turnos recentes, com limites de tamanho e até 1.500 tokens de saída por chamada. São permitidos 5 pedidos/minuto por usuário; cada pedido usa até 3 chamadas ao modelo e 10 ferramentas. Os resultados de leitura são limitados e identificam paginação ou conteúdo parcial. Não há repetição automática de chamadas cobradas. Se houver falha após o envio, confira o uso no provedor antes de repetir. O campo Modelo pode ser ajustado se um modelo sair de linha ou não estiver liberado na conta.

### Ações no site

O assistente consulta dados autorizados e prepara operações reais: abrir/editar/finalizar/reabrir cards; abrir e atualizar chamados; enviar mensagens ao cliente; registrar e corrigir vistorias; alterar materiais e colunas do estoque; criar/editar/excluir notas; abrir/responder chamados de suporte; e, exclusivamente para o mestre, criar contas ou alterar permissões de usuários. Também abre as telas do sistema.

Exemplos de pedidos:

- “Abra um card no Be Urban, apartamento 214, para trocar a torneira que está vazando.”
- “Liste os cards em andamento do Unlimited.”
- “Reabra o card 123 para corrigir o responsável pelo pagamento.”
- “Acrescente à minha nota de compras: verificar duas lâmpadas.”
- “Atualize a quantidade do material Parafuso para 30 unidades.”
- “Abra um chamado ao mestre sobre este erro de acesso.”

Toda gravação exige **Confirmar ação** no painel, após revisão dos dados. A IA não executa alterações apenas por escrever que fez algo. A proposta fica vinculada ao usuário e à sessão por 10 minutos; enviar novo pedido invalida propostas anteriores ainda não confirmadas. O servidor guarda os dados preparados e ignora alterações enviadas junto com o botão de confirmação. Permissões são verificadas novamente e o banco aplica as mesmas regras, auditoria, versões e consumo de estoque usados nas telas normais.

Cliques repetidos na mesma proposta não repetem a gravação durante sua validade. Se a execução falhar sem confirmação, o mesmo token não é executado novamente: confira o registro antes de gerar outra proposta. Reiniciar o servidor descarta propostas em memória. A criação de conta gera uma senha inicial no servidor, exibida somente ao mestre após a confirmação; essa senha não vai para o modelo nem para o histórico de IA. Alterações de conta continuam protegendo o mestre.

As alterações de estoque são parciais: materiais não mencionados são preservados. Exclusão de material ou coluna exige ID explícito e confirmação. Valores de fechamento são normalizados pelo sistema, e custos dos materiais são calculados a partir do estoque. Uma mudança detectada no estoque após preparar a proposta exige uma nova revisão; o banco continua sendo a fonte final de validação dos valores e saldos.

O assistente não fabrica fotos, resultados de checklist, dados financeiros nem contas. Se faltar informação real, deve perguntar. Arquivos locais, escolha da pasta no HD e outras interações do navegador continuam dependendo da pessoa. Backup abre a tela existente para escolher conteúdo e destino. Não há execução de JavaScript, comandos de servidor ou SQL livre, nem operações fora das permissões do usuário. As ações implementadas não exigem migração adicional: continuam necessárias as migrações 10 e 11 descritas acima.

Documentação dos adaptadores:

- OpenAI Responses e funções: https://developers.openai.com/api/docs/guides/function-calling
- Gemini generateContent e funções: https://ai.google.dev/gemini-api/docs/function-calling
- Claude Messages e ferramentas: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

Os testes usam respostas simuladas de IA e não fazem chamadas cobradas. Uma chave válida deve ser testada no painel com uma mensagem curta antes de disponibilizar a integração para a equipe.
