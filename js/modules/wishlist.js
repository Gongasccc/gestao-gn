// Lista de desejos e ideias: restaurantes, filmes/séries, sítios a visitar e prendas (surpresa para o outro).
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, memberName, on } from '../core/state.js';
import { updateDoc } from '../services/firebase.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';
import { tabsTpl } from '../components/tabs.js';

const scope = createScope();

const TYPES = [
  { value: 'restaurante', label: 'Comer', long: 'Restaurantes', icon: 'restaurant' },
  { value: 'ver', label: 'Ver', long: 'Filmes e séries', icon: 'film' },
  { value: 'sitio', label: 'Sítios', long: 'Sítios a visitar', icon: 'map' },
  { value: 'prenda', label: 'Prendas', long: 'Ideias de prendas', icon: 'gift' },
  { value: 'outro', label: 'Outros', long: 'Outros', icon: 'star' },
];
const typeOf = (v) => TYPES.find((t) => t.value === v) || TYPES[TYPES.length - 1];

const wishes = createRecordList({
  key: 'desejos',
  col: () => sharedCol('desejos'),
  docRef: (id) => sharedDoc('desejos', id),
  addTitle: 'Nova ideia',
  editTitle: 'Editar ideia',
  addedToast: 'Ideia guardada',
  fields: [
    { name: 'titulo', label: 'O quê', required: true, placeholder: 'ex: Sushi no Bairro Alto, Severance, Gerês' },
    { name: 'tipo', label: 'Tipo', type: 'select', options: TYPES.map((t) => ({ value: t.value, label: t.long })) },
    { name: 'para', label: 'Prenda para (fica escondida dessa pessoa)', type: 'member' },
    { name: 'link', label: 'Link', type: 'url', placeholder: 'https://' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
  // As prendas para mim ficam escondidas, para ser surpresa.
  filter: (w, tab) => (w.tipo || 'outro') === tab && !(w.tipo === 'prenda' && w.para === session.uid),
  sort: (a, b) => Number(!!a.feito) - Number(!!b.feito) || (b.timestamp || 0) - (a.timestamp || 0),
  empty: 'Nada por aqui ainda.',
  emptyIcon: 'star',
  itemClass: (w) => (w.feito ? 'is-done' : ''),
  item: (w) => html`
    <button class="check pressable" data-action="wish:toggle" data-id="${w.id}" aria-label="Feito">${icon('check', 14)}</button>
    <span class="record__main">
      <span class="record__title">${w.titulo}</span>
      <span class="record__meta">${w.tipo === 'prenda' && w.para ? `Para ${memberName(w.para)} · ` : ''}sugerido por ${memberName(w.createdBy)}${w.notas ? ` · ${w.notas}` : ''}</span>
    </span>
    ${w.link ? html`<a class="icon-btn icon-btn--subtle" href="${w.link}" target="_blank" rel="noopener" aria-label="Abrir link">${icon('external', 16)}</a>` : ''}`,
});

export default {
  id: 'wishlist',
  pages: [{
    id: 'menu-desejos',
    title: 'Desejos e ideias',
    root: true,
    template: () => html`
      <div class="toolbar--scroll">${tabsTpl('desejos', TYPES.map((t) => ({ id: t.value, label: t.label })))}</div>
      ${wishes.addButton('Nova ideia')}
      ${wishes.template()}`,
    onEnter: () => wishes.setFilter(wishes.state.filter || 'restaurante'),
  }],
  modals: () => wishes.modals(),
  actions: {
    'wish:toggle': async ({ data }) => {
      const w = wishes.items().find((x) => x.id === data.id);
      if (w) await updateDoc(sharedDoc('desejos', w.id), { feito: !w.feito });
    },
  },
  start() {
    wishes.state.filter = 'restaurante';
    wishes.subscribe(scope);
    scope.add(on('tabs:desejos', (tab) => {
      wishes.setFilter(tab);
      document.querySelectorAll('#menu-desejos [data-action="rl:new"]').forEach((b) => { b.dataset.prefill = JSON.stringify({ tipo: tab }); });
    }));
  },
  stop() { scope.clear(); },
};
