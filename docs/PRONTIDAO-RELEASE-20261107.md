# Verificacao de recursos recentes

Aplique a migracao 29 depois das migracoes anteriores, inclusive 28. Ela cria apenas uma funcao que consulta metadados de estrutura. Nao retorna registros, senhas ou nomes de usuarios e pode ser executada anonimamente pelo monitor.

- `/health`: processo e versao do codigo publicado.
- `/ready`: conexao Auth e compatibilidade basica do banco. O campo `scope: connectivity` deixa explicito esse alcance. Continua sendo o health check de hospedagem durante a atualizacao.
- `/ready/release`: exige o verificador da migracao 29 e a presenca dos recursos recentes de etiquetas, MFA, edicao de cards, informacoes de acesso, controle de vistorias e cobertura do backup. Retorna 503 quando a verificacao estiver ausente ou incompleta. O sucesso recebe `scope: release`.

As verificacoes basica e recente possuem resultados separados, compartilhamento de consultas simultaneas e cache de sucesso de dez segundos. Erros nao sao guardados como sucesso. Isso evita que a verificacao basica aprove indevidamente a recente.

Depois de aplicar o SQL, consulte `/ready/release`. O resultado esperado e `status: ok`, `scope: release`, `release: 29`. Se falhar, confira a ordem das migracoes. Nao reaplique migracoes antigas indiscriminadamente: algumas substituem funcoes novas.

Essa verificacao confirma a estrutura esperada, nao o conteudo das importacoes, o funcionamento de SMTP ou uma restauracao de backup. Os testes reais do roteiro de lancamento continuam necessarios.

A sincronizacao automatica das telas pausa sem internet e em abas ocultas. Ao reconectar ou voltar para a aba, tenta atualizar novamente, respeitando o bloqueio durante edicao. A atualizacao manual continua disponivel e as permissoes permanecem verificadas pelo servidor.
