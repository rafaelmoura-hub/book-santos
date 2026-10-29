# Apoio à decisão no BOOK TESK — 29/10/2026

## Referências e alcance da avaliação

A [página pública da Optimus](https://lp.optimus.br.com/manutencao-predial) apresenta manutenção preventiva, evidências digitais, indicadores por unidade/equipe e alerta de reposição. É uma apresentação comercial, não um acesso ao produto ou validação de seus resultados anunciados. Não foram reproduzidas promessas percentuais de produtividade, ausência de falhas, certificações ou identidade visual.

O [pipe informado](https://app.pipefy.com/pipes/302508165) exige autenticação e não foi acessado nesta revisão. A referência prática de Pipefy continua sendo a gravação fornecida anteriormente, analisada em [ROTINA-BOOK-TESK.md](ROTINA-BOOK-TESK.md). O conteúdo atual desse pipe específico não foi confirmado. Não houve login, importação ou alteração de dados nesses dois serviços.

SAD foi interpretado como **Sistema de Apoio à Decisão**: reunir informação confiável, explicar prioridades e levar ao registro em que a pessoa decide e age. Não é um sistema que toma decisões, compra materiais ou declara vistorias feitas sem confirmação humana.

| Necessidade | Situação no BOOK TESK | Aplicação desta revisão |
| --- | --- | --- |
| Acompanhar fluxo de trabalho | Cards e processos já possuem etapas, responsáveis, prazos e histórico | Reaproveitados; painel abre a agenda, os filtros e o acompanhamento existentes. |
| Evidências e rastreabilidade | Fotos, checklists, versões e auditorias já existem | Preservados, sem outro cadastro concorrente de manutenção. |
| Visão gerencial | Gráficos anteriores dependem dos registros carregados no navegador | Novo resumo global no banco, respeitando permissões, com totais, etapas, condomínios e responsáveis. Gráficos antigos permanecem como consulta complementar, identificada como parcial. |
| Saber o próximo passo | Exigia percorrer cards e filtros | Fila com motivo explícito: urgentes, vencidos, vencendo hoje, sem responsável e demais prazos. |
| Organizar preventivas | Vistorias já têm ciclo trimestral | Consolidação de todos os apartamentos autorizados e da última vistoria válida, com referência trimestral e conferência dos próximos 30 dias. |
| Reposição | Estoque único e compras já existem | Mínimo opcional por material, sinalização no estoque e alertas no painel. Compra continua pelo fluxo existente. |
| Custos | Financeiro já tem totalização própria no banco | Atalho para consulta existente, sem somar ou duplicar lançamentos por outro caminho. |

Não foi acrescentada localização de funcionários: não há necessidade operacional demonstrada para essa nova coleta de dados. Cadastro detalhado de equipamentos, planos por ativo, satisfação específica de cada serviço e integrações externas podem ser avaliados em outra etapa com requisitos próprios; não foram apresentados como recursos já implantados.

## Como funciona a Visão geral

1. Escolha um condomínio ou todos os autorizados.
2. Confira serviços em aberto, vencidos, vencendo hoje, urgentes, sem responsável e sem prazo válido.
3. Consulte até 12 serviços prioritários, com o motivo da posição. A ordenação é determinística, sem pontuação de IA ou promessa de resultado.
4. Use os agrupamentos por condomínio, responsável e etapa. Contagem de pendências não mede horas de trabalho ou desempenho individual.
5. Abra o serviço original ou sua agenda para agir. Acesso de escrita continua exigindo a aba Cards; ter a Visão geral não concede permissão de alteração.
6. Exporte o resumo CSV com os totais e agrupamentos. Não é exportação completa de todos os cards nem documento de certificação. O CSV neutraliza células que poderiam virar fórmulas.

Serviços em etapa Resolvido ou Recusa proprietário saem da fila de pendências. Um card financeiramente finalizado prevalece como Resolvido; um card reaberto não permanece fechado apenas por uma etapa antiga. Nome histórico Unique é consolidado como Unique Residence na leitura do painel, sem alterar registros antigos.

Totais consideram todos os registros autorizados no banco, inclusive além da primeira página da interface. Detalhes são limitados a 12 serviços, 20 unidades e 20 materiais; os totais não têm esse corte. A tela informa a atualização no horário de São Paulo, atualiza a cada minuto enquanto visível e sem diálogo aberto e oferece atualização manual. Não há promessa de informação instantânea ou notificação fora do site.

O painel carrega somente quando usado. Dados idênticos recentes podem ser reaproveitados por até 30 segundos na página. Respostas antigas de uma seleção anterior são ignoradas; falhas retiram o resultado anterior para evitar confundir valores desatualizados com o filtro atual. Gráficos antigos são recolhidos inicialmente e carregam dados somente quando abertos. O painel mantém tabelas e ações acessíveis por teclado e evita dependência de cor para explicar alertas.

## Preventivas e estoque

**Vistorias:** referência = última data válida não futura + três meses de calendário. Dia inexistente no mês de destino é ajustado pelo calendário. Apartamento sem data não é declarado vencido: aparece como sem registro, para conferência. Não há geração de vistoria executada, OS automática, visita agendada ou mensagem enviada ao morador. A equipe continua registrando o que foi efetivamente feito.

**Estoque:** informe o mínimo na planilha existente. Campo vazio não inventa um limite; o alerta considera apenas saldo zero. Com mínimo configurado, alerta quando quantidade ≤ mínimo, inclusive em igualdade. Aceita zero e até duas casas decimais, com validação no servidor e no banco. A escrita preserva controle de versões, auditoria, preços e regras de consumo já existentes. Estoque é global, e o painel identifica expressamente que esse bloco não muda pelo filtro de condomínio. Exige acesso à aba Estoque.

Dados de vistorias aparecem somente para quem já possui permissão dessa coleção. A função de resumo usa `security invoker`, de modo que RLS continua filtrando tabelas, histórico e perfis. Cliente ou administrador sem Visão geral não executa o resumo. O filtro de condomínio é validado também no servidor.

## Ativação

Aplicar no SQL Editor do Supabase, depois da migração 14:

`supabase/migrations/202610290015_decision.sql`

A migração é transacional e repetível; cria resumo de leitura e validação do mínimo do estoque, sem apagar ou importar registros. Depois, `select public.book_schema_version();` deve retornar **15**.

O servidor aceita versões **14 e 15**. Sem a 15, o painel mostra a pendência; login e outras abas não são bloqueados por esse novo módulo. A validação do mínimo diretamente no banco e os indicadores globais exigem a 15. Não houve aplicação dessa migração no projeto online nesta revisão.

## Identificação da empresa

CNPJ fornecido pelo usuário: **08.941.697/0001-07**, com dígitos verificadores válidos. Incluído como valor público padrão em `/legal/empresa`, substituível por configuração explícita do servidor. Isso não certifica situação cadastral, poderes de representação ou titularidade da marca. Razão social, endereço e contato de privacidade ainda aguardam confirmação; contatos encontrados em consultas públicas não foram adotados como canal LGPD sem autorização.

## Validação

- 60 testes automatizados aprovados, com PostgreSQL local, RLS, repetição da migração, resumo de mais de 100 serviços, datas inválidas/futuras, fechamento e reabertura, isolamento por condomínio e mínimo de estoque.
- Navegador com 18 abas e dados simulados: filtros do SAD, abertura da agenda sem duplicação, mínimo editável no estoque, telas de 390/1440 pixels e fluxos anteriores.
- Nenhum registro operacional real foi alterado, não houve cobrança de IA nem acesso autenticado aos sites de referência.
- A publicação na branch principal continua dependendo da autorização de mesclagem solicitada anteriormente.
