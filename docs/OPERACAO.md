# Ativar os dados compartilhados

Atualização: a aplicação foi publicada no Render. Para cadastrar usuários pelo próprio site e editar suas funções/hotéis, siga [USUARIOS-NO-SITE.md](USUARIOS-NO-SITE.md). O procedimento administrativo abaixo permanece como alternativa de provisionamento manual.

Esta etapa está preparada no código e foi testada localmente. O SQL ainda precisa ser executado no seu projeto Supabase. A conexão MCP administrativa não está disponível nesta sessão.

## Para Rafael

1. Abra o SQL Editor do projeto Supabase.
2. Copie **todo** o conteúdo de `supabase/migrations/202610170002_operations.sql`, cole no editor e clique em Run. Essa migração não apaga o administrador nem os registros existentes. Ela pode ser executada novamente.
3. No terminal do servidor atual, pressione Ctrl+C e execute `npm.cmd start`.
4. Abra <http://localhost:3000>, entre novamente e atualize a página. O aviso de dados sincronizados confirma que as consultas operacionais foram concluídas.

Rafael já é administrador mestre e pode acessar os dois hotéis. Não precisa cadastrar novamente sua conta. A implantação pública ainda não foi feita.

## Funcionários e clientes

Crie cada conta em Authentication e o perfil correspondente em `book_profiles`, como na etapa do login. Cada usuário comum precisa também dos hotéis permitidos. Execute este modelo no SQL Editor, substituindo o e-mail:

```sql
insert into public.book_hotel_access(user_id,hotel)
select id,'Unlimited'
from public.book_profiles
where lower(login)=lower('EMAIL_DO_FUNCIONARIO')
on conflict do nothing;
```

Use `'Unique'` em outra execução para conceder esse hotel. Para retirar o acesso, remova a linha correspondente em `book_hotel_access` pelo Table Editor. Esses ajustes são administrativos e não devem ser feitos por uma API pública.

| Perfil | Permissões operacionais |
| --- | --- |
| Cliente | Abre chamados nos hotéis permitidos; lê seus chamados e conversa sobre eles |
| Administrador | Gerencia chamados, ordens e vistorias dos hotéis permitidos; acessa o estoque compartilhado da empresa |
| Administrador mestre | Acessa todos os hotéis e a auditoria |

O estoque é global da empresa nesta etapa. Não há isolamento de estoque por hotel nem permissões por apartamento. Os hotéis e apartamentos continuam sendo os exemplos existentes: Unlimited/Unique e 1111/2222. Defina os dados reais antes do piloto. O acesso ao painel administrativo do Supabase depende do convite à organização, separadamente do perfil do sistema.

## Como os dados são gravados

`book_records` guarda cada chamado, ordem, vistoria e conversa em uma linha JSONB com proprietário, hotel e versão. O estoque usa uma linha com materiais e colunas do cadastro existente. Isso preserva os campos das telas; não é ainda um esquema relacional separado para cada domínio.

Todas as escritas passam pela função transacional `book_commit`. A função verifica perfil/hotel e versão lida. Duas edições do mesmo registro produzem conflito em vez de sobrescrever dados. Atualize e reabra o formulário antes de tentar novamente. O consumo de materiais e a gravação da ordem acontecem juntos: se falta material ou houver erro, a operação inteira é revertida. Alterar o consumo de um rascunho devolve a quantidade anterior e aplica a nova. Ordens finalizadas não podem ser reabertas nesta etapa.

A autoria dos chamados/ordens vem da sessão, e o custo de materiais do estoque é calculado pelo banco. Ordens têm responsável, prioridade e prazo; a finalização exige executor autorizado, data e responsável pelo pagamento. Não há escalonamento automático, SLA em horas ou alertas por e-mail.

Os anexos ficam no bucket **privado** `book-attachments`, com acesso pela sessão. Limites: até 5 MB por arquivo, 10 MB e 20 anexos novos por gravação. Formatos: JPG, PNG, WEBP, GIF, MP4, WEBM e PDF. DOC/DOCX e SVG não são aceitos. Uploads são validados no servidor e limitados no bucket. Após falha de gravação, o servidor tenta remover somente os uploads novos que não estejam referenciados; uma falha de rede nessa limpeza gera `attachment_cleanup_pending` para revisão.

O histórico de mudanças fica em `book_audit`, com autor, horário e dados antes/depois. Mensagens existentes do chat não podem ser reescritas. Cada conversa aceita até 1000 mensagens, respeitando também o limite de 250 KB por registro; conversas muito longas precisam de arquivamento futuro.

## Atualização e limites desta versão

As telas buscam até 100 registros por coleção e usam paginação por cursor. Carregar mais amplia o histórico até 2000 registros por coleção nesta interface. **Indicadores, gráficos e filtros consideram os registros carregados**, não um agregado de todo o banco. Consultas analíticas globais e busca no servidor são próximas melhorias para grandes volumes.

Há sincronização a cada 15 segundos, suspensa enquanto um formulário modal ou campo estiver em edição e quando a aba estiver oculta. O botão Atualizar força uma consulta. O chat também depende desse intervalo para mensagens de outro computador; não usa Realtime. Imagens carregam sob demanda e vídeos usam pré-carregamento de metadados. A API aceita no máximo 60 gravações por minuto por usuário.

Tokens ficam apenas na memória do servidor. A sessão dura até oito horas, com renovação dos tokens do Supabase. Reiniciar o servidor encerra as sessões locais. Para múltiplas instâncias, será necessário um armazenamento compartilhado de sessões e limites de requisição. A arquitetura atual é destinada ao piloto com um servidor, ainda sem dimensionamento por teste de carga.

## Dados antigos

O botão **Exportar dados antigos deste navegador** salva um JSON dos registros locais, sem senhas. Não apague o armazenamento do navegador antes de exportar. Cada computador/origem pode conter dados diferentes; exporte todos os navegadores usados anteriormente. Os dados antigos não são enviados automaticamente: é necessário revisar duplicações e mapear os logins antigos para os IDs dos usuários do Supabase antes da importação. Esse importador ainda não foi implementado.

## Conferência antes do piloto

Use contas de teste para conferir:

1. Cliente cria chamado com anexo; outro cliente não o enxerga. Administrador do hotel o recebe.
2. Funcionário sem acesso ao hotel não consegue consultar, criar ou alterar registros dele.
3. Duas abas abrem a mesma ordem. A primeira salva; a segunda deve receber conflito, sem perder o que a primeira gravou.
4. Cadastre material com quantidade 10. Consuma 4 numa ordem: restam 6. Tente consumir 7 em outra: nenhuma ordem nem baixa parcial pode ser confirmada. Atualize o rascunho de 4 para 2: devem restar 8.
5. Anexo abre com sessão autorizada e falha em janela anônima. Envio de arquivo maior que 5 MB deve falhar sem mostrar sucesso.
6. Envie mensagens entre dois computadores. Confira histórico, indicação de leitura e atraso máximo esperado da sincronização.
7. Teste conexão indisponível, entrada duplicada e expiração da sessão, incluindo uso no celular.

Os testes automatizados (`npm.cmd test`) incluem PostgreSQL embutido com simulação dos esquemas Auth/Storage, além de API e estado das telas. Eles não substituem essas verificações no Supabase real nem executam teste de carga ou validação visual num navegador.

## Backups, monitoramento e publicação

Defina responsável, frequência, retenção e destino dos backups antes do uso empresarial. Confira o recurso de backups disponível no plano do projeto. **Backups do banco não incluem os arquivos do Storage**; programe também a cópia do bucket e teste a restauração conjunta em outro projeto. Nenhuma agenda de backup foi configurada por esta etapa. Consulte a [documentação de backups do Supabase](https://supabase.com/docs/guides/platform/backups).

Para conferir a trilha de mudanças pelo painel:

```sql
select actor_id,collection,record_id,happened_at
from public.book_audit
order by happened_at desc
limit 100;
```

`GET /health` verifica somente se o processo HTTP responde. Erros HTTP 5xx geram logs JSON com identificador de requisição, status e duração, sem registrar senhas ou tokens. Configure coleta desses logs e alerta de indisponibilidade na hospedagem; esses serviços externos ainda não estão configurados. Use também os logs do Supabase para investigar erros do banco.

Por padr?o local o servidor ouve em `127.0.0.1`; no pacote Docker, `HOST=0.0.0.0` permite acesso pelo proxy interno. Para uma URL da empresa, será necessário definir a hospedagem, configurar HTTPS e `COOKIE_SECURE=true`, e proteger o acesso ao processo. Recuperação de senha pela interface, gestão completa de contas dentro do sistema e importação dos registros antigos permanecem pendentes. Faça o piloto antes de liberar toda a equipe.
