# Identidade visual e modo noturno

A logo enviada pela empresa foi integrada no login, cabeçalhos, páginas legais e ícone da aba. O arquivo original foi preservado: o site usa uma cópia PNG de 256 × 256 pixels, com transparência e cerca de 55 KB. O desenho e as proporções não foram recriados. Junto ao nome escrito, a imagem usa alt vazio para evitar a leitura duplicada da marca por leitores de tela.

A paleta parte do azul petróleo da logo (`#042d46`), com azuis próximos para ações e fundos. Estados de erro, prioridade e sucesso mantêm cores semânticas e rótulos próprios. A logo e as fotos dos usuários não recebem filtros de cor no modo noturno.

## Usar o tema

O botão fica no canto superior do login e no cabeçalho das outras telas, incluindo os documentos legais. No tema claro, mostra **Modo noturno**, com lua; no escuro, mostra **Modo diurno**, com sol. O nome indica a próxima ação. No celular, aparece o ícone correspondente, mantendo o nome acessível. O login mostra apenas a logo, com texto alternativo identificando BOOK TASK para leitores de tela.

Sem escolha anterior, o site acompanha a aparência do sistema operacional. Uma escolha manual fica em `localStorage`, na chave `book:theme`, contendo somente `light` ou `dark`, sem dados pessoais. A preferência é compartilhada pelas páginas do mesmo endereço e atualizada entre abas. Se o armazenamento estiver bloqueado, a troca funciona na página atual; ao navegar, o site volta a seguir a preferência do sistema. Login e funções operacionais não dependem dessa gravação.

O aviso de cookies descreve essa preferência. Não há envio do tema a terceiros ou alteração de permissões, registros, reservas ou valores. Os documentos continuam disponíveis sem JavaScript; nesse caso o botão de troca não é criado e o estilo padrão permanece claro.

## Layout e acessibilidade

Os links de Privacidade, Termos, Cookies, Reembolso, Direitos LGPD e Empresa foram centralizados no rodapé. Na administração, o centro considera a área de conteúdo à direita do menu; no celular, usa a largura da tela. A navegação das páginas legais também foi centralizada, com quebra de linha e espaço para o botão do tema.

Os dois temas usam cores explícitas para fundos, textos, campos, cards, tabelas, estados e painéis laterais. A preferência é aplicada no início do carregamento para reduzir mudanças visuais durante a abertura. A logo possui dimensões definidas para evitar deslocamento do cabeçalho. Recursos estáticos locais têm tipo de conteúdo correto e revalidação por ETag; o PNG não é comprimido novamente com gzip.

## Verificação

Testes de preferência inicial, sistema operacional, troca manual, bloqueio de armazenamento e atualização entre abas. O teste de navegador percorre as 18 telas nos dois temas, verifica a persistência após recarregar, a leitura da logo, responsividade e contraste de textos nos estados exercitados, inclusive IA e formulário LGPD. Integrações externas e dados operacionais são simulados. Isso não substitui uma avaliação completa com leitores de tela e conteúdo real.

Não exige migração do banco. Publicação inclui os novos assets e o servidor que os disponibiliza; reinicie o servidor local após atualizar os arquivos.
