window.BookNotifications = (() => {
  let user,
    busy = false,
    started = false;
  const seen = new Set();
  const el = (id) => document.getElementById(id);
  function badge(node, count) {
    if (!node) return;
    let marker = node.querySelector('.workspace-badge');
    if (!marker) {
      marker = document.createElement('span');
      marker.className = 'workspace-badge';
      node.append(' ', marker);
    }
    marker.textContent = count > 99 ? '99+' : String(count);
    marker.hidden = !count;
  }
  function notify(id, title, body, action) {
    if (seen.has(id)) return;
    seen.add(id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'notification-item';
    const strong = document.createElement('strong'),
      text = document.createElement('span');
    strong.textContent = title;
    text.textContent = body;
    item.append(strong, text);
    item.onclick = () => {
      el('notificationsPanel').hidden = true;
      el('notificationsToggle').setAttribute('aria-expanded', 'false');
      Promise.resolve()
        .then(() => action?.())
        .catch((error) => {
          el('notificationsStatus').textContent = error.message;
        });
    };
    el('notificationsList').prepend(item);
    while (el('notificationsList').children.length > 30) el('notificationsList').lastChild.remove();
    el('notificationsEmpty').hidden = true;
    badge(el('notificationsToggle'), el('notificationsList').children.length);
    const toast = el('notificationToast');
    toast.textContent = title + ': ' + body;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => (toast.hidden = true), 7000);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notice = new Notification(title, { body, tag: id });
        notice.onclick = () => {
          window.focus();
          action?.();
          notice.close();
        };
      } catch {
        /* Notificações internas continuam disponíveis. */
      }
    }
  }
  async function permission() {
    const status = el('notificationsStatus');
    if (!('Notification' in window)) {
      status.textContent = 'Use os avisos internos neste navegador.';
      return;
    }
    const result = await Notification.requestPermission();
    status.textContent =
      result === 'granted'
        ? 'Notificações do navegador ativadas.'
        : 'Avisos internos continuam ativos. Verifique a permissão do navegador para receber alertas do sistema.';
  }
  async function refresh() {
    if (!user || busy) return;
    busy = true;
    try {
      const data = await BookAPI.request('/api/notifications');
      const chat = data.chat || {},
        support = data.support || {};
      badge(
        document.querySelector('.workspace-actions [data-workspace-target="supportDialog"]'),
        support.count || 0,
      );
      badge(el('abaSuporte'), support.count || 0);
      const chatBadge = el('chatBadge');
      if (chatBadge) {
        chatBadge.textContent = chat.count > 99 ? '99+' : String(chat.count || 0);
        chatBadge.hidden = !chat.count;
      }
      if (user.funcao === 'cliente') badge(el('botaoSuporte'), chat.count || 0);
      if (chat.latest)
        notify('chat:' + chat.latest.id, 'Nova mensagem no chat', chat.latest.body, async () => {
          await BookStore.refresh(true);
          if (user.funcao === 'adm') mostrarAba('chat');
          else if (el('chatCliente').hidden) alternarChatCliente();
        });
      if (support.latest)
        notify(
          'support:' + support.latest.id,
          'Nova mensagem de suporte',
          support.latest.body,
          () => BookWorkspace.openTicket(support.latest.ticket),
        );
      if (user.funcao === 'adm') {
        const reminders = await BookAPI.request('/api/workspace/reminders-due', {
          method: 'POST',
          body: '{}',
        });
        for (const reminder of reminders) {
          notify('reminder:' + reminder.id + ':' + reminder.due, 'Lembrete', reminder.title, () =>
            BookCollaboration.openReminderNote(reminder.id),
          );
          await BookAPI.request('/api/workspace/reminders-ack', {
            method: 'POST',
            body: JSON.stringify({ id: reminder.id, due: reminder.due }),
          });
        }
      }
      el('notificationsStatus').textContent =
        'Atualizado. Avisos com o site aberto; lembretes vencidos aparecem ao voltar.';
      window.dispatchEvent(new CustomEvent('book:notifications', { detail: data }));
    } catch (error) {
      if (el('notificationsStatus')) el('notificationsStatus').textContent = error.message;
    } finally {
      busy = false;
    }
  }
  function init(profile) {
    if (started || !profile) return;
    started = true;
    user = profile;
    const box = document.createElement('div');
    box.className = 'notifications-control';
    box.innerHTML =
      '<button id="notificationsToggle" type="button" class="botao-secundario" aria-expanded="false" aria-controls="notificationsPanel">🔔 Avisos</button><section id="notificationsPanel" class="notifications-panel" hidden aria-label="Notificações"><div class="titulo-secao"><h2>Notificações</h2><button type="button" id="notificationsClose" class="botao-secundario">Fechar</button></div><button id="notificationsEnable" type="button" class="botao-secundario">Ativar notificações</button><button id="notificationsClear" type="button" class="botao-secundario">Limpar avisos</button><p id="notificationsStatus" role="status"></p><p id="notificationsEmpty">Nenhum aviso nesta sessão.</p><div id="notificationsList"></div></section>';
    document.querySelector('header').append(box);
    document.body.append(el('notificationsPanel'));
    const toast = document.createElement('p');
    toast.id = 'notificationToast';
    toast.className = 'notification-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    document.body.append(toast);
    const toggle = (show) => {
      el('notificationsPanel').hidden = !show;
      el('notificationsToggle').setAttribute('aria-expanded', String(show));
    };
    el('notificationsToggle').onclick = () => {
      toggle(el('notificationsPanel').hidden);
      refresh();
    };
    el('notificationsClose').onclick = () => toggle(false);
    el('notificationsEnable').onclick = permission;
    el('notificationsClear').onclick = () => {
      el('notificationsList').replaceChildren();
      el('notificationsEmpty').hidden = false;
      badge(el('notificationsToggle'), 0);
    };
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !el('notificationsPanel').hidden) {
          toggle(false);
          event.preventDefault();
          event.stopPropagation();
          el('notificationsToggle').focus();
        }
      },
      true,
    );
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
    window.addEventListener('book:data', () => {
      clearTimeout(init.timer);
      init.timer = setTimeout(refresh, 500);
    });
    refresh();
    setInterval(refresh, 15000);
  }
  return { init, refresh, permission, notify };
})();
