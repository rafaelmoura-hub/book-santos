# Informações dos apartamentos e cobertura de vistorias

Ativação: execute supabase/migrations/202611050025_apartment_details.sql após as migrações anteriores e publique a aplicação atualizada. Não importar senhas reais para repositórios, arquivos públicos ou dados de demonstração.

Condomínios > apartamento > Informações: senha da fechadura eletrônica, senha do cofre, nome e senha da rede Wi-Fi. Todos opcionais. Salvar mantém zeros iniciais e espaços. Campos de senha ocultos por padrão; botão Mostrar/Ocultar. Para alterar, escolha Editar informações. Uma edição desatualizada é recusada.

Acesso restrito a administradores com aba Condomínios e permissão para o imóvel. A tabela não permite leitura direta pelo cliente: somente a função autenticada autorizada. Auditoria registra autor e versão sem repetir os valores das senhas. Informações não são adicionadas a cards, chats, exportação de vistorias ou armazenamento local.

Onboarding > Remover imóvel da operação: escolha condomínio e apartamento ou condomínio inteiro e confirme. A remoção é arquivamento do catálogo ativo, preservando cards, vistorias, informações e arquivos anteriores. Não apaga usuários nem histórico. Dados arquivados não aparecem no catálogo ativo. Recadastrar o mesmo nome permanece sujeito à regra de duplicidade; restauração ainda não possui botão na interface.

Vistorias: referência trimestral, três meses de calendário após a data mais recente válida. No dia do vencimento ainda está no prazo. Sem registro válido = Sem vistoria. Bolinha vermelha soma vencidos e sem vistoria; verde mostra a quantidade no prazo quando não há pendências. Apartamentos pendentes recebem fundo vermelho suave.

Visão geral das vistorias: totais gerais, filtros por condomínio/situação, tabela paginada de 100 apartamentos e download CSV com todos os resultados filtrados. A consulta considera o banco completo e somente os imóveis ativos autorizados, sem depender dos registros carregados na tela.

A planilha de vistorias e as informações reais ainda não foram recebidas/importadas.
