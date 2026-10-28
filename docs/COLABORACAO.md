# Suporte, notificações, lembretes, Feedbacks e Avaliações

## Ativar esta versão

Com o banco já na versão 12, execute no SQL Editor do projeto correto **todo** o arquivo `supabase/migrations/202610280013_collaboration.sql`. Confirme:

```sql
select public.book_schema_version(); -- 13
```

Depois execute `npm.cmd run check:supabase`, publique a versão do servidor e entre novamente. A migração é transacional, repetível e não apaga registros existentes. Uma cópia de segurança anterior à atualização continua recomendada.

Feedbacks e Avaliações entram na seleção de abas do cadastro/edição de administradores. O mestre sempre tem acesso. Administradores que já tinham todas as oito abas anteriores recebem as duas novas; acessos restritos são preservados e precisam de liberação explícita do mestre. Clientes não recebem essas abas.

## Suporte do mestre

A aba mostra totais de chamados, abertos e fechados, calculados no banco sobre todos os chamados, incluindo páginas ainda não carregadas. Há apenas **Aberto** e **Fechado**. O mestre altera o status diretamente na lista ou dentro da conversa; administradores comuns não podem alterá-lo. O filtro de status consulta o banco e a lista tem paginação.

## Notificações do suporte e do chat

O botão **Avisos** guarda os avisos recebidos nesta página e permite solicitar permissão de notificações do navegador. Contadores sinalizam mensagens não lidas no Suporte e no Chat; clientes recebem alertas de respostas do administrador. A leitura de suporte é individual e só é marcada quando a conversa está visível. Uma pessoa não pode marcar a leitura de conversa alheia.

O servidor consulta os registros autorizados, incluindo conversas que não estão carregadas na tela. Atualização em aproximadamente 15 segundos, sujeita à conexão e às restrições de execução em segundo plano do navegador. Sem permissão de notificações do sistema, os avisos internos continuam funcionando.

**O site precisa estar aberto para emitir os avisos.** Este recurso não é web push e não envia alertas com o navegador encerrado ou o dispositivo desligado. Mensagens não lidas permanecem no banco e reaparecem no próximo acesso. A lista de avisos da interface é temporária e pode ser limpa sem marcar conversas como lidas.

## Lembretes em notas

Salve uma nota e use **Lembrete**: marque Ativar, escolha data/hora e Uma vez ou Todos os dias, e clique Salvar lembrete. Há um lembrete por nota, editável e desativável. Cada pessoa só consulta e altera os seus; o mestre não recebe acesso às notas privadas de outras pessoas.

A data/hora é informada no horário do dispositivo e armazenada como instante UTC. Repetições diárias mantêm o horário de São Paulo. Um lembrete vencido enquanto o site estava fechado é mostrado no próximo acesso. A interface confirma o recebimento antes de desativar o aviso único ou reagendar o diário; se a conexão falhar antes dessa confirmação, o lembrete permanece pendente. Repetições atrasadas são agrupadas em um aviso, não em uma sequência de avisos de todos os dias perdidos. Excluir a nota também exclui seu lembrete.

## Feedbacks dos hóspedes

Campos: assunto, condomínio, apartamento do catálogo, grau **Crítico / Razoável / Irrelevante**, observações e anexos opcionais. Até 20 anexos, 5 MB por arquivo e 10 MB de arquivos novos por envio, com prévia e remoção. Feedbacks ficam limitados aos condomínios permitidos ao usuário. Edições usam controle de versão; o condomínio de um feedback existente não é alterado.

A opção **Criar também um card de serviço**, ou o botão **Abrir card de serviço** na lista, exige acesso tanto a Feedbacks quanto a Cards. O serviço recebe assunto, apartamento, observações e anexos, com prioridade Urgente para feedback crítico. O vínculo é gravado em transação e chamadas repetidas retornam o card existente. Se o feedback foi salvo mas a criação do serviço não foi confirmada, a mensagem orienta conferir a lista antes de tentar novamente. Editar o feedback depois não modifica automaticamente o card vinculado.

## Avaliações da equipe

Conversa compartilhada entre administradores com acesso à aba. Pode-se indicar um funcionário no campo Sobre ou comentar sobre a equipe em geral. Todos os participantes autorizados veem os comentários; não são mensagens privadas nem avaliações de hóspedes. Autor, nome e horário são definidos no banco, não pelo corpo da requisição. Mensagens enviadas são preservadas; não há edição nem exclusão pela interface. Há paginação e atualização automática enquanto a conversa recente está visível.

## Backup e testes

O backup recebe um grupo de colaboração, incluindo dados compartilhados e as notas/lembretes do próprio mestre. Anexos dos feedbacks entram na cópia quando selecionados. [Detalhes de privacidade e recuperação](BACKUP.md).

Validação automatizada em PostgreSQL local: migração reaplicável, RLS e bloqueios de acesso, contadores/leitura, lembrete único e diário, confirmação de recebimento, feedback inválido, anexos, vínculo idempotente de serviço e comentários. Testes de API validam autoria, acesso, formatos e limpeza de uploads após falha. Chrome headless testa as 13 abas, foto no feedback, card vinculado, status do suporte, contadores, lembrete diário, avisos, comentários e telas de 390/1440 pixels. Banco, IA e HD são simulados no teste de navegador; não foram feitas chamadas pagas de IA nem gravações em dados reais.
