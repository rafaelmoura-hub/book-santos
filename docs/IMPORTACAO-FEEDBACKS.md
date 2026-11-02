# Histórico de feedbacks

O gerador `node scripts/prepare-feedback-import.js source.json pasta-de-saida` aceita linhas normalizadas da planilha de feedbacks. Os dados privados e arquivos gerados ficam em `artifacts/`, fora do GitHub.

Execute `01-PREPARAR-FEEDBACKS.sql` no SQL Editor como proprietário. No Table Editor, importe `02-DADOS-FEEDBACKS.csv` em `book_history_import_stage`. Depois execute `03-CONCLUIR-FEEDBACKS.sql`. Não repita o preparo depois do upload: ele limpa somente a carga do mesmo hash.

Se o painel recusar o CSV por tamanho da consulta, use a pasta `lotes-sql` gerada: execute os arquivos `LOTE-01.sql`, `LOTE-02.sql` e seguintes, um de cada vez no SQL Editor. Cada arquivo tem no máximo 250 KiB. Eles carregam a mesma tabela de estágio; não importe o CSV junto. Cada lote pode ser repetido e verifica que eventuais linhas existentes têm exatamente o mesmo conteúdo. Divergência desfaz o lote inteiro. Não execute o preparo entre os lotes. Depois do último, a contagem precisa corresponder à planilha; execute então `03-CONCLUIR-FEEDBACKS.sql` uma única vez para adicionar os feedbacks. A conclusão também rejeita cargas incompletas e repetidas.

A conclusão é transacional, exige a quantidade completa e rejeita a repetição do mesmo arquivo. Adiciona feedbacks e acompanhamentos sem apagar os registros existentes, sem criar serviços, contas ou anexos. Os IDs são estáveis por arquivo e linha. Títulos iguais não são tratados como duplicatas, pois podem representar avaliações diferentes; uma exportação diferente precisa de conferência antes de importar.

Preserva fase, descrição, resposta, etiquetas, responsável original e todas as células no JSON de origem. Não converte prioridades Alta/Média/Baixa em graus de criticidade. Prioridades conflitantes ficam a conferir; ausentes ficam não informadas. Datas locais são preservadas e o fuso desconhecido é explícito; a coluna técnica usa São Paulo apenas como referência de armazenamento.

Somente UQ confirma Unique Residence. Não se deduz condomínio apenas pelo número do apartamento. Imóveis desconhecidos usam um rótulo sem acesso atribuído: somente a conta mestre pode vê-los, conforme as permissões existentes. Históricos ficam protegidos contra edição e geração de serviço até revisão administrativa dos dados. Novos comentários podem ser adicionados pelo acompanhamento, sem inventar comentários históricos.

Testes: `npm test`. Para validar a planilha completa localmente, defina `BOOK_FEEDBACK_TEST_FILE` com o caminho do JSON privado e execute `node --test test/operations-sql.test.js`.
