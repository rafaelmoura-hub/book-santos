/* Local enhancements: no telemetry, remote assets or new persistent storage. */
(() => {
  const start = () => {
    const main = document.querySelector('main') || document.querySelector('.login-box');
    if (main) {
      main.id ||= 'conteudo';
      main.setAttribute('tabindex', '-1');
      const skip = document.createElement('a');
      skip.className = 'skip-link';
      skip.href = '#' + main.id;
      skip.textContent = 'Pular para o conteúdo';
      skip.addEventListener('click', () => main.focus());
      document.body.prepend(skip);
    }
    if (!document.querySelector('.legal-footer')) {
      const footer = document.createElement('footer');
      footer.className = 'legal-footer';
      const nav = document.createElement('nav');
      nav.setAttribute('aria-label', 'Privacidade e condições de uso');
      for (const [path, text] of [
        ['privacidade', 'Privacidade'],
        ['termos', 'Termos'],
        ['cookies', 'Cookies'],
        ['reembolso', 'Reembolso'],
        ['lgpd', 'Direitos LGPD'],
        ['empresa', 'Empresa'],
      ]) {
        const a = document.createElement('a');
        a.href = '/legal/' + path;
        a.textContent = text;
        nav.append(a);
      }
      const notice = document.createElement('p');
      notice.textContent =
        'Usamos recursos necessários para acesso e funcionamento. Sem rastreadores publicitários nesta versão.';
      footer.append(nav, notice);
      document.body.append(footer);
    }
    let active = null,
      previous = null,
      queued = false;
    const visible = (node) => !!(node && !node.hidden && node.getClientRects().length);
    const controls = (node) =>
      [
        ...node.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex="0"]'),
      ].filter((e) => visible(e) && !e.disabled && e.type !== 'hidden');
    function enhance() {
      queued = false;
      document.querySelectorAll('span.fechar[data-on-click]').forEach((span) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = span.className;
        button.setAttribute('data-on-click', span.getAttribute('data-on-click'));
        button.textContent = span.textContent;
        button.setAttribute('aria-label', 'Fechar janela');
        span.replaceWith(button);
      });
      document.querySelectorAll('input:not([type="hidden"]),textarea,select').forEach((input) => {
        if (
          input.labels?.length ||
          input.hasAttribute('aria-label') ||
          input.hasAttribute('aria-labelledby')
        )
          return;
        const label = input.previousElementSibling;
        if (label?.tagName === 'LABEL' && !label.querySelector('input,select,textarea')) {
          input.id ||= 'campo-' + crypto.randomUUID();
          label.htmlFor = input.id;
        } else if (input.placeholder) input.setAttribute('aria-label', input.placeholder);
      });
      document.querySelectorAll('img:not([alt])').forEach((img) => {
        img.alt = 'Imagem anexada ao registro';
      });
      document.querySelectorAll('article.linha-chamado[data-on-click]').forEach((card) => {
        const text = card.querySelector('div');
        if (!text || text.querySelector('button')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'card-open';
        button.setAttribute('data-on-click', card.getAttribute('data-on-click'));
        while (text.firstChild) button.append(text.firstChild);
        text.append(button);
      });
      document.querySelectorAll('article.card-os[data-on-click]').forEach((card) => {
        const heading = card.querySelector('.os-topo strong');
        if (!heading || heading.closest('button')) return;
        card.removeAttribute('role');
        card.removeAttribute('tabindex');
        card.removeAttribute('data-on-keydown');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'card-open';
        button.setAttribute('data-on-click', card.getAttribute('data-on-click'));
        button.setAttribute(
          'aria-label',
          `Abrir ${heading.textContent}: ${card.querySelector('h3')?.textContent || ''}`,
        );
        heading.replaceWith(button);
        button.append(heading);
      });
      document
        .querySelectorAll('nav .aba')
        .forEach((button) =>
          button.setAttribute(
            'aria-current',
            button.classList.contains('ativa') ? 'page' : 'false',
          ),
        );
      const next = [...document.querySelectorAll('.modal')].filter(visible).at(-1) || null;
      if (next !== active) {
        const old = active;
        active = next;
        if (next) {
          if (!old) previous = document.activeElement;
          next.setAttribute('role', 'dialog');
          next.setAttribute('aria-modal', 'true');
          if (!next.hasAttribute('aria-labelledby')) {
            const h = next.querySelector('h2,h3');
            if (h) {
              h.id ||= next.id + 'TituloAcessivel';
              next.setAttribute('aria-labelledby', h.id);
            } else next.setAttribute('aria-label', 'Detalhes do registro');
          }
          next.tabIndex = -1;
          (controls(next)[0] || next).focus({ preventScroll: true });
        } else if (visible(previous)) previous.focus({ preventScroll: true });
      }
    }
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) => r.type === 'childList' || ['style', 'class', 'hidden'].includes(r.attributeName),
        ) &&
        !queued
      ) {
        queued = true;
        requestAnimationFrame(enhance);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.querySelector('dialog:modal')) {
        const panel = document.activeElement?.closest('dialog[open].workspace-dialog');
        const close = panel?.querySelector('.workspace-heading button');
        if (close && !close.disabled) {
          event.preventDefault();
          close.click();
          return;
        }
      }
      if (!active || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        const close = active.querySelector('.fechar');
        if (close && !close.disabled) {
          event.preventDefault();
          close.click();
        }
      }
      if (event.key === 'Tab') {
        const items = controls(active),
          first = items[0] || active,
          last = items.at(-1) || active;
        if (
          !active.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    });
    document.addEventListener('focusin', (event) => {
      if (active && !active.contains(event.target) && !document.querySelector('dialog[open]'))
        (controls(active)[0] || active).focus();
    });
    enhance();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
