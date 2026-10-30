// Álbum de memórias do casal, com "neste dia" para relembrar o que fizeram em anos anteriores.
import { html, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope } from '../core/state.js';
import { isoToShort, todayISO } from '../core/format.js';
import { showImage } from '../core/ui.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';

const scope = createScope();

const memories = createRecordList({
  key: 'memorias',
  col: () => sharedCol('memorias'),
  docRef: (id) => sharedDoc('memorias', id),
  addTitle: 'Nova memória',
  editTitle: 'Editar memória',
  addedToast: 'Memória guardada',
  empty: 'Guardem aqui os vossos momentos.',
  emptyIcon: 'image',
  fields: [
    { name: 'foto', label: 'Fotografia', type: 'photo', maxSize: 1800 },
    { name: 'titulo', label: 'Título', required: true, placeholder: 'ex: Primeiro jantar em casa nova' },
    { name: 'data', label: 'Data', type: 'date', default: todayISO },
    { name: 'local', label: 'Local' },
    { name: 'notas', label: 'O que querem lembrar', type: 'textarea' },
  ],
  sort: (a, b) => String(b.data).localeCompare(String(a.data)),
  group: (m) => (m.data ? m.data.slice(0, 4) : 'Sem data'),
  itemClass: () => 'record--media',
  item: (m) => html`
    ${m.foto ? html`<img class="memory__img" src="${m.foto}" alt="" loading="lazy" data-action="mem:view" data-src="${m.foto}">` : ''}
    <span class="record__main">
      <span class="record__title">${m.titulo}</span>
      <span class="record__meta">${isoToShort(m.data)}${m.local ? ` · ${m.local}` : ''}</span>
      ${m.notas ? html`<span class="record__note">${m.notas}</span>` : ''}
    </span>`,
  onChange: () => drawOnThisDay(),
});

/** Memórias de anos anteriores no mesmo dia e mês. */
export function onThisDay() {
  const md = todayISO().slice(5);
  const year = new Date().getFullYear();
  return memories.items().filter((m) => m.data?.slice(5) === md && Number(m.data.slice(0, 4)) < year);
}

function drawOnThisDay() {
  const list = onThisDay();
  render('mem-today', list.length ? html`
    <div class="card glass on-this-day">
      <h3 class="card__title">${icon('heart', 18)} Neste dia</h3>
      ${list.map((m) => html`<p><strong>Há ${new Date().getFullYear() - Number(m.data.slice(0, 4))} ano(s):</strong> ${m.titulo}</p>`)}
    </div>` : '');
}

export default {
  id: 'memories',
  pages: [{
    id: 'menu-memorias',
    title: 'Memórias',
    root: true,
    template: () => html`<div id="mem-today"></div>${memories.addButton('Nova memória')}${memories.template()}`,
    onEnter: drawOnThisDay,
  }],
  modals: () => memories.modals(),
  actions: {
    'mem:view': ({ data }) => showImage(data.src),
  },
  start() { memories.subscribe(scope); },
  stop() { scope.clear(); },
};
