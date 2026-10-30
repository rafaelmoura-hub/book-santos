# Histórico parcial da planilha

O relatório aprovado contém título, fase, criador e criação. A importação preserva esses valores, sem deduplicar títulos: não existem IDs de origem para distinguir demandas iguais. A linha da planilha e o SHA-256 identificam cada registro. Não são criadas contas de usuários com os nomes dos criadores.

Estados: Novo → Novo; Resolvido → Finalizado; Recusa Proprietário ou Cancelado → Recusado; demais fases conhecidas → Andamento. A fase original fica nos detalhes.

Sem condomínio identificado, os registros ficam visíveis somente ao mestre, marcados como histórico parcial. Não é permitido reabrir, finalizar ou remarcar até a conferência dos imóveis. Comentários novos podem ser adicionados. Não são criados vencimentos, custos, urgências, anexos nem datas de conclusão.

Regra confirmada pelo usuário: número no início do título → apartamento; sigla UQ → Unique Residence. Também são reconhecidos o prefixo “Apto.” e o formato “UQ 1001”. O título original não é modificado. Outras siglas não são adivinhadas e apartamentos históricos não são adicionados automaticamente ao catálogo atual. Com condomínio identificado, o acesso segue as permissões desse condomínio; sem identificação, continua restrito ao mestre.

O gerador também cria `ATUALIZAR-IMOVEIS.sql`, para o caso de a primeira importação já ter sido executada. Esse ajuste faz uma cópia protegida dos registros, altera apenas hotel/apartamento e metadados de classificação e preserva IDs, comentários, datas e estados. Pode ser repetido sem duplicar registros nem incrementar versões quando não houver mudanças. Associações já existentes não são apagadas quando a regra não identifica outro condomínio.

A visão geral conta criações pela data original da planilha. A carga não aparece como milhares de criações/conclusões de hoje. O fuso da exportação não foi informado: o texto original é preservado e a data civil é usada nos agrupamentos. Histórico parcial fica fora das somas financeiras.

## Execução

Os dados ficam somente em `artifacts/`, ignorado pelo Git. Não publicar o SQL preenchido, JSON ou a planilha no repositório. O gerador público aceita o JSON normalizado e produz SQL de importação e restauração:

```
node scripts/prepare-history-import.js artifacts/pipefy-import-12598/source.json artifacts/pipefy-import-12598/IMPORTAR-HISTORICO.sql
```

Executar o arquivo gerado como proprietário no SQL Editor do Supabase, com esquema 19. O SQL faz backup protegido em `book_history_import_backups`, substitui somente `ordensServico` e seus históricos, remove vínculos com os cards anteriores e valida a contagem na mesma transação. Preserva usuários, catálogo, estoque, vistorias, chamados de clientes e arquivos. Os arquivos físicos antigos não são apagados; o backup guarda suas referências, sem duplicar os binários.

As validações operacionais de apartamento e sincronização de fase são pausadas somente durante a inserção sob trava de manutenção. As fases são construídas em lote com os mesmos quatro estados, e os gatilhos são reativados antes do commit. Falhas provocam rollback. Não executar novamente a mesma fonte: o hash bloqueia substituições repetidas.

`RESTAURAR-CARDS-ANTERIORES.sql` restaura a cópia anterior. A restauração é bloqueada se houver novos cards, comentários ou alterações de vínculos que poderiam ser perdidos. O backup não fica acessível a clientes nem administradores comuns.

## Validação

Os testes verificam importação, mapeamento de fases, caracteres SQL, backup, restauração, repetição, permissões, financeiro e preservação das demais coleções. A variável local `BOOK_HISTORY_TEST_FILE` permite testar o arquivo completo em PostgreSQL descartável, incluindo acesso à última página. Esse teste não altera o Supabase online.
