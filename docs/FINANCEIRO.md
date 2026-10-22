# Financeiro e valores monetários

## Ativar

Execute todo o arquivo `supabase/migrations/202610220005_finance.sql` no SQL Editor do Supabase, após as migrações anteriores. A migração adiciona a consulta financeira e atualiza a função transacional de gravação. Pode ser reaplicada; não apaga registros nem recalcula custos históricos em massa. Depois, use a versão atual do site no Render.

Para habilitar o histórico por período, aplique depois `supabase/migrations/202610220006_finance_history.sql`. Essa migração adiciona uma consulta compatível com os filtros novos; não altera cards, valores ou contas. Não é necessário trocar as chaves do Render.

## Resumo por responsável

A aba Financeiro fica no painel administrativo, disponível para administradores e mestre. Mostra Todos, Hóspede, Proprietário, Book Santos, Airbnb, Governança e Sem responsável. Responsáveis diferentes já existentes no histórico também aparecem.

Cada card informa condomínio, apartamento, assunto, descrição, responsável, status, valor do serviço, valor do material e total. Os totais distinguem cards finalizados dos valores provisórios de cards em andamento/abertos. Não existe confirmação de recebimento, baixa de pagamento ou conciliação bancária nesta entrega.

A consulta respeita o acesso por hotel no banco. Os totais abrangem **todos** os cards autorizados, mesmo quando a lista tem mais páginas. A lista carrega cinquenta cards por vez. Clique em Atualizar financeiro para consultar os valores novamente; mudar de aba e retornar também atualiza a consulta.

## Histórico por dia, semana, mês ou ano

Use Histórico por e selecione a data de referência. O período selecionado filtra a lista **e todos os totais por responsável** no banco. Os botões Anterior e Próximo navegam entre os períodos. Todo o histórico mantém a consulta sem limite de datas.

- Dia: somente a data escolhida.
- Semana: segunda a domingo da semana da data escolhida.
- Mês: primeiro ao último dia do mês escolhido.
- Ano: primeiro ao último dia do ano escolhido.

O intervalo aparece na tela. Internamente, o início é inclusivo e o fim é exclusivo, para não duplicar registros na virada do período. A data financeira vem do fechamento informado no card. Se não existir, usa a conclusão registrada ou a abertura, incluindo o formato brasileiro dos registros antigos. Timestamps são convertidos para America/Sao_Paulo. Registros sem data válida aparecem em Todo o histórico como Sem data e ficam fora dos filtros por período.

O filtro acompanha a aba do responsável escolhida, e Carregar mais mantém esse mesmo período. A regra de precisão monetária de duas casas permanece inalterada.

## Dinheiro e precisão

- Todos os valores monetários exibidos usam BRL, como `R$ 1.234,56`.
- Campos de edição de dinheiro usam duas casas decimais, incluindo os zeros. O navegador pode usar vírgula ou ponto conforme o idioma; a representação enviada é normalizada.
- `assets/money.js` faz somas em centavos inteiros com BigInt. O custo dos materiais multiplica quantidades decimais de forma exata e arredonda a soma ao centavo, pelo mesmo critério do banco.
- A API recusa dinheiro negativo, acima de `999999999999.99` ou com frações menores que um centavo. A serialização numérica mantém compatibilidade com o banco anterior; não faz cálculos com ponto flutuante.
- No PostgreSQL, a função transacional usa `numeric` e grava os campos monetários JSON como textos decimais de duas casas, por exemplo `"12.30"`. O custo dos materiais e o total continuam sendo conferidos pelo banco.
- Quantidades de material e números de apartamentos não são dinheiro e mantêm seu tratamento próprio. Colunas extras livres do estoque são texto, sem semântica monetária automática.
- O histórico anterior continua legível: os valores são apresentados com duas casas. A migração não altera documentos históricos, autoria ou custos já registrados. Novas gravações passam pelas regras novas.

Foram revisados estoque, cálculo de materiais, rascunho e finalização de cards, detalhes administrativos, histórico de condomínios e nova consulta financeira. Abrir um fechamento sem consumo de estoque preserva o valor de material informado manualmente.

## Verificação

Os testes cobrem `0.10 + 0.20 = 0.30`, somas repetidas de centavos, quantidades fracionárias, precisão extra/negativos, valores grandes, persistência decimal no PostgreSQL, paginação com totais completos e isolamento por hotel e por função. O teste local no Chrome verifica a aba Financeiro, a seleção por responsável e a preservação de material manual.

Após aplicar o SQL e publicar, valide com cards de teste no Supabase real. Nenhum card real foi criado ou modificado pelos testes locais desta entrega.
