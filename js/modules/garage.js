// Garagem: veículos, documentos (seguro, inspeção, manutenções…) e gastos por mês.
import { html, render, byId, emptyState, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, emit } from '../core/state.js';
import { navigate, back } from '../core/router.js';
import { confirmDialog, toast, withLoading, modalTemplate, openModal, closeModal } from '../core/ui.js';
import { isoToShort, money, todayISO } from '../core/format.js';
import { daysUntil, parseISODate, countdownLabel } from '../core/dates.js';
import { addDoc, deleteDoc, updateDoc, onSnapshot } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList, storageScope } from '../services/paths.js';
import { uploadDataUrl } from '../services/storage.js';
import { createFileBrowser } from '../components/file-browser.js';
import { photoPickerTpl, getPhoto, clearPhoto } from '../components/photo-picker.js';
import { createRecordList } from '../components/record-list.js';
import { CATEGORIAS_CARRO, categoriaCarro, resumoMes, mudarMes, mediaMensal, consumoMedio } from './garagem/gastos.js';
import { removerFundo, miniatura, comLimite, preCarregarRemocaoFundo } from './farmacia/imagem.js';

const scope = createScope();
const carScope = createScope();
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=900&q=70';
let cars = [];
let currentCarId = null;
let month = todayISO().slice(0, 7);

const monthLabel = (m) => { const t = new Date(`${m}-01T12:00`).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

// Gastos de todos os veículos numa só coleção (carroId), para somar por mês e por carro.
const gastos = createRecordList({
  key: 'carros_gastos',
  col: () => sharedCol('carros_gastos'),
  docRef: (id) => sharedDoc('carros_gastos', id),
  addTitle: 'Novo gasto',
  editTitle: 'Editar gasto',
  addedToast: 'Gasto registado',
  empty: 'Sem gastos deste veículo neste mês.',
  emptyIcon: 'wallet',
  fields: [
    { name: 'carroId', label: 'Veículo', type: 'select', options: () => cars.map((c) => ({ value: c.id, label: c.matricula ? `${c.nome} · ${c.matricula}` : c.nome })), default: () => currentCarId || cars[0]?.id || '', required: true },
    { name: 'categoria', label: 'Tipo de gasto', type: 'select', options: CATEGORIAS_CARRO, default: 'combustivel' },
    { name: 'valor', label: 'Valor (€)', type: 'money', required: true },
    { name: 'data', label: 'Data', type: 'date', default: todayISO, required: true },
    { name: 'descricao', label: 'Descrição (opcional)', placeholder: 'ex: Galp, mudança de óleo' },
    { name: 'litros', label: 'Litros (combustível, opcional)', type: 'number', hint: 'Com litros e km a app calcula o consumo médio.' },
    { name: 'km', label: 'Quilómetros no momento (opcional)', type: 'number' },
  ],
  filter: (g) => g.carroId === currentCarId && String(g.data || '').startsWith(month),
  sort: (a, b) => String(b.data).localeCompare(String(a.data)) || (b.timestamp || 0) - (a.timestamp || 0),
  item: (g) => {
    const c = categoriaCarro(g.categoria);
    const extra = [isoToShort(g.data), g.litros ? `${String(g.litros).replace('.', ',')} L` : '', g.km ? `${Number(g.km).toLocaleString('pt-PT')} km` : ''].filter(Boolean).join(' · ');
    return html`
      <span class="record__icon">${icon(c.icon, 18)}</span>
      <span class="record__main">
        <span class="record__title">${g.descricao || c.label}</span>
        <span class="record__meta">${extra}</span>
      </span>
      <span class="record__value">${money(g.valor)}</span>`;
  },
  onChange: () => { drawSpend(); if (currentCarId) drawCarSpend(); },
});

const carName = (id) => cars.find((c) => c.id === id)?.nome || 'Veículo removido';

function monthSwitchTpl(id) {
  return html`
    <div class="month-switch">
      <button class="icon-btn glass-chip pressable" data-action="garage:month" data-step="-1" aria-label="Mês anterior">${icon('chevronLeft', 18)}</button>
      <span id="${id}" class="month-switch__label">${monthLabel(month)}</span>
      <button class="icon-btn glass-chip pressable" data-action="garage:month" data-step="1" aria-label="Mês seguinte">${icon('chevronRight', 18)}</button>
    </div>`;
}

function trendTpl(total, anterior) {
  if (!anterior) return '';
  const diff = total - anterior;
  if (Math.abs(diff) < 0.005) return html`<span class="chip chip--muted">Igual ao mês anterior</span>`;
  return html`<span class="chip ${diff > 0 ? 'chip--warn' : 'chip--accent'}">${icon(diff > 0 ? 'trendUp' : 'trendDown', 12)} ${money(Math.abs(diff))} ${diff > 0 ? 'mais' : 'menos'} que no mês anterior</span>`;
}

function barsTpl(rows, label, iconOf) {
  const max = rows[0]?.total || 1;
  return rows.map((r) => html`
    <div class="budget-row">
      <div class="budget-row__head"><span>${icon(iconOf(r.id), 16)} ${label(r.id)}</span><span>${money(r.total)}</span></div>
      <div class="progress"><span style="width:${((r.total / max) * 100).toFixed(1)}%"></span></div>
    </div>`);
}

/** Resumo do mês na página da Garagem: total, por carro e por tipo de gasto. */
function drawSpend() {
  if (!byId('garage-spend')) return;
  const all = gastos.items();
  const r = resumoMes(all, month);
  const media = mediaMensal(all, month);
  setText('garage-month', monthLabel(month));
  render('garage-spend', html`
    <div class="card glass fin-hero">
      <span class="eyebrow">Gasto com os carros</span>
      <span class="fin-hero__total">${money(r.total)}</span>
      <span class="muted small">${r.count === 1 ? '1 gasto' : `${r.count} gastos`}${media ? ` · média ${money(media)}/mês` : ''}</span>
      ${trendTpl(r.total, r.totalAnterior)}
    </div>
    ${r.count ? html`
      <div class="card glass">
        <h3 class="card__title">${icon('car', 18)} Por carro</h3>
        ${barsTpl(r.porCarro, carName, () => 'car')}
      </div>
      <div class="card glass">
        <h3 class="card__title">${icon('wallet', 18)} Por tipo de gasto</h3>
        ${barsTpl(r.porCategoria, (id) => categoriaCarro(id).label, (id) => categoriaCarro(id).icon)}
      </div>` : ''}`);
}

/** Gastos do veículo aberto no mês escolhido. */
function drawCarSpend() {
  if (!byId('car-spend')) return;
  const all = gastos.items();
  const r = resumoMes(all, month, currentCarId);
  const media = mediaMensal(all, month, 6, currentCarId);
  const consumo = consumoMedio(all, currentCarId);
  setText('car-month', monthLabel(month));
  render('car-spend', html`
    <div class="card glass fin-hero">
      <span class="eyebrow">Gasto neste mês</span>
      <span class="fin-hero__total">${money(r.total)}</span>
      <span class="muted small">${[media ? `média ${money(media)}/mês` : '', consumo ? `consumo ${String(consumo).replace('.', ',')} L/100 km` : ''].filter(Boolean).join(' · ')}</span>
      ${trendTpl(r.total, r.totalAnterior)}
    </div>`);
  gastos.draw();
}

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

// Foto do carro sem fundo (no próprio dispositivo, como na Farmácia). Se falhar, guarda a foto normal.
async function fotoDoCarro(ficheiro) {
  try {
    return { foto: await comLimite(removerFundo(ficheiro, () => {}), 45_000, 'Demorou demasiado.'), semFundo: true };
  } catch (e) {
    console.warn('[garagem] remoção de fundo', e);
    return { foto: await miniatura(ficheiro), semFundo: false };
  }
}

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
      <article class="media-card glass pressable ${car.semFundo ? 'is-cutout' : ''}" data-action="garage:open" data-id="${car.id}">
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
  byId('car-hero')?.classList.toggle('is-cutout', !!car.semFundo);
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
        ${monthSwitchTpl('garage-month')}
        <div class="card-stack" id="garage-spend"></div>
        <button class="btn btn--primary btn--block pressable" data-action="garage:spend-new">${icon('plus', 18)} Registar gasto</button>
        <h4 class="section-title">Veículos</h4>
        <div class="card-stack" id="cars-list"></div>
        <button class="btn btn--glass btn--block pressable" data-action="nav:go" data-page="page-add-carro">${icon('car', 18)} Adicionar veículo</button>`,
      onEnter: drawSpend,
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
        <label class="hero glass car-hero" id="car-hero" title="Mudar foto">
          <input type="file" accept="image/*" hidden data-change="garage:changePhoto">
          <span class="car-hero__stage"><img id="car-detail-img" class="hero__img" alt=""></span>
          <span class="car-hero__edit">${icon('camera', 15)}<span>Mudar foto</span></span>
          <span class="car-hero__busy"><i class="spinner"></i><span>A remover o fundo…</span></span>
          <div class="hero__overlay">
            <h2 class="hero__title" id="car-detail-name"></h2>
            <div id="car-detail-plate"></div>
          </div>
        </label>
        <div id="car-deadlines"></div>
        <h4 class="section-title">Gastos</h4>
        ${monthSwitchTpl('car-month')}
        <div id="car-spend"></div>
        <button class="btn btn--primary btn--block pressable" data-action="garage:spend-new">${icon('plus', 18)} Registar gasto</button>
        ${gastos.template()}
        ${browser.template()}`,
      onEnter: () => { drawDetail(); drawCarSpend(); },
    },
  ],
  modals: () => html`${browser.modals()}${gastos.modals()}${modalTemplate('car-deadlines-modal', 'Prazos do veículo', html`
    ${DEADLINES.map((d) => html`<div class="field"><label class="field__label" for="car-dl-${d.key}">${d.label}</label><input type="date" id="car-dl-${d.key}" class="input"></div>`)}
    <div class="field"><label class="field__label" for="car-dl-km">Quilómetros atuais</label><input type="number" id="car-dl-km" class="input" inputmode="numeric"></div>
    <div class="btn-row">
      <button class="btn" data-action="modal:close" data-modal="car-deadlines-modal">Cancelar</button>
      <button class="btn btn--primary" data-action="garage:deadlines-save">Guardar</button>
    </div>`)}`,
  actions: {
    'garage:month': ({ data }) => {
      month = mudarMes(month, Number(data.step));
      drawSpend();
      drawCarSpend();
    },
    'garage:spend-new': () => {
      if (!cars.length) return toast('Adiciona primeiro um veículo.', 'error');
      const hoje = todayISO();
      gastos.openForm(null, { carroId: currentCarId || cars[0].id, data: month === hoje.slice(0, 7) ? hoje : `${month}-01` });
    },
    'garage:save': async ({ el }) => {
      const nome = byId('car-name').value.trim();
      const matricula = byId('car-plate').value.trim().toUpperCase();
      if (!nome) return toast('Indica pelo menos o modelo do veículo.', 'error');
      await withLoading(el, async () => {
        const original = getPhoto('car-photo');
        const tratada = original ? await fotoDoCarro(await (await fetch(original)).blob()) : { foto: '', semFundo: false };
        const foto = await uploadDataUrl(storageScope(), 'carros', tratada.foto, 'carro.webp');
        await addDoc(sharedCol('carros'), { nome, matricula, foto: foto.url, fotoPath: foto.path, semFundo: tratada.semFundo, timestamp: Date.now() });
      });
      byId('car-name').value = '';
      byId('car-plate').value = '';
      clearPhoto('car-photo');
      toast('Veículo adicionado');
      back();
    },
    'garage:open': ({ data }) => {
      preCarregarRemocaoFundo();
      currentCarId = data.id;
      carScope.clear();
      browser.subscribe(carScope);
      navigate('page-detalhe-carro');
    },
    'garage:changePhoto': async ({ el }) => {
      const ficheiro = el.files?.[0];
      el.value = '';
      const id = currentCarId;
      if (!ficheiro || !id) return;
      const hero = byId('car-hero');
      hero?.classList.add('is-busy');
      try {
        const tratada = await fotoDoCarro(ficheiro);
        if (!tratada.foto) throw new Error('Não foi possível abrir a foto.');
        const foto = await uploadDataUrl(storageScope(), 'carros', tratada.foto, 'carro.webp');
        await updateDoc(sharedDoc('carros', id), { foto: foto.url, fotoPath: foto.path, semFundo: tratada.semFundo });
        toast(tratada.semFundo ? 'Foto atualizada, sem fundo' : 'Foto atualizada');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        hero?.classList.remove('is-busy');
      }
    },
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
      drawSpend();
      emit('records:update', 'carros');
    }));
    gastos.subscribe(scope);
  },
  stop() {
    scope.clear();
    carScope.clear();
    cars = [];
    currentCarId = null;
    month = todayISO().slice(0, 7);
  },
};
