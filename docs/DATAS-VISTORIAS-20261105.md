# Datas e cores das vistorias

Aplique a migração 26 depois da 25. O controle da planilha usa a próxima data informada e marca pendente quando ela é anterior a hoje em São Paulo (a regra G<HOJE da formatação condicional). No dia do vencimento está no prazo.

Sem bolinhas ou contadores nos condomínios. Os apartamentos pendentes continuam com vermelho suave. O resumo geral e o CSV permanecem disponíveis.

Vistorias do imóvel e governança são controles separados. A planilha informa 90 e 45 dias, respectivamente; as datas explícitas não são substituídas por três meses de calendário. Ao registrar uma nova vistoria, escolha o acompanhamento correspondente; um registro posterior passa a valer para aquele acompanhamento. Se qualquer acompanhamento estiver vencido, o apartamento fica pendente.

A importação prepara book_inspection_controls, sem criar registros fictícios em book_records, checklists ou fotos. Datas futuras da origem são preservadas como dados do controle, sem afirmar que a vistoria foi executada.

Use o gerador scripts/prepare-inspection-import.js com o JSON privado extraído da planilha. Os arquivos reais ficam somente em artifacts, fora do Git e da publicação web. Execute o SQL gerado no SQL Editor como proprietário. Ele preserva o controle anterior, aceita repetição e relata imóveis ausentes/arquivados, sem cadastrá-los automaticamente. Após conferir e cadastrar um imóvel pendente, repita a carga.

Nos apartamentos de Condomínios e de Vistorias, o resumo mostra Última vistoria, Próxima vistoria e Situação por acompanhamento, com datas em DD/MM/AAAA. Uma data futura da planilha aparece como Data informada na planilha, preservando a origem sem afirmar uma conclusão futura. Ao salvar uma nova vistoria, a próxima é recalculada pelo intervalo do acompanhamento; datas explícitas anteriores permanecem até haver um registro mais recente. Não exige migração além da 26.
