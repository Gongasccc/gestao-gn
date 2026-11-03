// Lista de compras: lista semanal e lista rápida (partilhadas pelo casal), agora com menu próprio.
import { html } from '../core/dom.js';
import { createScope } from '../core/state.js';
import { tabsTpl, positionIndicator } from '../components/tabs.js';
import { checklistTpl, subscribeChecklist } from '../components/checklist.js';

const scope = createScope();
export const PAG_LISTA = 'menu-lista-compras';

export default {
  id: 'shopping',
  pages: [
    {
      id: PAG_LISTA,
      width: 'narrow',
      title: 'Lista de compras',
      root: true,
      template: () => html`
        ${tabsTpl('lista', [{ id: 'semanal', label: 'Semanal' }, { id: 'rapida', label: 'Rápida' }])}
        <div data-tab-panel="lista:semanal">
          <div class="card glass">${checklistTpl('semanais', 'Adicionar item…')}</div>
        </div>
        <div data-tab-panel="lista:rapida" hidden>
          <div class="card glass">${checklistTpl('rapidas', 'Item urgente…')}</div>
        </div>`,
      onEnter: () => requestAnimationFrame(() => positionIndicator(document.querySelector('[data-tabs="lista"]'))),
    },
  ],
  start() {
    subscribeChecklist(scope, 'semanais');
    subscribeChecklist(scope, 'rapidas');
  },
  stop() { scope.clear(); },
};
