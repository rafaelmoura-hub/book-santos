# O mesmo card na lista, no quadro e na agenda

A agenda é uma visualização dos registros de `ordensServico`, sem cadastro próprio. **Criar card** usa `formOS` em todas as visualizações. **Abrir card** na agenda carrega o registro e sua versão no estado compartilhado e abre a mesma tela de detalhes. Preencher informações do serviço, anexar fotos, consumir materiais, finalizar e reabrir usam o mesmo `formFechamentoOS` e as validações existentes. Não é criado um segundo card ao mudar de visualização.

As duas telas exibem **Novo, Andamento, Recusado e Finalizado**, inclusive no filtro e no seletor de status dos detalhes. Os códigos internos continuam `Aberta`, `Em andamento`, `Recusada` e `Finalizada` para preservar a compatibilidade com os registros existentes. Recusado exige motivo de 3 a 2000 caracteres. Finalizado exige o fechamento completo; um card finalizado precisa ser reaberto antes de correções. O formulário separado de acompanhamento não edita mais campos de serviço: essa janela serve para histórico e comentários.

## Ativação

Após aplicar as migrações anteriores até a **17**, execute `supabase/migrations/202610290018_card_states.sql` no SQL Editor do Supabase. Ela pode ser executada novamente e não cria cópias dos cards. Normaliza os status antigos para refletir o acompanhamento já existente e sincroniza alterações posteriores com as colunas da agenda. Não altera campos de preenchimento, arquivos, fotos, materiais ou valores. A versão do registro é incrementada nas linhas normalizadas: usuários com uma tela antiga devem atualizar antes de salvar.

A normalização inicial pausa apenas o gatilho de escopo de anexos durante uma transação com bloqueio exclusivo da tabela, executada pelo proprietário do banco. Somente os campos de status e motivo são ajustados; referências de arquivo não são modificadas. O gatilho é reativado na mesma transação e um erro reverte toda a operação. Testes confirmam que referências de anexos sem acesso continuam sendo rejeitadas após a migração.

O salvamento normal sincroniza o estado do mesmo registro com o quadro, com auditoria e controle de versão. A reabertura também atualiza sua coluna. Edições pela função antiga de acompanhamento seguem a mesma regra, evitando divergência entre as telas.

## Validação

O teste de Chrome abre o mesmo card pelas duas visualizações, confere os quatro rótulos, abre o fechamento original e altera a recusa e o andamento. Os testes de PostgreSQL verificam migração repetida, preservação dos anexos, motivo obrigatório, bloqueio de fechamento incompleto, sincronização entre registro e coluna, reabertura e manutenção da proteção dos arquivos. Todos os testes usam dados isolados; a migração no Supabase online é aplicada pelo responsável pelo projeto.
