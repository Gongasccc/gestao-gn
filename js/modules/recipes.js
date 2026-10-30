// Livro de Receitas: livros com índice de categorias e receitas folheáveis.
import { html, render, byId, emptyState, show } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope } from '../core/state.js';
import { navigate } from '../core/router.js';
import { modalTemplate, openModal, closeModal, toast, confirmDialog, withLoading } from '../core/ui.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion } from '../services/firebase.js';
import { userCol, userDoc, snapToList } from '../services/paths.js';
import { photoPickerTpl, getPhoto, clearPhoto } from '../components/photo-picker.js';

const scope = createScope();
const bookScope = createScope();
const FALLBACK_COVER = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=600&q=70';

let books = [];
let currentBookId = null;
let recipes = [];
let pageIndex = 0; // 0 = índice

const currentBook = () => books.find((b) => b.id === currentBookId);
const categories = () => currentBook()?.categorias || [];

function drawBooks() {
  render('books-grid', books.length
    ? books.map((b) => html`
      <button class="book pressable" data-action="recipes:open-book" data-id="${b.id}">
        <span class="book__cover"><img src="${b.capa || FALLBACK_COVER}" alt="" loading="lazy"><span class="book__spine"></span></span>
        <span class="book__title">${b.nome}</span>
      </button>`)
    : emptyState('Nenhum livro criado ainda.', icon('book', 32)), { stagger: true });
}

function indexPageTpl() {
  const cats = categories();
  const countBy = (c) => recipes.filter((r) => r.categoria === c).length;
  return html`
    <h2 class="paper__heading">Índice</h2>
    <div class="input-row">
      <input type="text" id="recipe-new-category" class="input input--paper" placeholder="Nova categoria…" data-enter="recipes:add-category">
      <button class="btn btn--primary btn--icon" data-action="recipes:add-category" aria-label="Adicionar">${icon('plus', 18)}</button>
    </div>
    <div class="paper__index">
      ${cats.length ? cats.map((c) => html`<button class="paper__index-row" data-action="recipes:goto-category" data-cat="${c}"><span>${c}</span><span>${countBy(c)}</span></button>`)
        : html`<p class="paper__muted">Sem categorias. Adiciona acima!</p>`}
      ${recipes.length ? html`<p class="paper__muted">${recipes.length} receita(s) · desliza para folhear</p>` : ''}
    </div>`;
}

function recipePageTpl(r) {
  return html`
    ${r.foto ? html`<img class="paper__photo" src="${r.foto}" alt="">` : ''}
    <span class="paper__eyebrow">${r.categoria || 'Geral'}</span>
    <h2 class="paper__title">${r.titulo}</h2>
    ${r.tempo ? html`<span class="paper__meta">${icon('clock', 13)} ${r.tempo}</span>` : ''}
    <h4 class="paper__section">Ingredientes</h4>
    <ul class="paper__list">${(r.ingredientes || '').split('\n').filter(Boolean).map((i) => html`<li>${i}</li>`)}</ul>
    <h4 class="paper__section">Preparação</h4>
    <p class="paper__text">${r.preparo || 'Sem preparação'}</p>
    ${r.obs ? html`<h4 class="paper__section">Observações</h4><p class="paper__text">${r.obs}</p>` : ''}
    <button class="btn btn--small btn--danger-soft paper__delete" data-action="recipes:delete" data-id="${r.id}">${icon('trash', 14)} Apagar receita</button>`;
}

function drawPage(direction = 0) {
  const page = byId('paper-page');
  if (!page) return;
  const total = recipes.length + 1;
  pageIndex = Math.max(0, Math.min(pageIndex, total - 1));
  render(page, pageIndex === 0 ? indexPageTpl() : recipePageTpl(recipes[pageIndex - 1]));
  byId('paper-counter').textContent = pageIndex === 0 ? 'Índice' : `Página ${pageIndex} de ${recipes.length}`;
  byId('paper-prev').disabled = pageIndex === 0;
  byId('paper-next').disabled = pageIndex >= total - 1;
  if (direction) {
    page.classList.remove('flip-next', 'flip-prev');
    void page.offsetWidth;
    page.classList.add(direction > 0 ? 'flip-next' : 'flip-prev');
  }
}

function flip(dir) {
  const total = recipes.length + 1;
  const next = pageIndex + dir;
  if (next < 0 || next >= total) return;
  pageIndex = next;
  drawPage(dir);
}

function sortRecipes(list) {
  const order = categories();
  return list.sort((a, b) => {
    const ca = order.indexOf(a.categoria);
    const cb = order.indexOf(b.categoria);
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb);
    return (a.timestamp || 0) - (b.timestamp || 0);
  });
}

function initSwipe() {
  const el = byId('paper');
  if (!el || el.dataset.swipe) return;
  el.dataset.swipe = '1';
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50 && x0 > 40) flip(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive: true });
}

function resetRecipeForm() {
  ['recipe-title', 'recipe-time', 'recipe-ingredients', 'recipe-steps', 'recipe-notes'].forEach((id) => { byId(id).value = ''; });
  clearPhoto('recipe-photo');
}

export default {
  id: 'recipes',
  pages: [
    {
      id: 'menu-receitas',
      title: 'Livro de Receitas',
      root: true,
      template: () => html`
        <div class="section-head">
          <h3 class="section-title">A minha biblioteca</h3>
          <button class="btn btn--small btn--primary pressable" data-action="modal:open" data-modal="modal-new-book">${icon('plus', 14)} Criar livro</button>
        </div>
        <div class="books-grid" id="books-grid"></div>`,
    },
    {
      id: 'page-livro-receitas',
      title: () => currentBook()?.nome || 'Livro',
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="recipes:new" aria-label="Nova receita">${icon('plus', 20)}</button>`,
      template: () => html`
        <div class="paper-wrap">
          <div class="paper" id="paper"><div class="paper__page" id="paper-page"></div></div>
        </div>
        <div class="pager">
          <button class="icon-btn glass-chip pressable" id="paper-prev" data-action="recipes:flip" data-dir="-1" aria-label="Anterior">${icon('chevronLeft', 20)}</button>
          <span class="pager__label" id="paper-counter">Índice</span>
          <button class="icon-btn glass-chip pressable" id="paper-next" data-action="recipes:flip" data-dir="1" aria-label="Seguinte">${icon('chevronRight', 20)}</button>
        </div>
        <button class="btn btn--danger-soft btn--block btn--small" data-action="recipes:delete-book">${icon('trash', 14)} Apagar livro</button>`,
      onEnter: () => { initSwipe(); drawPage(); },
    },
  ],
  modals: () => html`
    ${modalTemplate('modal-new-book', 'Novo livro de receitas', html`
      ${photoPickerTpl('book-cover', 'Capa do livro (opcional)')}
      <input type="text" id="book-name" class="input" placeholder="Nome (ex: Sobremesas, Italianas)" data-enter="recipes:create-book">
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="modal-new-book">Cancelar</button>
        <button class="btn btn--primary" data-action="recipes:create-book">Criar livro</button>
      </div>`)}
    ${modalTemplate('modal-new-recipe', 'Nova receita', html`
      ${photoPickerTpl('recipe-photo', 'Foto da receita')}
      <input type="text" id="recipe-title" class="input" placeholder="Título da receita">
      <input type="text" id="recipe-time" class="input" placeholder="Tempo (ex: 45 min)">
      <div class="field" id="recipe-category-field">
        <label class="field__label" for="recipe-category">Categoria</label>
        <select id="recipe-category" class="input"></select>
      </div>
      <label class="field__label" for="recipe-ingredients">Ingredientes</label>
      <textarea id="recipe-ingredients" class="input textarea" placeholder="Um ingrediente por linha…"></textarea>
      <label class="field__label" for="recipe-steps">Modo de preparação</label>
      <textarea id="recipe-steps" class="input textarea textarea--tall" placeholder="Passos de preparação…"></textarea>
      <label class="field__label" for="recipe-notes">Observações</label>
      <textarea id="recipe-notes" class="input textarea" placeholder="Dicas extra…"></textarea>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="modal-new-recipe">Cancelar</button>
        <button class="btn btn--primary" data-action="recipes:save">Guardar receita</button>
      </div>`, { wide: true })}`,
  actions: {
    'recipes:create-book': async ({ el }) => {
      const nome = byId('book-name').value.trim();
      if (!nome) return;
      await withLoading(el, () => addDoc(userCol('livros_receitas'), { nome, capa: getPhoto('book-cover') || FALLBACK_COVER, categorias: [], timestamp: Date.now() }));
      byId('book-name').value = '';
      clearPhoto('book-cover');
      closeModal('modal-new-book');
      toast(`Livro "${nome}" criado`);
    },
    'recipes:open-book': ({ data }) => {
      currentBookId = data.id;
      recipes = [];
      pageIndex = 0;
      bookScope.clear();
      bookScope.add(onSnapshot(userCol('livros_receitas', data.id, 'itens'), (s) => {
        recipes = sortRecipes(snapToList(s));
        drawPage();
      }));
      navigate('page-livro-receitas');
    },
    'recipes:flip': ({ data }) => flip(Number(data.dir)),
    'recipes:goto-category': ({ data }) => {
      const i = recipes.findIndex((r) => r.categoria === data.cat);
      if (i >= 0) { pageIndex = i + 1; drawPage(1); } else toast('Ainda não há receitas nesta categoria.', 'info');
    },
    'recipes:add-category': async () => {
      const input = byId('recipe-new-category');
      const cat = input.value.trim();
      if (!cat || categories().includes(cat)) return;
      input.value = '';
      await updateDoc(userDoc('livros_receitas', currentBookId), { categorias: arrayUnion(cat) });
    },
    'recipes:new': () => {
      const cats = categories();
      show('recipe-category-field', cats.length > 0);
      render('recipe-category', cats.map((c) => html`<option value="${c}">${c}</option>`));
      openModal('modal-new-recipe');
    },
    'recipes:save': async ({ el }) => {
      const titulo = byId('recipe-title').value.trim();
      if (!titulo) return toast('Indica pelo menos o título da receita.', 'error');
      await withLoading(el, () => addDoc(userCol('livros_receitas', currentBookId, 'itens'), {
        titulo,
        tempo: byId('recipe-time').value.trim(),
        categoria: categories().length ? byId('recipe-category').value : 'Geral',
        ingredientes: byId('recipe-ingredients').value.trim(),
        preparo: byId('recipe-steps').value.trim(),
        obs: byId('recipe-notes').value.trim(),
        foto: getPhoto('recipe-photo'),
        timestamp: Date.now(),
      }));
      resetRecipeForm();
      closeModal('modal-new-recipe');
      toast('Receita guardada');
    },
    'recipes:delete': async ({ data }) => {
      if (!(await confirmDialog('A receita será apagada do livro.', { title: 'Apagar receita?', confirmLabel: 'Apagar', danger: true }))) return;
      await deleteDoc(userDoc('livros_receitas', currentBookId, 'itens', data.id));
    },
    'recipes:delete-book': async () => {
      if (!(await confirmDialog('O livro deixa de aparecer na tua biblioteca.', { title: 'Apagar livro?', confirmLabel: 'Apagar', danger: true }))) return;
      const id = currentBookId;
      bookScope.clear();
      navigate('menu-receitas');
      await deleteDoc(userDoc('livros_receitas', id));
    },
  },
  start() {
    scope.add(onSnapshot(userCol('livros_receitas'), (s) => {
      books = snapToList(s).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      drawBooks();
      if (currentBookId) drawPage();
    }));
  },
  stop() {
    scope.clear();
    bookScope.clear();
    books = [];
    recipes = [];
    currentBookId = null;
  },
};
