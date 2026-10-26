# Interface e desempenho

A atualização mantém chamados, cards, vistorias, condomínios e apartamentos, estoque, financeiro, usuários, chat e backup. Não exige migração nova nem modifica dados no Supabase.

## Interface

- Identidade única em azul e tons neutros, com tipografia do sistema, bordas suaves e sombras discretas. Não há fontes ou imagens externas para carregar.
- Menu lateral no computador e menu horizontal com rolagem no celular. A opção ativa fica destacada e visível.
- Login com rótulos de e-mail e senha; cliente com formulário e chamados em áreas separadas.
- Explicações financeiras, permissões e orientações detalhadas de backup ficam em áreas de ajuda expansíveis. Avisos importantes de cópia completa, erros e progresso continuam visíveis.
- Chamados do cliente mostram assunto, situação e apartamento; identificação, categoria e data ficam em Detalhes do chamado.
- Busca de condomínio sem diferenciar acentos; busca de apartamento aceita letras, como 194A.
- A barra de sincronização mostra o estado e as ações necessárias. Exportação antiga e detalhes de paginação ficam em Opções. Carregar mais aparece somente quando existem registros anteriores.

## Desempenho

- Respostas periódicas com os mesmos IDs, versões e datas de atualização não disparam reconstrução das listas. Respostas de atualização manual e de gravação continuam substituindo o cache, inclusive referências definitivas dos anexos.
- Somente as listas das abas visíveis são reconstruídas. As demais são preenchidas ao abrir a aba.
- A checagem local do chat a cada 1,5 segundo foi removida. Notificações e mensagens continuam acompanhando as atualizações de dados e os eventos existentes.
- A carga inicial de registros, permissões e apartamentos ocorre em paralelo. A sincronização tem tempo limite e continua respeitando formulários em edição e abas ocultas.
- Buscas esperam uma pequena pausa de 120 ms entre teclas para evitar renderizar uma lista inteira para cada caractere.
- CSS e JavaScript estáticos usam ETag com revalidação. Um arquivo inalterado retorna 304, enquanto páginas HTML, APIs e o catálogo por usuário continuam sem cache de dados privados. Arquivos de áreas protegidas ainda exigem autenticação antes da revalidação.
- Fotos usam decodificação assíncrona e carregamento sob demanda. Blocos fora da tela usam content-visibility nos navegadores compatíveis. Foram removidos efeitos de desfoque nos modais e movimentos de hover.

## Verificação

`npm test`: 31 testes, incluindo atualização de versão, ausência de notificação para resposta inalterada, agrupamento de buscas e revalidação HTTP de CSS.

`npm run test:browser`: dez abas no Chrome real, fluxos de administrador e cliente, seleção dos 126 apartamentos, fotos, chat, financeiro, usuários e backup. Também verifica a identidade dos elementos após sincronização sem alterações, busca sem acento e ausência de rolagem horizontal da página em 390 e 1440 pixels. O HD do teste é simulado.

Para gerar imagens de conferência no Windows, defina `BOOK_PREVIEW_DIR` para uma pasta local antes de executar o teste do navegador. As imagens usam somente dados simulados e não entram no Git. Os testes não medem a latência da hospedagem ou da internet de cada usuário; início de servidor e chamadas ao banco remoto ainda dependem desses serviços.
