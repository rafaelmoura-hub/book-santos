# Segurança, desempenho e operação — 05/11/2026

## O que foi implementado

- Urgência dos cards escolhida pelo administrador: baixa `🟢⚠️`, média `🟡⚠️`, alta `🔴⚠️`. Os valores históricos no banco continuam `Normal`, `Alta`, `Urgente`, respectivamente. Não existe classificação automática pelo texto. Histórico parcial sem urgência continua “Não informada”.
- Recuperação de senha por código de e-mail, sem revelar se uma conta existe, com limites de tentativas, expiração controlada pelo Supabase e encerramento das sessões do aplicativo após troca de senha. Contas com TOTP precisam também do código do autenticador.
- Ativação de TOTP em **Opções → Segurança da conta**, também disponível no menu Mais do celular. A chave de configuração só aparece durante o cadastro e não é salva no navegador. Um cadastro cancelado remove seu fator incompleto. Não há botão para desativar um fator já verificado.
- No login de administrador com TOTP ativo, a senha gera apenas uma sessão restrita de cinco minutos. O código válido troca o cookie e libera a sessão. Sessões antigas sem a segunda etapa deixam de acessar os dados. Sessões persistidas preservam o estado restrito após reinício.
- A migração 22 exige AAL2 nas permissões de administradores com TOTP verificado, incluindo chamadas diretas ao banco. Não ativa MFA automaticamente nem bloqueia contas que ainda não cadastraram um fator.
- Medição de tempo, falhas e consultas lentas, sem conteúdo de formulários, tokens ou nomes de anexos. O mestre consulta um resumo em **Segurança da conta → Ver desempenho do sistema**. As métricas reiniciam com o processo; logs da hospedagem complementam esse resumo.
- Consultas idênticas simultâneas da mesma sessão compartilham uma operação enquanto ela está em andamento. Não existe cache de permissões ou de resultados por vários segundos.
- Testes de integração e auditoria de dependências em GitHub Actions. Monitoramento dos endpoints públicos `/health` e `/ready` a cada 15 minutos, com falhas sinalizadas pelo job do GitHub.
- Blueprint separado `render-staging.yaml` para homologação na branch `staging`. A configuração impede usar a mesma URL Supabase declarada para produção.

## Ativar a proteção no Supabase

1. Aplique as migrações anteriores, inclusive etiquetas, e depois `supabase/migrations/202611040022_mfa.sql`. O script é repetível e mantém a versão de compatibilidade do banco.
2. Em Supabase Auth, habilite fatores TOTP. Em **Email Templates → Reset Password**, configure uma mensagem que apresente `{{ .Token }}` como código de recuperação, em vez de depender apenas do link. Exemplo: “Seu código de recuperação do BOOK TASK é {{ .Token }}. Se você não solicitou a recuperação, ignore esta mensagem.” Configure o envio de e-mail/SMTP e teste com uma conta de teste. Depois defina `BOOK_RECOVERY_ENABLED=true` no Render; antes disso, o aplicativo informa que a recuperação depende de configuração e não envia mensagens com um fluxo incompleto.
3. Entre novamente e abra Segurança da conta. Cadastre a chave em um aplicativo autenticador e confirme o código. Mantenha uma conta administrativa de contingência protegida e com acesso controlado; perda do autenticador exige recuperação pelo responsável do Supabase, sem desativação pelo aplicativo.
4. Depois de testar o cadastro e o login das contas administrativas, pode ativar `BOOK_REQUIRE_ADMIN_MFA=true` no Render. Isso exige o cadastro na próxima entrada dos administradores sem TOTP. Não ative antes de aplicar a migração 22 e preparar o suporte de recuperação.

MFA das contas do GitHub, Render e painel Supabase deve ser ativado separadamente nessas plataformas. O aplicativo não altera essas contas externas.

## Alertas e homologação

- O workflow `monitor.yml` consulta apenas o endereço público já informado da produção. `BOOK_MONITOR_URL` pode trocar a origem; `BOOK_MONITOR_ENABLED=false` desliga o agendamento. Ative as notificações de falhas de Actions na sua conta GitHub. Horários agendados do GitHub podem atrasar; não há promessa de resposta instantânea.
- Para homologação, crie um serviço separado pelo `render-staging.yaml` e forneça um projeto Supabase separado, sem dados reais desnecessários. `BOOK_PRODUCTION_SUPABASE_URL` identifica a URL de produção apenas para comparação. Aplique as migrações no projeto de teste. Criar a branch não cria automaticamente serviços ou projetos externos.
- Mantenha **uma instância** do servidor. `BOOK_INSTANCE_COUNT` diferente de 1 é recusado. Sessões e limites ainda não são distribuídos; Redis ou outro armazenamento compartilhado precisa ser implementado antes de escalar horizontalmente. A variável é uma trava declarativa, não descobre a quantidade de instâncias configuradas no Render.

## Backup automático: destino pendente

A criação da automação foi bloqueada pela revisão automática de segurança porque ainda não há um destino autorizado para copiar banco e anexos privados. Nenhum workflow de exportação automática foi adicionado. Defina um bucket privado de propriedade da empresa, fora do projeto de origem, e a política de retenção antes de configurar os segredos.

O plano é incluir banco e arquivos, cifrar a cópia antes do envio, manter a chave privada de recuperação fora do GitHub e executar uma restauração em banco descartável. O backup manual existente permanece disponível. Não foi executada restauração de produção nem enviada cópia dos dados a outro serviço.

## Validação e limites

Os testes usam PostgreSQL local, Auth simulado e navegador com dados fictícios. A integração real de SMTP, TOTP, políticas da migração 22, notificações de Actions e o serviço de homologação precisa ser validada nas respectivas contas após configurar os itens acima. Nunca envie senhas, chaves administrativas ou códigos de autenticador pelo chat.
