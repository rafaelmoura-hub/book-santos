# Revisão visual e funcional — 30/10/2026

## Correções

- Rótulos de cards, fechamento, usuários e vistorias agora seguem o tema. Seletores antigos mantinham texto escuro no modo noturno.
- Cards finalizados mantêm cores legíveis e não aplicam filtro de cinza às fotos.
- Resumos de vistorias e botões de remoção usam as superfícies do tema.
- Janelas de formulários aparecem acima do cabeçalho, com o botão de fechar acessível.
- Conteúdo longo pode quebrar linhas nas janelas; mensagens de erro usam a cor de alerta do tema.

## Validação

- 69 testes automatizados aprovados, incluindo permissões, persistência, API, migrações e conflitos de gravação.
- Verificação de sintaxe dos 78 arquivos JavaScript da aplicação, testes e ferramentas.
- Chrome: 15 abas administrativas, telas do cliente, formulários, conversas preenchidas e seis documentos legais; modos claro e escuro, larguras de 390 e 1440 pixels.
- Fluxos de criação e mudança de status de cards, vistoria com foto, estoque, feedback vinculado a serviço, suporte, notificações, notas, lembretes, permissões e backup.
- Auditoria de contraste de texto, campos e placeholders, imagens quebradas e cortes horizontais. Nenhuma ocorrência remanescente nos estados exercitados.
- Banco online consultado somente para confirmar a versão 18. Estas correções não exigem migração.

## Limites

Os testes funcionais usam dados isolados. IA paga e gravação em HD externo são simuladas; não foram feitas alterações em registros reais. A auditoria automatizada não substitui testes com leitores de tela e diferentes aparelhos, nem garante todos os possíveis conteúdos futuros. As capturas e o relatório visual podem ser gerados com `BOOK_PREVIEW_DIR` ao executar `npm run test:browser`.
