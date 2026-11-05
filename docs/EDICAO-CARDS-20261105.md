# Edição de cards e histórico

Aplique a migração 23 atualizada e depois `202611050024_card_edit.sql` no Supabase SQL Editor. Atualize também os arquivos da aplicação.

O botão Editar card permite corrigir título, descrição, urgência e vencimento quantas vezes precisar, inclusive em cards finalizados, recusados e importados. Preserva status, fechamento, anexos e origem. Uma versão desatualizada é recusada; reabra o card para carregar a versão atual. As alterações ficam na auditoria.

Em Condomínios, selecione um condomínio para consultar todos os cards, finalizados ou recusados, com paginação. Não duplica nem move registros. Dados sem condomínio reconhecido continuam aguardando identificação.

A fonte contém 11.950 finalizados, 451 recusados e 197 abertos/em andamento. Aguardando escolha do usuário para classificar esses 197; nenhum status foi alterado automaticamente.
