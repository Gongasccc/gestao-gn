// Menu (telemóvel): todas as secções, agrupadas como no menu lateral.
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { MENU, MENU_GROUPS } from '../navigation/menu.js';

export default {
  id: 'library',
  pages: [{
    id: 'menu-biblioteca',
    title: 'Menu',
    root: true,
    template: () => html`
      <div class="menu-groups">
        ${MENU_GROUPS.map((g) => {
          const items = MENU.filter((m) => m.library && m.group === g.id);
          return items.length ? html`
            <section class="menu-group">
              <p class="menu-group__caption">${g.label}</p>
              <nav class="menu-list glass">
                ${items.map((m) => html`
                  <button class="menu-list__row pressable" data-action="nav:go" data-page="${m.page}">
                    <span class="menu-list__icon">${icon(m.icon, 20)}</span>
                    <span class="menu-list__label">${m.label}</span>
                    ${m.badge ? html`<span class="badge" data-badge="${m.badge}" hidden></span>` : ''}
                    ${icon('chevronRight', 16)}
                  </button>`)}
              </nav>
            </section>` : '';
        })}
      </div>`,
  }],
};
