# Melhorias de segurança e continuidade

- O catálogo JavaScript exige sessão e só inclui os condomínios autorizados. Os apartamentos continuam protegidos pela API e por RLS.
- Páginas e conteúdo gerado usam ações delegadas com uma lista explícita de funções e argumentos permitidos, sem `eval` nem `Function`. A CSP bloqueia scripts embutidos e atributos `on*`. Estilos embutidos continuam permitidos por compatibilidade visual.
- O nome histórico Unique é apresentado como Unique Residence sem reescrever os registros, o histórico de auditoria ou os caminhos dos anexos. As políticas consideram os nomes equivalentes. Registros antigos podem manter sua unidade original ao serem atualizados; novos registros exigem unidade cadastrada.
- A sincronização periódica busca as coleções da aba ativa e para nas abas de backup, usuários e financeiro. Carregamento inicial, atualização manual e confirmação de gravações continuam buscando os dados necessários ao funcionamento existente. Os quatro contadores principais vêm do banco e respeitam as permissões, sem se limitar às páginas carregadas. Os gráficos e filtros locais ainda representam os registros carregados.
- A checagem de prontidão exige a versão 9 e verifica as funções de backup, financeiro, contadores e o catálogo.
- Backup é exclusivo do mestre no servidor e no banco, com controle de frequência. Usuários e senhas de Auth não são exportados; somente os perfis do aplicativo.

## Sessões persistidas, opção de infraestrutura

Sem configuração adicional, as sessões continuam na memória, para compatibilidade com o ambiente de testes. Para sobreviverem a reinícios, configure **ambas** as variáveis no servidor:

- `BOOK_SESSION_KEY`: chave secreta de 32 bytes representada por 64 caracteres hexadecimais, gerada por fonte criptográfica. Não é uma senha digitada por uma pessoa.
- `BOOK_SESSION_FILE`: caminho absoluto do arquivo em um **disco persistente**, por exemplo `/var/data/book-santos/sessions.enc` quando esse disco estiver efetivamente montado.

O arquivo usa AES-256-GCM e gravação por substituição; não contém tokens em texto aberto. Preserve a chave fora do repositório. Perder a chave encerra a possibilidade de recuperar as sessões, mas não apaga os dados do aplicativo. Configuração incompleta ou arquivo inválido impede inicialização, evitando uma falsa indicação de persistência.

Essa opção atende a uma única instância do servidor. Não compartilhe o arquivo entre várias instâncias. Para múltiplas réplicas, use uma solução centralizada de sessões. Um caminho em disco temporário da hospedagem não garante persistência entre publicações.

Não foi contratado nem configurado disco persistente nesta alteração. A autenticação em dois fatores e a recuperação de senha pela interface também não foram ativadas: precisam de um fluxo próprio e configuração de Auth/e-mail, sem impor bloqueio inesperado à conta mestre atual.
