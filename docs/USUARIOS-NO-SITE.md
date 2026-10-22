# Gestão de usuários pelo site

A aba Usuários permite ao administrador mestre criar contas e editar nome, função e acesso aos condomínios. Administradores comuns e clientes não podem gerenciar contas. A conta mestre é protegida; o formulário não cria outros mestres nem altera e-mail e senha de contas existentes.

## Ativação única

1. No Supabase SQL Editor, execute todo o arquivo `supabase/migrations/202610220004_user_management.sql`, após as três migrações existentes. A migração não apaga contas nem registros e pode ser reaplicada. Ela adiciona permissões administrativas, controle de versão e auditoria das alterações de usuários.
2. No painel do Supabase, localize uma chave **secret** do projeto (`sb_secret_...`) em API Keys. Não use a publishable neste campo.
3. No Render, abra o serviço → Environment e adicione `SUPABASE_SECRET_KEY` com essa chave. Salve e publique a nova configuração. Nunca coloque a chave no GitHub, no HTML, no JavaScript do navegador ou neste documento. Não envie a chave pelo chat.
4. Após o deploy, entre como mestre, abra Usuários e clique em Novo usuário. Sem essa chave, a edição dos perfis existentes funciona após a migração, mas a tela informa que novos cadastros não estão habilitados.

Essa chave possui privilégios elevados e é usada somente no servidor para criar a conta Auth. O código valida a identidade do mestre antes de usá-la. As alterações de perfil e de hotéis são feitas por uma função SQL que também valida o mestre e grava tudo em uma transação. Não foi adicionada uma rota pública de cadastro.

## Uso

- Novo usuário: preencha nome, e-mail, senha inicial de 12 a 100 caracteres, função e condomínios. A conta é criada com e-mail confirmado pelo administrador, sem envio automático de convite. Compartilhe a senha individualmente por um canal adequado.
- Editar permissões: altere nome, Cliente/Administrador e as caixas dos condomínios. O e-mail permanece fixo para preservar referências existentes. Mudanças confirmadas invalidam as sessões locais daquela pessoa, que precisa entrar novamente.
- Cliente: cria e acompanha seus próprios chamados e conversas nos condomínios permitidos.
- Administrador: gerencia chamados, cards e vistorias dos condomínios permitidos e acessa o estoque global da empresa.
- Sem hotéis selecionados: não há acesso aos registros dos hotéis. O estoque global continua acessível para administradores. Isso **não** equivale a bloquear a conta.
- Mestre: todos os hotéis e auditoria; conta protegida contra edição nesta interface.

Exclusão/bloqueio de contas, alteração de e-mail, redefinição de senha e novos cargos não fazem parte desta entrega. Não são necessários para cadastrar e delegar os acessos já existentes. O acesso ao painel do Supabase é separado do acesso ao site.

Se o e-mail já existir em Authentication sem perfil, o cadastro não assume essa conta automaticamente. O responsável precisa concluir a liberação pelo painel. Se houver falha de conexão durante o cadastro, atualize a lista antes de tentar novamente. Em falhas confirmadas ao gravar o perfil, o servidor tenta remover somente a conta Auth recém-criada, preservando contas existentes.

## Condomínios e navegação

Condomínios agora é uma aba dentro de `adm/admin.html`, com os mesmos botões de navegação das outras áreas administrativas. A consulta de histórico foi movida para `adm/condominios.js`. URLs antigas de `hotel/hotel.html` redirecionam ao painel integrado. A aba Usuários continua exclusiva do mestre.

## Conferência

A consulta da lista tem prazo de 30 segundos. Em falhas de rede, a mensagem é exibida e o botão volta a responder; use Recarregar usuários para tentar de novo. Um cadastro que ultrapasse o prazo de confirmação pode ter sido salvo no servidor: confira a lista antes de reenviar. Se o formulário não carregar após uma publicação, atualize com Ctrl + Shift + R.

Os testes cobrem rejeição de clientes/administradores comuns, proteção de mestre, hotéis inválidos, conflitos de edição, auditoria, uso da chave somente em Auth e compensação de falha no perfil. Faça o teste final no Supabase real após a migração e a configuração do Render, usando contas de teste.

Referências: [criação administrativa de contas](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [chaves públicas e secretas](https://supabase.com/docs/guides/getting-started/api-keys).
