// Router simples baseado num stack de páginas, integrado com o botão "voltar" do sistema.
// Cada módulo regista as suas páginas com registerPage({ id, title, root, onEnter, headerAction }).
import { byId, html, staggerChildren } from './dom.js';
import { icon } from './icons.js';
import { emit } from './state.js';

const pages = new Map();
const HOME = 'menu-principal';
let stack = [HOME];

export function registerPage(meta) {
  pages.set(meta.id, meta);
}

export const currentPage = () => stack[stack.length - 1];
export const isRootPage = (id = currentPage()) => !!pages.get(id)?.root;

function pageTitle(meta) {
  if (!meta) return '';
  return typeof meta.title === 'function' ? meta.title() : meta.title;
}

export function refreshHeader() {
  const id = currentPage();
  const meta = pages.get(id);
  const left = byId('topbar-left');
  const title = byId('topbar-title');
  const right = byId('topbar-right');
  if (!left || !title || !right) return;

  if (meta?.root) {
    left.innerHTML = String(html`<button class="avatar-btn pressable" data-action="sidebar:open" aria-label="Abrir menu"><span class="avatar avatar--sm" data-avatar="me"></span></button>`);
    emit('avatar:refresh');
  } else {
    left.innerHTML = String(html`<button class="icon-btn glass-chip pressable" data-action="nav:back" aria-label="Voltar">${icon('back', 20)}</button>`);
  }

  const newTitle = pageTitle(meta) || '';
  if (title.textContent !== newTitle) {
    title.classList.remove('title-swap');
    void title.offsetWidth;
    title.classList.add('title-swap');
    title.textContent = newTitle;
  }
  right.innerHTML = meta?.headerAction ? String(meta.headerAction()) : '';
}

function showPage(id, direction) {
  const container = byId('page-container');
  const next = byId(id);
  if (!next) {
    console.warn(`[router] página inexistente: ${id}`);
    return;
  }
  container.querySelectorAll('.page.is-active').forEach((p) => {
    if (p !== next) p.classList.remove('is-active', 'enter-forward', 'enter-back', 'enter-fade');
  });
  next.classList.remove('enter-forward', 'enter-back', 'enter-fade');
  void next.offsetWidth;
  next.classList.add('is-active', `enter-${direction}`);
  next.querySelectorAll('.stagger-on-enter').forEach((el) => {
    el.querySelectorAll(':scope > *').forEach((c) => c.classList.remove('anim-rise'));
    void el.offsetWidth;
    staggerChildren(el, 45);
  });
  container.scrollTo({ top: 0 });

  refreshHeader();
  document.querySelectorAll('[data-nav-page]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.navPage === id);
  });
  emit('route:change', id);
  pages.get(id)?.onEnter?.();
}

/**
 * Navega para uma página.
 * Páginas "root" (do menu) reiniciam o stack; as restantes empilham-se e mostram o botão voltar.
 */
export function navigate(id, { replace = false } = {}) {
  if (!pages.has(id)) console.warn(`[router] página não registada: ${id}`);
  const meta = pages.get(id);
  if (currentPage() === id) {
    showPage(id, 'fade');
    return;
  }
  let direction = 'forward';
  if (meta?.root) {
    stack = id === HOME ? [HOME] : [HOME, id];
    direction = 'fade';
    history.replaceState({ page: id }, '');
  } else if (replace) {
    stack[stack.length - 1] = id;
    history.replaceState({ page: id }, '');
  } else {
    stack.push(id);
    history.pushState({ page: id }, '');
  }
  showPage(id, direction);
}

function popInternal() {
  if (stack.length > 1) {
    stack.pop();
    showPage(currentPage(), 'back');
    return true;
  }
  if (currentPage() !== HOME) {
    stack = [HOME];
    showPage(HOME, 'back');
    return true;
  }
  return false;
}

/** Voltar atrás (botão da topbar ou gesto). */
export function back() {
  if (stack.length > 1 && history.state?.page === currentPage()) history.back();
  else popInternal();
}

export function resetRouter() {
  stack = [HOME];
}

export function initRouter() {
  history.replaceState({ page: HOME }, '');
  window.addEventListener('popstate', () => {
    const openModal = document.querySelector('.modal.is-open');
    if (openModal) {
      openModal.querySelector('[data-action="modal:close"]')?.click();
      history.pushState({ page: currentPage() }, '');
      return;
    }
    popInternal();
  });
}
