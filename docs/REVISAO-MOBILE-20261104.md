# Revisão e adaptação para celular — 04/11/2026

A revisão cobriu a inicialização das telas, navegação, autenticação, permissões, persistência, cadastros, cards e etiquetas, chat, vistorias, estoque, financeiro, colaboração, notas, assistente IA e backup. A validação combina leitura dos módulos, análise sintática do JavaScript, testes de API e PostgreSQL e navegação no Chrome com dados simulados. Nenhum registro do Supabase real foi alterado durante os testes.

## Adaptação das referências

- Cabeçalho compacto com a marca, tema, avisos e iniciais da conta autenticada.
- Barra inferior no administrador: Início, Chamados, Cards e Mais. Atalhos seguem as permissões; Mais apresenta apenas os módulos já liberados e as ferramentas pessoais.
- Área inicial do cliente com seu nome, atalhos para abrir e acompanhar chamados e contadores calculados dos registros disponíveis para sua conta. O cliente acessa seu chat; módulos administrativos não são exibidos.
- Telas e formulários com controles maiores, texto legível, espaçamento e organização para toque. Não foram copiados os dados ilustrativos das imagens.
- Financeiro usa os mesmos valores e filtros do desktop, com linhas organizadas como cartões no celular. Tabelas de estoque que precisam de largura continuam com rolagem dentro da própria área.
- Notas, IA e edição abrem painéis que aproveitam a tela do celular. Confirmar uma ação de IA continua sendo uma etapa explícita.
- Login ganhou botão de mostrar/ocultar senha, mantendo preenchimento automático, autenticação e animação de carregamento.

## Correções verificadas

O envio do login seleciona explicitamente o botão de envio, para que o novo botão de exibir senha não interfira no bloqueio durante a autenticação. Trocar o tema mantém o menu Mais aberto. A navegação devolve o foco a um controle visível ao fechar ferramentas e impede interações com o conteúdo atrás do menu Mais. O chat do cliente acompanha o estado da barra inferior.

## Limites preservados

O backup em pasta/HD depende da API de diretórios do navegador; quando indisponível, a tela orienta usar HTTPS no Chrome ou Edge de um computador. Não foram acrescentados tamanhos estimados fictícios, um novo sistema de perfis, sincronização offline ou opções sem implementação. Os contadores do cliente representam seus registros disponíveis, sem prometer um período de 30 dias que o cadastro atual não fornece.

Esta adaptação não exige nova migração de banco. A ativação de etiquetas continua dependendo da migração 21 já entregue.

## Verificação

Resultado desta revisão: 86 arquivos JavaScript verificados sintaticamente, 80 testes automatizados aprovados e 166 estados visuais inspecionados pelo teste de navegador, sem falhas detectadas de contraste, texto cortado ou imagens quebradas. Os cliques na barra inferior, a digitação na senha e as restrições de acesso foram exercitados no navegador.

Execute `npm.cmd test` e `npm.cmd run test:browser`. Para gerar as capturas locais, defina `BOOK_PREVIEW_DIR=artifacts/mobile-review`. O teste de navegador cobre temas claro/escuro, login em 320/360/390 px, navegação inferior com cliques na posição real dos botões, menu Mais, permissões, conta, formulários, chat e os fluxos operacionais existentes. O desktop também é verificado em 1440 px. A emulação no Chrome não substitui testes em aparelhos físicos e no Safari.
