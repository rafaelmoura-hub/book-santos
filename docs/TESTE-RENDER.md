# Teste por URL para três pessoas

O projeto está preparado para um Web Service no Render, com banco no Supabase atual. O serviço fornece uma URL HTTPS; não é preciso comprar domínio nem manter seu computador ligado. Esta configuração ainda precisa ser publicada na sua conta.

## Criar as contas e enviar o projeto

1. Crie sua conta em https://github.com/signup.
2. Crie um repositório **privado**, por exemplo `book-santos`. Mantenha a opção de não adicionar README ou outros arquivos, pois o projeto já os contém.
3. Instale GitHub Desktop de https://desktop.github.com/ e entre com sua conta. Adicione esta pasta como repositório local; se ele pedir, crie o repositório nessa própria pasta. Confira os arquivos antes de confirmar e publique no repositório privado. Se preferir, clone o repositório privado em outra pasta e copie o projeto para ela, excluindo `.env`, `.env.production`, `node_modules` e `data`.
4. Não envie arquivos `.env` pessoais, senhas, banco SQLite ou dados exportados. Os arquivos `.env.example` e `.env.production.example` são modelos. O `.gitignore` do projeto já contém as exclusões necessárias; confira se elas foram respeitadas.
5. Crie uma conta em https://dashboard.render.com/ usando seu GitHub e autorize acesso somente ao repositório necessário.

## Publicar

1. No Render, escolha **New → Blueprint** e selecione o repositório privado.
2. O arquivo `render.yaml` preenche a configuração do serviço `book-santos-teste` no plano Free.
3. Preencha `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` com os valores correspondentes do seu `.env` local. Use a chave publishable; não use service_role/secret e não envie credenciais pelo chat.
4. Confira o plano Free antes de confirmar. Não adicione banco Render: o sistema já usa Supabase.
5. Inicie a criação e acompanhe os logs. O build instala dependências, executa testes e remove dependências de desenvolvimento. O servidor usa a URL HTTPS fornecida pelo Render como origem permitida.
6. Aguarde o serviço ficar **Live** e abra a URL exibida pelo painel no Chrome. O nome exato da URL é atribuído pelo Render; não é garantido que seja igual ao nome do serviço.

Não crie um Static Site: o login e a API precisam do Web Service Node.js.

## Conferir antes de compartilhar

- Abra a URL acrescentando `/ready`: deve responder com `{"status":"ok"}`. Falha pode indicar conexão ou migração ausente; consulte os logs.
- Entre com sua conta e abra um chamado com anexo. Confira a leitura por uma segunda conta autorizada.
- Cada uma das três pessoas deve ter sua própria conta Auth, perfil `book_profiles` e permissões em `book_hotel_access`. O administrador provisiona essas contas pelo Supabase, conforme `docs/OPERACAO.md`. Não compartilhem a senha do administrador.
- Compartilhe a URL normal do serviço. Ela exibe login para visitantes; os registros dependem da conta e das permissões. A URL não fica limitada a três visitantes por si só.
- Faça os testes entre clientes e hotéis descritos em `docs/OPERACAO.md` antes de incluir dados reais.

## Limitações do piloto gratuito

O Render informa que serviços Free param após quinze minutos sem tráfego e voltam ao receber acesso. A primeira abertura pode demorar. Como as sessões desta aplicação ficam na memória, suspensão, reinício e atualização podem exigir login novamente. Os dados operacionais permanecem no Supabase.

Mantenha um único serviço/instância. Backups e alertas externos ainda devem ser configurados antes do uso com dados reais. O plano Free é uma opção de avaliação, sujeito aos limites e condições da conta Render.

Referências: [Web Services](https://render.com/docs/web-services), [Blueprints](https://render.com/docs/blueprint-spec), [limites gratuitos](https://render.com/docs/free), [variáveis fornecidas pelo Render](https://render.com/docs/environment-variables).
