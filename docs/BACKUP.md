# Backup no HD externo

## Ativação

Antes de publicar a nova versão no Render, aplique pelo SQL Editor do Supabase, nesta ordem:

1. `supabase/migrations/202610230008_backup.sql`.
2. `supabase/migrations/202610230009_hardening.sql`.

As migrações anteriores, até 007, devem estar aplicadas. As novas migrações são transacionais e podem ser reaplicadas; não apagam registros, fotos ou histórico. A versão nova exige essas funções no banco, e `/ready` falha se estiverem ausentes. Não execute novamente as migrações antigas de piloto ou catálogo para ativar o backup.

## Como usar

Entre como administrador mestre, abra Backup e selecione os grupos de dados. Conecte o HD e clique em Fazer backup e escolher pasta. No seletor do Chrome ou Edge, escolha uma pasta no HD externo. O navegador só consegue escrever depois dessa autorização; o servidor não conhece a letra nem o caminho do HD.

Uma pasta nova recebe `dados.json`, `manifesto.json` e os anexos selecionados, com sua extensão de imagem, vídeo ou PDF. Os nomes originais e os vínculos aos registros continuam nos dados. O manifesto relaciona cada arquivo local à referência original e registra seu tamanho e SHA-256. A tela só informa conclusão depois de terminar e reler os arquivos para conferir a integridade.

O backup inclui todos os registros das categorias selecionadas no banco, sem depender das páginas carregadas na tela. O retrato dos dados é produzido em uma única consulta consistente. Fotos e outros arquivos atuais são copiados depois, individualmente. Se um anexo não puder ser baixado ou gravado, a operação falha e o manifesto fica incompleto. A verificação recusa cópias incompletas, arquivos ausentes ou modificados. A auditoria guarda as referências históricas; arquivos antigos sem vínculo atual, que já tenham sido removidos do Storage, não são recuperados por esse recurso.

O botão Conferir backup existente pede a pasta específica da cópia que contém `manifesto.json`; não a pasta pai com todas as cópias.

## Espaço, frequência e privacidade

Esta versão faz uma cópia completa dos itens selecionados em cada execução. Não é incremental: repetir uma cópia com 100 GB de anexos ocupa aproximadamente mais 100 GB. As estimativas de vários anos de uso do HD discutidas para cópia incremental não se aplicam a múltiplas cópias completas. Planeje a retenção das cópias; o aplicativo não apaga backups anteriores.

A operação é automática após o clique e a escolha da pasta. Não é um agendador diário e não funciona com o computador desligado, o site fechado ou o HD desconectado. Para agendamento sem abrir o site será necessária uma rotina no Windows ou em outro serviço. A permissão não dá acesso remoto permanente ao seu computador.

O HD precisa estar conectado e com espaço suficiente. A pasta é criada somente no destino autorizado. Nenhum dado remoto é apagado pelo backup. O manifesto identifica interrupções, mas os navegadores e sistemas operacionais podem adiar gravações físicas; use a função de ejetar com segurança do Windows antes de desconectar.

As cópias contêm informações privadas e não são cifradas pelo aplicativo. Proteja o HD com controle de acesso e, se possível, criptografia do sistema operacional. Não coloque o backup no GitHub nem em pastas públicas.

## Recuperação

A migração 13 acrescenta a opção **Feedbacks, avaliações, suporte e minhas notas/lembretes**. Ela inclui feedbacks e vínculos a cards, comentários da equipe, chamados e mensagens de suporte, além das notas e lembretes do próprio mestre. Notas privadas de outros usuários continuam fora dessa exportação. Ao selecionar também Anexos, os arquivos dos feedbacks são incluídos. Para preservar todas as notas privadas, mantenha também o backup completo do banco, com acesso restrito aos responsáveis pela infraestrutura.

Esta é uma exportação dos dados e dos arquivos do aplicativo, não um dump SQL completo do Supabase. Não contém senhas, tokens, sessões, políticas de infraestrutura, contas completas de Auth ou chaves do ambiente. As definições das tabelas e regras ficam nas migrações deste repositório.

Não há botão de restauração que sobrescreva o ambiente online. Para recuperar, primeiro confira a integridade, preserve a cópia original, prepare um ambiente separado com as migrações, reconstitua as contas de Auth e seus vínculos de UUID e importe os registros respeitando as chaves e referências. Os anexos devem voltar às referências registradas no manifesto. Em seguida, valide login, permissões, chamados, vistorias e financeiro antes de mudar o ambiente em uso. Esse procedimento exige uma ferramenta de importação e teste supervisionado; a conferência de hashes não é um teste de restauração do aplicativo.

Mantenha também uma estratégia de backup completo do projeto Supabase. Nunca envie credenciais ou senhas junto com os arquivos para pedir ajuda.
