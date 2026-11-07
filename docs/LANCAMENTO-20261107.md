# Preparacao para lancamento — 07/11/2026

O sistema ainda depende de aceite no ambiente real. Testes locais usam dados ficticios e nao comprovam SMTP, TOTP, permissoes remotas ou capacidade do plano de hospedagem.

## Dados

A carga privada em `artifacts/launch-20261107/01-ATUALIZAR-VISTORIAS.sql` contem 120 acompanhamentos gerais e 8 de governanca. Em 07/11/2026 sao 26 vencidos e 102 no prazo. Executar como proprietario apos a migracao 26, preservando o backup criado pela propria carga. Helbor Stay 714 precisa existir no catalogo ativo; nao e cadastrado automaticamente. Conferir o resultado de pendencias e comparar as datas apos a carga. O SQL nao cria fotos nem checklists ficticios.

As informacoes privadas dos apartamentos precisam ser conferidas com `artifacts/apartment-info-import/02-DIAGNOSTICO-SEM-SENHAS.sql`. Nunca publicar os artefatos privados.

## Backup e recuperacao

Aplicar `supabase/migrations/202611070028_backup_property.sql` apos 25 a 27. A exportacao de Cadastros passa a incluir informacoes privadas e catalogo arquivado; Vistorias inclui as datas de controle; Auditoria inclui as alteracoes dos acessos. O backup continua exclusivo do mestre. Proteger o destino: o aplicativo nao cifra essa exportacao.

O teste PostgreSQL local exporta dados ficticios, remove uma amostra dentro de uma transacao, restaura a amostra a partir do JSON exportado, compara os dados e desfaz a transacao. Isso testa a recuperacao dessas novas tabelas, nao uma restauracao completa de producao.

Antes da liberacao, o responsavel deve: escolher destino privado separado; copiar banco completo e Storage; definir retencao; restaurar em projeto isolado; conferir contas, permissoes, registros e anexos. Nao restaurar sobre o projeto em uso. A exportacao do aplicativo nao substitui backup completo do Supabase/Auth.

## Aceite com contas reais e celulares

Registrar resultado, data e responsavel de cada cenario:

- Administrador A acessa apenas seu condominio; administrador B nao acessa os dados/anexos de A por interface nem por URL copiada.
- Cliente nao acessa campos privados, backup ou administracao; duas contas de cliente nao compartilham chamados indevidamente.
- Recuperacao de senha recebe codigo por email, rejeita codigo errado e permite nova entrada. Validar SMTP antes de habilitar a funcionalidade.
- Administrador com TOTP nao acessa dados antes da segunda etapa. Preparar contingencia de recuperacao e testar antes de exigir MFA de todos.
- No Android/Chrome e iPhone/Safari: criar card com urgencia, filtrar, comentar, ditar quando suportado, anexar, editar novamente e finalizar. Conferir resultado em uma segunda conta.
- Durante gravacao, interromper a conexao; verificar mensagem e consultar o resultado antes de repetir, evitando duplicacao. Duas pessoas editando o mesmo registro devem receber conflito de versao.

## Desempenho e alertas

Executar `node scripts/check-pilot-load.js` mede somente HTTP local com provedor simulado. Para medir capacidade real, definir usuarios simultaneos e executar carga em homologacao separada com Supabase de teste; registrar latencia p95, falhas, consultas lentas e recursos do servidor. Nao disparar carga contra producao.

O workflow `.github/workflows/monitor.yml` verifica disponibilidade a cada 15 minutos. Confirmar execucao recente e recebimento da notificacao de falha na conta do responsavel. HTTP 200 nao comprova todos os fluxos autenticados. Manter uma instancia ate existir controle distribuido validado.

## Liberacao

Liberar primeiro um grupo pequeno, com responsavel de suporte identificado. Ampliar apos os cenarios acima passarem e a restauracao real estar comprovada. Manter versao anterior do codigo, backup privado e procedimento de contingencia. Falhas de permissao ou perda de dados impedem a liberacao.
