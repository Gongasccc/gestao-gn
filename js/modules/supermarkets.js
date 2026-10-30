// Supermercados: cartões de cliente, folhetos e listas de compras.
import { html, byId } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope } from '../core/state.js';
import { navigate } from '../core/router.js';
import { toast, showImage } from '../core/ui.js';
import { compressImage, takeFile } from '../core/images.js';
import { getDoc, setDoc } from '../services/firebase.js';
import { userDoc } from '../services/paths.js';
import { checklistTpl, subscribeChecklist } from '../components/checklist.js';

const scope = createScope();
let currentStoreId = null;
let currentCard = '';

const STORES = [
  { id: 'continente', nome: 'Continente', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Logo_Continente.svg', link: 'https://folhetos.continente.pt/' },
  { id: 'pingodoce', nome: 'Pingo Doce', logo: 'https://upload.wikimedia.org/wikipedia/en/d/de/Pingo_Doce_logo.svg', link: 'https://www.pingodoce.pt/folhetos/' },
  { id: 'lidl', nome: 'Lidl', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/Lidl_logo.png', link: 'https://www.lidl.pt/folhetos' },
  { id: 'auchan', nome: 'Auchan', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/6e/Auchan_Retail_logo.svg', link: 'https://www.auchan.pt/pt/folhetos/' },
  { id: 'intermarche', nome: 'Intermarché', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Intermarch%C3%A9_logo_2009_classic.svg', link: 'https://www.intermarche.pt/folhetos/' },
];

const store = () => STORES.find((s) => s.id === currentStoreId);

function drawCard() {
  const img = byId('store-card-img');
  const holder = byId('store-card');
  if (!img || !holder) return;
  img.hidden = !currentCard;
  if (currentCard) img.src = currentCard;
  holder.classList.toggle('has-photo', !!currentCard);
}

const SHORTCUTS = [
  { page: 'menu-super-logos', label: 'Lojas & Cartões', icon: 'wallet' },
  { page: 'menu-compras-semanais', label: 'Lista Semanal', icon: 'calendar' },
  { page: 'menu-compras-rapidas', label: 'Lista Rápida', icon: 'bolt' },
];

export default {
  id: 'supermarkets',
  pages: [
    {
      id: 'menu-supermercados',
      title: 'Supermercados',
      root: true,
      template: () => html`
        <div class="stagger-on-enter list">
          ${SHORTCUTS.map((s) => html`
            <button class="row-link glass glass--interactive pressable" data-action="nav:go" data-page="${s.page}">
              <span>${icon(s.icon, 20)} ${s.label}</span>${icon('chevronRight', 18)}
            </button>`)}
        </div>`,
    },
    {
      id: 'menu-super-logos',
      title: 'Lojas & Cartões',
      template: () => html`
        <div class="tile-grid stagger-on-enter">
          ${STORES.map((s) => html`
            <button class="store-tile pressable" data-action="stores:open" data-id="${s.id}" aria-label="${s.nome}">
              <img src="${s.logo}" alt="${s.nome}" loading="lazy">
            </button>`)}
        </div>`,
    },
    {
      id: 'page-super-detail',
      title: () => store()?.nome || 'Supermercado',
      template: () => html`
        <div class="loyalty-card glass-soft pressable" id="store-card" data-action="stores:card">
          <span class="photo-picker__placeholder">${icon('wallet', 28)}<span>Inserir cartão de cliente</span></span>
          <img id="store-card-img" alt="Cartão" hidden>
        </div>
        <div class="btn-row">
          <label class="btn btn--glass pressable">${icon('camera', 16)} Fotografar cartão
            <input type="file" accept="image/*" hidden data-change="stores:card-photo">
          </label>
          <button class="btn btn--primary pressable" data-action="stores:flyer">${icon('external', 16)} Folheto</button>
        </div>
        <div class="field">
          <label class="field__label" for="store-notes">Notas</label>
          <textarea id="store-notes" class="input textarea" placeholder="Notas e observações…" data-change="stores:notes"></textarea>
        </div>`,
    },
    {
      id: 'menu-compras-semanais',
      title: 'Lista Semanal',
      template: () => html`<div class="card glass">${checklistTpl('semanais', 'Adicionar item…')}</div>`,
    },
    {
      id: 'menu-compras-rapidas',
      title: 'Lista Rápida',
      template: () => html`<div class="card glass">${checklistTpl('rapidas', 'Item urgente…')}</div>`,
    },
  ],
  actions: {
    'stores:open': async ({ data }) => {
      currentStoreId = data.id;
      currentCard = '';
      byId('store-notes').value = '';
      drawCard();
      navigate('page-super-detail');
      try {
        const snap = await getDoc(userDoc('supermercados', data.id));
        if (snap.exists() && currentStoreId === data.id) {
          const d = snap.data();
          byId('store-notes').value = d.notas || '';
          currentCard = d.cartao_img || '';
          drawCard();
        }
      } catch { /* sem dados */ }
    },
    'stores:card': () => {
      if (currentCard) showImage(currentCard);
      else document.querySelector('[data-change="stores:card-photo"]')?.click();
    },
    'stores:card-photo': async ({ ev }) => {
      const file = takeFile(ev);
      if (!file) return;
      currentCard = await compressImage(file, { maxSize: 900, quality: 0.7 });
      drawCard();
      await setDoc(userDoc('supermercados', currentStoreId), { cartao_img: currentCard }, { merge: true });
      toast('Cartão guardado');
    },
    'stores:flyer': () => { const s = store(); if (s) window.open(s.link, '_blank', 'noopener'); },
    'stores:notes': async ({ value }) => {
      await setDoc(userDoc('supermercados', currentStoreId), { notas: value }, { merge: true });
      toast('Notas guardadas');
    },
  },
  start() {
    subscribeChecklist(scope, 'semanais');
    subscribeChecklist(scope, 'rapidas');
  },
  stop() {
    scope.clear();
  },
};
