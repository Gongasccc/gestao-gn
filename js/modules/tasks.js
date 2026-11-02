// Tarefas: lista completa do casal (o Início mostra as primeiras no cartão "Tarefas de hoje").
import { html } from '../core/dom.js';
import { createScope, on } from '../core/state.js';
import { tasksTpl, subscribeTasks, tasksRefresh } from '../components/tasks.js';

const scope = createScope();

export default {
  id: 'tasks',
  pages: [{
    id: 'menu-tarefas',
    title: 'Tarefas',
    root: true,
    headerAction: () => html`<button class="btn btn--small btn--glass pressable" data-action="tasks:clearDone">Limpar feitas</button>`,
    template: () => html`<div class="card glass">${tasksTpl({ id: 'page-tasks' })}</div>`,
  }],
  start() {
    subscribeTasks(scope);
    scope.add(on('household:update', tasksRefresh));
  },
  stop() {
    scope.clear();
  },
};
