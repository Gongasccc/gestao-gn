// Datas importantes (aniversários, namoro, casamento…) e validades (CC, passaporte, carta…), com contagem decrescente.
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, memberName, on } from '../core/state.js';
import { isoToShort } from '../core/format.js';
import { daysUntil, nextYearly, parseISODate, countdownLabel } from '../core/dates.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';
import { tabsTpl } from '../components/tabs.js';

const scope = createScope();

const TYPES = [
  { value: 'aniversario', label: 'Aniversário', icon: 'gift', yearly: true },
  { value: 'namoro', label: 'Aniversário de namoro', icon: 'heart', yearly: true },
  { value: 'casamento', label: 'Aniversário de casamento', icon: 'heart', yearly: true },
  { value: 'evento', label: 'Evento / data especial', icon: 'star', yearly: false },
  { value: 'validade', label: 'Validade de documento', icon: 'file', yearly: false },
  { value: 'outro', label: 'Outro', icon: 'calendar', yearly: false },
];
const typeOf = (v) => TYPES.find((t) => t.value === v) || TYPES[TYPES.length - 1];
const isExpiry = (d) => d.tipo === 'validade';

/** Próxima ocorrência de um registo (as anuais repetem-se). */
export function occurrence(d) {
  if (!d.data) return null;
  const yearly = d.repete ?? typeOf(d.tipo).yearly;
  if (yearly) return nextYearly(d.data);
  return { date: parseISODate(d.data), years: null };
}

function countdownChip(days, expiry) {
  const cls = days < 0 ? 'chip--danger' : days <= (expiry ? 30 : 7) ? 'chip--warn' : 'chip--muted';
  const label = expiry && days < 0 ? 'Expirado' : countdownLabel(days);
  return html`<span class="chip ${cls}">${label}</span>`;
}

const FIELDS = [
  { name: 'titulo', label: 'Título', placeholder: 'ex: Anos da mãe da N., Cartão de Cidadão do G.', required: true },
  { name: 'tipo', label: 'Tipo', type: 'select', options: TYPES },
  { name: 'data', label: 'Data', type: 'date', required: true, hint: 'Nos aniversários, a data original (ano de nascimento ou do início).' },
  { name: 'pessoa', label: 'De quem', type: 'member' },
  { name: 'lembrarDias', label: 'Avisar com quantos dias de antecedência', type: 'number', default: 7 },
  { name: 'notas', label: 'Notas', type: 'textarea', placeholder: 'ex: ideia de prenda, número do documento…' },
];

function itemTpl(d) {
  const occ = occurrence(d);
  const days = occ ? daysUntil(occ.date) : null;
  const t = typeOf(d.tipo);
  const sub = isExpiry(d)
    ? `Válido até ${isoToShort(d.data)}`
    : `${isoToShort(d.data, !t.yearly)}${occ?.years ? ` · faz ${occ.years} ${d.tipo === 'aniversario' ? 'anos' : occ.years === 1 ? 'ano' : 'anos'}` : ''}`;
  return html`
    <span class="record__icon">${icon(t.icon, 18)}</span>
    <span class="record__main">
      <span class="record__title">${d.titulo}</span>
      <span class="record__meta">${sub}${d.pessoa ? ` · ${memberName(d.pessoa)}` : ''}</span>
    </span>
    ${days != null ? countdownChip(days, isExpiry(d)) : ''}`;
}

const byNext = (a, b) => (occurrence(a)?.date || 0) - (occurrence(b)?.date || 0);

const dates = createRecordList({
  key: 'datas',
  col: () => sharedCol('datas'),
  docRef: (id) => sharedDoc('datas', id),
  addTitle: 'Nova data',
  editTitle: 'Editar data',
  empty: 'Adiciona aniversários, o dia em que começaram a namorar, validades de documentos…',
  emptyIcon: 'calendar',
  fields: FIELDS,
  filter: (d, tab) => (tab === 'validades' ? isExpiry(d) : !isExpiry(d)),
  sort: byNext,
  item: itemTpl,
  itemClass: (d) => {
    const occ = occurrence(d);
    return occ && daysUntil(occ.date) <= (Number(d.lembrarDias) || 7) ? 'record--highlight' : '';
  },
});

/** Próximos eventos para o Início / calendário. */
export function upcomingDates(withinDays = 45) {
  return dates.items().map((d) => {
    const occ = occurrence(d);
    if (!occ) return null;
    const days = daysUntil(occ.date);
    const warn = isExpiry(d) ? 30 : Math.max(Number(d.lembrarDias) || 7, 0);
    if (days > withinDays && days > warn) return null;
    if (days < (isExpiry(d) ? -30 : 0)) return null;
    return { date: occ.date, days, title: d.titulo, icon: typeOf(d.tipo).icon, page: 'menu-datas', expiry: isExpiry(d) };
  }).filter(Boolean);
}

/** Todas as ocorrências num mês (para o calendário). */
export function datesInMonth(year, month) {
  return dates.items().map((d) => {
    if (!d.data) return null;
    const base = parseISODate(d.data);
    const yearly = d.repete ?? typeOf(d.tipo).yearly;
    const date = yearly ? new Date(year, base.getMonth(), base.getDate()) : base;
    if (date.getFullYear() !== year || date.getMonth() !== month) return null;
    return { date, title: d.titulo, icon: typeOf(d.tipo).icon, kind: 'data' };
  }).filter(Boolean);
}

export default {
  id: 'dates',
  pages: [{
    id: 'menu-datas',
    title: 'Datas importantes',
    root: true,
    template: () => html`
      ${tabsTpl('datas', [{ id: 'datas', label: 'Datas' }, { id: 'validades', label: 'Validades' }])}
      ${dates.addButton('Adicionar')}
      ${dates.template()}`,
    onEnter: () => dates.setFilter(dates.state.filter || 'datas'),
  }],
  modals: () => dates.modals(),
  start() {
    dates.state.filter = 'datas';
    dates.subscribe(scope);
    scope.add(onTab());
  },
  stop() { scope.clear(); },
  dates,
};

function onTab() {
  return on('tabs:datas', (tab) => {
    dates.setFilter(tab);
    // Ao adicionar a partir do separador "Validades", o tipo já vem preenchido.
    document.querySelectorAll('#menu-datas [data-action="rl:new"]').forEach((b) => {
      b.dataset.prefill = tab === 'validades' ? JSON.stringify({ tipo: 'validade', lembrarDias: 30 }) : '';
    });
  });
}
