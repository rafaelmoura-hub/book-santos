# Ditado por voz

Microfone nos campos de texto das telas administrativas e do cliente, incluindo comentários de cards, chat, suporte e notas. Campos dinâmicos são detectados automaticamente. Não inclui senhas, login, e-mail, pesquisa nem campos numéricos.

Toque no microfone, aceite o aviso e a permissão do navegador, fale em português e toque novamente para parar. Revise o texto e envie pelo botão habitual. O texto anterior é preservado e o ditado respeita a seleção e o limite do campo.

Usa SpeechRecognition/webkitSpeechRecognition do navegador: requer HTTPS e suporte do dispositivo. A disponibilidade varia conforme navegador, sistema e serviço. Quando indisponível, a digitação continua funcionando. O navegador pode processar a voz em seu serviço externo; o BOOK TASK não grava nem armazena áudio. A primeira utilização exibe esse aviso antes de pedir acesso.

Ao sair da página, enviar um formulário, fechar o diálogo ou trocar de campo, o ditado é interrompido. Uma sessão dura no máximo dois minutos; não há reinício automático. Não envia mensagens automaticamente.

Publicar assets/dictation.js, assets/ui.css, adm/admin.html, cliente/cliente.html e server/supabase-app.js. Não exige migração SQL nem chave de API. Testes automatizados usam reconhecimento simulado; confirmar permissão e qualidade da transcrição no aparelho real.

Referência: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
