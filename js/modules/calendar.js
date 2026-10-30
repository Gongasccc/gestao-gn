// Calendário partilhado: eventos dos dois, com datas importantes e contas fixas à mistura.
import { html, render, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, memberName } from '../core/state.js';
import { todayISO, isoToShort } from '../core/format.js';
import { monthGrid, toISODate, parseISODate, daysUntil } from '../core/dates.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';
import { datesInMonth } from './dates.js';
import finances from './finances.js';

const scope = createScope();
const view = { year: new Date().getFullYear(), month: new Date().getMonth(), selected: todayISO() };

const REPEAT = [
  { value: 'none', label: 'Não repete' },
  { value: 'weekly', label: 'Todas as semanas' },
  { value: 'monthly', label: 'Todos os meses' },
  { value: 'yearly', label: 'Todos os anos' },
];

/** O evento acontece neste dia? (tendo em conta a repetição) */
function occursOn(ev, day) {
  if (!ev.data) return false;
  const base = parseISODate(ev.data);
  if (day < base) return toISODate(day) === ev.data;
  switch (ev.repete) {
    case 'weekly': return day.getDay() === base.getDay();
    case 'monthly': return day.getDate() === base.getDate();
    case 'yearly': return day.getDate() === base.getDate() && day.getMonth() === base.getMonth();
    default: return toISODate(day) === ev.data;
  }
}

const events = createRecordList({
  key: 'eventos',
  col: () => sharedCol('eventos'),
  docRef: (id) => sharedDoc('eventos', id),
  addTitle: 'Novo evento',
  editTitle: 'Editar evento',
  addedToast: 'Evento adicionado',
  fields: [
    { name: 'titulo', label: 'O quê', placeholder: 'ex: Jantar com os pais, consulta, turno', required: true },
    { name: 'data', label: 'Dia', type: 'date', required: true, default: () => view.selected },
    { name: 'hora', label: 'Hora', type: 'time' },
    { name: 'quem', label: 'Para quem', type: 'member' },
    { name: 'repete', label: 'Repetir', type: 'select', options: REPEAT, default: 'none' },
    { name: 'local', label: 'Local', placeholder: 'opcional' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
  filter: (ev) => occursOn(ev, parseISODate(view.selected)),
  sort: (a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99')),
  empty: 'Nada marcado para este dia.',
  emptyIcon: 'calendar',
  item: (ev) => html`
    <span class="record__time">${ev.hora || 'Todo o dia'}</span>
    <span class="record__main">
      <span class="record__title">${ev.titulo}</span>
      <span class="record__meta">${ev.quem ? memberName(ev.quem) : 'Os dois'}${ev.local ? ` · ${ev.local}` : ''}${ev.repete && ev.repete !== 'none' ? ' · repete' : ''}</span>
    </span>`,
  onChange: () => drawGrid(),
});

function extrasOn(iso) {
  const day = parseISODate(iso);
  const out = datesInMonth(day.getFullYear(), day.getMonth()).filter((d) => toISODate(d.date) === iso);
  for (const b of finances.bills.items()) {
    const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    if (Math.min(Number(b.dia) || 1, last) === day.getDate()) out.push({ title: `Pagar ${b.nome}`, icon: 'bolt', kind: 'conta' });
  }
  return out;
}

function drawGrid() {
  const cells = monthGrid(view.year, view.month);
  const today = todayISO();
  const label = new Date(view.year, view.month, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  setText('cal-title', label.charAt(0).toUpperCase() + label.slice(1));
  render('cal-grid', cells.map((c) => {
    const evCount = events.items().filter((ev) => occursOn(ev, c.date)).length;
    const extra = c.inMonth ? extrasOn(c.iso).length : 0;
    return html`
      <button class="cal-day ${c.inMonth ? '' : 'is-out'} ${c.iso === today ? 'is-today' : ''} ${c.iso === view.selected ? 'is-selected' : ''}"
        data-action="cal:select" data-date="${c.iso}">
        <span>${c.date.getDate()}</span>
        <span class="cal-day__dots">${evCount ? html`<i class="dot dot--accent"></i>` : ''}${extra ? html`<i class="dot dot--muted"></i>` : ''}</span>
      </button>`;
  }));
  drawDay();
}

function drawDay() {
  const d = parseISODate(view.selected);
  const diff = daysUntil(d);
  setText('cal-day-title', `${isoToShort(view.selected)}${diff === 0 ? ' · Hoje' : diff === 1 ? ' · Amanhã' : ''}`);
  render('cal-extras', extrasOn(view.selected).map((x) => html`
    <div class="record record--soft"><span class="record__icon">${icon(x.icon, 16)}</span><span class="record__main"><span class="record__title">${x.title}</span></span></div>`));
  events.draw();
}

/** Eventos dos próximos dias (para o Início). */
export function upcomingEvents(days = 7) {
  const out = [];
  const start = new Date();
  for (let i = 0; i <= days; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    events.items().filter((ev) => occursOn(ev, day)).forEach((ev) => out.push({
      date: day, days: i, title: ev.hora ? `${ev.hora} · ${ev.titulo}` : ev.titulo, icon: 'calendar', page: 'menu-calendario',
    }));
  }
  return out;
}

export default {
  id: 'calendar',
  pages: [{
    id: 'menu-calendario',
    title: 'Calendário',
    root: true,
    template: () => html`
      <div class="card glass cal">
        <div class="month-switch">
          <button class="icon-btn glass-chip pressable" data-action="cal:month" data-step="-1" aria-label="Mês anterior">${icon('chevronLeft', 18)}</button>
          <button class="month-switch__label" id="cal-title" data-action="cal:today"></button>
          <button class="icon-btn glass-chip pressable" data-action="cal:month" data-step="1" aria-label="Mês seguinte">${icon('chevronRight', 18)}</button>
        </div>
        <div class="cal-weekdays">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d) => html`<span>${d}</span>`)}</div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>
      <div class="section-head">
        <h3 class="section-title" id="cal-day-title"></h3>
        <button class="btn btn--small btn--primary pressable" data-action="rl:new" data-list="eventos">${icon('plus', 14)} Evento</button>
      </div>
      <div class="list" id="cal-extras"></div>
      ${events.template()}`,
    onEnter: drawGrid,
  }],
  modals: () => events.modals(),
  actions: {
    'cal:select': ({ data }) => {
      view.selected = data.date;
      const d = parseISODate(data.date);
      if (d.getMonth() !== view.month) { view.month = d.getMonth(); view.year = d.getFullYear(); }
      drawGrid();
    },
    'cal:month': ({ data }) => {
      const d = new Date(view.year, view.month + Number(data.step), 1);
      view.year = d.getFullYear();
      view.month = d.getMonth();
      view.selected = toISODate(d);
      drawGrid();
    },
    'cal:today': () => {
      const t = new Date();
      Object.assign(view, { year: t.getFullYear(), month: t.getMonth(), selected: todayISO() });
      drawGrid();
    },
  },
  start() { events.subscribe(scope); },
  stop() { scope.clear(); },
  events,
};
