# Revisão dos cards e testes de regressão

## Correções

- Cards: a troca de condomínio agora atualiza o campo de apartamentos. A seleção anterior é removida; o campo fica desabilitado sem condomínio ou sem unidades cadastradas. Abertura por chamado e vistoria mantém a unidade correta, inclusive 194A.
- Chat do cliente: selecionar um chamado não grava mais uma conversa vazia. A conversa nasce na primeira mensagem, evitando uma gravação simultânea que podia impedir o envio imediato.
- Verificação no Chrome: corrigida leitura da porta de depuração e execução do navegador de teste no ambiente local. Ampliados os testes dos fluxos administrativos e do cliente.

## Validação executada

`npm test`: 25 testes aprovados, incluindo API, sessão e renovação, permissões, usuários, conflitos de versão, anexos, dinheiro, períodos e PostgreSQL local com RLS, auditoria e consumo de estoque. Inclui aplicação e reaplicação da migração do catálogo e comparação das 126 unidades.

`npm run test:browser`: Chrome real em modo headless, servidor local e provedor de dados simulado:

- Navegação das nove abas administrativas.
- Troca de condomínio nos cards para os 17 condomínios e comparação dos 126 apartamentos; limpeza de seleção, abertura pelo chamado e pela vistoria.
- Criação de card, mudança para em andamento, salvamento parcial e finalização.
- Vistoria simplificada com checklist e upload de foto.
- Inclusão de material no estoque e abertura do dashboard.
- Financeiro: responsáveis, valores decimais, períodos de dia, semana, mês e ano e navegação mensal.
- Cadastro de usuário e edição de função e permissões.
- Login do cliente, apartamentos restritos aos condomínios autorizados, chamado com foto e prévia.
- Chat do cliente para o administrador, resposta e leitura pelo cliente.
- Bloqueio do financeiro para cliente e logout.
- Nenhuma exceção JavaScript nem alerta inesperado no cenário concluído.

Verificação de sintaxe dos arquivos JavaScript do projeto, incluindo os arquivos antigos preservados.

## Limites desta revisão

Os testes não alteram o Supabase real nem enviam chamados, fotos ou usuários ao ambiente online. O teste do navegador simula a persistência; regras reais do banco são verificadas separadamente no PostgreSQL local. Não são testes de carga, de indisponibilidade do provedor, de celulares físicos ou de todos os estados possíveis. O limite de fotos permanece em 20 por vistoria, 5 MB por arquivo e 10 MB por envio.

O teste de navegador requer Chrome instalado no Windows, ou a variável `CHROME_BIN` apontando para seu executável. A opção de execução sem sandbox é usada somente no navegador local de testes com dados simulados.
