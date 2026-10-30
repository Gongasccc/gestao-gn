// Garagem: veículos e respetivos documentos (seguro, inspeção, manutenções…).
import { html, render, byId, emptyState, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, emit } from '../core/state.js';
import { navigate, back } from '../core/router.js';
import { confirmDialog, toast, withLoading, showImage, modalTemplate, openModal, closeModal } from '../core/ui.js';
import { isoToShort } from '../core/format.js';
import { daysUntil, parseISODate, countdownLabel } from '../core/dates.js';
import { addDoc, deleteDoc, updateDoc, onSnapshot } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList, storageScope } from '../services/paths.js';
import { uploadDataUrl } from '../services/storage.js';
import { createFileBrowser } from '../components/file-browser.js';
import { photoPickerTpl, getPhoto, clearPhoto } from '../components/photo-picker.js';

const scope = createScope();
const carScope = createScope();
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=900&q=70';
let cars = [];
let currentCarId = null;

const browser = createFileBrowser({
  key: 'car',
  filesCol: () => sharedCol('carros', currentCarId, 'documentos'),
  foldersCol: () => sharedCol('carros', currentCarId, 'pastas'),
  fileDoc: (id) => sharedDoc('carros', currentCarId, 'documentos', id),
  folderDoc: (id) => sharedDoc('carros', currentCarId, 'pastas', id),
  folderPlaceholder: 'Nome da pasta (ex: Seguros, Manutenções)',
  emptyText: 'Sem ficheiros associados a este veículo.',
});

const currentCar = () => cars.find((c) => c.id === currentCarId);

// Prazos de cada veículo, com aviso antecipado (dias).
const DEADLINES = [
  { key: 'inspecao', label: 'Inspeção', warn: 30 },
  { key: 'seguro', label: 'Seguro', warn: 30 },
  { key: 'iuc', label: 'IUC', warn: 30 },
  { key: 'revisao', label: 'Revisão', warn: 30 },
];

function deadlineChip(iso, warn) {
  const days = daysUntil(parseISODate(iso));
  const cls = days < 0 ? 'chip--danger' : days <= warn ? 'chip--warn' : 'chip--muted';
  return html`<span class="chip ${cls}">${days < 0 ? 'Em atraso' : countdownLabel(days)}</span>`;
}

/** Prazos a aproximar-se em todos os veículos (para o Início). */
export function garageAlerts() {
  const out = [];
  cars.forEach((car) => DEADLINES.forEach((d) => {
    if (!car[d.key]) return;
    const days = daysUntil(parseISODate(car[d.key]));
    if (days <= d.warn) out.push({ date: parseISODate(car[d.key]), days, title: `${d.label} · ${car.nome}`, icon: 'car', page: 'menu-carros' });
  }));
  return out;
}

function deadlinesTpl(car) {
  return html`
    <div class="card glass">
      <div class="section-head">
        <h3 class="card__title">${icon('calendar', 18)} Prazos</h3>
        <button class="btn btn--small btn--glass pressable" data-action="garage:deadlines">${icon('edit', 14)} Editar</button>
      </div>
      ${DEADLINES.map((d) => html`
        <div class="kv"><span class="kv__k">${d.label}</span><span class="kv__v">${car[d.key] ? html`${isoToShort(car[d.key])} ${deadlineChip(car[d.key], d.warn)}` : html`<span class="muted">—</span>`}</span></div>`)}
      ${car.km ? html`<div class="kv"><span class="kv__k">Quilómetros</span><span class="kv__v">${Number(car.km).toLocaleString('pt-PT')} km</span></div>` : ''}
    </div>`;
}

function drawCars() {
  render('cars-list', cars.length
    ? cars.map((car) => html`
      <article class="media-card glass pressable" data-action="garage:open" data-id="${car.id}">
        <img class="media-card__img" src="${car.foto || FALLBACK_IMG}" alt="" loading="lazy">
        <div class="media-card__overlay">
          <div>
            <h3 class="media-card__title">${car.nome}</h3>
            ${car.matricula ? html`<span class="plate">${car.matricula}</span>` : ''}
            ${(() => {
              const next = DEADLINES.filter((d) => car[d.key]).map((d) => ({ ...d, days: daysUntil(parseISODate(car[d.key])) })).sort((a, b) => a.days - b.days)[0];
              return next && next.days <= next.warn ? html`<span class="media-card__badge">${next.label}: ${next.days < 0 ? 'em atraso' : countdownLabel(next.days)}</span>` : '';
            })()}
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
  render('car-deadlines', deadlinesTpl(car));
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
        <div id="car-deadlines"></div>
        ${browser.template()}`,
      onEnter: drawDetail,
    },
  ],
  modals: () => html`${browser.modals()}${modalTemplate('car-deadlines-modal', 'Prazos do veículo', html`
    ${DEADLINES.map((d) => html`<div class="field"><label class="field__label" for="car-dl-${d.key}">${d.label}</label><input type="date" id="car-dl-${d.key}" class="input"></div>`)}
    <div class="field"><label class="field__label" for="car-dl-km">Quilómetros atuais</label><input type="number" id="car-dl-km" class="input" inputmode="numeric"></div>
    <div class="btn-row">
      <button class="btn" data-action="modal:close" data-modal="car-deadlines-modal">Cancelar</button>
      <button class="btn btn--primary" data-action="garage:deadlines-save">Guardar</button>
    </div>`)}`,
  actions: {
    'garage:save': async ({ el }) => {
      const nome = byId('car-name').value.trim();
      const matricula = byId('car-plate').value.trim().toUpperCase();
      if (!nome) return toast('Indica pelo menos o modelo do veículo.', 'error');
      await withLoading(el, async () => {
        const foto = await uploadDataUrl(storageScope(), 'carros', getPhoto('car-photo'));
        await addDoc(sharedCol('carros'), { nome, matricula, foto: foto.url, fotoPath: foto.path, timestamp: Date.now() });
      });
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
    'garage:deadlines': () => {
      const car = currentCar();
      DEADLINES.forEach((d) => { byId(`car-dl-${d.key}`).value = car?.[d.key] || ''; });
      byId('car-dl-km').value = car?.km || '';
      openModal('car-deadlines-modal');
    },
    'garage:deadlines-save': async () => {
      const patch = { km: byId('car-dl-km').value ? Number(byId('car-dl-km').value) : null };
      DEADLINES.forEach((d) => { patch[d.key] = byId(`car-dl-${d.key}`).value || null; });
      await updateDoc(sharedDoc('carros', currentCarId), patch);
      closeModal('car-deadlines-modal');
      toast('Prazos guardados');
    },
    'garage:delete': async ({ data }) => {
      const ok = await confirmDialog('O veículo e as referências aos seus documentos serão removidos.', { title: 'Remover veículo?', confirmLabel: 'Remover', danger: true });
      if (ok) await deleteDoc(sharedDoc('carros', data.id));
    },
  },
  start() {
    scope.add(onSnapshot(sharedCol('carros'), (s) => {
      cars = snapToList(s).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      drawCars();
      if (currentCarId) drawDetail();
      emit('records:update', 'carros');
    }));
  },
  stop() {
    scope.clear();
    carScope.clear();
    cars = [];
    currentCarId = null;
  },
};
