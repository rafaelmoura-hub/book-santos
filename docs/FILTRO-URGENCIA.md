# Filtro por urgência

Execute `supabase/migrations/202611050023_urgency_filter.sql` no SQL Editor do Supabase após a migração 21. A migração preserva os cards e suas prioridades.

O filtro dos cards combina urgência, etiqueta, etapa, condomínio, responsável, prazo e busca. Funciona em quadro, lista e agenda, com totais calculados antes da paginação.

Alta: 🔴⚠️ (valor armazenado Urgente). Média: 🟡⚠️ (Alta). Baixa: 🟢⚠️ (Normal). Não informada: histórico parcial ou prioridade ausente. A escolha continua sendo do administrador.
