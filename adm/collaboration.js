window.BookCollaboration = (() => {
  let user,
    feedbacks = [],
    offset = 0,
    editing = null,
    attachments = [],
    saving = false,
    reminders = [],
    selectedNote,
    team = [],
    older = null,
    teamBusy = false;
  const el = (id) => document.getElementById(id);
  const request = (url, body) =>
    BookAPI.request(url, body ? { method: 'POST', body: JSON.stringify(body) } : {});
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const status = (id, text) => {
    el(id).textContent = text;
  };
  async function loadFeedbacks() {
    if (!BookWorkspace.can('feedbacks')) return;
    status('feedbackStatus', 'Carregando…');
    try {
      const rows = await request(
        '/api/feedbacks?offset=' +
          offset +
          '&grade=' +
          encodeURIComponent(el('feedbackGradeFilter').value),
      );
      feedbacks = rows.slice(0, 50);
      el('feedbackPrevious').disabled = !offset;
      el('feedbackNext').disabled = rows.length <= 50;
      renderFeedbacks();
      status('feedbackStatus', '');
    } catch (error) {
      status('feedbackStatus', error.message);
    }
  }
  function renderFeedbacks() {
    el('feedbackList').replaceChildren(
      ...feedbacks.map((f) => {
        const card = document.createElement('article');
        card.className = 'chamado feedback-card';
        card.innerHTML = `<div class="titulo-secao"><h3>${esc(f.data.assunto)}</h3><span class="feedback-grade" data-grade="${esc(f.data.grau)}">${esc(f.data.grau)}</span></div><p>${esc(f.hotel)} · Apartamento ${esc(f.data.apartamento)}</p><p class="collaboration-text">${esc(f.data.observacoes)}</p><div class="feedback-files"></div><div class="feedback-card-actions"></div>`;
        const files = card.querySelector('.feedback-files');
        for (const a of f.data.anexos || []) {
          const link = document.createElement('a');
          link.textContent = a.nome;
          link.href = a.dados;
          link.target = '_blank';
          link.rel = 'noopener';
          files.append(link);
        }
        const phase = document.createElement('p');
        phase.className = 'routine-stage';
        phase.textContent = 'Etapa: ' + (f.flowPhase || 'Feedback');
        card.querySelector('.titulo-secao').after(phase);
        const imported = f.data.importacao?.parcial === true;
        if (imported) {
          const info = document.createElement('p');
          info.className = 'collaboration-text';
          info.textContent =
            'Histórico importado · ' +
            f.data.importacao.criadoEmLocal.replace('T', ' ') +
            ' · Fuso de origem não informado. Imóvel e responsável precisam de conferência antes de editar ou gerar serviço.';
          card.append(info);
          const original = f.data.importacao.original || {};
          for (const [label, key] of [
            ['Responsável original', 'Responsáveis'],
            ['Assunto principal', 'Assunto principal'],
            ['Tipo de comentário', 'Tipo de Comentário'],
            ['Data do feedback', 'Data do feedback'],
            ['Resposta ao cliente', 'Resposta Ao Cliente'],
          ]) {
            if (original[key]) {
              const p = document.createElement('p');
              p.className = 'collaboration-text';
              p.textContent = label + ': ' + original[key];
              card.append(p);
            }
          }
        }
        const actions = card.querySelector('.feedback-card-actions');
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'botao-secundario';
        edit.textContent = 'Editar feedback';
        edit.disabled = imported;
        edit.onclick = () => openFeedback(f);
        actions.append(edit);
        const follow = document.createElement('button');
        follow.type = 'button';
        follow.className = 'botao-secundario';
        follow.textContent = 'Etapas e resposta ao cliente';
        follow.onclick = () => BookRoutine.openFlow('feedbacks', f.id);
        actions.append(follow);
        if (f.service_id) {
          const view = document.createElement('button');
          view.type = 'button';
          view.className = 'botao-secundario';
          view.textContent = 'Card de serviço #' + f.service_id;
          view.disabled = !BookWorkspace.can('os');
          view.onclick = async () => {
            mostrarAba('os');
            await BookStore.refresh(true);
            abrirOS(f.service_id);
          };
          actions.append(view);
        } else if (BookWorkspace.can('os') && !imported) {
          const create = document.createElement('button');
          create.type = 'button';
          create.className = 'acao-principal';
          create.textContent = 'Abrir card de serviço';
          create.onclick = async () => {
            if (
              saving ||
              !confirm('Criar um card de serviço com os dados e anexos deste feedback?')
            )
              return;
            saving = true;
            create.disabled = true;
            try {
              const result = await request('/api/feedbacks/service', {
                id: f.id,
                version: Number(f.version),
                recordId: String(BookStore.id()),
              });
              await loadFeedbacks();
              status('feedbackStatus', 'Card #' + result.id + ' criado.');
            } catch (error) {
              status('feedbackStatus', error.message);
            } finally {
              saving = false;
              create.disabled = false;
            }
          };
          actions.append(create);
        }
        return card;
      }),
    );
    if (!el('feedbackList').children.length)
      el('feedbackList').textContent = 'Nenhum feedback nesta página com esse grau.';
  }
  function fillApartments(value = '') {
    const select = el('feedbackApartment');
    select.replaceChildren(new Option('Selecione o apartamento', ''));
    for (const apartment of BookStore.apartments(el('feedbackHotel').value))
      select.append(new Option(apartment, apartment));
    select.value = value;
    select.disabled = !el('feedbackHotel').value;
  }
  function existingFiles() {
    el('feedbackExisting').replaceChildren(
      ...attachments.map((file, index) => {
        const row = document.createElement('div');
        row.className = 'attachment-row';
        const name = document.createElement('span');
        name.textContent = file.nome;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'botao-secundario';
        remove.textContent = 'Remover';
        remove.onclick = () => {
          attachments.splice(index, 1);
          existingFiles();
        };
        row.append(name, remove);
        return row;
      }),
    );
  }
  function openFeedback(feedback) {
    if (saving) return;
    editing = feedback || { id: crypto.randomUUID(), version: 0 };
    attachments = structuredClone(feedback?.data.anexos || []);
    el('feedbackForm').reset();
    el('feedbackFiles').dispatchEvent(new Event('change'));
    el('feedbackDialogTitle').textContent = feedback ? 'Editar feedback' : 'Novo feedback';
    el('feedbackSubject').value = feedback?.data.assunto || '';
    el('feedbackHotel').value = feedback?.hotel || '';
    el('feedbackHotel').disabled = !!feedback;
    fillApartments(feedback?.data.apartamento || '');
    el('feedbackGrade').value = feedback?.data.grau || 'Razoável';
    el('feedbackNotes').value = feedback?.data.observacoes || '';
    el('feedbackCreateService').checked = false;
    el('feedbackCreateService').disabled = !!feedback?.service_id || !BookWorkspace.can('os');
    existingFiles();
    status('feedbackFormStatus', '');
    el('feedbackDialog').showModal();
  }
  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ nome: file.name, dados: reader.result });
      reader.onerror = () => reject(Error('Não foi possível ler ' + file.name));
      reader.readAsDataURL(file);
    });
  async function saveFeedback(event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const buttons = [...el('feedbackDialog').querySelectorAll('button')];
    buttons.forEach((b) => (b.disabled = true));
    el('feedbackFiles').disabled = true;
    let saved = false;
    try {
      const files = [...el('feedbackFiles').files];
      BookStore.validateFiles(files);
      if (attachments.length + files.length > 20) throw Error('Use até 20 anexos por feedback.');
      status('feedbackFormStatus', files.length ? 'Carregando e enviando anexos…' : 'Salvando…');
      el('feedbackDialog').setAttribute('aria-busy', 'true');
      const data = {
        assunto: el('feedbackSubject').value.trim(),
        hotel: el('feedbackHotel').value,
        apartamento: el('feedbackApartment').value,
        grau: el('feedbackGrade').value,
        observacoes: el('feedbackNotes').value,
        anexos: [...attachments, ...(await Promise.all(files.map(readFile)))],
      };
      await request('/api/feedbacks', { id: editing.id, version: Number(editing.version), data });
      saved = true;
      if (el('feedbackCreateService').checked)
        await request('/api/feedbacks/service', {
          id: editing.id,
          version: Number(editing.version) + 1,
          recordId: String(BookStore.id()),
        });
      el('feedbackDialog').close();
      offset = 0;
      await loadFeedbacks();
      status('feedbackStatus', 'Feedback salvo.');
    } catch (error) {
      if (saved) {
        el('feedbackDialog').close();
        await loadFeedbacks();
        status(
          'feedbackStatus',
          'Feedback salvo. O card de serviço não foi confirmado: ' +
            error.message +
            ' Confira a lista antes de tentar novamente.',
        );
      } else status('feedbackFormStatus', error.message);
    } finally {
      saving = false;
      buttons.forEach((b) => (b.disabled = false));
      el('feedbackFiles').disabled = false;
      el('feedbackDialog').removeAttribute('aria-busy');
    }
  }
  async function loadEvaluations(more = false) {
    if (teamBusy || !BookWorkspace.can('avaliacoes')) return;
    teamBusy = true;
    try {
      const area = el('evaluationThread'),
        atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;
      const rows = await request(
        '/api/evaluations' +
          (more && older
            ? '?before=' + encodeURIComponent(older.time) + '&beforeId=' + older.id
            : ''),
      );
      const page = rows.slice(0, 50);
      team = more ? [...team, ...page] : page;
      older = page.length ? { time: page.at(-1).created_at, id: page.at(-1).id } : null;
      el('evaluationMore').hidden = rows.length <= 50;
      area.replaceChildren(
        ...[...team].reverse().map((m) => {
          const row = document.createElement('article');
          row.className = 'mensagem-chat' + (m.author_id === user.id ? ' minha-mensagem' : '');
          row.innerHTML = `<strong>${esc(m.author_name)}${m.target_name ? ' · Sobre ' + esc(m.target_name) : ''}</strong><p>${esc(m.body)}</p><small>${esc(new Date(m.created_at).toLocaleString('pt-BR'))}</small>`;
          return row;
        }),
      );
      if (!team.length) area.textContent = 'Comece a conversa com a equipe.';
      if (!more && atBottom) area.scrollTop = area.scrollHeight;
      status('evaluationStatus', '');
    } catch (error) {
      status('evaluationStatus', error.message);
    } finally {
      teamBusy = false;
    }
  }
  async function loadReminders() {
    reminders = await request('/api/workspace/reminders');
    if (selectedNote) renderReminder();
  }
  function renderReminder() {
    const r = reminders.find((item) => item.note_id === selectedNote?.id);
    el('noteReminder').hidden = !selectedNote?.version;
    el('reminderEnabled').checked = !!r?.enabled;
    el('reminderRepeat').value = r?.repeat || 'once';
    const date = r ? new Date(r.due_at) : new Date(Date.now() + 3600000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    el('reminderDate').value = local.toISOString().slice(0, 16);
    status(
      'reminderStatus',
      r?.last_delivered_at
        ? 'Último aviso: ' + new Date(r.last_delivered_at).toLocaleString('pt-BR')
        : '',
    );
  }
  function noteSelected(note) {
    selectedNote = note;
    if (el('noteReminder'))
      loadReminders().catch((error) => status('reminderStatus', error.message));
  }
  async function openReminderNote(id) {
    await BookWorkspace.openNotes();
    const button = [...document.querySelectorAll('#notesList button')].find(
      (b) => b.dataset.noteId === id,
    );
    button?.click();
  }
  function init(profile) {
    user = profile;
    for (const [name, title] of [
      ['feedbacks', 'Feedbacks'],
      ['avaliacoes', 'Avaliações'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'aba';
      button.id = 'aba' + name[0].toUpperCase() + name.slice(1);
      button.textContent = title;
      button.hidden = !BookWorkspace.can(name);
      button.onclick = () => mostrarAba(name);
      document.querySelector('nav').append(button);
    }
    const feedback = document.createElement('section');
    feedback.id = 'visaoFeedbacks';
    feedback.hidden = true;
    feedback.innerHTML =
      '<div class="titulo-secao"><h2>Feedbacks dos hóspedes</h2><button type="button" id="feedbackNew" class="acao-principal">+ Novo feedback</button></div><label>Grau nesta página<select id="feedbackGradeFilter"><option value="">Todos</option><option>Crítico</option><option>Razoável</option><option>Irrelevante</option></select></label><p id="feedbackStatus" role="status"></p><div id="feedbackList"></div><div class="collaboration-pagination"><button type="button" id="feedbackPrevious" class="botao-secundario">Anterior</button><button type="button" id="feedbackNext" class="botao-secundario">Próxima</button></div>';
    document.querySelector('main').append(feedback);
    const modal = document.createElement('dialog');
    modal.id = 'feedbackDialog';
    modal.className = 'collaboration-dialog';
    modal.innerHTML =
      '<div class="titulo-secao"><h2 id="feedbackDialogTitle">Novo feedback</h2><button type="button" id="feedbackClose" class="botao-secundario">Fechar</button></div><form id="feedbackForm"><label>Assunto<input id="feedbackSubject" maxlength="120" required></label><div class="collaboration-fields"><label>Condomínio<select id="feedbackHotel" required><option value="">Selecione</option></select></label><label>Apartamento<select id="feedbackApartment" required disabled></select></label></div><label>Grau<select id="feedbackGrade"><option>Crítico</option><option selected>Razoável</option><option>Irrelevante</option></select></label><label>Observações<textarea id="feedbackNotes" maxlength="8000" rows="4"></textarea></label><div id="feedbackExisting"></div><label>Anexos<input id="feedbackFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf" multiple></label><label class="collaboration-check"><input id="feedbackCreateService" type="checkbox"> Criar também um card de serviço</label><button class="acao-principal" type="submit">Salvar feedback</button><p id="feedbackFormStatus" role="status"></p></form>';
    modal.setAttribute('aria-labelledby', 'feedbackDialogTitle');
    document.body.append(modal);
    for (const grade of ['Alta', 'Média', 'Baixa', 'A conferir', 'Não informado'])
      el('feedbackGradeFilter').append(new Option(grade + ' (histórico)', grade));
    for (const hotel of BookCatalog.hotels) el('feedbackHotel').append(new Option(hotel, hotel));
    el('feedbackHotel').onchange = () => fillApartments();
    el('feedbackNew').onclick = () => openFeedback();
    el('feedbackGradeFilter').onchange = () => {
      offset = 0;
      loadFeedbacks();
    };
    el('feedbackPrevious').onclick = () => {
      offset = Math.max(0, offset - 50);
      loadFeedbacks();
    };
    el('feedbackNext').onclick = () => {
      offset += 50;
      loadFeedbacks();
    };
    el('feedbackClose').onclick = () => {
      if (!saving) modal.close();
    };
    modal.addEventListener('cancel', (event) => {
      if (saving) event.preventDefault();
    });
    el('feedbackForm').onsubmit = saveFeedback;
    BookStore.setupAttachments();
    const evaluation = document.createElement('section');
    evaluation.id = 'visaoAvaliacoes';
    evaluation.hidden = true;
    evaluation.innerHTML =
      '<div class="titulo-secao"><h2>Avaliações da equipe</h2><button type="button" id="evaluationRefresh" class="botao-secundario">Atualizar</button></div><p class="workspace-hint">Conversa compartilhada com os administradores que têm acesso a esta aba. Comente com respeito e foco no trabalho.</p><button id="evaluationMore" type="button" class="botao-secundario" hidden>Comentários anteriores</button><div id="evaluationThread" class="workspace-thread evaluation-thread" aria-live="polite"></div><form id="evaluationForm"><label>Sobre<select id="evaluationTarget"><option value="">Equipe / assunto geral</option></select></label><label>Comentário<textarea id="evaluationBody" maxlength="2000" rows="3" required></textarea></label><button id="evaluationSend" type="submit" class="acao-principal">Enviar comentário</button></form><p id="evaluationStatus" role="status"></p>';
    document.querySelector('main').append(evaluation);
    el('evaluationRefresh').onclick = () => loadEvaluations();
    el('evaluationMore').onclick = () => loadEvaluations(true);
    if (BookWorkspace.can('avaliacoes'))
      request('/api/users')
        .then((rows) => {
          for (const member of rows.filter((r) => r.funcao === 'adm'))
            el('evaluationTarget').append(new Option(member.nome, member.id));
        })
        .catch((error) => status('evaluationStatus', error.message));
    let messageId = null;
    el('evaluationForm').onsubmit = async (event) => {
      event.preventDefault();
      if (saving) return;
      saving = true;
      el('evaluationSend').disabled = true;
      messageId ??= crypto.randomUUID();
      try {
        await request('/api/evaluations', {
          id: messageId,
          body: el('evaluationBody').value.trim(),
          target: el('evaluationTarget').value || null,
        });
        messageId = null;
        el('evaluationBody').value = '';
        await loadEvaluations();
        el('evaluationThread').scrollTop = el('evaluationThread').scrollHeight;
      } catch (error) {
        status('evaluationStatus', error.message);
      } finally {
        saving = false;
        el('evaluationSend').disabled = false;
      }
    };
    el('evaluationBody').oninput = () => {
      messageId = null;
    };
    el('evaluationTarget').onchange = () => {
      messageId = null;
    };
    const reminder = document.createElement('fieldset');
    reminder.id = 'noteReminder';
    reminder.hidden = true;
    reminder.innerHTML =
      '<legend>Lembrete</legend><label class="collaboration-check"><input id="reminderEnabled" type="checkbox"> Ativar lembrete desta nota</label><label>Data e hora<input id="reminderDate" type="datetime-local"></label><label>Repetir<select id="reminderRepeat"><option value="once">Uma vez</option><option value="daily">Todos os dias</option></select></label><button id="reminderSave" type="button" class="botao-secundario">Salvar lembrete</button><p class="workspace-hint">Horário deste dispositivo. A repetição diária usa o horário de São Paulo. Avisos com o site aberto; vencidos aparecem no próximo acesso.</p><p id="reminderStatus" role="status"></p>';
    el('notesForm').after(reminder);
    el('reminderSave').onclick = async () => {
      if (saving || !selectedNote?.version) return;
      saving = true;
      el('reminderSave').disabled = true;
      try {
        const date = new Date(el('reminderDate').value);
        if (!Number.isFinite(date.getTime())) throw Error('Informe data e hora.');
        const current = reminders.find((r) => r.note_id === selectedNote.id);
        await request('/api/workspace/reminders', {
          id: selectedNote.id,
          version: Number(current?.version || 0),
          due: date.toISOString(),
          repeat: el('reminderRepeat').value,
          enabled: el('reminderEnabled').checked,
        });
        await loadReminders();
        status('reminderStatus', 'Lembrete salvo.');
        BookNotifications.refresh();
      } catch (error) {
        status('reminderStatus', error.message);
        await loadReminders().catch(() => {});
      } finally {
        saving = false;
        el('reminderSave').disabled = false;
      }
    };
    setInterval(() => {
      const thread = el('evaluationThread');
      if (
        !document.hidden &&
        !el('visaoAvaliacoes').hidden &&
        team.length <= 50 &&
        thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60
      )
        loadEvaluations();
      if (!document.hidden && user.mestre && !el('visaoSuporte').hidden) BookWorkspace.loadMaster();
    }, 15000);
  }
  return { init, loadFeedbacks, loadEvaluations, noteSelected, openReminderNote };
})();
