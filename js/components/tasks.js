// Tarefas do casal: entrada rápida com prioridade e responsável, caixas redondas que riscam o texto.
// Usado no cartão "Tarefas de hoje" do Início e na página Tarefas. Os dados ficam em sharedCol('tarefas').
import { html, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { registerActions } from '../core/events.js';
import { session, memberName, partnerUid } from '../core/state.js';
import { initials } from '../core/format.js';
import { toast } from '../core/ui.js';
import { notifyUser } from '../services/notifications.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../services/paths.js';
import { registarAtividade } from '../services/atividade.js';

const COL = 'tarefas';
const PRIORIDADES = [
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Média' },
  { id: '', label: 'Normal' },
];
const PESO = { alta: 0, media: 1 };

let tarefas = [];
let primeira = true;
// Escolhas da entrada rápida (partilhadas entre o Início e a página Tarefas).
const escolha = { prioridade: '', quem: '' };

const temCasal = () => session.members.length > 1;

function opcoesQuem() {
  const eu = { id: session.uid, label: 'Eu' };
  if (!temCasal()) return [];
  const p = partnerUid();
  return [eu, { id: p, label: memberName(p) || 'Parceiro(a)' }, { id: 'ambos', label: 'Os dois' }];
}

function chipsTpl() {
  const quem = opcoesQuem();
  return html`
    <div class="task-chips" role="group" aria-label="Prioridade e responsável">
      ${PRIORIDADES.map((p) => html`
        <button type="button" class="task-chip ${escolha.prioridade === p.id ? 'is-on' : ''}" data-action="tasks:prio" data-v="${p.id}">
          <i class="task-chip__dot task-chip__dot--${p.id || 'normal'}"></i>${p.label}</button>`)}
      ${quem.length ? html`<span class="task-chips__sep"></span>` : ''}
      ${quem.map((q) => html`
        <button type="button" class="task-chip ${escolha.quem === q.id ? 'is-on' : ''}" data-action="tasks:quem" data-v="${q.id}">${q.label}</button>`)}
    </div>`;
}

/** Entrada rápida + lista. limit: número máximo de tarefas por fazer a mostrar (0 = todas). */
export function tasksTpl({ limit = 0, id = 'tasks' } = {}) {
  return html`
    <div class="tasks" data-tasks data-limit="${limit}" id="${id}">
      <div class="task-add">
        <div class="task-add__row">
          <input type="text" class="input task-add__input" id="${id}-input" placeholder="Adicionar tarefa…" autocomplete="off"
            data-enter="tasks:add" aria-label="Nova tarefa">
          <button class="btn btn--primary task-add__btn pressable" data-action="tasks:add" aria-label="Adicionar">${icon('plus', 18)}<span>Adicionar</span></button>
        </div>
        <div class="task-add__chips">${chipsTpl()}</div>
      </div>
      <div class="meds-today" data-meds-today data-limit="${limit ? 3 : 0}"></div>
      <ul class="task-list" data-tasks-list></ul>
      <div class="task-progress" data-tasks-progress></div>
    </div>`;
}

function quemTpl(t) {
  if (!temCasal()) return '';
  const ambos = t.quem === 'ambos';
  const nome = ambos ? 'Os dois' : t.quem ? memberName(t.quem) : 'Ninguém';
  const cls = ambos ? 'is-both' : t.quem === session.uid ? 'is-me' : t.quem ? 'is-partner' : '';
  return html`<button class="task-who ${cls} pressable" data-action="tasks:assign" data-id="${t.id}" data-who="${t.quem || ''}"
    title="${nome}" aria-label="Responsável: ${nome}">${ambos ? '' : t.quem ? initials(memberName(t.quem, { short: false })) : '·'}</button>`;
}

function itemTpl(t) {
  return html`
    <li class="task ${t.feita ? 'is-done' : ''}" data-id="${t.id}">
      <button class="task__check pressable" data-action="tasks:toggle" data-id="${t.id}" aria-label="${t.feita ? 'Marcar por fazer' : 'Marcar como feita'}">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>
      </button>
      <span class="task__text" data-action="tasks:toggle" data-id="${t.id}"><span>${t.texto}</span></span>
      ${t.prioridade && !t.feita ? html`<span class="task__prio task__prio--${t.prioridade}">${t.prioridade === 'alta' ? 'Alta' : 'Média'}</span>` : ''}
      ${quemTpl(t)}
      <button class="task__del icon-btn icon-btn--subtle" data-action="tasks:delete" data-id="${t.id}" aria-label="Apagar">${icon('trash', 15)}</button>
    </li>`;
}

const ordenar = (a, b) => (PESO[a.prioridade] ?? 2) - (PESO[b.prioridade] ?? 2) || (a.timestamp || 0) - (b.timestamp || 0);

function desenhar() {
  const porFazer = tarefas.filter((t) => !t.feita).sort(ordenar);
  const feitas = tarefas.filter((t) => t.feita).sort((a, b) => (b.feitaEm || 0) - (a.feitaEm || 0));
  document.querySelectorAll('[data-tasks]').forEach((box) => {
    const limit = Number(box.dataset.limit) || 0;
    const lista = box.querySelector('[data-tasks-list]');
    const itens = limit ? [...porFazer.slice(0, limit), ...feitas.slice(0, Math.max(0, limit - porFazer.length))] : [...porFazer, ...feitas];
    render(lista, itens.length
      ? itens.map(itemTpl)
      : html`<li class="task-empty">${icon('check', 22)}<span>Nada por fazer. Bom trabalho!</span></li>`, { stagger: primeira });
    const total = tarefas.length;
    const prog = box.querySelector('[data-tasks-progress]');
    render(prog, total ? html`
      <span class="task-progress__bar"><i style="width:${Math.round((feitas.length / total) * 100)}%"></i></span>
      <span>${feitas.length} de ${total} feitas</span>
      ${limit && porFazer.length > limit ? html`<button class="link" data-action="nav:go" data-page="menu-tarefas">+${porFazer.length - limit} por fazer</button>` : ''}` : '');
  });
  primeira = false;
}

function desenharChips() {
  document.querySelectorAll('[data-tasks] .task-add__chips').forEach((el) => render(el, chipsTpl()));
}

/** Liga a lista ao Firestore. Chamar no start() de um módulo (o scope desliga no stop()). */
export function subscribeTasks(scope) {
  primeira = true;
  scope.add(onSnapshot(sharedCol(COL), (snap) => {
    tarefas = snapToList(snap);
    desenhar();
  }));
}

export const tasksRefresh = () => { desenharChips(); desenhar(); };
export const pendingTasks = () => tarefas.filter((t) => !t.feita).length;

registerActions({
  'tasks:prio': ({ data }) => { escolha.prioridade = data.v; desenharChips(); },
  'tasks:quem': ({ data }) => { escolha.quem = escolha.quem === data.v ? '' : data.v; desenharChips(); },
  'tasks:add': async ({ el }) => {
    const box = el.closest('[data-tasks]');
    const input = box?.querySelector('.task-add__input');
    const texto = input?.value.trim();
    if (!texto) { input?.focus(); return; }
    input.value = '';
    const quem = escolha.quem || null;
    await addDoc(sharedCol(COL), {
      texto,
      feita: false,
      prioridade: escolha.prioridade || null,
      quem,
      timestamp: Date.now(),
      createdBy: session.uid,
    });
    const outro = partnerUid();
    if (outro && (quem === outro || quem === 'ambos')) {
      notifyUser(outro, `${session.name.split(' ')[0]} atribuiu-te: ${texto}`).catch(() => {});
    }
    escolha.prioridade = '';
    desenharChips();
  },
  'tasks:toggle': async ({ el, data }) => {
    const t = tarefas.find((x) => x.id === data.id);
    if (!t) return;
    const feita = !t.feita;
    el.closest('.task')?.classList.toggle('is-done', feita);
    await updateDoc(sharedDoc(COL, t.id), { feita, feitaEm: feita ? Date.now() : null });
    if (feita) registarAtividade(`fez a tarefa "${t.texto}"`, { icon: 'check', page: 'menu-tarefas' });
  },
  'tasks:assign': async ({ data }) => {
    // Ninguém -> eu -> parceiro(a) -> os dois -> ninguém
    const ordem = ['', session.uid, partnerUid(), 'ambos'].filter((v, i) => i === 0 || v);
    const next = ordem[(ordem.indexOf(data.who || '') + 1) % ordem.length];
    await updateDoc(sharedDoc(COL, data.id), { quem: next || null });
    const outro = partnerUid();
    if (outro && (next === outro || next === 'ambos')) {
      const texto = tarefas.find((x) => x.id === data.id)?.texto || 'uma tarefa';
      notifyUser(outro, `${session.name.split(' ')[0]} atribuiu-te: ${texto}`).catch(() => {});
    }
  },
  'tasks:delete': async ({ el, data }) => {
    el.closest('.task')?.classList.add('is-removing');
    setTimeout(() => deleteDoc(sharedDoc(COL, data.id)).catch((e) => toast(e.message, 'error')), 220);
  },
  'tasks:clearDone': async () => {
    await Promise.all(tarefas.filter((t) => t.feita).map((t) => deleteDoc(sharedDoc(COL, t.id))));
    toast('Tarefas feitas apagadas');
  },
});
