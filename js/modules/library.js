// Biblioteca: grelha gerada automaticamente a partir das entradas do menu com `library: true`.
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { MENU } from '../navigation/menu.js';

export default {
  id: 'library',
  pages: [{
    id: 'menu-biblioteca',
    title: 'Biblioteca',
    root: true,
    template: () => html`
      <div class="tile-grid stagger-on-enter">
        ${MENU.filter((m) => m.library).map((m) => html`
          <button class="tile glass glass--interactive pressable" data-action="nav:go" data-page="${m.page}">
            <span class="tile__icon">${icon(m.icon, 26)}</span>
            <span class="tile__label">${m.label}</span>
          </button>`)}
      </div>`,
  }],
};
