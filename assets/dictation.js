/* Browser speech recognition. Never submits forms or stores audio. */
(function () {
  'use strict';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const buttons = new WeakMap();
  let active = null,
    consented = false,
    status;
  function notify(text) {
    if (!status) {
      status = document.createElement('div');
      status.className = 'dictation-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      document.body.append(status);
    }
    status.textContent = text;
  }
  function eligible(field) {
    return (
      !field.matches('[data-no-dictation],input[type=search]') &&
      !/password|senha|email|login|token|codigo|cpf|cnpj|telefone|phone|cep|filtro|filter|busca/i.test(
        field.id + ' ' + field.name + ' ' + field.autocomplete,
      )
    );
  }
  function stop(abort = false) {
    if (!active) return;
    const session = active;
    clearTimeout(session.timer);
    if (!abort && !session.stopping) {
      session.stopping = true;
      try {
        session.recognition.stop();
        if (active === session)
          session.timer = setTimeout(() => {
            if (active === session) stop(true);
          }, 3000);
        return;
      } catch {}
    }
    active = null;
    session.button.setAttribute('aria-pressed', 'false');
    session.button.title = 'Ditar texto';
    session.button.setAttribute('aria-label', 'Ditar texto neste campo');
    try {
      session.recognition.abort();
    } catch {}
  }
  function start(field, button) {
    if (active?.field === field) {
      stop();
      notify('Ditado encerrado. Revise o texto antes de enviar.');
      return;
    }
    stop(true);
    if (field.disabled || field.readOnly || !field.isConnected) return;
    if (!Recognition || !window.isSecureContext) {
      notify('Ditado indisponível neste navegador. Você pode continuar digitando normalmente.');
      return;
    }
    if (!consented) {
      if (
        !window.confirm(
          'Para ditar, permita o microfone. O navegador pode enviar sua voz ao serviço de reconhecimento dele. O BOOK TASK recebe apenas o texto e não envia a mensagem automaticamente. Deseja continuar?',
        )
      )
        return;
      consented = true;
    }
    const recognition = new Recognition(),
      session = { recognition, field, button, seen: new Set(), timer: null };
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    active = session;
    button.setAttribute('aria-pressed', 'true');
    button.title = 'Parar ditado';
    button.setAttribute('aria-label', 'Parar ditado');
    notify('Ouvindo em português… Toque no microfone para parar.');
    recognition.onresult = (event) => {
      if (active !== session) return;
      if (field.disabled || field.readOnly || !field.isConnected) {
        stop(true);
        return;
      }
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          const preview = result[0].transcript.trim();
          if (preview) notify('Ouvindo: ' + preview.slice(0, 160));
          continue;
        }
        if (session.seen.has(i)) continue;
        session.seen.add(i);
        const words = result[0].transcript.trim();
        if (!words) continue;
        const from = field.selectionStart ?? field.value.length,
          to = field.selectionEnd ?? from;
        const left = field.value.slice(0, from),
          right = field.value.slice(to);
        const insertion =
          (left && !/\s$/.test(left) ? ' ' : '') +
          words +
          (right && !/^\s|^[.,;:!?]/.test(right) ? ' ' : '');
        const limit = field.maxLength >= 0 ? field.maxLength : Infinity;
        if (left.length + right.length + insertion.length > limit) {
          stop(true);
          notify('O texto ditado ultrapassa o limite do campo. Encurte o texto para continuar.');
          return;
        }
        field.setRangeText(insertion, from, to, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    recognition.onerror = (event) => {
      if (active !== session) return;
      stop(true);
      notify(
        {
          'not-allowed':
            'Microfone não autorizado. Libere a permissão nas configurações do navegador.',
          'service-not-allowed': 'O navegador não permite este serviço de ditado.',
          'audio-capture': 'Microfone não encontrado ou ocupado.',
          network: 'Falha de conexão no ditado. Seu texto foi preservado.',
          'no-speech': 'Nenhuma fala detectada. Toque no microfone para tentar novamente.',
          'language-not-supported': 'Português não disponível no reconhecimento deste navegador.',
        }[event.error] || 'Ditado interrompido. Seu texto foi preservado.',
      );
    };
    recognition.onend = () => {
      if (active === session) {
        stop(true);
        notify('Ditado encerrado. Revise o texto antes de enviar.');
      }
    };
    try {
      recognition.start();
      session.timer = setTimeout(() => {
        if (active === session) {
          stop();
          notify('Ditado encerrado após dois minutos. Toque no microfone para continuar.');
        }
      }, 120000);
    } catch {
      stop(true);
      notify('Não foi possível iniciar o microfone. Continue digitando ou tente novamente.');
    }
  }
  function scan() {
    document.querySelectorAll('textarea,input[type=text],input:not([type])').forEach((field) => {
      if (buttons.has(field)) {
        const button = buttons.get(field),
          disabled = field.disabled || field.readOnly;
        if (button.disabled !== disabled) button.disabled = disabled;
        return;
      }
      if (!eligible(field)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dictation-button';
      button.title = 'Ditar texto';
      button.setAttribute('aria-label', 'Ditar texto neste campo');
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
      button.disabled = field.disabled || field.readOnly;
      button.onclick = () => start(field, button);
      field.after(button);
      buttons.set(field, button);
      if (!Recognition || !window.isSecureContext) {
        button.setAttribute('aria-label', 'Ditado indisponível neste navegador');
        button.title = 'Ditado indisponível neste navegador; continue digitando';
      }
      field.addEventListener('keydown', () => {
        if (active?.field === field) stop(true);
      });
    });
    if (
      active &&
      (!active.field.isConnected ||
        active.field.disabled ||
        active.field.readOnly ||
        active.field.closest('dialog:not([open]),[hidden]') ||
        active.field.getClientRects().length === 0)
    )
      stop(true);
  }
  function init() {
    scan();
    new MutationObserver(scan).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'open', 'disabled', 'readonly', 'style'],
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(true);
    });
    window.addEventListener('pagehide', () => stop(true));
    document.addEventListener('submit', () => stop(true), true);
    document.addEventListener('close', () => stop(true), true);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
