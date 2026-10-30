// Menu de ações (estilo iOS): uma lista de opções numa folha inferior.
// const escolha = await actionSheet([{ id: 'edit', label: 'Editar', icon: 'edit' }, …], { title: 'Receita' });
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openModal, closeModal } from '../core/ui.js';

export function actionSheet(items, { title = '' } = {}) {
  const id = `sheet-${Date.now()}`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html`
    <div class="modal modal--sheet" id="${id}" role="dialog" aria-modal="true">
      <div class="modal__backdrop" data-action="modal:close" data-modal="${id}"></div>
      <div class="modal__sheet action-sheet">
        ${title ? html`<p class="action-sheet__title">${title}</p>` : ''}
        <div class="action-sheet__group">
          ${items.map((it, i) => html`
            <button class="action-sheet__item ${it.danger ? 'is-danger' : ''} ${it.active ? 'is-active' : ''}" data-index="${i}">
              <span>${it.label}</span>${it.active ? icon('check', 18) : it.icon ? icon(it.icon, 18) : ''}
            </button>`)}
        </div>
        <button class="action-sheet__item action-sheet__cancel" data-index="-1">Cancelar</button>
      </div>
    </div>`);
  const el = wrapper.firstElementChild;
  document.body.appendChild(el);
  requestAnimationFrame(() => openModal(id));
  return new Promise((resolve) => {
    let done = false;
    const finish = async (value) => {
      if (done) return;
      done = true;
      await closeModal(id);
      el.remove();
      resolve(value);
    };
    el.querySelectorAll('[data-index]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.index);
      finish(i >= 0 ? items[i].id : null);
    }));
    el.querySelector('.modal__backdrop').addEventListener('click', () => finish(null));
  });
}
