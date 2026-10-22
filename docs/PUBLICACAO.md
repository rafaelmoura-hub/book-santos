# Publicar o piloto Book Santos

Preparado em 22/10/2026. O pacote está configurado para **um servidor e uma instância**. Ainda não existe uma URL publicada por esta alteração.

## Recursos necessários

- Servidor Linux com Docker Engine e plugin Docker Compose instalados, acesso SSH e saída HTTPS para Supabase e emissão de certificados.
- Domínio ou subdomínio de sua propriedade, com registro A apontando para o IPv4 do servidor. Só configure AAAA se o IPv6 também estiver funcionando.
- Portas públicas 80 e 443 liberadas. Restrinja SSH aos administradores. A porta 3000 não precisa ser publicada e o Compose não a expõe no host.
- Projeto Supabase de homologação, preferencialmente separado dos dados reais.

Não há contratação, domínio nem servidor incluídos no código. Use contas pertencentes à empresa. Não envie senhas ou chaves administrativas pelo chat.

## 1. Preparar o banco

No SQL Editor do Supabase, execute nesta ordem:

1. `supabase/migrations/202610170001_book_profiles.sql`
2. `supabase/migrations/202610170002_operations.sql`
3. `supabase/migrations/202610220003_pilot.sql`

As migrações podem ser reaplicadas sem apagar as tabelas. A terceira adiciona validações e um catálogo de apartamentos. Não elimina dados antigos; registros antigos inválidos podem precisar de correção antes da próxima edição.

Revise `book_apartments` pelo painel antes do piloto. Os quatro apartamentos iniciais são exemplos preservados da versão anterior. As telas agora consultam esse cadastro e o banco rejeita apartamentos não cadastrados. Para incluir um apartamento, por exemplo:

```sql
insert into public.book_apartments(hotel,apartment)
values ('Unlimited','1234') on conflict do nothing;
```

Os hotéis continuam limitados a Unlimited e Unique. O estoque permanece compartilhado entre hotéis. A troca dos nomes dos hotéis exige adaptação adicional; não renomeie somente uma tabela.

Crie contas de teste em Authentication e perfis em `book_profiles`; use `supabase/provision-profile.sql` e `docs/OPERACAO.md`. Conceda hotéis em `book_hotel_access`. Confira as configurações de cadastro público e libere somente as contas aprovadas; criar uma conta Auth sozinha não concede perfil operacional.

## 2. Preparar os arquivos no servidor

Copie o projeto para uma pasta no servidor, por exemplo `/opt/book-santos`. Não copie `.env` local, `node_modules`, `data` nem dados antigos do navegador. O Dockerfile copia somente código da aplicação para a imagem.

No servidor, na pasta do projeto:

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Edite `.env.production` com domínio, e-mail de operação, URL e chave **publishable** do Supabase de homologação. Não use chave secret/service_role. `DOMAIN` deve ser somente um nome de domínio, sem protocolo ou caminho.

O Compose define `NODE_ENV=production`, `COOKIE_SECURE=true` e `PUBLIC_ORIGIN=https://DOMAIN`. O processo recusa iniciar em produção se HTTPS e cookie seguro estiverem ausentes. Não copie o arquivo de desenvolvimento sobre o arquivo de publicação.

## 3. Validar e iniciar

Execute os testes em ambiente Node 24 antes de transferir a versão:

```sh
npm ci
npm test
```

No servidor:

```sh
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build --pull
docker compose --env-file .env.production run --rm app node server/check-supabase.js
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100
```

Pare se a checagem do Supabase falhar. Ela verifica Auth e a versão 3 da migração; não substitui testes entre usuários. O container roda sem root e com sistema de arquivos somente leitura. O proxy Caddy guarda certificados em volumes persistentes, emite/renova HTTPS e redireciona HTTP quando DNS e portas estão corretos.

Não execute `docker compose down -v`: isso também removeria os volumes dos certificados. Os dados operacionais ficam no Supabase.

## 4. Conferir a publicação

Substitua o domínio nos comandos:

```sh
curl --fail https://teste.seu-dominio.com.br/health
curl --fail https://teste.seu-dominio.com.br/ready
```

`/health` verifica o processo. `/ready` verifica conexão Auth e versão da migração no Supabase. Configure monitoramento externo de `/ready`, em intervalo de pelo menos um minuto, com alerta para o responsável. A configuração de alerta depende do serviço escolhido e ainda precisa ser feita.

Entre no navegador e execute os sete cenários de `docs/OPERACAO.md`, incluindo duas contas de clientes, administradores de hotéis diferentes, duas abas editando a mesma ordem e estoque insuficiente. Verifique cookies Secure/HttpOnly e rejeição de acesso a anexos em janela anônima. Teste também no celular e com conexão interrompida.

Somente libere a equipe depois de conferir esses resultados. Os testes locais não atestam permissões ou configuração do projeto remoto.

## 5. Operação do piloto

- Um servidor, sem réplicas: sessões e limites ficam em memória. Reiniciar ou atualizar desconecta os usuários; avise a equipe e finalize gravações antes.
- Cada conta tem até dez tentativas de login por quinze minutos. Há também um teto de trezentas requisições de login por minuto por endereço de socket, inclusive para proxy compartilhado. Cabeçalhos de IP enviados pelo cliente não são usados para autenticação ou limites.
- Recuperação de senha e provisionamento continuam administrativos pelo Supabase. Não existe recuperação de senha pela interface nesta versão.
- Indicadores e filtros mostram dados carregados, não necessariamente o banco todo. Não use como relatório contábil global.
- Anexos de cliente são lidos pelo próprio autor e administradores do hotel. O compartilhamento de arquivos enviados por administrador com clientes não faz parte da interface deste piloto; o bucket continua privado.
- Faça backups do banco e dos arquivos do bucket em destino separado, defina retenção e responsável. Confira os recursos do plano Supabase. Antes de dados reais, restaure banco e objetos em outro projeto e confira registros e anexos. Um backup só do banco não é suficiente para recuperar objetos do Storage.
- Não há importação automática dos registros antigos. Exporte cada navegador antes de limpar seu armazenamento.

## Atualizar e reverter

Guarde a versão anterior do código e a imagem anterior antes de atualizar. Não apague o projeto Supabase. Aplique migrações novas somente após backup e leitura das alterações.

```sh
docker compose --env-file .env.production build --pull
docker compose --env-file .env.production run --rm app node server/check-supabase.js
docker compose --env-file .env.production up -d
```

Se a atualização falhar, restaure os arquivos da versão anterior e reconstrua sua imagem. Reversão do código não desfaz migrações nem gravações; não restaure banco indiscriminadamente sobre dados novos. Esta migração adiciona validações que permanecem mesmo após reverter a aplicação.

## Validação desta entrega

Testes automatizados incluem regressão da saída de datas, limites de login entre contas, origem pública, cookie seguro, configuração de publicação, versão da migração e validação SQL. Docker e Caddy precisam ser validados no servidor: Docker não está disponível no ambiente de desenvolvimento desta sessão. HTTPS público, backup, alertas, testes visuais e carga ainda dependem da infraestrutura real.

Na verificação desta entrega, os 12 testes passaram. Uma checagem externa de leitura alcançou o Supabase, mas a função de versão esperada não estava disponível: a migração nova ainda precisa ser executada. Essa checagem não confirma quais migrações anteriores já estão aplicadas.

Referências: [HTTPS automático no Caddy](https://caddyserver.com/docs/automatic-https), [variáveis de ambiente do Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
