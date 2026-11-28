(() => {
  const form = document.getElementById('privacyRequest');
  if (!form) return;
  const status = document.getElementById('privacyStatus');
  const message = () =>
    `Solicitação LGPD — BOOK TASK\n\nIdentificação: ${document.getElementById('privacyName').value.trim()}\nE-mail para resposta: ${document.getElementById('privacyEmail').value.trim()}\nPedido: ${document.getElementById('privacyType').value}\nDetalhes: ${document.getElementById('privacyDetails').value.trim()}\n\nSolicito retorno pelo e-mail indicado.\n`;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const url = URL.createObjectURL(new Blob([message()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solicitacao-lgpd-book-task.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent =
      'Arquivo preparado. Envie ao responsável pelo seu acesso. Nenhuma solicitação foi enviada ou registrada pelo site.';
  });
  document.getElementById('privacyMail')?.addEventListener('click', (event) => {
    if (!form.reportValidity()) return;
    location.href = `mailto:${event.currentTarget.dataset.email}?subject=${encodeURIComponent('Solicitação LGPD — BOOK TASK')}&body=${encodeURIComponent(message())}`;
    status.textContent =
      'Confira e envie no seu programa de e-mail. Abrir o programa não confirma o envio ou recebimento.';
  });
})();
