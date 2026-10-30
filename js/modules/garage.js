// Garagem: veículos e respetivos documentos (seguro, inspeção, manutenções…).
import { html, render, byId, emptyState, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope } from '../core/state.js';
import { navigate, back } from '../core/router.js';
import { confirmDialog, toast, withLoading, showImage } from '../core/ui.js';
import { addDoc, deleteDoc, onSnapshot } from '../services/firebase.js';
import { userCol, userDoc, snapToList } from '../services/paths.js';
import { createFileBrowser } from '../components/file-browser.js';
import { photoPickerTpl, getPhoto, clearPhoto } from '../components/photo-picker.js';

const scope = createScope();
const carScope = createScope();
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=900&q=70';
let cars = [];
let currentCarId = null;

const browser = createFileBrowser({
  key: 'car',
  filesCol: () => userCol('carros', currentCarId, 'documentos'),
  foldersCol: () => userCol('carros', currentCarId, 'pastas'),
  fileDoc: (id) => userDoc('carros', currentCarId, 'documentos', id),
  folderDoc: (id) => userDoc('carros', currentCarId, 'pastas', id),
  folderPlaceholder: 'Nome da pasta (ex: Seguros, Manutenções)',
  emptyText: 'Sem ficheiros associados a este veículo.',
});

const currentCar = () => cars.find((c) => c.id === currentCarId);

function drawCars() {
  render('cars-list', cars.length
    ? cars.map((car) => html`
      <article class="media-card glass pressable" data-action="garage:open" data-id="${car.id}">
        <img class="media-card__img" src="${car.foto || FALLBACK_IMG}" alt="" loading="lazy">
        <div class="media-card__overlay">
          <div>
            <h3 class="media-card__title">${car.nome}</h3>
            ${car.matricula ? html`<span class="plate">${car.matricula}</span>` : ''}
          </div>
          <button class="icon-btn glass-chip" data-action="garage:delete" data-id="${car.id}" aria-label="Remover">${icon('trash', 16)}</button>
        </div>
      </article>`)
    : emptyState('Sem veículos registados.', icon('car', 32)), { stagger: true });
}

function drawDetail() {
  const car = currentCar();
  if (!car) return;
  const img = byId('car-detail-img');
  if (img) img.src = car.foto || FALLBACK_IMG;
  setText('car-detail-name', car.nome);
  render('car-detail-plate', car.matricula ? html`<span class="plate">${car.matricula}</span>` : html`<span class="muted">Sem matrícula</span>`);
}

export default {
  id: 'garage',
  pages: [
    {
      id: 'menu-carros',
      title: 'Garagem',
      root: true,
      template: () => html`
        <button class="btn btn--primary btn--block pressable" data-action="nav:go" data-page="page-add-carro">${icon('plus', 18)} Adicionar veículo</button>
        <div class="card-stack" id="cars-list"></div>`,
    },
    {
      id: 'page-add-carro',
      title: 'Adicionar Veículo',
      template: () => html`
        ${photoPickerTpl('car-photo', 'Fotografia do veículo', { tall: true })}
        <div class="field"><label class="field__label" for="car-name">Modelo</label><input type="text" id="car-name" class="input" placeholder="ex: VW Golf, BMW Série 1"></div>
        <div class="field"><label class="field__label" for="car-plate">Matrícula</label><input type="text" id="car-plate" class="input" placeholder="AA-00-AA" autocapitalize="characters"></div>
        <button class="btn btn--primary btn--block pressable" data-action="garage:save">Guardar veículo</button>`,
    },
    {
      id: 'page-detalhe-carro',
      title: () => currentCar()?.nome || 'Veículo',
      template: () => html`
        <div class="hero glass" data-action="garage:photo">
          <img id="car-detail-img" class="hero__img" alt="">
          <div class="hero__overlay">
            <h2 class="hero__title" id="car-detail-name"></h2>
            <div id="car-detail-plate"></div>
          </div>
        </div>
        ${browser.template()}`,
      onEnter: drawDetail,
    },
  ],
  modals: () => browser.modals(),
  actions: {
    'garage:save': async ({ el }) => {
      const nome = byId('car-name').value.trim();
      const matricula = byId('car-plate').value.trim().toUpperCase();
      if (!nome) return toast('Indica pelo menos o modelo do veículo.', 'error');
      await withLoading(el, () => addDoc(userCol('carros'), { nome, matricula, foto: getPhoto('car-photo'), timestamp: Date.now() }));
      byId('car-name').value = '';
      byId('car-plate').value = '';
      clearPhoto('car-photo');
      toast('Veículo adicionado');
      back();
    },
    'garage:open': ({ data }) => {
      currentCarId = data.id;
      carScope.clear();
      browser.subscribe(carScope);
      navigate('page-detalhe-carro');
    },
    'garage:photo': () => showImage(currentCar()?.foto),
    'garage:delete': async ({ data }) => {
      const ok = await confirmDialog('O veículo e as referências aos seus documentos serão removidos.', { title: 'Remover veículo?', confirmLabel: 'Remover', danger: true });
      if (ok) await deleteDoc(userDoc('carros', data.id));
    },
  },
  start() {
    scope.add(onSnapshot(userCol('carros'), (s) => {
      cars = snapToList(s).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      drawCars();
      if (currentCarId) drawDetail();
    }));
  },
  stop() {
    scope.clear();
    carScope.clear();
    cars = [];
    currentCarId = null;
  },
};
