# Indicadores e acompanhamento dos cards

Aplicar no SQL Editor do Supabase, após a migração 18: `supabase/migrations/202610300019_activity.sql`. A versão online mantém compatibilidade com o banco 18; enquanto a migração não for aplicada, apenas os novos indicadores e a remarcação exibem a orientação para atualizar. Cores, urgência e comentários usam os recursos já existentes.

## Visão geral

A seção **Análise por período** oferece início e fim inclusivos, atalhos para dia, semana, mês e ano, agrupamento por dia/semana/mês/ano, urgência e seleção de vários responsáveis. Sem seleção de responsável, considera todos. O condomínio utiliza o filtro existente da visão geral. Os filtros desta seção não mudam os indicadores da situação atual no painel de prioridades.

- Criados: cards com criação registrada na auditoria no intervalo.
- Fechados: cards distintos finalizados ou recusados no intervalo, pela data da mudança de status.
- Vencidos agora: cards ativos com prazo anterior a hoje, independentemente do intervalo escolhido.
- Comentários: mensagens publicadas nos cards no intervalo, aproveitando o histórico existente.
- Prazo alterado sem comentário no dia: cards com alteração de vencimento no intervalo, sem comentário no mesmo card e dia, por qualquer participante. Um comentário posterior no mesmo dia remove esse alerta.
- Postergados: cards distintos cujo prazo passou para uma data posterior no intervalo; prazo preenchido pela primeira vez não conta como adiamento.
- Vistorias: registros pela data informada da execução, com filtro de condomínio e responsável. A urgência não se aplica a vistorias.

Datas de eventos usam São Paulo. O responsável e a urgência dos filtros são os valores atuais do card. Histórico que não estiver registrado não é reconstruído por estimativa. Totais consideram todos os registros autorizados; detalhes exibem até 100 ocorrências por indicador. A distribuição agrupada conta eventos, podendo incluir mais de um fechamento ou adiamento do mesmo card.

## Cards

Ao salvar as informações do serviço ou finalizar o card, a data de fechamento preenchida também passa a ser seu vencimento. Os dois campos são enviados juntos na mesma gravação e aparecem atualizados na lista, nos detalhes e no quadro/agenda. Uma data vazia no rascunho não apaga o vencimento existente.

Na visão geral, **Ver registros** abre uma janela com a lista do indicador. Clicar no título abre os detalhes do card ou carrega a vistoria específica, expandindo seu registro no histórico do apartamento. Falhas de acesso ou de rede aparecem nessa janela, permitindo tentar novamente.

Comentários aparecem nos detalhes, com autor e data, e continuam disponíveis no histórico anterior. São cumulativos e não permitem que outro usuário altere a autoria ou apague o histórico. A paginação carrega atividades anteriores.

**Alterar vencimento** permite informar a nova data e um comentário opcional. Prazo e comentário são gravados na mesma transação, com proteção contra alterações simultâneas. Cards finalizados ou recusados precisam ser reabertos para mudar o prazo. Comentários podem continuar sendo publicados após o fechamento.

Urgência reutiliza a prioridade existente: `Normal → Baixa`, `Alta → Média`, `Urgente → Alta`. Não foi criado um segundo campo nem regravados registros antigos.

Datas na lista, nos detalhes e no quadro/agenda: futuro ou sem prazo em cinza, hoje em laranja, vencido em vermelho, finalizado em verde. Cards recusados não são classificados como vencidos ativos. As cores possuem versões para os temas claro e escuro.

## Verificação

Após remarcar, o card é consultado diretamente no servidor e sua versão confirmada atualiza os detalhes, a lista e o quadro. Uma resposta anterior da sincronização não pode substituir essa versão por outra mais antiga. Registros que deixarem de aparecer no escopo autorizado continuam sendo removidos da tela normalmente.

Testes da API verificam autenticação, permissões, filtros inválidos e entrada de datas. O PostgreSQL isolado executa a migração duas vezes e verifica contagens, remarcações, comentários, conflitos de versão e isolamento por condomínio. O Chrome exercita filtros, publicação de comentários e remarcação, além das verificações existentes de contraste e navegação. Nenhum dado operacional real é alterado por esses testes.
