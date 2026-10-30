// Livro de Receitas (inspirado no AnyList): coleções, todas as receitas, por fonte,
// detalhe com Ingredientes / Passos / Notas, escala, envio para a lista de compras,
// modo cozinhar e importação a partir de sites de receitas.
import { html, raw, esc, render, byId, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session } from '../core/state.js';
import { navigate, back, currentPage, refreshHeader } from '../core/router.js';
import { modalTemplate, openModal, closeModal, toast, confirmDialog, promptDialog, withLoading, showImage } from '../core/ui.js';
import { toISODate } from '../core/dates.js';
import {
  addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, arrayUnion, arrayRemove,
} from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../services/paths.js';
import { photoPickerTpl, getPhoto, setPhoto, clearPhoto } from '../components/photo-picker.js';
import { actionSheet } from '../components/action-sheet.js';
import {
  parseIngredients, parseSteps, quantityText, shoppingText, servingsNumber, formatNumber, sourceName, normalize,
} from './recipes/parse.js';
import { importRecipe, recipeFromText } from './recipes/importer.js';

const RECIPES = 'receitas';
const COLLECTIONS = 'receitas_colecoes';
const LISTS = [{ id: 'semanais', label: 'Lista Semanal' }, { id: 'rapidas', label: 'Lista Rápida' }];
const SCALES = [0.5, 1, 1.5, 2, 3, 4];
const EMOJIS = ['🍰', '🥗', '🍝', '🍲', '🥘', '🍛', '🍕', '🍔', '🥩', '🍗', '🐟', '🦐', '🥦', '🍳', '🥞', '🍪', '🍮', '🧁', '🥧', '🍞', '🌮', '🍜', '🍹', '☕', '🎄', '📖', '⭐', '❤️'];
const SORTS = [{ id: 'nome', label: 'Nome' }, { id: 'recentes', label: 'Mais recentes' }, { id: 'avaliacao', label: 'Avaliação' }];

const scope = createScope();
let recipes = [];
let collections = [];

// Lista atual: todas, uma coleção ou uma fonte.
let listCtx = { kind: 'all', id: '', title: 'Todas as receitas' };
let homeQuery = '';
let listQuery = '';
let sortBy = readPref('sort', 'nome');

// Detalhe
let currentId = null;
let tab = 'ingredientes';
let scale = 1;
let destList = readPref('dest', 'semanais');
let selected = new Set();

// Formulários
let editingId = null;
let editCols = new Set();
let editingCollectionId = null;
let collectionEmoji = EMOJIS[0];
let pickSet = new Set();

// Modo cozinhar
let cookStep = 0;
let wakeLock = null;

function readPref(key, fallback) {
  try { return localStorage.getItem(`gn.receitas.${key}`) || fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(`gn.receitas.${key}`, value); } catch { /* sem storage */ }
}

const current = () => recipes.find((r) => r.id === currentId);
const collectionById = (id) => collections.find((c) => c.id === id);
const countIn = (cid) => recipes.filter((r) => (r.colecoes || []).includes(cid)).length;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sourceOf = (r) => r.fonteNome || sourceName(r.fonte) || '';

function sources() {
  const map = new Map();
  recipes.forEach((r) => {
    const s = sourceOf(r) || 'Criadas por nós';
    map.set(s, (map.get(s) || 0) + 1);
  });
  return [...map].sort((a, b) => a[0].localeCompare(b[0], 'pt'));
}

function matches(r, q) {
  if (!q) return true;
  const hay = normalize([r.titulo, r.ingredientes, sourceOf(r), r.notas].join(' '));
  return normalize(q).split(/\s+/).every((w) => hay.includes(w));
}

function sorted(list) {
  const arr = [...list];
  if (sortBy === 'recentes') return arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  if (sortBy === 'avaliacao') return arr.sort((a, b) => (b.avaliacao || 0) - (a.avaliacao || 0) || String(a.titulo).localeCompare(String(b.titulo), 'pt'));
  return arr.sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), 'pt'));
}

function listRecipes() {
  let list = recipes;
  if (listCtx.kind === 'collection') list = list.filter((r) => (r.colecoes || []).includes(listCtx.id));
  if (listCtx.kind === 'queue') list = list.filter((r) => r.fila);
  if (listCtx.kind === 'source') list = list.filter((r) => (sourceOf(r) || 'Criadas por nós') === listCtx.id);
  return sorted(list.filter((r) => matches(r, listQuery)));
}

/* ---------------- Templates ---------------- */

const thumbTpl = (r) => (r.foto
  ? html`<img src="${r.foto}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : html`<span class="rc-card__placeholder">${icon('restaurant', 28)}</span>`);

function cardTpl(r) {
  return html`
    <div class="rc-card pressable" role="button" tabindex="0" data-action="rc:open" data-id="${r.id}">
      <span class="rc-card__img">${thumbTpl(r)}
        <button class="rc-card__more" data-action="rc:card-menu" data-id="${r.id}" aria-label="Opções">${icon('more', 18)}</button>
      </span>
      <span class="rc-card__body">
        <span class="rc-card__title">${r.titulo}</span>
        <span class="rc-card__sub">${sourceOf(r) || (r.tempoPrep ? r.tempoPrep : ' ')}</span>
      </span>
    </div>`;
}

function rowTpl({ action, data = {}, emoji, iconName, title, sub, more }) {
  const attrs = raw(Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '));
  return html`
    <div class="rc-row pressable" role="button" tabindex="0" data-action="${action}" ${attrs}>
      <span class="rc-row__icon">${emoji || icon(iconName, 22)}</span>
      <span class="rc-row__main"><span class="rc-row__title">${title}</span><span class="rc-row__sub">${sub}</span></span>
      ${more ? html`<button class="icon-btn icon-btn--subtle rc-row__more" data-action="${more}" ${attrs} aria-label="Opções">${icon('more', 20)}</button>` : icon('chevronRight', 18)}
    </div>`;
}

function drawHome() {
  const el = byId('rc-home');
  if (!el) return;
  if (homeQuery) {
    const found = sorted(recipes.filter((r) => matches(r, homeQuery)));
    render(el, found.length
      ? html`<div class="rc-grid">${found.map(cardTpl)}</div>`
      : emptyState(`Nenhuma receita encontrada para "${homeQuery}".`, icon('search', 30)));
    return;
  }
  if (!recipes.length && !collections.length) {
    render(el, html`
      <div class="rc-empty">
        <span class="rc-empty__icon">${icon('restaurant', 34)}</span>
        <h3>Ainda não há receitas</h3>
        <p>Importa receitas de qualquer site (Pingo Doce, Continente, blogs…) ou escreve as vossas.</p>
        <button class="btn btn--primary btn--block pressable" data-action="rc:import-open">${icon('download', 18)} Importar da web</button>
        <button class="btn btn--block pressable" data-action="rc:new">${icon('plus', 18)} Criar receita</button>
      </div>`);
    return;
  }
  const nSources = sources().length;
  const queued = recipes.filter((r) => r.fila).length;
  render(el, html`
    <p class="rc-label">Receitas</p>
    <div class="rc-group">
      ${rowTpl({ action: 'rc:list', data: { kind: 'all' }, emoji: '🗃️', title: 'Ver todas as receitas', sub: plural(recipes.length, 'receita', 'receitas') })}
      ${rowTpl({ action: 'rc:sources', emoji: '📚', title: 'Ver por fonte', sub: plural(nSources, 'fonte', 'fontes') })}
      ${queued ? rowTpl({ action: 'rc:list', data: { kind: 'queue' }, emoji: '⏳', title: 'Fila para cozinhar', sub: plural(queued, 'receita', 'receitas') }) : ''}
    </div>
    <p class="rc-label">Coleções</p>
    <div class="rc-group">
      ${collections.map((c) => rowTpl({
        action: 'rc:list', data: { kind: 'collection', id: c.id }, emoji: c.emoji || '📖', title: c.nome, sub: plural(countIn(c.id), 'receita', 'receitas'), more: 'rc:collection-menu',
      }))}
      <button class="rc-row rc-row--add pressable" data-action="rc:collection-new">
        <span class="rc-row__icon">${icon('plus', 20)}</span><span class="rc-row__main"><span class="rc-row__title">Nova coleção</span></span>
      </button>
    </div>`);
}

function drawList() {
  const grid = byId('rc-grid');
  if (!grid) return;
  const list = listRecipes();
  byId('rc-list-search').placeholder = `Pesquisar em ${listCtx.title}`;
  render(grid, list.length ? list.map(cardTpl) : emptyState(
    listQuery ? 'Nenhuma receita encontrada.' : listCtx.kind === 'collection' ? 'Esta coleção está vazia. Toca em + para adicionar receitas.' : 'Sem receitas.',
    icon('restaurant', 30),
  ));
}

function drawSources() {
  const el = byId('rc-sources');
  if (!el) return;
  const list = sources();
  render(el, list.length
    ? html`<div class="rc-group">${list.map(([name, n]) => rowTpl({ action: 'rc:list', data: { kind: 'source', id: name }, iconName: name === 'Criadas por nós' ? 'heart' : 'globe', title: name, sub: plural(n, 'receita', 'receitas') }))}</div>`
    : emptyState('Sem fontes ainda.'));
}

function starsTpl(r) {
  const v = r.avaliacao || 0;
  return html`<span class="rc-stars">${[1, 2, 3, 4, 5].map((n) => html`
    <button class="rc-star ${n <= v ? 'is-on' : ''}" data-action="rc:rate" data-v="${n}" aria-label="${n} estrelas">${icon('star', 18)}</button>`)}</span>`;
}

function ingredientsPanel(r) {
  const ings = parseIngredients(r.ingredientes);
  if (!ings.length) return html`<p class="rc-muted">Sem ingredientes. <button class="link" data-action="rc:edit">Adicionar</button></p>`;
  const dest = LISTS.find((l) => l.id === destList) || LISTS[0];
  const n = selected.size;
  return html`
    <div class="rc-ingbar">
      <button class="rc-ingbar__cell pressable" data-action="rc:dest"><small>Lista de destino</small><b>${dest.label}</b></button>
      <button class="rc-ingbar__cell rc-ingbar__cell--scale pressable" data-action="rc:scale"><small>Escala</small><b>${formatNumber(scale)}×</b></button>
    </div>
    <ul class="rc-ings">
      ${ings.map((ing, i) => (ing.header
        ? html`<li class="rc-ings__header">${ing.header}</li>`
        : html`<li class="rc-ing ${selected.has(i) ? 'is-selected' : ''}" data-action="rc:ing" data-i="${i}">
            <span class="rc-circle">${icon('check', 14)}</span>
            <span class="rc-ing__qty">${quantityText(ing, scale)}</span>
            <span class="rc-ing__name">${ing.name}</span>
          </li>`))}
    </ul>
    <button class="rc-addall pressable" data-action="rc:add-to-list">${n ? `Adicionar ${plural(n, 'ingrediente', 'ingredientes')} à lista` : 'Adicionar todos os ingredientes à lista'}</button>
    ${r.nutricao ? html`<p class="rc-label">Nutrição</p><div class="rc-text rc-box">${r.nutricao}</div>` : ''}`;
}

function stepsPanel(r) {
  const steps = parseSteps(r.passos);
  if (!steps.length) return html`<p class="rc-muted">Sem passos. <button class="link" data-action="rc:edit">Adicionar</button></p>`;
  let n = 0;
  return html`<ol class="rc-steps">${steps.map((s) => (s.header
    ? html`<li class="rc-steps__header">${s.header}</li>`
    : html`<li class="rc-step"><b>Passo ${++n}</b><p>${s.text}</p></li>`))}</ol>`;
}

function notesPanel(r) {
  return r.notas
    ? html`<div class="rc-text">${r.notas}</div>`
    : html`<p class="rc-muted">Sem notas. <button class="link" data-action="rc:edit">Adicionar</button></p>`;
}

function drawDetail() {
  const el = byId('rc-detail');
  const r = current();
  if (!el) return;
  if (!r) { render(el, ''); return; }
  const cols = (r.colecoes || []).map(collectionById).filter(Boolean);
  const servings = servingsNumber(r.porcoes);
  const servingsText = servings ? formatNumber(servings * scale) : (r.porcoes || '–');
  const last = r.ultimaVez ? new Date(r.ultimaVez).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
  const panel = tab === 'passos' ? stepsPanel(r) : tab === 'notas' ? notesPanel(r) : ingredientsPanel(r);
  render(el, html`
    <header class="rc-head">
      <h1 class="rc-title">${r.titulo}</h1>
      ${r.fonte ? html`<a class="rc-source" href="${r.fonte}" target="_blank" rel="noopener">de <span>${sourceOf(r)}</span> ${icon('external', 13)}</a>` : ''}
    </header>
    <div class="rc-hero">
      <button class="rc-photo" data-action="rc:photo" aria-label="Ver foto">${thumbTpl(r)}</button>
      <div class="rc-side">
        <div><small>Avaliação</small>${starsTpl(r)}</div>
        <div><small>Coleções</small>
          <button class="rc-side__cols" data-action="rc:edit-collections">${cols.length ? cols.map((c) => html`<span>${c.emoji || '📖'} ${c.nome}</span>`) : html`<span class="rc-muted">Adicionar…</span>`}</button>
        </div>
        <div><small>Última vez</small><span>${last}</span></div>
      </div>
    </div>
    <div class="rc-times">
      <div><small>Preparação</small><span>${r.tempoPrep || '–'}</span></div>
      <div><small>Confeção</small><span>${r.tempoCozedura || '–'}</span></div>
      <div><small>Porções</small><span>${servingsText}</span></div>
    </div>
    <button class="btn btn--block rc-cook-btn pressable" data-action="rc:cook">${icon('utensils', 20)} Cozinhar receita</button>
    <div class="rc-tabs" role="tablist">
      ${[['ingredientes', 'Ingredientes'], ['passos', 'Passos'], ['notas', 'Notas']].map(([id, label]) => html`
        <button class="rc-tab ${tab === id ? 'is-active' : ''}" role="tab" data-action="rc:tab" data-tab="${id}">${label}</button>`)}
    </div>
    <div class="rc-panel">${panel}</div>`);
}

function drawAll() {
  drawHome();
  drawList();
  drawSources();
  if (currentId && currentPage() === 'page-receita') {
    if (!current()) back(); else drawDetail();
  }
}

/* ---------------- Formulário de receita ---------------- */

function drawEditCollections() {
  render('rc-edit-cols', html`
    ${collections.map((c) => html`<button type="button" class="chip pressable ${editCols.has(c.id) ? 'chip--accent' : ''}" data-action="rc:edit-col" data-id="${c.id}">${c.emoji || '📖'} ${c.nome}</button>`)}
    <button type="button" class="chip chip--muted pressable" data-action="rc:edit-col-new">${icon('plus', 12)} Nova</button>`);
}

const FIELDS = {
  titulo: 'rc-f-title', fonte: 'rc-f-source', tempoPrep: 'rc-f-prep', tempoCozedura: 'rc-f-cook', porcoes: 'rc-f-serv',
  ingredientes: 'rc-f-ings', passos: 'rc-f-steps', notas: 'rc-f-notes', nutricao: 'rc-f-nutri',
};

function openEditor(data = {}, id = null) {
  editingId = id;
  Object.entries(FIELDS).forEach(([k, fid]) => { byId(fid).value = data[k] || ''; });
  if (data.foto) setPhoto('rc-photo', data.foto); else clearPhoto('rc-photo');
  editCols = new Set(data.colecoes || (listCtx.kind === 'collection' && currentPage() === 'page-receitas-lista' ? [listCtx.id] : []));
  drawEditCollections();
  byId('rc-edit-title').textContent = id ? 'Editar receita' : 'Nova receita';
  openModal('rc-edit');
}

/* ---------------- Modo cozinhar ---------------- */

async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* não suportado */ }
}

function drawCook() {
  const r = current();
  if (!r) return;
  const steps = parseSteps(r.passos).filter((s) => !s.header);
  const total = Math.max(steps.length, 1);
  cookStep = Math.max(0, Math.min(cookStep, total - 1));
  const last = cookStep >= total - 1;
  const ings = parseIngredients(r.ingredientes);
  render('rc-cook-body', html`
    <div class="rc-cook__top">
      <button class="icon-btn glass-chip pressable" data-action="rc:cook-close" aria-label="Fechar">${icon('close', 20)}</button>
      <span class="rc-cook__title">${r.titulo}</span>
      <button class="icon-btn glass-chip pressable" data-action="rc:cook-ings" aria-label="Ingredientes">${icon('clipboard', 18)}</button>
    </div>
    <div class="rc-cook__progress"><span style="width:${((cookStep + 1) / total) * 100}%"></span></div>
    <div class="rc-cook__main" id="rc-cook-main">
      <p class="rc-cook__count">Passo ${cookStep + 1} de ${total}</p>
      <p class="rc-cook__text">${steps[cookStep]?.text || 'Esta receita ainda não tem passos.'}</p>
    </div>
    <div class="rc-cook__ings" id="rc-cook-ings" hidden>
      <ul class="rc-ings">${ings.map((ing) => (ing.header ? html`<li class="rc-ings__header">${ing.header}</li>`
        : html`<li class="rc-ing"><span class="rc-ing__qty">${quantityText(ing, scale)}</span><span class="rc-ing__name">${ing.name}</span></li>`))}</ul>
    </div>
    <div class="rc-cook__nav">
      <button class="btn pressable" data-action="rc:cook-step" data-dir="-1" ${cookStep === 0 ? raw('disabled') : ''}>${icon('chevronLeft', 18)} Anterior</button>
      ${last
        ? html`<button class="btn btn--primary pressable" data-action="rc:cook-done">${icon('check', 18)} Concluir</button>`
        : html`<button class="btn btn--primary pressable" data-action="rc:cook-step" data-dir="1">Seguinte ${icon('chevronRight', 18)}</button>`}
    </div>`);
}

function initCookSwipe() {
  const el = byId('rc-cook-body');
  if (!el || el.dataset.swipe) return;
  el.dataset.swipe = '1';
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 60) return;
    const total = parseSteps(current()?.passos).filter((s) => !s.header).length;
    const next = cookStep + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < total) { cookStep = next; drawCook(); }
  }, { passive: true });
}

/* ---------------- Migração do livro antigo ---------------- */

// Os livros antigos (livros_receitas/{livro}/itens) passam a coleções; as receitas mantêm o id,
// por isso o plano de refeições continua a apontar para elas. Os dados antigos não são apagados.
async function migrateOldBooks() {
  const flag = sharedDoc('receitas_meta', 'estado');
  try {
    const snap = await getDoc(flag);
    if (snap.exists() && snap.data().migrado) return;
    const books = snapToList(await getDocs(sharedCol('livros_receitas')));
    for (const b of books) {
      await setDoc(sharedDoc(COLLECTIONS, b.id), { nome: b.nome || 'Livro', emoji: '📖', timestamp: b.timestamp || Date.now() }, { merge: true });
      const items = snapToList(await getDocs(sharedCol('livros_receitas', b.id, 'itens')));
      await Promise.all(items.map((it) => setDoc(sharedDoc(RECIPES, it.id), {
        titulo: it.titulo || 'Receita',
        foto: it.foto || '',
        tempoPrep: it.tempo || '',
        ingredientes: it.ingredientes || '',
        passos: it.preparo || '',
        notas: [it.categoria && it.categoria !== 'Geral' ? `Categoria: ${it.categoria}` : '', it.obs || ''].filter(Boolean).join('\n\n'),
        colecoes: arrayUnion(b.id),
        timestamp: it.timestamp || Date.now(),
      }, { merge: true })));
    }
    await setDoc(flag, { migrado: true, em: Date.now() }, { merge: true });
  } catch (err) {
    console.warn('[receitas] migração', err);
  }
}

/* ---------------- Ações ---------------- */

async function addToList(ings) {
  if (!ings.length) return;
  const existing = new Set(snapToList(await getDocs(sharedCol(destList))).filter((i) => !i.feita).map((i) => normalize(i.texto)));
  const items = ings.map((ing) => shoppingText(ing, scale)).filter((t) => !existing.has(normalize(t)));
  const label = LISTS.find((l) => l.id === destList)?.label || 'lista';
  if (!items.length) return toast(`Já estão na ${label}.`, 'info');
  const now = Date.now();
  await Promise.all(items.map((texto, i) => addDoc(sharedCol(destList), {
    texto, feita: false, timestamp: now + i, createdBy: session.uid, origem: 'receitas',
  })));
  selected = new Set();
  drawDetail();
  toast(`${plural(items.length, 'ingrediente adicionado', 'ingredientes adicionados')} à ${label}`);
}

function shareText(r) {
  const ings = parseIngredients(r.ingredientes).map((i) => (i.header ? `\n${i.header}:` : `• ${shoppingText(i, scale)}`)).join('\n');
  let n = 0;
  const steps = parseSteps(r.passos).map((s) => (s.header ? `\n${s.header}:` : `${++n}. ${s.text}`)).join('\n');
  return [r.titulo, r.fonte, ings && `\nIngredientes\n${ings}`, steps && `\nPreparação\n${steps}`, r.notas && `\nNotas\n${r.notas}`].filter(Boolean).join('\n');
}

async function shareRecipe(r) {
  const text = shareText(r);
  try {
    if (navigator.share) return await navigator.share({ title: r.titulo, text });
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Receita copiada');
  } catch {
    toast('Não foi possível partilhar.', 'error');
  }
}

async function toggleQueue(r) {
  await updateDoc(sharedDoc(RECIPES, r.id), { fila: r.fila ? null : Date.now() });
  toast(r.fila ? 'Removida da fila' : 'Adicionada à fila para cozinhar');
}

function printRecipe(r) {
  const ings = parseIngredients(r.ingredientes);
  const steps = parseSteps(r.passos);
  const doc = String(html`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${r.titulo}</title>
    <style>body{font:15px/1.5 system-ui,sans-serif;max-width:680px;margin:32px auto;padding:0 20px;color:#111}
    h1{margin:0}.src{color:#666}img{max-width:100%;max-height:300px;border-radius:10px;margin:14px 0}
    h2{font-size:16px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em}li{margin:4px 0}</style></head><body>
    <h1>${r.titulo}</h1>${r.fonte ? html`<div class="src">${r.fonte}</div>` : ''}
    ${r.foto ? html`<img src="${r.foto}" alt="">` : ''}
    <p>${[r.tempoPrep && `Preparação: ${r.tempoPrep}`, r.tempoCozedura && `Confeção: ${r.tempoCozedura}`, r.porcoes && `Porções: ${r.porcoes}`].filter(Boolean).join(' · ')}</p>
    <h2>Ingredientes</h2><ul>${ings.map((i) => (i.header ? html`</ul><b>${i.header}</b><ul>` : html`<li>${shoppingText(i, scale)}</li>`))}</ul>
    <h2>Passos</h2><ol>${steps.map((st) => (st.header ? html`</ol><b>${st.header}</b><ol>` : html`<li>${st.text}</li>`))}</ol>
    ${r.notas ? html`<h2>Notas</h2><p style="white-space:pre-line">${r.notas}</p>` : ''}
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  const w = window.open('', '_blank');
  if (!w) return toast('Permite janelas para imprimir.', 'error');
  w.document.write(doc);
  w.document.close();
}

async function shareMenu(r) {
  const choice = await actionSheet([
    { id: 'share', label: 'Partilhar…', icon: 'share' },
    { id: 'email', label: 'Enviar por email', icon: 'mail' },
    { id: 'print', label: 'Imprimir', icon: 'printer' },
    { id: 'copy', label: 'Copiar texto', icon: 'copy' },
  ], { title: r.titulo });
  if (choice === 'share') shareRecipe(r);
  if (choice === 'email') window.location.href = `mailto:?subject=${encodeURIComponent(r.titulo)}&body=${encodeURIComponent(shareText(r))}`;
  if (choice === 'print') printRecipe(r);
  if (choice === 'copy') {
    try { await navigator.clipboard.writeText(shareText(r)); toast('Receita copiada'); } catch { toast('Não foi possível copiar.', 'error'); }
  }
}

async function pickCollectionFor(r) {
  if (!collections.length) return openCollectionModal();
  const has = new Set(r.colecoes || []);
  const choice = await actionSheet([
    ...collections.map((c) => ({ id: c.id, label: `${c.emoji || '📖'} ${c.nome}`, active: has.has(c.id) })),
    { id: '__new', label: 'Nova coleção', icon: 'plus' },
  ], { title: 'Coleções' });
  if (!choice) return;
  if (choice === '__new') return openCollectionModal();
  await updateDoc(sharedDoc(RECIPES, r.id), { colecoes: has.has(choice) ? arrayRemove(choice) : arrayUnion(choice) });
}

async function cardMenu(id) {
  const r = recipes.find((x) => x.id === id);
  if (!r) return;
  const inCollection = listCtx.kind === 'collection' && currentPage() === 'page-receitas-lista';
  const choice = await actionSheet([
    { id: 'edit', label: 'Editar receita', icon: 'edit' },
    { id: 'cols', label: 'Coleções…', icon: 'folder' },
    { id: 'queue', label: r.fila ? 'Remover da fila' : 'Adicionar à fila', icon: 'queue' },
    { id: 'share', label: 'Email, imprimir e partilhar', icon: 'share' },
    inCollection ? { id: 'out', label: 'Remover desta coleção', icon: 'close', danger: true } : { id: 'delete', label: 'Apagar receita', icon: 'trash', danger: true },
  ], { title: r.titulo });
  if (choice === 'edit') { currentId = r.id; openEditor(r, r.id); }
  if (choice === 'cols') pickCollectionFor(r);
  if (choice === 'queue') toggleQueue(r);
  if (choice === 'share') shareMenu(r);
  if (choice === 'out') await updateDoc(sharedDoc(RECIPES, r.id), { colecoes: arrayRemove(listCtx.id) });
  if (choice === 'delete') {
    if (!(await confirmDialog('Esta ação não pode ser desfeita.', { title: `Apagar "${r.titulo}"?`, confirmLabel: 'Apagar', danger: true }))) return;
    await deleteDoc(sharedDoc(RECIPES, r.id));
  }
}

async function collectionMenu(id) {
  const c = collectionById(id);
  if (!c) return;
  const choice = await actionSheet([
    { id: 'edit', label: 'Editar coleção', icon: 'edit' },
    { id: 'add', label: 'Adicionar receitas à coleção', icon: 'check' },
    { id: 'delete', label: 'Apagar coleção', icon: 'trash', danger: true },
  ], { title: `${c.emoji || '📖'} ${c.nome}` });
  if (choice === 'edit') openCollectionModal(c);
  if (choice === 'add') openPicker(c.id);
  if (choice === 'delete') {
    if (!(await confirmDialog('As receitas continuam em "Todas as receitas".', { title: `Apagar "${c.nome}"?`, confirmLabel: 'Apagar', danger: true }))) return;
    await Promise.all(recipes.filter((r) => (r.colecoes || []).includes(id)).map((r) => updateDoc(sharedDoc(RECIPES, r.id), { colecoes: arrayRemove(id) })));
    await deleteDoc(sharedDoc(COLLECTIONS, id));
    if (currentPage() === 'page-receitas-lista' && listCtx.id === id) back();
  }
}

function drawEmojis() {
  render('rc-col-emojis', EMOJIS.map((e) => html`<button type="button" class="rc-emoji ${e === collectionEmoji ? 'is-active' : ''}" data-action="rc:col-emoji" data-e="${e}">${e}</button>`));
}

function openCollectionModal(c = null) {
  editingCollectionId = c?.id || null;
  collectionEmoji = c?.emoji || EMOJIS[0];
  byId('rc-col-name').value = c?.nome || '';
  byId('rc-col-title').textContent = c ? 'Editar coleção' : 'Nova coleção';
  drawEmojis();
  openModal('rc-col');
}

function drawPicker() {
  render('rc-pick-list', recipes.length
    ? sorted(recipes).map((r) => html`
      <button class="rc-pick ${pickSet.has(r.id) ? 'is-selected' : ''}" data-action="rc:pick" data-id="${r.id}">
        <span class="rc-circle">${icon('check', 14)}</span>
        <span class="rc-pick__img">${thumbTpl(r)}</span>
        <span class="rc-pick__title">${r.titulo}</span>
      </button>`)
    : emptyState('Ainda não há receitas.'));
}

function openPicker(cid) {
  editingCollectionId = cid;
  pickSet = new Set(recipes.filter((r) => (r.colecoes || []).includes(cid)).map((r) => r.id));
  byId('rc-pick-title').textContent = `Receitas em ${collectionById(cid)?.nome || 'coleção'}`;
  drawPicker();
  openModal('rc-pick');
}

async function addMenu() {
  const inCollection = currentPage() === 'page-receitas-lista' && listCtx.kind === 'collection';
  const choice = await actionSheet([
    { id: 'new', label: 'Criar receita', icon: 'plus' },
    { id: 'import', label: 'Importar receitas da web', icon: 'download' },
    inCollection ? { id: 'pick', label: 'Adicionar receitas à coleção', icon: 'check' } : { id: 'col', label: 'Nova coleção', icon: 'folder' },
  ]);
  if (choice === 'new') openEditor();
  if (choice === 'import') openImport();
  if (choice === 'pick') openPicker(listCtx.id);
  if (choice === 'col') openCollectionModal();
}

function openImport() {
  byId('rc-import-url').value = '';
  byId('rc-import-text').value = '';
  openModal('rc-import');
}

const moreBtn = (action) => html`<button class="icon-btn glass-chip pressable" data-action="${action}" aria-label="Opções">${icon('more', 20)}</button>`;

/** Título de duas linhas como no AnyList ("Bolos" / "Ordenar receitas"). O router repõe-no ao mudar de página. */
function headerSubtitle(label, action) {
  const title = byId('topbar-title');
  if (!title || title.querySelector('.rc-subtitle')) return;
  title.classList.add('has-subtitle');
  title.insertAdjacentHTML('beforeend', String(html`<button class="rc-subtitle" data-action="${action}">${label}</button>`));
}

const plusBtn = () => html`<button class="icon-btn glass-chip pressable" data-action="rc:add-menu" aria-label="Adicionar">${icon('plus', 20)}</button>`;

export default {
  id: 'recipes',
  pages: [
    {
      id: 'menu-receitas',
      title: 'Receitas',
      root: true,
      headerAction: () => html`<span class="rc-head-actions">${plusBtn()}${moreBtn('rc:home-menu')}</span>`,
      template: () => html`
        <label class="search-field glass-soft rc-search">${icon('search', 18)}
          <input type="search" id="rc-home-search" class="search-field__input" placeholder="Pesquisar receitas" data-input="rc:home-search" autocomplete="off" enterkeyhint="search">
        </label>
        <div id="rc-home"></div>`,
      onEnter: () => drawHome(),
    },
    {
      id: 'page-receitas-lista',
      title: () => listCtx.title,
      headerAction: () => html`<span class="rc-head-actions">${plusBtn()}${moreBtn('rc:list-menu')}</span>`,
      template: () => html`
        <label class="search-field glass-soft rc-search">${icon('search', 18)}
          <input type="search" id="rc-list-search" class="search-field__input" placeholder="Pesquisar" data-input="rc:list-search" autocomplete="off" enterkeyhint="search">
        </label>
        <div class="rc-grid" id="rc-grid"></div>`,
      onEnter: () => { headerSubtitle('Ordenar receitas', 'rc:sort'); drawList(); },
    },
    {
      id: 'page-receitas-fontes',
      title: 'Por fonte',
      template: () => html`<div id="rc-sources"></div>`,
      onEnter: () => drawSources(),
    },
    {
      id: 'page-receita',
      title: 'Detalhes da receita',
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="rc:recipe-menu" aria-label="Opções">${icon('more', 20)}</button>`,
      template: () => html`<div id="rc-detail" class="rc-detail"></div>`,
      onEnter: () => drawDetail(),
    },
  ],
  modals: () => html`
    ${modalTemplate('rc-edit', html`<span id="rc-edit-title">Nova receita</span>`, html`
      ${photoPickerTpl('rc-photo', 'Foto da receita')}
      <input type="text" id="rc-f-title" class="input" placeholder="Nome da receita" autocomplete="off">
      <input type="url" id="rc-f-source" class="input" placeholder="Link da receita (opcional)" inputmode="url" autocomplete="off">
      <div class="rc-form-row">
        <div class="field"><label class="field__label" for="rc-f-prep">Preparação</label><input id="rc-f-prep" class="input" placeholder="30 min"></div>
        <div class="field"><label class="field__label" for="rc-f-cook">Confeção</label><input id="rc-f-cook" class="input" placeholder="45 min"></div>
        <div class="field"><label class="field__label" for="rc-f-serv">Porções</label><input id="rc-f-serv" class="input" placeholder="4" inputmode="decimal"></div>
      </div>
      <label class="field__label">Coleções</label>
      <div class="rc-chips" id="rc-edit-cols"></div>
      <label class="field__label" for="rc-f-ings">Ingredientes</label>
      <textarea id="rc-f-ings" class="input textarea textarea--tall" placeholder="Um por linha, ex:&#10;200 g farinha&#10;3 ovos&#10;1 c. de sopa açúcar&#10;Para a cobertura:"></textarea>
      <label class="field__label" for="rc-f-steps">Passos</label>
      <textarea id="rc-f-steps" class="input textarea textarea--tall" placeholder="Um passo por linha"></textarea>
      <label class="field__label" for="rc-f-notes">Notas</label>
      <textarea id="rc-f-notes" class="input textarea" placeholder="Dicas, variações…"></textarea>
      <label class="field__label" for="rc-f-nutri">Nutrição</label>
      <textarea id="rc-f-nutri" class="input textarea" placeholder="Calorias: 280 por fatia"></textarea>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="rc-edit">Cancelar</button>
        <button class="btn btn--primary" data-action="rc:save">Guardar</button>
      </div>`, { wide: true })}
    ${modalTemplate('rc-import', 'Importar receita', html`
      <p class="rc-muted">Cola o link de uma receita (Pingo Doce, Continente, Teleculinária, blogs…). Lemos os ingredientes, passos, tempos e foto.</p>
      <div class="input-row">
        <input type="url" id="rc-import-url" class="input" placeholder="https://…" inputmode="url" autocomplete="off" data-enter="rc:import">
        <button class="btn btn--icon pressable" data-action="rc:paste" aria-label="Colar">${icon('clipboard', 18)}</button>
      </div>
      <button class="btn btn--primary btn--block pressable" data-action="rc:import">${icon('download', 18)} Importar</button>
      <p class="rc-or"><span>ou cola o texto da receita</span></p>
      <textarea id="rc-import-text" class="input textarea textarea--tall" placeholder="Título&#10;Ingredientes&#10;…&#10;Preparação&#10;…"></textarea>
      <button class="btn btn--block pressable" data-action="rc:import-text">Ler texto</button>`)}
    ${modalTemplate('rc-col', html`<span id="rc-col-title">Nova coleção</span>`, html`
      <input type="text" id="rc-col-name" class="input" placeholder="Nome (ex: Bolos, Jantares rápidos)" data-enter="rc:col-save" autocomplete="off">
      <div class="rc-emojis" id="rc-col-emojis"></div>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="rc-col">Cancelar</button>
        <button class="btn btn--primary" data-action="rc:col-save">Guardar</button>
      </div>`)}
    ${modalTemplate('rc-pick', html`<span id="rc-pick-title">Adicionar receitas</span>`, html`
      <div class="rc-pick-list" id="rc-pick-list"></div>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="rc-pick">Cancelar</button>
        <button class="btn btn--primary" data-action="rc:pick-save">Guardar</button>
      </div>`)}
    ${modalTemplate('rc-plan', 'Adicionar ao plano', html`
      <div class="field"><label class="field__label" for="rc-plan-date">Dia</label><input type="date" id="rc-plan-date" class="input"></div>
      <div class="field"><label class="field__label" for="rc-plan-slot">Refeição</label>
        <select id="rc-plan-slot" class="input"><option value="almoco">Almoço</option><option value="jantar" selected>Jantar</option></select></div>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="rc-plan">Cancelar</button>
        <button class="btn btn--primary" data-action="rc:plan-save">Adicionar</button>
      </div>`)}
    <div class="modal rc-cook" id="rc-cook" role="dialog" aria-modal="true" aria-label="Modo cozinhar">
      <button class="rc-cook__closer" data-action="modal:close" data-modal="rc-cook" hidden></button>
      <div class="rc-cook__body" id="rc-cook-body"></div>
    </div>`,
  actions: {
    'rc:home-search': ({ value }) => { homeQuery = value.trim(); drawHome(); },
    'rc:list-search': ({ value }) => { listQuery = value.trim(); drawList(); },
    'rc:add-menu': () => addMenu(),
    'rc:card-menu': ({ data }) => cardMenu(data.id),
    'rc:home-menu': async () => {
      const choice = await actionSheet([
        { id: 'col', label: 'Nova coleção', icon: 'folder' },
        { id: 'import', label: 'Importar receitas da web', icon: 'download' },
        { id: 'sources', label: 'Ver por fonte', icon: 'globe' },
      ]);
      if (choice === 'col') openCollectionModal();
      if (choice === 'import') openImport();
      if (choice === 'sources') navigate('page-receitas-fontes');
    },
    'rc:list-menu': async () => {
      if (listCtx.kind === 'collection') return collectionMenu(listCtx.id);
      const choice = await actionSheet([
        { id: 'sort', label: 'Ordenar receitas', icon: 'menu' },
        { id: 'import', label: 'Importar receitas da web', icon: 'download' },
      ]);
      if (choice === 'sort') document.querySelector('.rc-subtitle')?.click();
      if (choice === 'import') openImport();
    },
    'rc:list': ({ data }) => {
      if (data.kind === 'collection') listCtx = { kind: 'collection', id: data.id, title: collectionById(data.id)?.nome || 'Coleção' };
      else if (data.kind === 'source') listCtx = { kind: 'source', id: data.id, title: data.id };
      else if (data.kind === 'queue') listCtx = { kind: 'queue', id: '', title: 'Fila para cozinhar' };
      else listCtx = { kind: 'all', id: '', title: 'Todas as receitas' };
      listQuery = '';
      byId('rc-list-search').value = '';
      navigate('page-receitas-lista');
    },
    'rc:sources': () => navigate('page-receitas-fontes'),
    'rc:sort': async () => {
      const choice = await actionSheet(SORTS.map((s) => ({ ...s, active: s.id === sortBy })), { title: 'Ordenar por' });
      if (!choice) return;
      sortBy = choice;
      savePref('sort', choice);
      drawList();
    },
    'rc:open': ({ data }) => {
      if (currentId !== data.id) { scale = 1; selected = new Set(); tab = 'ingredientes'; }
      currentId = data.id;
      navigate('page-receita');
    },
    'rc:tab': ({ data }) => { tab = data.tab; drawDetail(); },
    'rc:photo': () => { const r = current(); if (r?.foto) showImage(r.foto); },
    'rc:rate': async ({ data }) => {
      const r = current();
      const v = Number(data.v);
      await updateDoc(sharedDoc(RECIPES, r.id), { avaliacao: r.avaliacao === v ? 0 : v });
    },
    'rc:ing': ({ data }) => {
      const i = Number(data.i);
      if (selected.has(i)) selected.delete(i); else selected.add(i);
      drawDetail();
    },
    'rc:dest': async () => {
      const choice = await actionSheet(LISTS.map((l) => ({ ...l, active: l.id === destList })), { title: 'Lista de destino' });
      if (!choice) return;
      destList = choice;
      savePref('dest', choice);
      drawDetail();
    },
    'rc:scale': async () => {
      const opts = SCALES.map((s) => ({ id: String(s), label: `${formatNumber(s)}×`, active: s === scale }));
      const choice = await actionSheet([...opts, { id: 'custom', label: 'Outra…', icon: 'edit' }], { title: 'Escala' });
      if (!choice) return;
      if (choice === 'custom') {
        const v = await promptDialog('Multiplicar as quantidades por:', { title: 'Escala', value: String(scale), type: 'text', confirmLabel: 'Aplicar' });
        const n = Number(String(v ?? '').replace(',', '.'));
        if (!(n > 0)) return;
        scale = n;
      } else scale = Number(choice);
      drawDetail();
    },
    'rc:add-to-list': async ({ el }) => {
      const all = parseIngredients(current()?.ingredientes);
      const ings = all.filter((ing, i) => !ing.header && (!selected.size || selected.has(i)));
      await withLoading(el, () => addToList(ings));
    },
    'rc:cook': () => {
      cookStep = 0;
      drawCook();
      initCookSwipe();
      openModal('rc-cook');
      keepAwake(true);
    },
    'rc:cook-step': ({ data }) => { cookStep += Number(data.dir); drawCook(); },
    'rc:cook-ings': () => {
      const ings = byId('rc-cook-ings');
      ings.hidden = !ings.hidden;
      byId('rc-cook-main').hidden = !ings.hidden;
    },
    'rc:cook-close': () => { closeModal('rc-cook'); keepAwake(false); },
    'rc:cook-done': async () => {
      closeModal('rc-cook');
      keepAwake(false);
      await updateDoc(sharedDoc(RECIPES, currentId), { ultimaVez: Date.now() });
      toast('Bom apetite!');
    },
    'rc:recipe-menu': async () => {
      const r = current();
      if (!r) return;
      const choice = await actionSheet([
        { id: 'edit', label: 'Editar receita', icon: 'edit' },
        { id: 'dup', label: 'Duplicar receita', icon: 'copy' },
        { id: 'share', label: 'Email, imprimir e partilhar', icon: 'share' },
        { id: 'queue', label: r.fila ? 'Remover da fila' : 'Adicionar à fila', icon: 'queue' },
        { id: 'plan', label: 'Adicionar ao calendário', icon: 'calendarPlus' },
        { id: 'delete', label: 'Apagar receita', icon: 'trash', danger: true },
      ]);
      if (choice === 'queue') toggleQueue(r);
      if (choice === 'edit') openEditor(r, r.id);
      if (choice === 'dup') {
        const { id, ...copy } = r;
        const ref = await addDoc(sharedCol(RECIPES), { ...copy, titulo: `${r.titulo} (cópia)`, avaliacao: 0, ultimaVez: null, timestamp: Date.now() });
        currentId = ref.id;
        drawDetail();
        toast('Receita duplicada');
      }
      if (choice === 'share') shareMenu(r);
      if (choice === 'plan') {
        byId('rc-plan-date').value = toISODate(new Date());
        openModal('rc-plan');
      }
      if (choice === 'delete') {
        if (!(await confirmDialog('Esta ação não pode ser desfeita.', { title: `Apagar "${r.titulo}"?`, confirmLabel: 'Apagar', danger: true }))) return;
        back();
        await deleteDoc(sharedDoc(RECIPES, r.id));
        currentId = null;
      }
    },
    'rc:plan-save': async () => {
      const r = current();
      const date = byId('rc-plan-date').value;
      if (!r || !date) return;
      const slot = byId('rc-plan-slot').value;
      await setDoc(sharedDoc('refeicoes', `${date}_${slot}`), {
        texto: r.titulo, receita: { id: r.id, titulo: r.titulo }, updatedBy: session.uid, timestamp: Date.now(),
      });
      closeModal('rc-plan');
      toast('Adicionada ao plano de refeições');
    },
    'rc:edit': () => { const r = current(); if (r) openEditor(r, r.id); },
    'rc:edit-collections': () => { const r = current(); if (r) pickCollectionFor(r); },
    'rc:new': () => openEditor(),
    'rc:edit-col': ({ data }) => {
      if (editCols.has(data.id)) editCols.delete(data.id); else editCols.add(data.id);
      drawEditCollections();
    },
    'rc:edit-col-new': async () => {
      const nome = (await promptDialog('Nome da coleção', { title: 'Nova coleção', placeholder: 'ex: Bolos', confirmLabel: 'Criar' }))?.trim();
      if (!nome) return;
      const ref = await addDoc(sharedCol(COLLECTIONS), { nome, emoji: '📖', timestamp: Date.now() });
      editCols.add(ref.id);
      setTimeout(drawEditCollections, 50);
    },
    'rc:save': async ({ el }) => {
      const data = Object.fromEntries(Object.entries(FIELDS).map(([k, fid]) => [k, byId(fid).value.trim()]));
      if (!data.titulo) return toast('Indica o nome da receita.', 'error');
      data.fonteNome = sourceName(data.fonte);
      data.foto = getPhoto('rc-photo');
      data.colecoes = [...editCols];
      await withLoading(el, async () => {
        if (editingId) {
          await updateDoc(sharedDoc(RECIPES, editingId), { ...data, atualizado: Date.now() });
        } else {
          const ref = await addDoc(sharedCol(RECIPES), { ...data, avaliacao: 0, timestamp: Date.now(), createdBy: session.uid });
          currentId = ref.id;
          scale = 1; selected = new Set(); tab = 'ingredientes';
        }
      });
      const wasNew = !editingId;
      await closeModal('rc-edit');
      clearPhoto('rc-photo');
      toast('Receita guardada');
      if (wasNew) navigate('page-receita');
    },
    'rc:import-open': () => openImport(),
    'rc:paste': async () => {
      try {
        byId('rc-import-url').value = (await navigator.clipboard.readText()).trim();
      } catch {
        toast('Cola o link no campo (tocar e manter > Colar).', 'info');
      }
    },
    'rc:import': async ({ el }) => {
      let url = byId('rc-import-url').value.trim();
      const found = url.match(/https?:\/\/\S+/);
      if (found) url = found[0];
      else if (url && !/^https?:/i.test(url)) url = `https://${url}`;
      if (!sourceName(url)) return toast('Cola um link válido.', 'error');
      const btn = el.closest('.modal')?.querySelector('[data-action="rc:import"].btn--primary') || el;
      try {
        const recipe = await withLoading(btn, () => importRecipe(url));
        await closeModal('rc-import');
        openEditor(recipe);
        if (recipe.incompleta) toast('Não encontrámos a receita completa nesta página. Completa os campos em falta.', 'info', 4500);
      } catch {
        toast('Não foi possível ler este site. Copia o texto da receita e usa "Ler texto".', 'error', 4500);
      }
    },
    'rc:import-text': async () => {
      const text = byId('rc-import-text').value.trim();
      if (!text) return toast('Cola primeiro o texto da receita.', 'info');
      const recipe = recipeFromText(text);
      const url = byId('rc-import-url').value.trim();
      if (sourceName(url)) recipe.fonte = url;
      await closeModal('rc-import');
      openEditor(recipe);
    },
    'rc:collection-new': () => openCollectionModal(),
    'rc:collection-menu': ({ data }) => collectionMenu(data.id),
    'rc:col-emoji': ({ data }) => { collectionEmoji = data.e; drawEmojis(); },
    'rc:col-save': async ({ el }) => {
      const nome = byId('rc-col-name').value.trim();
      if (!nome) return;
      await withLoading(el, () => (editingCollectionId
        ? updateDoc(sharedDoc(COLLECTIONS, editingCollectionId), { nome, emoji: collectionEmoji })
        : addDoc(sharedCol(COLLECTIONS), { nome, emoji: collectionEmoji, timestamp: Date.now() })));
      if (editingCollectionId && listCtx.id === editingCollectionId) {
        listCtx.title = nome;
        refreshHeader();
        if (currentPage() === 'page-receitas-lista') headerSubtitle('Ordenar receitas', 'rc:sort');
      }
      closeModal('rc-col');
    },
    'rc:pick': ({ data }) => {
      if (pickSet.has(data.id)) pickSet.delete(data.id); else pickSet.add(data.id);
      drawPicker();
    },
    'rc:pick-save': async ({ el }) => {
      const cid = editingCollectionId;
      const ops = recipes.map((r) => {
        const has = (r.colecoes || []).includes(cid);
        const want = pickSet.has(r.id);
        if (has === want) return null;
        return updateDoc(sharedDoc(RECIPES, r.id), { colecoes: want ? arrayUnion(cid) : arrayRemove(cid) });
      }).filter(Boolean);
      await withLoading(el, () => Promise.all(ops));
      closeModal('rc-pick');
    },
  },
  start() {
    migrateOldBooks();
    scope.add(onSnapshot(sharedCol(RECIPES), (s) => { recipes = snapToList(s); drawAll(); }));
    scope.add(onSnapshot(sharedCol(COLLECTIONS), (s) => {
      collections = snapToList(s).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
      drawAll();
      if (byId('rc-edit')?.classList.contains('is-open')) drawEditCollections();
    }));
  },
  stop() {
    scope.clear();
    recipes = [];
    collections = [];
    currentId = null;
    keepAwake(false);
  },
};
