// Renderiza o menu lateral e a barra inferior a partir de menu.js e trata dos gestos.
import { byId, html, staggerChildren } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { registerActions } from '../core/events.js';
import { navigate, back, isRootPage } from '../core/router.js';
import { on } from '../core/state.js';
import { MENU, MENU_GROUPS, BOTTOM_NAV } from './menu.js';

const badges = {};

function badgeTpl(key) {
  return key ? html`<span class="badge" data-badge="${key}" hidden></span>` : '';
}

function itemTpl(item) {
  const hasChildren = item.children?.length;
  return html`
    <div class="sidebar__group ${hasChildren ? 'has-children' : ''}">
      <button class="sidebar__item pressable" data-nav-page="${item.page}"
        data-action="${hasChildren ? 'sidebar:toggle-group' : 'nav:go'}" data-page="${item.page}">
        <span class="sidebar__icon">${icon(item.icon, 20)}</span>
        <span class="sidebar__label">${item.label}</span>
        ${badgeTpl(item.badge)}
        ${hasChildren ? html`<span class="sidebar__chevron">${icon('chevronRight', 16)}</span>` : ''}
      </button>
      ${hasChildren ? html`
        <div class="sidebar__submenu">
          ${item.children.map((c) => html`
            <button class="sidebar__subitem" data-nav-page="${c.page}" data-action="nav:go" data-page="${c.page}">${c.label}</button>`)}
        </div>` : ''}
    </div>`;
}

function renderSidebar() {
  const groups = MENU_GROUPS.map((g) => ({ ...g, items: MENU.filter((m) => m.group === g.id && m.sidebar !== false) }))
    .filter((g) => g.items.length);
  byId('sidebar').innerHTML = String(html`
    <button class="sidebar__account pressable" data-nav-page="menu-perfil" data-action="nav:go" data-page="menu-perfil" title="Perfil e amigos">
      <span class="avatar avatar--md" data-avatar="me"></span>
      <span class="sidebar__account-info">
        <span class="sidebar__account-name" data-username="me">A carregar…</span>
        <span class="sidebar__account-sub">Perfil e amigos</span>
      </span>
    </button>
    <nav class="sidebar__nav" id="sidebar-nav">
      ${groups.map((g) => html`
        <div class="sidebar__section">
          <p class="sidebar__caption">${g.label}</p>
          ${g.items.map(itemTpl)}
        </div>`)}
    </nav>
  `);
}

function renderTopbarBell() {
  document.querySelectorAll('.topbar-bell__icon').forEach((el) => { el.innerHTML = String(icon('bell', 20)); });
}

function renderBottomNav() {
  byId('bottom-nav').innerHTML = String(html`
    <div class="bottom-nav__bar">
      ${BOTTOM_NAV.map((item) => html`
        <button class="bottom-nav__btn" data-nav-page="${item.page}" data-action="nav:go" data-page="${item.page}" aria-label="${item.label}">
          <span class="bottom-nav__icon">${icon(item.icon, 22)}${badgeTpl(item.badge)}</span>
          <span class="bottom-nav__label">${item.label}</span>
        </button>`)}
    </div>`);
}

/** Atualiza um contador (ex.: notificações não lidas) em todos os sítios onde aparece. */
export function setBadge(key, count) {
  badges[key] = count;
  document.querySelectorAll(`[data-badge="${key}"]`).forEach((el) => {
    const changed = el.textContent !== String(count);
    el.hidden = !count;
    el.textContent = count > 9 ? '+9' : String(count);
    if (changed && count) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  });
}

export function openSidebar() {
  const sb = byId('sidebar');
  sb.classList.add('is-open');
  byId('sidebar-overlay').classList.add('is-open');
  staggerChildren(byId('sidebar-nav'), 30);
}

export function closeSidebar() {
  byId('sidebar')?.classList.remove('is-open');
  byId('sidebar-overlay')?.classList.remove('is-open');
}

function initGestures() {
  let startX = 0;
  let startY = 0;
  document.addEventListener('touchstart', (e) => {
    startX = e.changedTouches[0].clientX;
    startY = e.changedTouches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (document.body.classList.contains('has-modal')) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 70 && startX < 40) {
      if (isRootPage()) openSidebar(); else back();
    } else if (dx < -70 && byId('sidebar').classList.contains('is-open')) {
      closeSidebar();
    }
  }, { passive: true });
}

export function initNavigation() {
  renderSidebar();
  renderBottomNav();
  renderTopbarBell();
  // Linha por baixo do topo só quando há conteúdo a passar por baixo.
  const onScroll = () => document.body.classList.toggle('is-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  initGestures();

  registerActions({
    'nav:go': ({ data }) => { closeSidebar(); navigate(data.page); },
    'nav:back': () => back(),
    'sidebar:open': () => openSidebar(),
    'sidebar:close': () => closeSidebar(),
    'sidebar:toggle-group': ({ el, data }) => {
      const group = el.closest('.sidebar__group');
      const opening = !group.classList.contains('is-expanded');
      group.classList.toggle('is-expanded', opening);
      if (opening) navigate(data.page);
    },
  });

}
