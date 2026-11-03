# Etiquetas de cards

Execute `supabase/migrations/202611030021_labels.sql` no SQL Editor do Supabase, depois das migrações 19 e 20. O script pode ser executado novamente. Não substitui os cards existentes.

Na aba Cards, abra **Quadro e agenda dos cards → Gerenciar etiquetas** para criar nomes e escolher cores. No detalhe de um card, use **Editar etiquetas**, marque as desejadas e clique em **Salvar etiquetas**. Administradores com acesso à aba Cards podem criar e aplicar etiquetas, respeitando seus condomínios permitidos.

O filtro **Etiqueta** funciona no quadro, lista e agenda. Na lista inicial, selecionar uma etiqueta abre a lista paginada com todos os cards correspondentes, incluindo registros que não estavam carregados inicialmente. O filtro combina com etapa, condomínio, responsável, busca e prazo.

São permitidas até 200 etiquetas compartilhadas e até 10 por card. Nomes possuem até 40 caracteres e não podem repetir, mesmo com diferença de maiúsculas e minúsculas. Os nomes aparecem junto às cores.

Etiquetar um card não altera seus dados de serviço, status ou versão. Cards finalizados e históricos importados também aceitam etiquetas. Alterações ficam no acompanhamento do card; se outra pessoa alterar as etiquetas durante a edição, reabra o editor antes de salvar. O backup que inclui cards também inclui o catálogo de etiquetas e seus vínculos.

Antes da migração, a edição de etiquetas informa indisponibilidade; os demais recursos continuam funcionando.
