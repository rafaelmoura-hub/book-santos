# Revisão de abertura, privacidade e acessibilidade — 29/10/2026

## Abertura

Na verificação local, nenhum processo estava escutando na porta 3000. `npm.cmd start` iniciou normalmente. Auth e versão 14 do Supabase foram confirmados por consulta de leitura. Isso não comprova a disponibilidade de uma hospedagem externa; nenhum endereço online de falha foi informado.

Execute `npm.cmd start` na pasta do projeto e abra http://127.0.0.1:3000. Não abra login.html diretamente ou via Live Server. F5 também usa a tarefa de desenvolvimento. A página de login explica o procedimento quando aberta por file://.

Corrigidas falhas de abertura quando localStorage está bloqueado ou sem espaço: a identidade fica em memória, obtida da sessão no servidor. A indisponibilidade da rede ou falha ao carregar scripts mostra erro recuperável, em vez de tela vazia ou redirecionamento contínuo ao login. Respostas comuns têm espera limitada; backup mantém o limite específico de dois minutos. Uma resposta perdida de gravação não deve ser repetida sem conferir o estado.

## Documentos e dados legais

Rotas públicas, sem necessidade de conta:

- `/legal/privacidade`: finalidade, tipos de dados, fornecedores, IA, retenção e direitos.
- `/legal/termos`: uso responsável, conteúdo, limitações e direitos obrigatórios preservados.
- `/legal/cookies`: inventário técnico; sem aceite fictício de rastreadores inexistentes.
- `/legal/reembolso`: o código não processa pagamentos; contratos, fornecedor e direitos obrigatórios regem cancelamentos reais.
- `/legal/lgpd`: formulário mínimo que prepara texto localmente; não envia ao servidor nem gera protocolo.
- `/legal/empresa`: identificação do responsável, sem dados inventados.

O usuário pediu deixar a identificação jurídica para depois. Permanecem pendentes razão social, CNPJ, endereço e contato de privacidade. Preencher somente no ambiente do servidor:

```dotenv
BOOK_COMPANY_NAME=
BOOK_COMPANY_CNPJ=
BOOK_COMPANY_ADDRESS=
BOOK_PRIVACY_EMAIL=
```

Esses campos são públicos, nunca devem conter segredos. Reinicie o servidor após preencher. Sem e-mail configurado, o formulário permite baixar a solicitação para encaminhar ao responsável pelo acesso; não oferece envio inexistente. Com e-mail configurado, pode preparar uma mensagem no programa de e-mail, sem afirmar que foi enviada. Não pede CPF, documento ou anexo de identidade.

## Minimização e tracking

- Removida a cópia persistida do perfil completo em `usuarioLogado`. O cookie HttpOnly permanece necessário ao login. Permissões continuam verificadas pelo servidor e pelo banco.
- Não encontrados scripts de analytics, pixels, anúncios, fontes ou bibliotecas carregadas de CDN nas telas revisadas. CSP limita scripts e conexões do navegador à mesma origem. IA é uma integração iniciada pelo usuário, no servidor, que pode compartilhar dados de consultas autorizadas com o provedor escolhido.
- Não foram apagados registros operacionais, backups ou dados antigos do navegador sem análise de retenção. A exportação legada continua disponível para quem precisar recuperar dados antigos.
- Formulários operacionais preservados: contatos e dados opcionais devem ser preenchidos somente quando necessários. Campos livres e fotos podem conter dados excessivos; código sozinho não assegura a minimização do conteúdo inserido.

## Acessibilidade e desempenho

Mantida a identidade azul e branca. Acrescentados atalho para conteúdo, foco visível, contraste de textos auxiliares, placeholders e bordas de formulário. Fechamento de modais agora tem botão nativo com nome acessível. Modais antigos receberam nome, foco inicial, contenção de Tab, Escape e retorno de foco. Chamados têm botão para abertura por teclado, separado do seletor de status. Campos sem associação recebem rótulo disponível; imagens sem alt recebem alternativa contextual, sem inventar o conteúdo da foto. Imagens existentes continuam com carregamento tardio.

Documentos legais usam títulos, regiões, rótulos, tabela com cabeçalhos e funcionam sem JavaScript; apenas a preparação do formulário depende dele. Telas operacionais informam quando JavaScript está desligado. Preferência por movimento reduzido e cores forçadas é respeitada. Melhorias não constituem certificação WCAG: leitor de tela, conteúdo dos anexos e todas as combinações de estados precisam de validação contínua com usuários.

Arquivos estáticos permitidos usam cache limitado em memória, invalidação quando alterados, compressão gzip e revalidação por ETag. Arquivos protegidos passam pela autorização antes do cache; APIs e documentos continuam sem armazenamento em cache no navegador. Removido blur de fundo dos modais, reduzindo trabalho gráfico. As rotinas de atualização existentes já pausam em segundo plano, formulários e diálogos.

Na verificação local, `assets/ui.css` passou de 30.291 para 6.715 bytes transferidos com gzip (cerca de 78% a menos). Não é uma promessa de redução equivalente no tempo de toda a aplicação.

## Validação desta revisão

57 testes automatizados aprovados, incluindo PostgreSQL/RLS, sessões, permissões, anexos, documentos públicos e recuperação com armazenamento bloqueado. Navegador Chrome com dados simulados: 18 abas, fluxos operacionais existentes, Tab/Escape/retorno de foco em modal, uso com localStorage bloqueado, formulário LGPD e telas de 390 e 1440 pixels. Sem alteração de registros reais e sem chamadas pagas de IA. `npm audit` não apontou vulnerabilidades conhecidas nas dependências instaladas; isso não certifica ausência de falhas no código ou na operação. `/health`, `/ready` e páginas de login e legais responderam normalmente no servidor local com acesso à rede.

## Riscos reais e próximos passos

1. Confirmar o controlador, contato, contratos com fornecedores, região de dados e mecanismos aplicáveis de transferência internacional. Não é possível deduzir isso apenas pelo código.
2. Definir tabela de retenção e procedimento de exclusão, inclusive de anexos, auditorias e backups no HD. O sistema não faz expurgo automático por prazo.
3. Tratar avaliações e planos da equipe como informações compartilhadas conforme permissões. Não registrar saúde, denúncias ou questões confidenciais de RH nesse chat.
4. Orientar a equipe sobre fotos de hóspedes, documentos e códigos de acesso. Usar apenas anexos necessários e autorizados; não inserir segredos em notas, cards ou prompts de IA.
5. Proteger HDs e cópias exportadas com criptografia e acesso restrito. Estabelecer resposta a incidentes, revisão de acessos e teste de recuperação.
6. Confirmar direitos sobre a marca e materiais enviados. Não foi feita pesquisa de disponibilidade no INPI nem comprovação de titularidade. O aplicativo não alega marca registrada. Nenhum conteúdo do Pipefy foi copiado como ativo visual.
7. Se começar a vender pelo site, revisar identificação obrigatória, oferta, checkout, contratos, cancelamento e atendimento antes de ativar pagamentos. Não criamos um checkout ou política comercial fictícia.

Não é uma declaração de conformidade jurídica integral. Os documentos devem refletir a operação e ser revisados pelo responsável jurídico quando os dados e contratos forem definidos.

## Referências oficiais

- [LGPD — Lei 13.709/2018](https://www.presidencia.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm): princípios, transparência e direitos dos titulares.
- [ANPD — Guia de cookies](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais): inventário e escolhas para recursos opcionais.
- [Código de Defesa do Consumidor](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm): direitos obrigatórios e art. 49, quando aplicável.
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/): referência para teclado, foco, contraste e alternativas textuais.
