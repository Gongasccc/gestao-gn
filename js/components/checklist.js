// Lista de tarefas reutilizável (A Fazer Hoje, Lista Semanal, Lista Rápida).
import { html, byId, render, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { registerActions } from '../core/events.js';
import { session, memberName, partnerUid } from '../core/state.js';
import { initials } from '../core/format.js';
import { notifyUser } from '../services/notifications.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../services/paths.js';

const inputId = (col) => `checklist-input-${col}`;
const listId = (col) => `checklist-${col}`;

// Listas em que cada item pode ser atribuído a um dos dois (toque no círculo para mudar).
const ASSIGNABLE = new Set(['tarefas']);

function assigneeTpl(col, item) {
  if (!ASSIGNABLE.has(col) || session.members.length < 2) return '';
  const who = item.quem;
  return html`<button class="assignee pressable ${who ? 'has-owner' : ''} ${who === session.uid ? 'is-me' : ''}"
    data-action="checklist:assign" data-col="${col}" data-id="${item.id}" data-who="${who || ''}"
    aria-label="${who ? `Atribuída a ${memberName(who)}` : 'Atribuir'}" title="${who ? memberName(who) : 'Ninguém'}">${who ? initials(memberName(who, { short: false })) : '·'}</button>`;
}

export function checklistTpl(col, placeholder) {
  return html`
    <div class="input-row">
      <input type="text" id="${inputId(col)}" class="input" placeholder="${placeholder}"
        data-enter="checklist:add" data-col="${col}" autocomplete="off">
      <button class="btn btn--primary btn--icon pressable" data-action="checklist:add" data-col="${col}" aria-label="Adicionar">${icon('plus', 20)}</button>
    </div>
    <div class="list" id="${listId(col)}"></div>`;
}

function itemTpl(col, item) {
  return html`
    <div class="list-item glass-soft ${item.feita ? 'is-done' : ''}" data-id="${item.id}">
      <button class="check pressable" data-action="checklist:toggle" data-col="${col}" data-id="${item.id}" data-done="${item.feita ? '1' : ''}" aria-label="Marcar">
        ${icon('check', 14)}
      </button>
      <span class="list-item__text" data-action="checklist:toggle" data-col="${col}" data-id="${item.id}" data-done="${item.feita ? '1' : ''}">${item.texto}</span>
      ${assigneeTpl(col, item)}
      <button class="icon-btn icon-btn--subtle" data-action="checklist:delete" data-col="${col}" data-id="${item.id}" aria-label="Apagar">${icon('trash', 16)}</button>
    </div>`;
}

let firstRender = new Set();

export function subscribeChecklist(scope, col) {
  scope.add(onSnapshot(sharedCol(col), (snap) => {
    const items = snapToList(snap).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const pending = items.filter((i) => !i.feita);
    const done = items.filter((i) => i.feita);
    render(listId(col),
      items.length ? html`${pending.map((i) => itemTpl(col, i))}${done.map((i) => itemTpl(col, i))}` : emptyState('Lista vazia. Adiciona o primeiro item!'),
      { stagger: !firstRender.has(col) });
    firstRender.add(col);
  }));
}

export function resetChecklists() {
  firstRender = new Set();
}

registerActions({
  'checklist:add': async ({ data }) => {
    const input = byId(inputId(data.col));
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    await addDoc(sharedCol(data.col), { texto, feita: false, timestamp: Date.now(), createdBy: session.uid });
  },
  'checklist:toggle': async ({ el, data }) => {
    const row = el.closest('.list-item');
    const feita = !data.done;
    row?.classList.toggle('is-done', feita);
    await updateDoc(sharedDoc(data.col, data.id), { feita });
  },
  'checklist:assign': async ({ data }) => {
    // Ninguém -> eu -> parceiro(a) -> ninguém
    const order = ['', session.uid, partnerUid()].filter((v, i) => i === 0 || v);
    const next = order[(order.indexOf(data.who || '') + 1) % order.length];
    await updateDoc(sharedDoc(data.col, data.id), { quem: next || null });
    if (next && next !== session.uid) {
      const text = document.querySelector(`.list-item[data-id="${data.id}"] .list-item__text`)?.textContent || 'uma tarefa';
      notifyUser(next, `${session.name.split(' ')[0]} atribuiu-te: ${text}`).catch(() => {});
    }
  },
  'checklist:delete': async ({ el, data }) => {
    const row = el.closest('.list-item');
    row?.classList.add('is-removing');
    setTimeout(() => deleteDoc(sharedDoc(data.col, data.id)), 220);
  },
});
