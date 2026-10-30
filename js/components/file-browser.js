// Explorador de ficheiros com pastas, reutilizado em "Meus Documentos" e nos documentos de cada veículo.
import { html, byId, render, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { registerActions } from '../core/events.js';
import { modalTemplate, openModal, closeModal, confirmDialog, toast, showImage } from '../core/ui.js';
import { compressImage, readAsDataURL, takeFile, dataUrlBytes, MAX_FILE_BYTES } from '../core/images.js';
import { addDoc, deleteDoc, updateDoc, onSnapshot } from '../services/firebase.js';
import { snapToList } from '../services/paths.js';
import { relativeTime } from '../core/format.js';

const browsers = new Map();

function fileIcon(tipo = '') {
  if (tipo.startsWith('image/')) return 'camera';
  return 'file';
}

/**
 * @param {object} cfg
 * @param {string} cfg.key            identificador único (usado nos ids do DOM)
 * @param {() => any} cfg.filesCol    coleção dos ficheiros
 * @param {() => any} cfg.foldersCol  coleção das pastas
 * @param {(id) => any} cfg.fileDoc
 * @param {(id) => any} cfg.folderDoc
 */
export function createFileBrowser(cfg) {
  const state = { files: [], folders: [], folderId: null };
  const ids = {
    folders: `fb-${cfg.key}-folders`,
    files: `fb-${cfg.key}-files`,
    crumb: `fb-${cfg.key}-crumb`,
    input: `fb-${cfg.key}-input`,
    modal: `fb-${cfg.key}-modal`,
    folderName: `fb-${cfg.key}-folder-name`,
  };

  function draw() {
    const folder = state.folders.find((f) => f.id === state.folderId);
    render(ids.crumb, folder
      ? html`<button class="chip pressable" data-action="fb:open-folder" data-browser="${cfg.key}" data-id="">${icon('chevronLeft', 14)} Todas</button>
             <span class="crumb__current">${icon('folder', 16)} ${folder.nome}</span>`
      : '');

    const folders = state.folderId ? [] : [...state.folders].sort((a, b) => a.nome.localeCompare(b.nome));
    render(ids.folders, folders.map((f) => {
      const count = state.files.filter((d) => d.pastaId === f.id).length;
      return html`
        <div class="folder-card glass-soft pressable" data-action="fb:open-folder" data-browser="${cfg.key}" data-id="${f.id}">
          <span class="folder-card__icon">${icon('folder', 22)}</span>
          <span class="folder-card__name">${f.nome}</span>
          <span class="folder-card__count">${count}</span>
          <button class="icon-btn icon-btn--subtle" data-action="fb:delete-folder" data-browser="${cfg.key}" data-id="${f.id}" aria-label="Apagar pasta">${icon('trash', 14)}</button>
        </div>`;
    }), { stagger: true });

    const files = state.files
      .filter((d) => (state.folderId ? d.pastaId === state.folderId : !d.pastaId || !state.folders.some((f) => f.id === d.pastaId)))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    render(ids.files, files.length
      ? files.map((d) => html`
        <div class="file-row glass-soft pressable" data-action="fb:open-file" data-browser="${cfg.key}" data-id="${d.id}">
          <span class="file-row__icon">${icon(fileIcon(d.tipo), 18)}</span>
          <span class="file-row__info">
            <span class="file-row__name">${d.nome}</span>
            <span class="file-row__meta">${d.timestamp ? relativeTime(d.timestamp) : ''}</span>
          </span>
          <button class="icon-btn icon-btn--subtle" data-action="fb:delete-file" data-browser="${cfg.key}" data-id="${d.id}" aria-label="Apagar">${icon('trash', 16)}</button>
        </div>`)
      : emptyState(state.folderId ? 'Pasta vazia.' : (cfg.emptyText || 'Sem ficheiros guardados.'), icon('file', 28)),
    { stagger: true });
  }

  const browser = {
    cfg,
    state,
    ids,
    draw,
    template() {
      return html`
        <div class="toolbar">
          <button class="btn btn--glass pressable" data-action="modal:open" data-modal="${ids.modal}">${icon('folder', 16)} Nova pasta</button>
          <label class="btn btn--primary pressable">
            ${icon('upload', 16)} Carregar ficheiro
            <input type="file" id="${ids.input}" hidden data-change="fb:upload" data-browser="${cfg.key}">
          </label>
        </div>
        <div class="crumb" id="${ids.crumb}"></div>
        <div class="folder-grid" id="${ids.folders}"></div>
        <div class="list" id="${ids.files}"></div>`;
    },
    modals() {
      return modalTemplate(ids.modal, 'Nova pasta', html`
        <input type="text" id="${ids.folderName}" class="input" placeholder="${cfg.folderPlaceholder || 'Nome da pasta'}" data-enter="fb:create-folder" data-browser="${cfg.key}">
        <div class="btn-row">
          <button class="btn" data-action="modal:close" data-modal="${ids.modal}">Cancelar</button>
          <button class="btn btn--primary" data-action="fb:create-folder" data-browser="${cfg.key}">Criar pasta</button>
        </div>`);
    },
    subscribe(scope) {
      state.folderId = null;
      state.files = [];
      state.folders = [];
      scope.add(onSnapshot(cfg.filesCol(), (s) => { state.files = snapToList(s); draw(); }));
      scope.add(onSnapshot(cfg.foldersCol(), (s) => { state.folders = snapToList(s); draw(); }));
    },
  };
  browsers.set(cfg.key, browser);
  return browser;
}

async function openFile(file) {
  if (!file?.conteudo) return;
  if (file.tipo?.startsWith('image/')) {
    showImage(file.conteudo);
    return;
  }
  const blob = await (await fetch(file.conteudo)).blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.nome || 'ficheiro';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

registerActions({
  'fb:open-folder': ({ data, ev }) => {
    if (ev.target.closest('[data-action="fb:delete-folder"]')) return;
    const b = browsers.get(data.browser);
    b.state.folderId = data.id || null;
    b.draw();
  },
  'fb:create-folder': async ({ data }) => {
    const b = browsers.get(data.browser);
    const input = byId(b.ids.folderName);
    const nome = input.value.trim();
    if (!nome) return;
    await addDoc(b.cfg.foldersCol(), { nome, timestamp: Date.now() });
    input.value = '';
    closeModal(b.ids.modal);
    toast(`Pasta "${nome}" criada`);
  },
  'fb:delete-folder': async ({ data }) => {
    const b = browsers.get(data.browser);
    const ok = await confirmDialog('Os ficheiros desta pasta passam para a raiz.', { title: 'Apagar pasta?', confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    const inside = b.state.files.filter((f) => f.pastaId === data.id);
    await Promise.all(inside.map((f) => updateDoc(b.cfg.fileDoc(f.id), { pastaId: null })));
    await deleteDoc(b.cfg.folderDoc(data.id));
  },
  'fb:upload': async ({ data, ev }) => {
    const b = browsers.get(data.browser);
    const file = takeFile(ev);
    if (!file) return;
    const conteudo = file.type.startsWith('image/')
      ? await compressImage(file, { maxSize: 1600, quality: 0.75 })
      : await readAsDataURL(file);
    if (dataUrlBytes(conteudo) > MAX_FILE_BYTES) {
      toast('Ficheiro demasiado grande (máx. ~900 KB).', 'error', 3500);
      return;
    }
    await addDoc(b.cfg.filesCol(), {
      nome: file.name,
      tipo: file.type.startsWith('image/') ? 'image/jpeg' : file.type,
      conteudo,
      pastaId: b.state.folderId || null,
      timestamp: Date.now(),
    });
    toast(`"${file.name}" guardado`);
  },
  'fb:open-file': ({ data, ev }) => {
    if (ev.target.closest('[data-action="fb:delete-file"]')) return;
    const b = browsers.get(data.browser);
    openFile(b.state.files.find((f) => f.id === data.id));
  },
  'fb:delete-file': async ({ data }) => {
    const b = browsers.get(data.browser);
    const ok = await confirmDialog('Esta ação não pode ser desfeita.', { title: 'Apagar ficheiro?', confirmLabel: 'Apagar', danger: true });
    if (ok) await deleteDoc(b.cfg.fileDoc(data.id));
  },
});
