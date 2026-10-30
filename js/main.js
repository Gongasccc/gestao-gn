// Ponto de entrada da aplicação.
import { byId } from './core/dom.js';
import { initEvents, registerActions } from './core/events.js';
import { initUI } from './core/ui.js';
import { initRouter, registerPage, navigate, resetRouter } from './core/router.js';
import { emit, on, createScope } from './core/state.js';
import { restoreThemeFromCache } from './core/theme.js';
import { initGlassEffects } from './core/glass.js';
import { initNavigation, closeSidebar } from './navigation/sidebar.js';
import { initAuth } from './app/auth.js';
import { resetChecklists } from './components/checklist.js';
import { MODULES } from './modules/index.js';
import { watchHousehold } from './services/household.js';

const householdScope = createScope();

restoreThemeFromCache();

function mountModules() {
  const pageContainer = byId('page-container');
  const modalRoot = byId('modal-root');
  let pagesHtml = '';
  let modalsHtml = '';

  MODULES.forEach((mod) => {
    (mod.pages || []).forEach((page) => {
      registerPage(page);
      pagesHtml += `<section class="page" id="${page.id}" data-module="${mod.id}">${page.template()}</section>`;
    });
    if (mod.modals) modalsHtml += String(mod.modals());
    if (mod.actions) registerActions(mod.actions);
  });

  pageContainer.innerHTML = pagesHtml;
  modalRoot.innerHTML = modalsHtml;
}

function startModules() {
  watchHousehold(householdScope);
  MODULES.forEach((mod) => {
    try { mod.start?.(); } catch (err) { console.error(`[${mod.id}] start`, err); }
  });
}

function stopModules() {
  householdScope.clear();
  MODULES.forEach((mod) => {
    try { mod.stop?.(); } catch (err) { console.error(`[${mod.id}] stop`, err); }
  });
  resetChecklists();
}

initEvents();
initUI();
initRouter();
mountModules();
initNavigation();
initGlassEffects();

// Ao criar/entrar/sair de um casal, os dados passam a vir de outro sítio: reinicia os módulos.
on('household:changed', () => {
  stopModules();
  startModules();
});

initAuth({
  onLogin() {
    startModules();
    emit('avatar:refresh');
    resetRouter();
    navigate('menu-principal');
  },
  onLogout() {
    closeSidebar();
    stopModules();
    resetRouter();
  },
});

// PWA: guarda a "casca" da app para abrir offline e permitir lembretes como notificação.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw]', err)));
}
