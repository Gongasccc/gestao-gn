// Diário da viagem: paragens com local, mapa da rota, fotos e notas.
// Os dados ficam na subcoleção "timeline" (compatível com o antigo planeamento).
import { html, render, byId, emptyState, esc } from '../../core/dom.js';
import { icon, iconSvg } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { modalTemplate, openModal, closeModal, confirmDialog, toast, showImage, withLoading } from '../../core/ui.js';
import { compressImage, dataUrlBytes } from '../../core/images.js';
import { isoToShort, daysBetween, todayISO } from '../../core/format.js';
import { addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { tripCol, tripSubDoc } from '../../services/paths.js';
import { tripState, currentTrip } from './store.js';
import {
  hasCoords, sortSteps, routeLegs, flag, formatKm,
  searchPlaces, reversePlace, currentPosition, arcPoints, TRANSPORTS, transportOf,
} from './geo.js';
import { newMapState, ensureMap, resetMapState, animateLine, fitTo } from './mapkit.js';

const MAX_PHOTOS = 6;
const MAX_DOC_BYTES = 850 * 1024;

/** Fotos de uma paragem (inclui o campo antigo `foto`). */
export const photosOf = (s) => (s.fotos?.length ? s.fotos : s.foto ? [s.foto] : []);

// ---------- Templates ----------

export function journalTabTpl() {
  return html`
    <div class="journal">
      <div class="journal__map-wrap">
        <div class="trip-map-box">
          <div class="trip-map glass" id="trip-map">
            <div class="trip-map__empty" id="trip-map-empty">${icon('map', 26)}<span>Adiciona paragens com local para ver a rota no mapa.</span></div>
          </div>
          <div class="map-tools" id="trip-map-tools" hidden>
            <button class="map-tool pressable" data-action="journal:sat" aria-label="Mudar entre mapa e satélite">${icon('layers', 18)}</button>
            <button class="map-tool pressable" data-action="journal:play" id="journal-play-btn" aria-label="Reproduzir a viagem">${icon('play', 18)}</button>
          </div>
          <div class="play-card" id="play-card" hidden></div>
        </div>
        <div class="route-stats" id="route-stats"></div>
      </div>
      <div class="journal__steps">
        <button class="btn btn--primary btn--block pressable" data-action="journal:new">${icon('plus', 16)} Adicionar paragem</button>
        <div class="steps" id="journal-list"></div>
      </div>
    </div>`;
}

export function journalModalTpl() {
  return modalTemplate('modal-step', 'Nova paragem', html`
    <input type="hidden" id="step-id">
    <div class="field">
      <label class="field__label" for="step-place-q">Local</label>
      <div class="input-row">
        <input type="search" id="step-place-q" class="input" placeholder="Procurar cidade, sítio, restaurante…" data-enter="journal:search" autocomplete="off">
        <button class="icon-btn glass-chip pressable" data-action="journal:search" aria-label="Procurar">${icon('search', 18)}</button>
        <button class="icon-btn glass-chip pressable" data-action="journal:here" aria-label="Usar a minha localização">${icon('pin', 18)}</button>
      </div>
      <div class="place-results" id="step-place-results"></div>
      <div id="step-place-chosen"></div>
    </div>
    <div class="field">
      <span class="field__label">Como chegaram aqui?</span>
      <div class="transport-pick" id="step-transport">
        ${TRANSPORTS.map((t) => html`<button type="button" class="transport-pick__btn pressable" data-action="journal:transport" data-t="${t.id}" aria-label="${t.label}" title="${t.label}">${icon(t.icon, 18)}</button>`)}
      </div>
    </div>
    <div class="field"><label class="field__label" for="step-title">Título</label>
      <input type="text" id="step-title" class="input" placeholder="ex: Pôr do sol no miradouro"></div>
    <div class="field-row">
      <div class="field"><label class="field__label" for="step-date">Dia</label><input type="date" id="step-date" class="input"></div>
      <div class="field"><label class="field__label" for="step-time">Hora</label><input type="time" id="step-time" class="input"></div>
    </div>
    <div class="field"><label class="field__label" for="step-notes">O que aconteceu</label>
      <textarea id="step-notes" class="input textarea" placeholder="Conta como foi, o que comeram, dicas para lembrar…"></textarea></div>
    <div class="field">
      <span class="field__label">Fotos</span>
      <div class="step-photos" id="step-photos"></div>
    </div>
    <div class="btn-row">
      <button class="btn" data-action="modal:close" data-modal="modal-step">Cancelar</button>
      <button class="btn btn--primary" data-action="journal:save">Guardar</button>
    </div>`);
}

// ---------- Lista de paragens ----------

function dayNumber(day) {
  const start = currentTrip()?.dataInicio;
  if (!start || !day) return null;
  const n = daysBetween(start, day) + 1;
  return n > 0 ? n : null;
}

function placeLine(p) {
  if (!p?.nome) return '';
  const extra = [p.cidade, p.pais].filter(Boolean).join(', ');
  return html`<span class="step__place">${flag(p.paisCode)} ${p.nome}${extra ? html`<span class="muted">, ${extra}</span>` : ''}</span>`;
}

function mosaic(step) {
  const fotos = photosOf(step);
  if (!fotos.length) return '';
  const shown = fotos.slice(0, 4);
  return html`
    <div class="mosaic mosaic--${Math.min(shown.length, 4)}">
      ${shown.map((src, i) => html`
        <button class="mosaic__item pressable" data-action="journal:photo" data-id="${step.id}" data-i="${i}" aria-label="Ver foto">
          <img src="${src}" alt="" loading="lazy">
          ${i === 3 && fotos.length > 4 ? html`<span class="mosaic__more">+${fotos.length - 4}</span>` : ''}
        </button>`)}
    </div>`;
}

export function drawJournal() {
  const steps = sortSteps(tripState.timeline);
  const { legs, total } = routeLegs(steps);
  drawRouteStats(steps, total);

  if (!steps.length) {
    render('journal-list', emptyState('Ainda não há paragens. Junta a primeira: onde começa a aventura?', icon('pin', 28)));
    drawMap(steps);
    return;
  }
  const today = todayISO();
  let lastDay = null;
  let n = 0;
  const parts = [];
  steps.forEach((s) => {
    const day = s.data || '';
    if (day !== lastDay) {
      const dn = dayNumber(day);
      parts.push(html`<div class="steps__day">${dn ? html`<span class="chip chip--accent">Dia ${dn}</span>` : ''}<span>${day ? isoToShort(day) : 'Sem data'}</span></div>`);
      lastDay = day;
    }
    const num = hasCoords(s.lugar) ? (n += 1) : null;
    const planned = day && day > today;
    parts.push(html`
      <article class="step glass" id="step-${s.id}">
        <div class="step__head">
          <span class="step__num ${num ? '' : 'step__num--off'}">${num || icon('edit', 12)}</span>
          <div class="step__heading">
            <h3 class="step__title">${s.titulo || s.lugar?.nome || 'Paragem'}</h3>
            <div class="step__meta">
              ${s.hora ? html`<span>${icon('clock', 12)} ${s.hora}</span>` : ''}
              ${planned ? html`<span class="chip chip--muted">Planeado</span>` : ''}
              ${legs[s.id] ? html`<span class="step__leg">${icon(transportOf(s.transporte)?.icon || 'compare', 12)} ${formatKm(legs[s.id])}</span>` : ''}
            </div>
          </div>
          <span class="step__actions">
            ${num ? html`<button class="icon-btn icon-btn--subtle" data-action="journal:focus" data-id="${s.id}" aria-label="Ver no mapa">${icon('map', 15)}</button>` : ''}
            <button class="icon-btn icon-btn--subtle" data-action="journal:edit" data-id="${s.id}" aria-label="Editar">${icon('edit', 15)}</button>
            <button class="icon-btn icon-btn--subtle" data-action="journal:delete" data-id="${s.id}" aria-label="Apagar">${icon('trash', 15)}</button>
          </span>
        </div>
        ${placeLine(s.lugar)}
        ${s.notas ? html`<p class="step__notes">${s.notas}</p>` : ''}
        ${mosaic(s)}
        ${s.autorNome && s.autorUid !== session.uid ? html`<span class="step__author muted small">por ${s.autorNome}</span>` : ''}
      </article>`);
  });
  render('journal-list', parts, { stagger: true });
  drawMap(steps);
}

function drawRouteStats(steps, totalKm) {
  const located = steps.filter((s) => hasCoords(s.lugar)).length;
  const photos = steps.reduce((sum, s) => sum + photosOf(s).length, 0);
  render('route-stats', steps.length ? html`
    <span class="glass-chip">${icon('pin', 12)} ${located} ${located === 1 ? 'paragem' : 'paragens'}</span>
    <span class="glass-chip">${icon('compare', 12)} ${formatKm(totalKm)}</span>
    <span class="glass-chip">${icon('image', 12)} ${photos} ${photos === 1 ? 'foto' : 'fotos'}</span>` : '');
}

// ---------- Mapa ----------

const mapState = newMapState();
const play = { on: false, timer: 0, i: 0 };

export async function drawMap(steps = sortSteps(tripState.timeline)) {
  const el = byId('trip-map');
  if (!el || !el.offsetParent) return; // só desenha quando o separador está visível
  const located = steps.filter((s) => hasCoords(s.lugar));
  byId('trip-map-empty').hidden = located.length > 0;
  byId('trip-map-tools').hidden = !located.length;
  if (!located.length) {
    if (mapState.layer) mapState.layer.clearLayers();
    el.classList.remove('has-map');
    return;
  }
  const L = await ensureMap(mapState, el);
  if (!L) {
    byId('trip-map-empty').hidden = false;
    return;
  }
  el.classList.add('has-map');
  mapState.layer.clearLayers();
  mapState.markers = {};
  const pts = located.map((s) => [s.lugar.lat, s.lugar.lng]);
  if (pts.length > 1) {
    // Cada troço segue o meio de transporte: avião em arco, o resto em linha.
    const path = [pts[0]];
    for (let i = 1; i < located.length; i += 1) {
      const a = located[i - 1].lugar;
      const b = located[i].lugar;
      if (located[i].transporte === 'aviao') path.push(...arcPoints(a, b).slice(1));
      else path.push(pts[i]);
      const t = transportOf(located[i].transporte);
      if (t) {
        const mid = located[i].transporte === 'aviao' ? arcPoints(a, b)[12] : [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
        L.marker(mid, {
          icon: L.divIcon({ className: '', html: `<span class="map-transport">${iconSvg(t.icon, 13)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
          interactive: false,
          keyboard: false,
        }).addTo(mapState.layer);
      }
    }
    const glow = L.polyline(path, { className: 'route-glow', weight: 8 }).addTo(mapState.layer);
    L.polyline(path, { className: 'route-line', weight: 3, dashArray: '2 8', lineCap: 'round' }).addTo(mapState.layer);
    animateLine(glow, 1500);
  }
  const today = todayISO();
  located.forEach((s, i) => {
    const last = i === located.length - 1;
    const planned = s.data && s.data > today;
    const foto = photosOf(s)[0];
    const m = L.marker([s.lugar.lat, s.lugar.lng], {
      icon: L.divIcon({
        className: '',
        html: foto
          ? `<span class="map-photo ${last ? 'map-photo--last' : ''}" style="--i:${i}"><img src="${foto}" alt=""><b>${i + 1}</b></span>`
          : `<span class="map-pin ${last ? 'map-pin--last' : ''} ${planned ? 'map-pin--planned' : ''}" style="--i:${i}">${i + 1}</span>`,
        iconSize: foto ? [40, 40] : [28, 28],
        iconAnchor: foto ? [20, 20] : [14, 14],
      }),
      title: s.titulo || s.lugar.nome,
    }).addTo(mapState.layer);
    m.bindTooltip(`${esc(s.titulo || s.lugar.nome)}`, { direction: 'top', offset: [0, -14] });
    m.on('click', () => byId(`step-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    mapState.markers[s.id] = m;
  });
  if (!play.on) fitTo(mapState, pts);
}

export function resetMap() {
  stopPlay();
  resetMapState(mapState);
}

// ---------- Reproduzir a viagem ----------

function playCard(s, i, total) {
  const foto = photosOf(s)[0];
  render('play-card', html`
    <div class="play-card__inner" key="${s.id}">
      ${foto ? html`<img class="play-card__img" src="${foto}" alt="">` : html`<span class="play-card__flag">${flag(s.lugar?.paisCode) || icon('pin', 22)}</span>`}
      <div class="play-card__text">
        <span class="play-card__step">Paragem ${i + 1} de ${total}${s.data ? ` · ${isoToShort(s.data)}` : ''}</span>
        <strong>${s.titulo || s.lugar?.nome || 'Paragem'}</strong>
        ${s.notas ? html`<span class="play-card__notes">${s.notas}</span>` : ''}
      </div>
    </div>
    <div class="play-card__bar"><span style="width:${((i + 1) / total) * 100}%"></span></div>`);
  const card = byId('play-card');
  card.hidden = false;
  card.classList.remove('is-in');
  void card.offsetWidth;
  card.classList.add('is-in');
}

function stopPlay() {
  play.on = false;
  clearTimeout(play.timer);
  const card = byId('play-card');
  if (card) card.hidden = true;
  const btn = byId('journal-play-btn');
  if (btn) btn.innerHTML = iconSvg('play', 18);
  document.querySelectorAll('.map-pin.is-playing, .map-photo.is-playing').forEach((e) => e.classList.remove('is-playing'));
}

function playStep() {
  const located = sortSteps(tripState.timeline).filter((s) => hasCoords(s.lugar));
  if (!play.on || !mapState.map) return;
  if (play.i >= located.length) {
    play.timer = setTimeout(() => {
      stopPlay();
      fitTo(mapState, located.map((s) => [s.lugar.lat, s.lugar.lng]));
    }, 2200);
    return;
  }
  const s = located[play.i];
  document.querySelectorAll('.map-pin.is-playing, .map-photo.is-playing').forEach((e) => e.classList.remove('is-playing'));
  mapState.markers[s.id]?.getElement()?.firstElementChild?.classList.add('is-playing');
  mapState.map.flyTo([s.lugar.lat, s.lugar.lng], Math.max(8, Math.min(13, mapState.map.getZoom() + 1)), { duration: play.i === 0 ? 1.2 : 1.8 });
  playCard(s, play.i, located.length);
  play.i += 1;
  play.timer = setTimeout(playStep, 3400);
}

// ---------- Formulário ----------

const form = { lugar: null, fotos: [], results: [], transporte: '' };

function drawTransport() {
  document.querySelectorAll('#step-transport .transport-pick__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.t === form.transporte));
}

function drawChosenPlace() {
  const p = form.lugar;
  render('step-place-chosen', p ? html`
    <div class="place-chosen glass-soft">
      <span class="place-chosen__icon">${icon('pin', 16)}</span>
      <span class="place-chosen__text"><strong>${flag(p.paisCode)} ${p.nome}</strong><span class="muted small">${[p.cidade, p.pais].filter(Boolean).join(', ')}</span></span>
      <button class="icon-btn icon-btn--subtle" data-action="journal:clear-place" aria-label="Remover local">${icon('close', 14)}</button>
    </div>` : '');
}

function drawPhotos() {
  render('step-photos', html`
    ${form.fotos.map((src, i) => html`
      <div class="step-photos__item">
        <img src="${src}" alt="">
        <button class="step-photos__remove" data-action="journal:remove-photo" data-i="${i}" aria-label="Remover foto">${icon('close', 12)}</button>
      </div>`)}
    ${form.fotos.length < MAX_PHOTOS ? html`
      <label class="step-photos__add glass-soft pressable">${icon('camera', 20)}<span>Adicionar</span>
        <input type="file" accept="image/*" multiple hidden data-change="journal:add-photos">
      </label>` : ''}`);
}

function fillForm(s = {}) {
  byId('step-id').value = s.id || '';
  byId('step-title').value = s.titulo || '';
  const trip = currentTrip();
  const today = todayISO();
  // Por defeito, hoje; mas dentro das datas da viagem (útil a escrever o diário depois de voltar).
  const fallback = trip?.dataInicio && today < trip.dataInicio ? trip.dataInicio : trip?.dataFim && today > trip.dataFim ? trip.dataFim : today;
  byId('step-date').value = s.data || fallback;
  byId('step-time').value = s.hora || '';
  byId('step-notes').value = s.notas || '';
  byId('step-place-q').value = '';
  form.lugar = s.lugar || null;
  form.fotos = [...photosOf(s)];
  form.results = [];
  form.transporte = s.transporte || '';
  render('step-place-results', '');
  drawChosenPlace();
  drawPhotos();
  drawTransport();
  byId('modal-step-title').textContent = s.id ? 'Editar paragem' : 'Nova paragem';
}

function choosePlace(p) {
  form.lugar = p;
  form.results = [];
  render('step-place-results', '');
  byId('step-place-q').value = '';
  if (!byId('step-title').value.trim()) byId('step-title').value = p.nome;
  drawChosenPlace();
}

export const journalActions = {
  'journal:new': () => { fillForm(); openModal('modal-step'); },
  'journal:edit': ({ data }) => {
    fillForm(tripState.timeline.find((e) => e.id === data.id));
    openModal('modal-step');
  },
  'journal:photo': ({ data }) => {
    const s = tripState.timeline.find((e) => e.id === data.id);
    showImage(photosOf(s || {})[Number(data.i) || 0]);
  },
  'journal:transport': ({ data }) => {
    form.transporte = form.transporte === data.t ? '' : data.t;
    drawTransport();
  },
  'journal:sat': () => {
    mapState.sat = !mapState.sat;
    drawMap();
  },
  'journal:play': () => {
    if (play.on) return stopPlay();
    const located = sortSteps(tripState.timeline).filter((s) => hasCoords(s.lugar));
    if (!located.length) return;
    play.on = true;
    play.i = 0;
    byId('journal-play-btn').innerHTML = iconSvg('pause', 18);
    byId('trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    playStep();
  },
  'journal:focus': ({ data }) => {
    const m = mapState.markers[data.id];
    if (!m || !mapState.map) return;
    byId('trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mapState.map.flyTo(m.getLatLng(), 13, { duration: 0.8 });
    m.openTooltip();
  },
  'journal:search': async ({ el }) => {
    const q = byId('step-place-q').value.trim();
    if (q.length < 2) return toast('Escreve o nome de um sítio.', 'info');
    const btn = el.tagName === 'BUTTON' ? el : null;
    try {
      form.results = await withLoading(btn, () => searchPlaces(q));
    } catch {
      return toast('Não foi possível procurar agora. Tenta de novo.', 'error');
    }
    render('step-place-results', form.results.length
      ? form.results.map((p, i) => html`
          <button class="place-result pressable" data-action="journal:pick" data-i="${i}">
            <span>${flag(p.paisCode) || icon('pin', 14)}</span>
            <span class="place-result__text"><strong>${p.nome}</strong><span class="muted small">${[p.cidade, p.pais].filter(Boolean).join(', ')}</span></span>
          </button>`)
      : html`<p class="muted small">Nenhum resultado para “${q}”.</p>`);
  },
  'journal:pick': ({ data }) => { const p = form.results[Number(data.i)]; if (p) choosePlace(p); },
  'journal:here': async ({ el }) => {
    try {
      const pos = await withLoading(el, () => currentPosition());
      let p;
      try { p = await reversePlace(pos.lat, pos.lng); } catch { p = { nome: 'Localização atual', ...pos }; }
      choosePlace(p);
    } catch {
      toast('Não foi possível obter a tua localização.', 'error');
    }
  },
  'journal:clear-place': () => { form.lugar = null; drawChosenPlace(); },
  'journal:add-photos': async ({ ev }) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    const room = MAX_PHOTOS - form.fotos.length;
    if (files.length > room) toast(`Só cabem mais ${room} fotos nesta paragem.`, 'info');
    for (const f of files.slice(0, room)) {
      form.fotos.push(await compressImage(f, { maxSize: 1100, quality: 0.68 }));
    }
    drawPhotos();
  },
  'journal:remove-photo': ({ data }) => { form.fotos.splice(Number(data.i), 1); drawPhotos(); },
  'journal:save': async ({ el }) => {
    const titulo = byId('step-title').value.trim() || form.lugar?.nome || '';
    if (!titulo) return toast('Escolhe um local ou escreve um título.', 'error');
    const bytes = form.fotos.reduce((s, f) => s + dataUrlBytes(f), 0);
    if (bytes > MAX_DOC_BYTES) return toast('As fotos são grandes demais para uma paragem. Remove uma ou duas.', 'error', 3800);
    const id = byId('step-id').value;
    const payload = {
      data: byId('step-date').value,
      hora: byId('step-time').value,
      titulo,
      notas: byId('step-notes').value.trim(),
      lugar: form.lugar || null,
      transporte: form.transporte || '',
      fotos: form.fotos,
      foto: '',
      timestamp: Date.now(),
    };
    if (!id) Object.assign(payload, { autorUid: session.uid, autorNome: session.name || '' });
    const tripId = tripState.currentTripId;
    await withLoading(el, () => (id ? updateDoc(tripSubDoc(tripId, 'timeline', id), payload) : addDoc(tripCol(tripId, 'timeline'), payload)));
    closeModal('modal-step');
    toast(id ? 'Paragem atualizada' : 'Paragem adicionada');
  },
  'journal:delete': async ({ data }) => {
    if (await confirmDialog('A paragem, as fotos e as notas deixam de estar no diário.', { title: 'Apagar paragem?', confirmLabel: 'Apagar', danger: true })) {
      await deleteDoc(tripSubDoc(tripState.currentTripId, 'timeline', data.id));
    }
  },
};
