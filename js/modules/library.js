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
      <nav class="menu-list glass">
        ${MENU.filter((m) => m.library).map((m) => html`
          <button class="menu-list__row pressable" data-action="nav:go" data-page="${m.page}">
            <span class="menu-list__icon">${icon(m.icon, 20)}</span>
            <span class="menu-list__label">${m.label}</span>
            ${icon('chevronRight', 16)}
          </button>`)}
      </nav>`,
  }],
};
