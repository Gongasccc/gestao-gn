// Tarefas: lista completa do grupo (o Início mostra as primeiras no cartão "Tarefas de hoje")
// e Rotinas (tarefas que se repetem e rodam entre pessoas, com pontos).
import { html } from '../core/dom.js';
import { createScope, on } from '../core/state.js';
import { tasksTpl, subscribeTasks, tasksRefresh } from '../components/tasks.js';
import { tabsTpl, positionIndicator } from '../components/tabs.js';
import { rotinasTpl, rotinasModal, subscribeRotinas, desenharRotinas } from './juntos/rotinas.js';

const scope = createScope();

export default {
  id: 'tasks',
  pages: [{
    id: 'menu-tarefas',
    title: 'Tarefas',
    root: true,
    headerAction: () => html`<button class="btn btn--small btn--glass pressable" data-action="tasks:clearDone">Limpar feitas</button>`,
    template: () => html`
      ${tabsTpl('tarefas', [{ id: 'lista', label: 'Tarefas' }, { id: 'rotinas', label: 'Rotinas' }])}
      <section data-tab-panel="tarefas:lista" style="margin-top:14px"><div class="card glass">${tasksTpl({ id: 'page-tasks' })}</div></section>
      <section data-tab-panel="tarefas:rotinas" style="margin-top:14px" hidden>${rotinasTpl()}</section>`,
    onEnter: () => requestAnimationFrame(() => positionIndicator(document.querySelector('[data-tabs="tarefas"]'))),
  }],
  modals: rotinasModal,
  start() {
    subscribeTasks(scope);
    subscribeRotinas(scope);
    scope.add(on('household:update', () => { tasksRefresh(); desenharRotinas(); }));
  },
  stop() {
    scope.clear();
  },
};
