# Análise de prontidão — 22/10/2026

> Registro da análise inicial. Após este parecer foram implementadas correções de datas, limite de login por conta, cadastro/validação de apartamentos, validação de vistorias e anexos, configuração de produção e pacote Docker com HTTPS. Consulte `PUBLICACAO.md` para o estado atual e os passos ainda dependentes de infraestrutura. A migração nova ainda precisa ser aplicada no Supabase remoto. O sistema não foi publicado.

## Parecer

O projeto tem uma base funcional para testes locais, mas ainda não está aprovado para homologação profissional compartilhada. Recomenda-se corrigir os achados de segurança, preparar a infraestrutura e validar os fluxos no Supabase real antes de abrir um piloto com a equipe. Não está pronto para produção.

Esta análise não alterou o código da aplicação nem os dados remotos.

## Escopo e evidências

Foram revisados as quatro interfaces HTML/CSS/JS, os clientes compartilhados, o servidor Supabase ativo, a implementação SQLite anterior, as migrações SQL, os testes e a documentação de operação.

- Ambiente: Node v24.21.0, compatível com package.json.
- `npm.cmd test`: 9 testes passaram, nenhum falhou. Incluem autenticação, API, estado da interface e PostgreSQL embutido com Auth/Storage simulados.
- Reprodução local da função `formatarData`: a entrada `2026-10-<img src=x onerror=alert(1)>` retornou `<img src=x onerror=alert(1)>/10/2026`, preservando HTML executável.
- `npm.cmd run check:supabase`: falhou com mensagem de conexão. A rede deste ambiente é restrita; não foi possível determinar a causa nem confirmar a saúde do projeto remoto.
- Não foram realizados testes visuais em navegador, testes completos entre dispositivos, carga ou restauração de backup. Não foi confirmada a aplicação das migrações remotas.

## Achados prioritários

### 1. Alta — HTML não escapado na formatação de datas

Locais: `adm/utilidades.js` (antes em `adm/admin.js`), função `formatarData`, e `hotel/hotel.js`, função de mesmo nome. O resultado é interpolado em `innerHTML`.

Quando o texto contém exatamente três partes separadas por hífen, a função devolve as partes sem escape. A migração operacional não valida o formato de vencimento, data de vistoria e data de fechamento como datas reais. Uma gravação manipulada por uma conta administrativa pode persistir conteúdo que execute ao ser exibido para outro administrador. A reprodução confirmou a saída insegura da função; não foi executado ataque em navegador ou no banco remoto.

Correção: validar datas no banco e servidor, escapar a saída em todos os caminhos e preferir nós de texto. Adicionar teste de regressão para a renderização. Os testes atuais de anexos não cobrem essa falha.

### 2. Alta para publicação — infraestrutura de homologação não preparada

Local: `server/start.js` e `docs/OPERACAO.md`.

O servidor escuta em `127.0.0.1`, depende de configuração externa para HTTPS e só ativa cookies Secure com `COOKIE_SECURE=true`. Não foi encontrada configuração de implantação automatizada no conjunto de arquivos inspecionado. A documentação registra publicação, backups e alertas como pendentes; a existência desses recursos fora do projeto não pôde ser confirmada.

Antes do piloto: definir hospedagem, HTTPS, domínio, reinício automático do processo, logs e alertas. Separar os dados de homologação dos dados reais. Configurar backup do banco e dos objetos de Storage, com restauração comprovada.

### 3. Média — bloqueio de login compartilhado atrás de proxy

Local: `server/supabase-app.js`, mapa `attempts` e `req.socket.remoteAddress`.

O limite de dez tentativas em quinze minutos usa o endereço do socket. Atrás de um proxy local, vários usuários podem aparecer com o mesmo endereço. Tentativas malsucedidas de uma pessoa podem impedir os demais de entrar; um login bem-sucedido também limpa o contador compartilhado.

Correção: definir explicitamente quais proxies são confiáveis e implementar limites por origem e conta. Não confiar indiscriminadamente em cabeçalhos enviados pelo cliente. Validar o comportamento na topologia real.

### 4. Média — acesso a anexos depende do autor do upload

Local: política `book_read_files` em `supabase/migrations/202610170002_operations.sql`.

Clientes leem arquivos da própria pasta; administradores autorizados leem arquivos do hotel. A referência do arquivo em um registro não concede, por si só, acesso ao cliente. Se um administrador anexar um arquivo a um chamado de cliente pela API, esse cliente não terá acesso ao arquivo. A interface atual do cliente não oferece esse fluxo de leitura; portanto, o impacto depende do compartilhamento pretendido.

Definir a regra de negócio antes de ampliar esse fluxo. Caso anexos de resposta devam ser compartilhados, autorizar a leitura por vínculo com registros acessíveis, com testes entre contas. Não tornar o bucket público.

### 5. Média — validação de domínio incompleta no banco

Local: função `book_commit` na migração operacional.

A função verifica papéis, hotéis, versões e consumo, mas vistorias não têm validação específica de checklist, responsável ou data. Apartamentos de chamados só precisam ser não vazios; não há cadastro que valide sua existência. A interface usa os exemplos 1111 e 2222. Datas operacionais não têm validação completa.

Um cliente autenticado pode enviar requisições sem passar pelos formulários. Regras obrigatórias devem ser verificadas também no banco, pois a função RPC pode ser chamada diretamente com credenciais válidas.

### 6. Média — limitações de sessão, capacidade e indicadores

Locais: `server/supabase-app.js`, `assets/store.js` e `server/supabase.js`.

- Sessões e limites ficam na memória de um processo. Reiniciar encerra as sessões; múltiplas instâncias não compartilham esse estado.
- Cada requisição protegida consulta usuário e perfil no Supabase. A sincronização a cada quinze segundos acrescenta consultas por coleção; falta medir capacidade e latência com a quantidade esperada de usuários.
- Indicadores e filtros usam o conjunto carregado, inicialmente até cem registros por coleção, com limite de dois mil na interface. Não representam necessariamente todo o banco.
- A paginação ordena IDs, gerados no navegador com relógio local e componente aleatório. Relógios divergentes podem afetar a ordem cronológica aparente.
- Na tela de hotel, o evento `book:data` chama `selecionarApartamento`, reconstruindo a área e podendo fechar o histórico aberto após sincronização.

Para um piloto pequeno, um processo pode ser aceitável se essa restrição for explícita. Antes de expansão, medir carga, planejar sessões compartilhadas e consultas agregadas no servidor.

## Pontos positivos confirmados no código e nos testes locais

- Cookies HttpOnly e SameSite; tokens Supabase mantidos no servidor.
- Rotas e arquivos públicos limitados por lista explícita.
- Perfis sem permissão de autopromoção pela API e políticas RLS por usuário/hotel.
- Bucket privado, limites de upload e checagem de assinatura básica dos formatos.
- Controle de versão para impedir sobrescrita silenciosa.
- Consumo de estoque e ordem de serviço na mesma transação, com auditoria.
- Migração operacional testada localmente inclusive em reaplicação.
- Documentação reconhece os limites atuais e descreve verificações de piloto.

Esses resultados locais não comprovam a configuração do Supabase publicado.

## Condições para liberar o piloto

1. Corrigir a renderização insegura e validar campos de domínio no servidor/banco.
2. Confirmar migrações, RLS e Storage em projeto de homologação, com contas distintas de cliente, administrador e mestre.
3. Configurar HTTPS, cookie seguro, processo supervisionado, logs, alertas e backups restauráveis.
4. Substituir exemplos por hotéis/apartamentos autorizados e definir o alcance do estoque global e dos anexos.
5. Executar os sete cenários de `OPERACAO.md` no serviço real, incluindo isolamento entre clientes/hotéis, conflito, estoque insuficiente, anexos e expiração.
6. Validar navegadores e celulares usados pela equipe; medir carga representativa.
7. Definir responsáveis por criação/bloqueio de contas, recuperação de senha, suporte e recuperação de dados. A recuperação de senha na interface e o importador de dados antigos continuam pendentes.

Com essas evidências, o projeto poderá ser reavaliado para um piloto restrito e acompanhado. A aprovação para produção exige uma avaliação posterior da operação real.
