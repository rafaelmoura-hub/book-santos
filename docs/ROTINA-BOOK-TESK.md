# Adaptação da rotina ao BOOK TESK

## Análise da demonstração

Foi analisada visualmente a gravação de aproximadamente nove minutos enviada pela equipe, com quadros, formulários, cards, vínculos e relatórios. A gravação é uma referência de trabalho: não houve acesso à conta Pipefy, importação de registros ou transcrição de áudio. Nomes, contatos e documentos exibidos não foram copiados para os dados de teste ou para o repositório.

O fluxo observado é receber a demanda, identificar apartamento e origem, definir urgência/responsável/prazo, acompanhar pendências, registrar evidências e conferir a conclusão. Os relatórios mostram também a necessidade de organizar a agenda por funcionário, data e etapa.

| Trecho aproximado | Observação | Aplicação no BOOK TESK |
| --- | --- | --- |
| 0:12 e 0:46–0:59 | Serviço passa por Novo, Preventivos, Aguardando proprietário, Em andamento, Fornecedor, Conferência, Resolvido e Recusa; há conferências de comunicação | Aprimoramento de Cards com quadro, agenda, responsável, prazo, origem, prestador, conferências e histórico. O fechamento financeiro continua no card existente. |
| 1:31–1:53 | Vistoria tem apartamento, administrador, tipo, checklist e vínculos com serviços/compras | Mantido o formulário existente; acrescentados acompanhamento e serviço vinculado com pendências e fotos. Próxima vistoria trimestral aparece no resumo. |
| 2:16–2:28 | Reserva passa por coleta, conferência, check-in e autorização, com canal, datas e apartamento | Novo processo Reservas, com conferência documental e bloqueio de sobreposição de períodos no mesmo apartamento. |
| 2:53–3:09 | Feedback tem categorização, andamento, resposta ao cliente e quem resolveu | Aprimoramento da aba Feedbacks já criada, com etapa, resposta, solucionador e histórico; preservado o serviço vinculado. |
| 3:23–3:36 | Projetos têm planejamento, execução, espera, responsável, orçamento e resultados | Novo processo Projetos, com custos previstos/realizados, prazo, resultados e conferências. |
| 4:08–5:05 | Onboarding coleta dados do proprietário e do imóvel, confere acessos/manuais/anúncio e acompanha ativação | Um único processo Onboarding. O quadro antigo identificado como desativado não foi reproduzido. Acessos são conferências, sem campo para armazenar senhas de fechaduras. |
| 5:38–5:55 | Quebras têm item, quantidade, reserva, origem, cobrança, reposição e arquivo | Novo processo Danos e reposições, separado do reparo, podendo gerar serviço vinculado. |
| 6:18 | RH usa avaliação, conversa com gestão, feedback e plano de ação | Planos de desenvolvimento dentro de Avaliações, mantendo a conversa compartilhada existente. Não foi criada outra aba concorrente de comentários. |
| 7:31–8:50 | Relatórios filtram responsável, vencimento e etapa | Quadros/Lista/Agenda com filtros no servidor, Minhas demandas, hoje, semana, vencidas e exportação da página. |

Solicitações de compras aparecem nos atalhos e vínculos da gravação, mas seu formulário não foi detalhado. As etapas Solicitada, Cotação, Aprovação, Comprada, Recebida e Cancelada e seus campos são uma proposta de adaptação para o BOOK TESK, sujeita aos testes da equipe.

## O que foi preservado e reaproveitado

- Nome BOOK TESK, cores azul/branco, navegação e painel lateral de IA, suporte e notas.
- Catálogo único dos 17 condomínios e 126 apartamentos. Não foram criados novos imóveis a partir do vídeo.
- Cards, chamados e vistorias continuam nas tabelas e funções existentes. Novas etapas são acompanhamento; não substituem as regras de fechamento, dinheiro ou consumo de materiais.
- Feedbacks mantém seus registros e vínculo de serviço; Avaliações mantém o chat. Planos da equipe são uma seção dentro da mesma aba.
- Estoque continua único. Compras registra a solicitação e seu recebimento; não cria outro controle de materiais.
- Não houve cópia do layout ou da identidade do Pipefy. Foram aproveitados os conceitos de fluxo observados.

## Como usar

**Cards:** escolha Quadro e agenda de serviços. Os filtros consultam todos os registros autorizados; cada página exibe até 50 cards. Os contadores indicam o total dos filtros, inclusive registros em outras páginas. Use o filtro de etapa para concentrar uma coluna. Lista e Agenda usam os mesmos registros, sem duplicação. Exportar página gera CSV somente da página carregada.

Abra Acompanhar serviço para alterar etapa, administrador, prazo e conferências. A mudança é auditada e confere versões. Resolvido exige o fechamento financeiro normal do card. Um finalizado precisa ser reaberto pela função já existente antes de alterar seu estado. Recusa exige motivo e é uma etapa operacional, sem fabricar um serviço executado ou valor financeiro.

**Vistorias:** cada vistoria registrada tem Acompanhamento e serviço desta vistoria. Ao gerar serviço, as respostas Com problema e as fotos são aproveitadas; pedidos repetidos retornam o vínculo existente. O resumo usa três meses de calendário para a próxima vistoria, ajustando o último dia do mês quando necessário. Isso é uma indicação de prazo, não uma vistoria agendada automaticamente nem uma notificação push.

**Reservas:** registre hóspede/titular, canal, código, apartamento, check-in/check-out, quantidade de hóspedes, contato e conferências. O check-out deve ser posterior ao check-in. Reservas não canceladas não podem ocupar noites sobrepostas no mesmo apartamento; uma saída e uma entrada na mesma data são permitidas. Para Pronta para check-in ou Autorizada, confira os documentos. Este é um controle interno: não consulta disponibilidade nem modifica anúncios ou reservas em Airbnb, Booking ou outros canais.

**Onboarding:** use o apartamento do catálogo, os dados do proprietário, pets/capacidade, enxoval, regras e pendências. O checklist apoia contrato, vistoria inicial, acessos conferidos em local seguro, manual, fotos e anúncio. Informações e conferências são manuais; nenhum anúncio, contrato ou acesso é emitido automaticamente. Para um imóvel ainda fora do catálogo, o cadastro da unidade precisa ser atualizado primeiro.

**Projetos:** podem ser gerais da equipe ou ligados a um apartamento. Registre categoria, início, prazo, orçamento, resultados e conferências. Valores não são lançados automaticamente no Financeiro de serviços. Registros gerais sem condomínio não recebem anexos neste fluxo; para anexar, vincule o projeto a um apartamento.

**Compras:** registre especificação, quantidade, fornecedor, valores e pagador. Pode-se iniciar a solicitação de dentro do acompanhamento de um serviço, aproveitando apartamento e referência. O vínculo só é aceito se o serviço estiver acessível e for do mesmo apartamento. Pedir novamente um serviço de uma compra já vinculada abre o existente.

Receber no estoque exige acesso a Compras e Estoque e uma compra marcada como Comprada ou Recebida. Selecione um material já cadastrado e a quantidade. A entrada é transacional, confere a versão do estoque e não se repete em cliques/requisições repetidas. O recebimento atual registra **uma entrada de material por solicitação**; para vários materiais, separe solicitações ou registre as demais entradas pelo estoque existente. A compra não altera automaticamente preço unitário, pagamento nem o financeiro do serviço.

**Danos e reposições:** registre item/quantidade, apartamento, hóspede/código de reserva quando aplicável, quem informou, decisão de cobrança, valor e evidências. Cobrar é registro de acompanhamento: não envia cobrança nem movimenta dinheiro. Reposição/reparo pode gerar serviço vinculado.

**Avaliações:** além da conversa, abra Planos de desenvolvimento da equipe. Informe funcionário, período, pontos fortes, melhorias, reunião e plano de ação. Os planos são compartilhados com os administradores que têm acesso à aba Avaliações; não são um prontuário confidencial de RH.

Todos os processos novos têm histórico e comentários. Autoria e horário vêm do servidor. A tela de histórico mostra até 50 eventos por página e permite consultar os anteriores. Comentários são preservados. Alterações conflitantes pedem atualização, evitando sobrescrever o trabalho de outra pessoa.

## Acesso, desempenho e backup

As cinco abas novas entram nas permissões do cadastro de administradores. O mestre tem acesso integral; contas que já tinham todas as dez abas anteriores recebem as novas. Contas restritas continuam restritas até liberação explícita. Clientes não acessam esses processos. O banco verifica aba, condomínio e registros relacionados; esconder botões não é a proteção.

Acesso a Projetos gerais e Planos da equipe é definido pela aba, pois não têm condomínio. Demais processos exigem apartamento do catálogo. Responsáveis precisam ter acesso ao tipo de processo e ao condomínio. Anexos usam o Storage privado e os limites já existentes: 20 por registro, 5 MB por arquivo e 10 MB de arquivos novos por gravação.

As novas consultas são paginadas e carregadas ao abrir o módulo. O quadro não baixa fotos completas; arquivos são abertos quando solicitados. Filtros são executados no banco, com atraso curto durante a digitação para evitar consultas por tecla. O refresh do suporte conserva a lista enquanto consulta novas mensagens, reduzindo a oscilação da tela.

O grupo Colaboração do backup inclui processos, acompanhamentos, eventos e vínculos de vistorias, além dos dados já incluídos na migração 13. Selecionar Anexos inclui os arquivos relacionados. Notas privadas de outros usuários continuam dependendo do backup completo do banco.

## Ativação

O servidor desta atualização exige a versão **14** do banco. Após as migrações anteriores até 12:

1. Se ainda não foi aplicada, execute `supabase/migrations/202610280013_collaboration.sql`.
2. Execute `supabase/migrations/202610280014_routine.sql`.
3. Confirme `select public.book_schema_version();` retornando **14**.
4. Execute `npm.cmd run check:supabase`, publique o servidor e entre novamente.

As migrações são transacionais e reaplicáveis. Não importam dados do Pipefy nem apagam os registros existentes. Faça a cópia de segurança antes de atualizar o banco.

## Verificação

Testes cobrem todos os tipos de processo, datas, decimais, permissões, RLS, controle de versão, reservas sobrepostas, conferência documental, responsável/prazo do serviço, comentários, vínculo idempotente de serviços e recebimento único no estoque. CSV neutraliza fórmulas em planilhas. Chrome headless valida as 18 abas, os seis processos, etapas, histórico, anexos e os fluxos anteriores em desktop e celular. O banco de teste, a IA e o HD do navegador são simulados; dados reais e integrações pagas não foram acionados.
