(function (root) {
  const encode = (value) => new TextEncoder().encode(JSON.stringify(value, null, 2));
  const digest = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  async function write(directory, name, bytes) {
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(bytes);
      await stream.close();
    } catch (error) {
      await stream.abort?.().catch(() => {});
      throw error;
    }
  }
  function check(signal) {
    signal?.throwIfAborted();
  }
  const validName = (name) =>
    typeof name === 'string' && /^[a-zA-Z0-9._-]+$/.test(name) && !['.', '..'].includes(name);
  async function save(directory, exported, download, { signal, progress = () => {} } = {}) {
    if (
      exported.format !== 'book-santos-backup' ||
      exported.version !== 1 ||
      !Array.isArray(exported.data?.records) ||
      !Array.isArray(exported.files)
    )
      throw new Error('Formato de backup inválido.');
    const manifest = {
      format: exported.format,
      version: 1,
      created_at: new Date().toISOString(),
      selected: exported.selected,
      complete: false,
      files: [],
    };
    await write(directory, 'manifesto.json', encode(manifest));
    try {
      check(signal);
      const data = encode({ ...exported, files: undefined });
      await write(directory, 'dados.json', data);
      manifest.files.push({ name: 'dados.json', size: data.length, sha256: await digest(data) });
      const target = exported.files.length
        ? await directory.getDirectoryHandle('anexos', { create: true })
        : null;
      for (const [index, path] of exported.files.entries()) {
        check(signal);
        if (!/^[a-f0-9-]{36}\/[^/]+\/[a-f0-9-]{36}$/.test(path))
          throw new Error('Referência de arquivo inválida.');
        const file = await download(path, signal);
        check(signal);
        const extension =
          {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'application/pdf': 'pdf',
          }[file.type?.split(';')[0]] || 'bin';
        const name = `${index + 1}-${path.split('/').at(-1)}.${extension}`;
        await write(target, name, file.bytes);
        manifest.files.push({
          name: `anexos/${name}`,
          source: `/api/files/${path}`,
          type: file.type,
          size: file.bytes.byteLength,
          sha256: await digest(file.bytes),
        });
        progress(index + 1, exported.files.length);
        // A partial copy remains identifiable if the browser closes mid-transfer.
        await write(directory, 'manifesto.json', encode(manifest));
      }
      check(signal);
      manifest.complete = true;
      manifest.completed_at = new Date().toISOString();
      await write(directory, 'manifesto.json', encode(manifest));
      await verify(directory, { signal });
      return manifest;
    } catch (error) {
      manifest.complete = false;
      await write(directory, 'manifesto.json', encode(manifest)).catch(() => {});
      throw error;
    }
  }
  async function verify(directory, { signal, progress = () => {} } = {}) {
    const file = await (await directory.getFileHandle('manifesto.json')).getFile();
    const manifest = JSON.parse(await file.text());
    if (
      manifest.format !== 'book-santos-backup' ||
      manifest.version !== 1 ||
      !manifest.complete ||
      !Array.isArray(manifest.files) ||
      !manifest.files.some((f) => f.name === 'dados.json')
    )
      throw new Error('Backup incompleto ou formato desconhecido.');
    for (const [index, entry] of manifest.files.entries()) {
      check(signal);
      const parts = entry.name.split('/');
      if (
        parts.length > 2 ||
        parts.some((name) => !validName(name)) ||
        (parts.length === 2 && parts[0] !== 'anexos')
      )
        throw new Error('Caminho inválido no manifesto.');
      const folder = parts.length === 2 ? await directory.getDirectoryHandle('anexos') : directory;
      const saved = await (await folder.getFileHandle(parts.at(-1))).getFile();
      if (saved.size !== entry.size || (await digest(await saved.arrayBuffer())) !== entry.sha256)
        throw new Error(`Arquivo alterado ou incompleto: ${entry.name}`);
      progress(index + 1, manifest.files.length);
    }
    return manifest;
  }
  const core = { save, verify };
  if (typeof module === 'object' && module.exports) {
    module.exports = core;
    return;
  }
  root.BookBackup = core;
  let controller;
  const el = (id) => document.getElementById(id);
  function busy(value) {
    for (const id of ['backupIniciar', 'backupVerificar']) el(id).disabled = value;
    el('backupCancelar').hidden = !value;
    el('backupOpcoes').disabled = value;
  }
  async function run(mode) {
    if (controller) return;
    const selected = [...document.querySelectorAll('#backupOpcoes input:checked')].map(
      (input) => input.value,
    );
    if (mode === 'save' && !selected.some((key) => key !== 'anexos')) {
      el('backupStatus').textContent = 'Selecione pelo menos um grupo de dados.';
      return;
    }
    controller = new AbortController();
    busy(true);
    try {
      // Request the directory during the original click, before any network work.
      const directory = await window.showDirectoryPicker({
        mode: mode === 'save' ? 'readwrite' : 'read',
        id: 'book-santos-backup',
      });
      controller.signal.throwIfAborted();
      if (mode === 'verify') {
        const manifest = await verify(directory, {
          signal: controller.signal,
          progress: (n, total) => {
            el('backupStatus').textContent = `Conferindo ${n} de ${total} arquivos…`;
          },
        });
        el('backupStatus').textContent =
          `Backup íntegro: ${manifest.files.length} arquivos conferidos. Isso confirma os arquivos, não substitui um teste de restauração.`;
      } else {
        el('backupStatus').textContent = 'Preparando os dados do servidor…';
        const exported = await BookAPI.request('/api/backup', {
          method: 'POST',
          body: JSON.stringify({ selected }),
          signal: controller.signal,
          timeoutMs: 120000,
        });
        controller.signal.throwIfAborted();
        const folderName = `Book-Santos-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
        const target = await directory.getDirectoryHandle(folderName, { create: true });
        const manifest = await save(
          target,
          exported,
          async (path, signal) => {
            const response = await fetch(
              `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`,
              {
                credentials: 'same-origin',
                signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
              },
            );
            if (!response.ok)
              throw new Error(
                'Não foi possível copiar um anexo. O backup ficou incompleto; tente novamente.',
              );
            return {
              bytes: await response.arrayBuffer(),
              type: response.headers.get('content-type'),
            };
          },
          {
            signal: controller.signal,
            progress: (n, total) => {
              el('backupStatus').textContent = `Copiando anexos: ${n} de ${total}…`;
            },
          },
        );
        el('backupStatus').textContent =
          `Backup concluído e conferido em ${directory.name}/${folderName}: ${manifest.files.length} arquivos. Você já pode ejetar o HD com segurança pelo Windows.`;
        try {
          localStorage.setItem(
            'book:lastBackup',
            JSON.stringify({ date: manifest.completed_at, folder: folderName }),
          );
        } catch {
          /* The copy is valid even if browser preferences cannot be saved. */
        }
      }
    } catch (error) {
      el('backupStatus').textContent =
        error.name === 'AbortError'
          ? 'Operação cancelada. Uma cópia iniciada fica marcada como incompleta.'
          : `Backup não concluído: ${error.message}`;
    } finally {
      controller = null;
      busy(false);
    }
  }
  el('backupIniciar').addEventListener('click', () => run('save'));
  el('backupVerificar').addEventListener('click', () => run('verify'));
  el('backupCancelar').addEventListener('click', () => controller?.abort());
  if (!window.showDirectoryPicker || !window.isSecureContext) {
    el('backupIniciar').disabled = true;
    el('backupVerificar').disabled = true;
    el('backupStatus').textContent =
      'Para escolher uma pasta no HD, abra o site com HTTPS no Chrome ou Edge de um computador.';
  }
})(typeof window === 'object' ? window : globalThis);
