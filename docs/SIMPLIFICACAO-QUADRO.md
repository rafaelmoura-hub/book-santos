# Navegação e quadro simplificados

O Onboarding contém somente o cadastro de condomínios e apartamentos. Reservas, Projetos e Compras foram retirados do menu, dos seletores de permissões e dos atalhos. O acompanhamento de serviços não possui mais a ação de solicitar compra. Os dados dos processos antigos permanecem no banco e no backup, sem exclusão.

O quadro de serviços, sua lista, agenda, filtros e os indicadores agrupam as etapas em:

| Coluna | Registros incluídos |
| --- | --- |
| Novo | Novos e preventivos ainda não iniciados |
| Andamento | Em andamento, aguardando proprietário, pendente de fornecedor e conferência |
| Recusado | Recusa do proprietário |
| Finalizado | Cards efetivamente finalizados |

Os nomes internos `Recusa proprietário` e `Resolvido` são mantidos para compatibilidade. A interface mostra **Recusado** e **Finalizado**. A conclusão depende do fechamento do card e dos dados obrigatórios. Reabrir um card continua usando a ação existente. O motivo da recusa permanece obrigatório. As etapas antigas registradas no histórico não são reescritas. A migração 18 unifica os status e faz a agenda abrir o formulário normal; veja [Cards e agenda](CARDS-AGENDA.md).

## Ativação

No SQL Editor do Supabase, execute a migração **16**, se ainda não foi aplicada, e depois **17**, nesta ordem:

1. `supabase/migrations/202610290016_onboarding_catalog.sql`
2. `supabase/migrations/202610290017_simplify.sql`

A migração 17 atualiza agrupamentos e filtros globais, bloqueia os processos removidos e retira suas permissões dos perfis. Ela é transacional e pode ser executada novamente. Não apaga cards nem processos. Sem a migração 17, o site continua abrindo e o quadro informa qual migração falta, para não apresentar filtros incompletos.

Testes abrangem as quatro colunas no Chrome, ausência das abas e formulários removidos, cadastro de imóveis, filtragem global, contadores, recusa, bloqueio de conclusão incompleta, preservação de registros e execução repetida das migrações em PostgreSQL isolado.
