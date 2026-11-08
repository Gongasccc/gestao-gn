// Ponto de entrada da aplicação.
import { byId } from './core/dom.js';
import { initEvents, registerActions } from './core/events.js';
import { initUI } from './core/ui.js';
import { initRouter, registerPage, navigate, resetRouter } from './core/router.js';
import { emit, on, createScope } from './core/state.js';
import { restoreThemeFromCache } from './core/theme.js';
import { initViewportFix } from './core/viewport.js';
import { initGlassEffects } from './core/glass.js';
import { initNavigation, closeSidebar } from './navigation/sidebar.js';
import { initAuth } from './app/auth.js';
import { resetChecklists } from './components/checklist.js';
import { MODULES } from './modules/index.js';
import { watchHousehold } from './services/household.js';
import { garantirPartilhas } from './services/partilhas.js';
import { cacheLocalAtiva } from './services/firebase.js';
import { toast } from './core/ui.js';

const householdScope = createScope();

restoreThemeFromCache();
initViewportFix();

function mountModules() {
  const pageContainer = byId('page-container');
  const modalRoot = byId('modal-root');
  let pagesHtml = '';
  let modalsHtml = '';

  MODULES.forEach((mod) => {
    (mod.pages || []).forEach((page) => {
      registerPage(page);
      // Largura no computador: páginas do menu usam o ecrã todo; formulários e detalhes ficam mais estreitos.
      const width = page.width || (page.wide || page.root ? 'wide' : 'narrow');
      pagesHtml += `<section class="page page--${width}" id="${page.id}" data-module="${mod.id}">${page.template()}</section>`;
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
  // Quem entrou num grupo que já tinha páginas partilhadas entra também nessas partilhas.
  garantirPartilhas().then((entrou) => { if (entrou) emit('household:changed'); }).catch(() => {});
  // Apaga (uma vez) os dados dos menus que já saíram da app.
  setTimeout(() => import('./services/limpeza.js').then((m) => m.limparMenusAntigos()), 4000);
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

// Ao criar/entrar/sair/mudar de grupo (ou partilhar uma página), os dados passam a vir de outro sítio: reinicia os módulos.
on('household:changed', () => {
  stopModules();
  startModules();
});

// Caso raro: a base de dados do telemóvel não respondeu e esta abertura guarda só em memória.
// Com internet tudo vai logo para a nuvem; sem internet avisamos para não fechar a app.
function avisarSemCacheLocal() {
  if (cacheLocalAtiva || navigator.onLine) return;
  toast('Sem internet e sem memória do telemóvel disponível: não feches a app até a ligação voltar, para as alterações chegarem à nuvem.', 'error', 9000);
}
if (!cacheLocalAtiva) window.addEventListener('offline', avisarSemCacheLocal);

initAuth({
  onLogin() {
    avisarSemCacheLocal();
    startModules();
    emit('avatar:refresh');
    resetRouter();
    navigate('menu-principal');
    // Aberta a partir de uma notificação do sistema (ex.: ./#menu-notificacoes).
    const destino = location.hash.slice(1);
    if (destino === 'menu-notificacoes') {
      navigate(destino);
      history.replaceState(null, '', location.pathname + location.search);
    }
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
  // Tocar numa notificação com a app aberta leva à página certa.
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'navigate' && ev.data.page) navigate(ev.data.page);
  });
}
