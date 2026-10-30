// Plano de refeições da semana, ligado ao Livro de Receitas, que gera a lista de compras.
import { html, render, byId, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session } from '../core/state.js';
import { modalTemplate, openModal, closeModal, toast, confirmDialog } from '../core/ui.js';
import { toISODate, parseISODate } from '../core/dates.js';
import { isoToShort } from '../core/format.js';
import { setDoc, deleteDoc, getDocs, addDoc, onSnapshot } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../services/paths.js';
import { parseIngredients, shoppingText } from './recipes/parse.js';

const scope = createScope();
const SLOTS = [{ id: 'almoco', label: 'Almoço' }, { id: 'jantar', label: 'Jantar' }];
const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

let weekStart = mondayOf(new Date());
let plan = {};
let recipesCache = null;
let editing = null;

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const weekDays = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return toISODate(d); });

async function loadRecipes() {
  if (recipesCache) return recipesCache;
  recipesCache = snapToList(await getDocs(sharedCol('receitas'))).sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), 'pt'));
  return recipesCache;
}

function draw() {
  const days = weekDays();
  setText('meals-week', `${isoToShort(days[0], false)} – ${isoToShort(days[6])}`);
  const today = toISODate(new Date());
  render('meals-grid', days.map((iso, i) => html`
    <div class="meal-day glass-soft ${iso === today ? 'is-today' : ''}">
      <span class="meal-day__name">${WEEKDAYS[i]} <span class="muted">${parseISODate(iso).getDate()}</span></span>
      ${SLOTS.map((s) => {
        const m = plan[`${iso}_${s.id}`];
        return html`
          <button class="meal-slot pressable ${m ? 'has-meal' : ''}" data-action="meals:edit" data-key="${iso}_${s.id}">
            <span class="meal-slot__label">${s.label}</span>
            <span class="meal-slot__text">${m ? m.texto : '+'}</span>
            ${m?.receita ? html`<span class="meal-slot__badge">${icon('book', 11)}</span>` : ''}
          </button>`;
      })}
    </div>`), { stagger: true });
}

let allMeals = [];

/** Filtra as refeições da semana visível. */
function selectWeek() {
  const days = new Set(weekDays());
  plan = {};
  allMeals.forEach((m) => { if (days.has(m.id.split('_')[0])) plan[m.id] = m; });
  draw();
}

export default {
  id: 'meals',
  pages: [{
    id: 'menu-refeicoes',
    title: 'Plano de refeições',
    root: true,
    template: () => html`
      <div class="month-switch">
        <button class="icon-btn glass-chip pressable" data-action="meals:week" data-step="-1" aria-label="Semana anterior">${icon('chevronLeft', 18)}</button>
        <span class="month-switch__label" id="meals-week"></span>
        <button class="icon-btn glass-chip pressable" data-action="meals:week" data-step="1" aria-label="Semana seguinte">${icon('chevronRight', 18)}</button>
      </div>
      <div class="meal-grid" id="meals-grid"></div>
      <button class="btn btn--primary btn--block pressable" data-action="meals:shopping">${icon('cart', 18)} Gerar lista de compras da semana</button>`,
    onEnter: () => { recipesCache = null; draw(); },
  }],
  modals: () => modalTemplate('meals-modal', 'Refeição', html`
    <div class="field"><label class="field__label" for="meals-recipe">Do livro de receitas</label>
      <select id="meals-recipe" class="input" data-change="meals:pick"><option value="">— Escrever à mão —</option></select></div>
    <div class="field"><label class="field__label" for="meals-text">O que vamos comer</label>
      <input id="meals-text" class="input" placeholder="ex: Bacalhau à Brás, sobras, jantar fora" data-enter="meals:save"></div>
    <div class="btn-row">
      <button class="btn btn--danger-soft" data-action="meals:clear">${icon('trash', 16)}</button>
      <button class="btn" data-action="modal:close" data-modal="meals-modal">Cancelar</button>
      <button class="btn btn--primary" data-action="meals:save">Guardar</button>
    </div>`),
  actions: {
    'meals:week': ({ data }) => {
      weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7 * Number(data.step));
      selectWeek();
    },
    'meals:edit': async ({ data }) => {
      editing = data.key;
      const m = plan[data.key];
      byId('meals-text').value = m?.texto || '';
      openModal('meals-modal');
      const recipes = await loadRecipes();
      render('meals-recipe', html`<option value="">— Escrever à mão —</option>${recipes.map((r) => html`
        <option value="${r.id}" ${m?.receita?.id === r.id ? 'selected' : ''}>${r.titulo}</option>`)}`);
    },
    'meals:pick': ({ value }) => {
      const r = recipesCache?.find((x) => x.id === value);
      if (r) byId('meals-text').value = r.titulo;
    },
    'meals:save': async () => {
      const texto = byId('meals-text').value.trim();
      const sel = byId('meals-recipe').value;
      const r = recipesCache?.find((x) => x.id === sel);
      if (!texto) return deleteDoc(sharedDoc('refeicoes', editing)).then(() => closeModal('meals-modal'));
      await setDoc(sharedDoc('refeicoes', editing), {
        texto,
        receita: r ? { id: r.id, titulo: r.titulo } : null,
        updatedBy: session.uid,
        timestamp: Date.now(),
      });
      closeModal('meals-modal');
    },
    'meals:clear': async () => {
      await deleteDoc(sharedDoc('refeicoes', editing));
      closeModal('meals-modal');
    },
    'meals:shopping': async () => {
      const recipes = await loadRecipes();
      const planned = Object.values(plan).filter((m) => m.receita);
      if (!planned.length) return toast('Escolhe receitas do livro para gerar a lista.', 'info', 3200);
      const ingredients = new Map();
      planned.forEach((m) => {
        const r = recipes.find((x) => x.id === m.receita.id);
        parseIngredients(r?.ingredientes).filter((i) => !i.header).map((i) => shoppingText(i))
          .forEach((l) => { if (!ingredients.has(l.toLowerCase())) ingredients.set(l.toLowerCase(), l); });
      });
      const existing = new Set(snapToList(await getDocs(sharedCol('semanais'))).filter((i) => !i.feita).map((i) => String(i.texto).toLowerCase()));
      const toAdd = [...ingredients].filter(([k]) => !existing.has(k)).map(([, v]) => v);
      if (!toAdd.length) return toast('A lista semanal já tem estes ingredientes.', 'info');
      const ok = await confirmDialog(`Adicionar ${toAdd.length} ingrediente(s) à Lista Semanal?`, { title: 'Lista de compras', confirmLabel: 'Adicionar' });
      if (!ok) return;
      const now = Date.now();
      await Promise.all(toAdd.map((texto, i) => addDoc(sharedCol('semanais'), { texto, feita: false, timestamp: now + i, origem: 'refeicoes' })));
      toast('Ingredientes adicionados à Lista Semanal');
    },
  },
  start() {
    weekStart = mondayOf(new Date());
    scope.add(onSnapshot(sharedCol('refeicoes'), (s) => { allMeals = snapToList(s); selectWeek(); }));
  },
  stop() { scope.clear(); },
};
