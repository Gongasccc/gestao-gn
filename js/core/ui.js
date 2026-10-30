// Componentes de interface partilhados: modais (bottom sheet), diálogos e toasts.
import { html, byId, esc } from './dom.js';
import { icon } from './icons.js';
import { registerActions } from './events.js';

const CLOSE_MS = 260;

/** Gera o markup padrão de um modal. `body` deve ser um html``. */
export function modalTemplate(id, title, body, { wide = false } = {}) {
  return html`
    <div class="modal" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal__backdrop" data-action="modal:close" data-modal="${id}"></div>
      <div class="modal__sheet glass ${wide ? 'modal__sheet--wide' : ''}">
        <div class="modal__grabber"></div>
        <div class="modal__header">
          <h2 class="modal__title" id="${id}-title">${title}</h2>
          <button class="icon-btn" data-action="modal:close" data-modal="${id}" aria-label="Fechar">${icon('close', 18)}</button>
        </div>
        <div class="modal__body">${body}</div>
      </div>
    </div>`;
}

export function openModal(id) {
  const el = byId(id);
  if (!el) return;
  el.classList.remove('is-closing');
  el.classList.add('is-open');
  document.body.classList.add('has-modal');
  const focusable = el.querySelector('input:not([type=hidden]):not([type=file]), textarea, select');
  if (focusable && window.matchMedia('(pointer: fine)').matches) setTimeout(() => focusable.focus(), 200);
}

export function closeModal(id) {
  const el = byId(id);
  if (!el || !el.classList.contains('is-open')) return Promise.resolve();
  el.classList.add('is-closing');
  return new Promise((resolve) => setTimeout(() => {
    el.classList.remove('is-open', 'is-closing');
    if (!document.querySelector('.modal.is-open')) document.body.classList.remove('has-modal');
    resolve();
  }, CLOSE_MS));
}

function topModal() {
  const open = document.querySelectorAll('.modal.is-open:not(.is-closing)');
  return open[open.length - 1];
}

/** Diálogo genérico que devolve uma Promise com o botão escolhido. */
function dialog({ title, message, buttons }) {
  const id = `dialog-${Date.now()}`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html`
    <div class="modal modal--dialog" id="${id}" role="alertdialog" aria-modal="true">
      <div class="modal__backdrop"></div>
      <div class="modal__sheet modal__sheet--dialog glass">
        <h2 class="modal__title">${title}</h2>
        ${message ? html`<p class="dialog__message">${message}</p>` : ''}
        <div class="btn-row">
          ${buttons.map((b, i) => html`<button class="btn ${b.variant ? `btn--${b.variant}` : ''}" data-index="${i}">${b.label}</button>`)}
        </div>
      </div>
    </div>`);
  const el = wrapper.firstElementChild;
  document.body.appendChild(el);
  requestAnimationFrame(() => openModal(id));

  return new Promise((resolve) => {
    const finish = async (value) => {
      await closeModal(id);
      el.remove();
      resolve(value);
    };
    el.querySelectorAll('button[data-index]').forEach((btn) => {
      btn.addEventListener('click', () => finish(buttons[Number(btn.dataset.index)].value));
    });
    el.querySelector('.modal__backdrop').addEventListener('click', () => finish(buttons[0].value));
  });
}

export const alertDialog = (message, title = 'Aviso') =>
  dialog({ title, message, buttons: [{ label: 'OK', value: true, variant: 'primary' }] });

export const confirmDialog = (message, { title = 'Confirmar', confirmLabel = 'Confirmar', danger = false } = {}) =>
  dialog({
    title,
    message,
    buttons: [
      { label: 'Cancelar', value: false },
      { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' },
    ],
  });

/** Notificação temporária em vidro no topo do ecrã. */
export function toast(message, type = 'success', duration = 2600) {
  let stack = byId('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const iconName = type === 'error' ? 'close' : type === 'info' ? 'bell' : 'check';
  const el = document.createElement('div');
  el.className = `toast glass glass--strong toast--${type}`;
  el.innerHTML = `<span class="toast__icon">${icon(iconName, 14)}</span><span>${esc(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 350);
  }, duration);
}

/** Mostra uma imagem em ecrã inteiro. */
export function showImage(src) {
  if (!src) return;
  let viewer = byId('image-viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'image-viewer';
    viewer.className = 'modal modal--viewer';
    viewer.innerHTML = '<div class="modal__backdrop" data-action="modal:close" data-modal="image-viewer"></div><img alt="" data-action="modal:close" data-modal="image-viewer">';
    document.body.appendChild(viewer);
  }
  viewer.querySelector('img').src = src;
  openModal('image-viewer');
}

/** Coloca um botão em estado de carregamento enquanto a promessa corre. */
export async function withLoading(btn, fn) {
  if (!btn) return fn();
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

export function initUI() {
  registerActions({
    'modal:open': ({ data }) => openModal(data.modal),
    'modal:close': ({ data, el }) => closeModal(data.modal || el.closest('.modal')?.id),
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const m = topModal();
    if (m && !m.classList.contains('modal--dialog')) closeModal(m.id);
  });
}
