// Planear a viagem: destinos com noites, estadias (alojamento), spots e sugestões perto.
// Os destinos ficam na subcoleção "plano" de cada viagem.
import { html, render, byId, esc, setText } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { navigate, back, currentPage } from '../../core/router.js';
import { modalTemplate, openModal, closeModal, confirmDialog, toast, withLoading } from '../../core/ui.js';
import { todayISO, plural } from '../../core/format.js';
import { addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { tripCol, tripSubDoc, tripDoc } from '../../services/paths.js';
import { tripState, currentTrip } from './store.js';
import { hasCoords, flag, formatKm, haversineKm, spotCategory, discoverSpots } from './geo.js';
import { planWithDates, nightsSummary, addDaysISO } from './stats.js';
import { countryName } from './countries.js';
import { pickPlace } from './place-picker.js';
import { newMapState, ensureMap, resetMapState, animateLine, fitTo } from './mapkit.js';

const WD = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MO = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const d0 = (iso) => new Date(`${iso}T00:00:00`);
const shortDM = (iso) => (iso ? `${WD[d0(iso).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const longD = (iso) => (iso ? `${WD[d0(iso).getDay()]} ${Number(iso.slice(8, 10))} ${MO[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : 'Sem data');
const dayMon = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MO[Number(iso.slice(5, 7)) - 1]}` : '');
const dayMonYear = (iso) => (iso ? `${dayMon(iso)} ${iso.slice(0, 4)}` : '—');
const nightsLabel = (n) => (n === 1 ? 'noite' : 'noites');
const uid36 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const planDests = () => planWithDates(currentTrip(), tripState.plan);
export const currentDest = () => planDests().find((d) => d.id === tripState.currentDestId) || null;
const destRef = (id) => tripSubDoc(tripState.currentTripId, 'plano', id);
const origin = () => {
  const t = currentTrip();
  return hasCoords(t?.origem) ? t.origem : hasCoords(tripState.perfil?.casa) ? tripState.perfil.casa : null;
};

// ---------- Separador "Plano" ----------

export function planTabTpl() {
  return html`
    <div class="plan">
      <div class="plan__map-wrap">
        <div class="trip-map glass" id="plan-map">
          <div class="trip-map__empty" id="plan-map-empty">${icon('compass', 26)}<span>Junta destinos para ver o percurso no mapa.</span></div>
        </div>
      </div>
      <div class="plan__sheet card glass">
        <div class="plan-tl" id="plan-list"></div>
      </div>
    </div>`;
}

function ring(done, total) {
  const pct = total ? Math.min(1, done / total) : done ? 1 : 0;
  const C = 2 * Math.PI * 9;
  const over = total != null && done > total;
  return html`
    <span class="nights-ring ${over ? 'is-over' : pct >= 1 ? 'is-full' : ''}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" class="nights-ring__bg"/><circle cx="12" cy="12" r="9" class="nights-ring__fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct)}"/></svg>
      <span><strong>${done}${total != null ? `/${total}` : ''}</strong> ${total != null && total !== 1 ? 'noites' : nightsLabel(done)}</span>
    </span>`;
}

const addBtn = (pos) => html`<button class="plan-tl__add pressable" data-action="plan:add" data-pos="${pos}" aria-label="Adicionar destino aqui">${icon('plus', 14)}</button>`;

function destThumb(d) {
  const spots = d.spots || [];
  const done = spots.filter((s) => s.feito).length;
  return html`
    <span class="plan-dest__thumb">
      <span class="plan-dest__flag">${flag(d.lugar?.paisCode) || icon('pin', 22)}</span>
      ${spots.length ? html`<span class="plan-dest__badge">${icon('check', 10)}${done || spots.length}</span>` : ''}
    </span>`;
}

export function drawPlan() {
  const t = currentTrip();
  if (!t || !byId('plan-list')) return;
  const dests = planDests();
  const { total, planeadas } = nightsSummary(t, dests);
  const o = origin();
  const end = t.dataFim || (dests.length ? dests[dests.length - 1].fim : '');
  const parts = [html`
    <div class="plan-tl__end">
      <button class="plan-tl__icon pressable" data-action="plan:origin" aria-label="Mudar o início">${icon('home', 18)}</button>
      <div class="plan-tl__text">
        <strong>Início da viagem</strong>
        <span>${longD(t.dataInicio)}${o?.nome ? ` · ${o.nome}` : ''}</span>
      </div>
      ${ring(planeadas, total)}
    </div>`, addBtn(0)];
  dests.forEach((d, i) => {
    parts.push(html`
      <article class="plan-dest glass-soft pressable" data-action="plan:open" data-id="${d.id}" style="--i:${i}">
        ${destThumb(d)}
        <div class="plan-dest__info">
          <strong class="plan-dest__name">${d.lugar?.nome || 'Destino'} ${icon('chevronRight', 14)}</strong>
          <span class="plan-dest__dates">${d.inicio ? (d.noites ? `${shortDM(d.inicio)} – ${shortDM(d.fim)}` : shortDM(d.inicio)) : countryName(d.lugar?.paisCode)}</span>
        </div>
        <div class="stepper" data-stop>
          <button class="stepper__btn pressable" data-action="plan:nights" data-id="${d.id}" data-d="-1" aria-label="Menos uma noite" ${d.noites <= 0 ? 'disabled' : ''}>${icon('minus', 16)}</button>
          <span class="stepper__val"><strong id="nights-${d.id}">${d.noites}</strong><small>${nightsLabel(d.noites)}</small></span>
          <button class="stepper__btn pressable" data-action="plan:nights" data-id="${d.id}" data-d="1" aria-label="Mais uma noite">${icon('plus', 16)}</button>
        </div>
      </article>`, addBtn(i + 1));
  });
  if (!dests.length) {
    parts.push(html`<p class="plan-tl__empty muted small">Toca no <strong>+</strong> para juntar o primeiro destino: cidades, vilas ou parques onde vão dormir.</p>`);
  }
  parts.push(html`
    <div class="plan-tl__end plan-tl__end--last">
      <span class="plan-tl__icon plan-tl__icon--muted">${icon('flag', 18)}</span>
      <div class="plan-tl__text"><strong>Fim da viagem</strong><span>${longD(end)}</span></div>
      ${total != null && planeadas !== total && dests.length && t.dataInicio ? html`<button class="btn btn--small btn--glass pressable" data-action="plan:fit-end">Ajustar fim</button>` : ''}
    </div>`);
  render('plan-list', parts);
  drawPlanMap(dests);
}

const planMap = newMapState();

export async function drawPlanMap(dests = planDests()) {
  const el = byId('plan-map');
  if (!el || !el.offsetParent) return;
  const located = dests.filter((d) => hasCoords(d.lugar));
  const o = origin();
  byId('plan-map-empty').hidden = located.length > 0;
  if (!located.length) {
    planMap.layer?.clearLayers();
    el.classList.remove('has-map');
    return;
  }
  const L = await ensureMap(planMap, el, { zoom: false });
  if (!L) return;
  el.classList.add('has-map');
  planMap.layer.clearLayers();
  const pts = located.map((d) => [d.lugar.lat, d.lugar.lng]);
  const route = o ? [[o.lat, o.lng], ...pts, [o.lat, o.lng]] : pts;
  if (route.length > 1) {
    const glow = L.polyline(route, { className: 'route-glow', weight: 7 }).addTo(planMap.layer);
    L.polyline(route, { className: 'route-line route-line--plan', weight: 2.5, dashArray: '6 8', lineCap: 'round' }).addTo(planMap.layer);
    animateLine(glow, 1300);
  }
  if (o) {
    L.marker([o.lat, o.lng], { icon: L.divIcon({ className: '', html: `<span class="map-home">${icon('home', 14)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(planMap.layer);
  }
  located.forEach((d, i) => {
    const spots = (d.spots || []).length;
    const m = L.marker([d.lugar.lat, d.lugar.lng], {
      icon: L.divIcon({
        className: '',
        html: `<span class="map-label" style="--i:${i}"><span class="map-label__name">${esc(d.lugar.nome)}</span><span class="map-label__dot">${spots ? `✓${spots}` : i + 1}</span></span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    }).addTo(planMap.layer);
    m.on('click', () => openDest(d.id));
  });
  fitTo(planMap, o ? [[o.lat, o.lng], ...pts] : pts, { maxZoom: 9, padding: 44 });
}

export function resetPlanMaps() {
  resetMapState(planMap);
  resetMapState(destMap);
}

// ---------- Página do destino ----------

const ui = { showAllSpots: false, spotsTab: 'plan', discover: {}, discoverLoading: false };

export const destPage = {
  id: 'page-viagem-destino',
  width: 'medium',
  title: () => currentDest()?.lugar?.nome || 'Destino',
  headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="plan:delete" aria-label="Remover destino">${icon('trash', 18)}</button>`,
  template: () => html`
    <div class="dest-hero">
      <div class="dest-hero__map" id="dest-map"></div>
      <div class="dest-hero__sheet">
        <span class="dest-hero__grab"></span>
        <span class="dest-hero__country" id="dest-country"></span>
        <h2 class="dest-hero__name" id="dest-name"></h2>
        <input class="dest-hero__tag" id="dest-tag" maxlength="60" placeholder="Escreve uma frase sobre este sítio" data-change="plan:tagline">
        <div class="dest-dates">
          <span class="dest-dates__range">${icon('calendar', 18)} <span id="dest-range"></span></span>
          <div class="stepper stepper--pill">
            <button class="stepper__btn pressable" data-action="plan:nights" data-cur="1" data-d="-1" aria-label="Menos uma noite">${icon('minus', 16)}</button>
            <span class="stepper__val stepper__val--row"><strong id="dest-nights">1</strong> <span id="dest-nights-l">noite</span></span>
            <button class="stepper__btn pressable" data-action="plan:nights" data-cur="1" data-d="1" aria-label="Mais uma noite">${icon('plus', 16)}</button>
          </div>
        </div>
      </div>
    </div>

    <section class="dest-sec">
      <h3 class="dest-sec__title">Notas</h3>
      <div class="sticky-note">
        <textarea id="dest-notes" class="sticky-note__text" rows="2" placeholder="Adiciona as tuas notas" data-change="plan:notes"></textarea>
        ${icon('file', 18)}
      </div>
    </section>

    <section class="dest-sec">
      <div class="dest-sec__head"><h3 class="dest-sec__title">Estadias</h3>
        <button class="tw-link pressable" data-action="plan:stay-new">${icon('plus', 15)} Adicionar estadia</button></div>
      <div class="nights-bar"><span id="dest-stay-count"></span><span class="nights-bar__track"><span class="nights-bar__fill" id="dest-stay-fill"></span></span></div>
      <div class="stays" id="dest-stays"></div>
    </section>

    <section class="dest-sec">
      <div class="dest-sec__head"><h3 class="dest-sec__title">Spots</h3>
        <button class="tw-link pressable" data-action="plan:spot-new">${icon('plus', 15)} Adicionar spot</button></div>
      <div class="seg-mini seg-mini--2" id="dest-spot-tabs">
        <button class="seg-mini__btn is-active" data-action="plan:spots-tab" data-tab="plan">Planeados</button>
        <button class="seg-mini__btn" data-action="plan:spots-tab" data-tab="discover">${icon('compass', 14)} Descobrir</button>
      </div>
      <div class="spots" id="dest-spots"></div>
    </section>

    <button class="btn btn--glass btn--block pressable" data-action="plan:to-journal">${icon('book', 16)} Já cá estive: juntar ao diário</button>`,
  onEnter: () => {
    ui.showAllSpots = false;
    drawDest();
  },
};

const destMap = newMapState();

async function drawDestMap(d) {
  const el = byId('dest-map');
  if (!el || !el.offsetParent || !hasCoords(d.lugar)) return;
  destMap.sat = true;
  const L = await ensureMap(destMap, el, { zoom: false });
  if (!L) return;
  destMap.layer.clearLayers();
  const pts = [[d.lugar.lat, d.lugar.lng]];
  (d.spots || []).filter(hasCoords).forEach((s) => {
    pts.push([s.lat, s.lng]);
    L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: '', html: `<span class="map-spot ${s.feito ? 'is-done' : ''}">${icon('star', 12)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      title: s.nome,
    }).addTo(destMap.layer).bindTooltip(esc(s.nome), { direction: 'top', offset: [0, -10] });
  });
  L.marker(pts[0], { icon: L.divIcon({ className: '', html: '<span class="map-pin map-pin--last">★</span>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(destMap.layer);
  // Mapa por cima do cartão: o destino fica na metade de cima.
  fitTo(destMap, pts, { maxZoom: 13, padding: 30 });
}

function stayNights(s) {
  if (!s.checkin || !s.checkout) return 0;
  return Math.max(0, Math.round((d0(s.checkout) - d0(s.checkin)) / 86400000));
}

function drawStays(d) {
  const stays = d.estadias || [];
  const booked = stays.reduce((n, s) => n + stayNights(s), 0);
  const pct = d.noites ? Math.min(100, (booked / d.noites) * 100) : stays.length ? 100 : 0;
  setText('dest-stay-count', `${booked} / ${d.noites} ${nightsLabel(d.noites)} reservadas`);
  const fill = byId('dest-stay-fill');
  if (fill) requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  render('dest-stays', stays.length
    ? stays.map((s, i) => html`
      <article class="stay" style="--i:${i}">
        <div class="stay__card">
          <h4 class="stay__name">${s.nome || 'Alojamento'}</h4>
          ${s.morada ? html`<span class="stay__addr">${icon('pin', 12)} ${s.morada}</span>` : ''}
          <div class="stay__times">
            <div><span>Check-in</span><strong>${dayMonYear(s.checkin)}</strong><span>${s.horaIn || ''}</span></div>
            <i></i>
            <div class="stay__out"><span>Check-out</span><strong>${dayMonYear(s.checkout)}</strong><span>${s.horaOut || ''}</span></div>
          </div>
        </div>
        <div class="stay__stub">
          <span class="stay__nights">${plural(stayNights(s), 'noite', 'noites').toUpperCase()}</span>
          <button class="stay__more pressable" data-action="plan:stay-edit" data-i="${i}" aria-label="Editar estadia">${icon('more', 18)}</button>
        </div>
      </article>`)
    : html`<button class="stay-empty glass-soft pressable" data-action="plan:stay-new">${icon('bed', 22)}<span>Onde vão dormir? Junta o hotel ou o alojamento.</span></button>`, { stagger: true });
}

function spotRow(s, i) {
  return html`
    <div class="spot ${s.feito ? 'is-done' : ''}" style="--i:${i}">
      <button class="spot__check pressable" data-action="plan:spot-done" data-sid="${s.id}" aria-label="${s.feito ? 'Marcar por visitar' : 'Marcar como visitado'}">${icon('check', 14)}</button>
      <button class="spot__body" data-action="plan:spot-edit" data-sid="${s.id}">
        ${spotCategory(s.tipo) ? html`<span class="spot__cat">${spotCategory(s.tipo)}</span>` : ''}
        <strong class="spot__name">${s.nome}</strong>
        ${s.data ? html`<span class="spot__date">${icon('calendar', 12)} ${s.data.slice(8, 10)}/${s.data.slice(5, 7)}</span>` : ''}
      </button>
      <button class="icon-btn icon-btn--subtle" data-action="plan:spot-edit" data-sid="${s.id}" aria-label="Opções">${icon('more', 16)}</button>
    </div>`;
}

function drawSpots(d) {
  byId('dest-spot-tabs')?.querySelectorAll('.seg-mini__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === ui.spotsTab));
  if (ui.spotsTab === 'discover') return drawDiscover(d);
  const spots = d.spots || [];
  const shown = ui.showAllSpots ? spots : spots.slice(0, 5);
  render('dest-spots', spots.length
    ? html`<div class="spots__list">${shown.map(spotRow)}</div>
      ${spots.length > shown.length ? html`<button class="chip chip--block pressable spots__more" data-action="plan:spots-more">e mais ${spots.length - shown.length}</button>` : ''}`
    : html`<p class="muted small spots__empty">Monumentos, restaurantes, miradouros… Junta o que não querem perder, ou vê sugestões em <strong>Descobrir</strong>.</p>`, { stagger: true });
}

async function drawDiscover(d) {
  if (!hasCoords(d.lugar)) return render('dest-spots', html`<p class="muted small">Este destino não tem localização.</p>`);
  const cached = ui.discover[d.id];
  if (!cached) {
    render('dest-spots', html`<div class="discover-loading"><span class="spinner"></span> A procurar sítios populares perto de ${d.lugar.nome}…</div>`);
    if (ui.discoverLoading) return;
    ui.discoverLoading = true;
    try {
      ui.discover[d.id] = await discoverSpots(d.lugar);
    } catch {
      ui.discover[d.id] = null;
      ui.discoverLoading = false;
      return render('dest-spots', html`<p class="muted small">Não foi possível obter sugestões agora. Tenta mais tarde.</p>`);
    }
    ui.discoverLoading = false;
    if (currentDest()?.id === d.id && ui.spotsTab === 'discover') drawDiscover(currentDest());
    return;
  }
  const have = new Set((d.spots || []).map((s) => s.nome));
  render('dest-spots', cached.length
    ? html`<p class="muted small">Sítios populares num raio de 5 km.</p><div class="spots__list">${cached.map((s, i) => html`
      <div class="spot spot--discover" style="--i:${i}">
        <span class="spot__icon">${icon(s.tipo.startsWith('natural') ? 'sun' : s.tipo.includes('museum') || s.tipo.includes('gallery') ? 'image' : 'star', 16)}</span>
        <span class="spot__body">
          <span class="spot__cat">${spotCategory(s.tipo)}</span>
          <strong class="spot__name">${s.nome}</strong>
          <span class="spot__date">${formatKm(s.dist)} do centro</span>
        </span>
        ${have.has(s.nome)
    ? html`<span class="spot__added">${icon('check', 16)}</span>`
    : html`<button class="icon-btn glass-chip pressable" data-action="plan:discover-add" data-i="${i}" aria-label="Juntar aos spots">${icon('plus', 16)}</button>`}
      </div>`)}</div>`
    : html`<p class="muted small">Não encontrámos sugestões perto deste destino.</p>`, { stagger: true });
}

export function drawDest() {
  if (currentPage() !== 'page-viagem-destino') return;
  const d = currentDest();
  if (!d) return;
  setText('dest-name', d.lugar?.nome || 'Destino');
  render('dest-country', d.lugar?.paisCode ? html`<span class="dest-hero__flag">${flag(d.lugar.paisCode)}</span> ${d.lugar.pais || countryName(d.lugar.paisCode)}` : '');
  const tag = byId('dest-tag');
  if (document.activeElement !== tag) tag.value = d.frase || '';
  setText('dest-range', d.inicio ? `${dayMon(d.inicio)} – ${dayMon(d.fim)}` : 'Sem datas');
  setText('dest-nights', String(d.noites));
  setText('dest-nights-l', nightsLabel(d.noites));
  const notes = byId('dest-notes');
  if (document.activeElement !== notes) notes.value = d.notas || '';
  drawStays(d);
  drawSpots(d);
  drawDestMap(d);
}

function openDest(id) {
  tripState.currentDestId = id;
  ui.spotsTab = 'plan';
  navigate('page-viagem-destino');
}

// ---------- Modais ----------

export function planModalsTpl() {
  return html`
    ${modalTemplate('modal-stay', 'Estadia', html`
      <input type="hidden" id="stay-i">
      <div class="field"><label class="field__label" for="stay-name">Alojamento</label>
        <input type="text" id="stay-name" class="input" placeholder="ex: Hotel Évora Centro"></div>
      <div class="field"><label class="field__label" for="stay-addr">Morada ou link da reserva</label>
        <input type="text" id="stay-addr" class="input" placeholder="Opcional"></div>
      <div class="field-row">
        <div class="field"><label class="field__label" for="stay-in">Check-in</label><input type="date" id="stay-in" class="input"></div>
        <div class="field"><label class="field__label" for="stay-in-h">Hora</label><input type="time" id="stay-in-h" class="input"></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="field__label" for="stay-out">Check-out</label><input type="date" id="stay-out" class="input"></div>
        <div class="field"><label class="field__label" for="stay-out-h">Hora</label><input type="time" id="stay-out-h" class="input"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn--danger-soft" id="stay-del" data-action="plan:stay-delete">${icon('trash', 16)}</button>
        <button class="btn btn--primary" data-action="plan:stay-save">Guardar</button>
      </div>`)}
    ${modalTemplate('modal-spot', 'Spot', html`
      <input type="hidden" id="spot-id">
      <div class="field"><label class="field__label" for="spot-name">Nome</label><input type="text" id="spot-name" class="input"></div>
      <div class="field"><label class="field__label" for="spot-date">Dia (opcional)</label><input type="date" id="spot-date" class="input"></div>
      <div class="field"><label class="field__label" for="spot-notes">Notas</label>
        <textarea id="spot-notes" class="input textarea" rows="2" placeholder="Horários, bilhetes, dicas…"></textarea></div>
      <div class="btn-row">
        <button class="btn btn--danger-soft" data-action="plan:spot-delete">${icon('trash', 16)} Remover</button>
        <button class="btn btn--primary" data-action="plan:spot-save">Guardar</button>
      </div>`)}`;
}

function newOrder(pos) {
  const list = planDests();
  const prev = list[pos - 1];
  const next = list[pos];
  if (prev && next) return ((prev.ordem ?? pos - 1) + (next.ordem ?? pos)) / 2;
  if (prev) return (prev.ordem ?? pos - 1) + 1;
  if (next) return (next.ordem ?? 0) - 1;
  return 1;
}

async function saveSpots(d, spots) {
  await updateDoc(destRef(d.id), { spots });
}

export const planActions = {
  'plan:add': async ({ data }) => {
    const pos = Number(data.pos) || 0;
    const ordem = newOrder(pos);
    const near = planDests()[Math.max(0, pos - 1)]?.lugar || origin();
    const lugar = await pickPlace({ title: 'Adicionar destino', hint: 'Cidade, vila ou zona onde vão ficar. Depois escolhes quantas noites.', placeholder: 'ex: Évora, Roma, Algarve…', near });
    if (!lugar) return;
    await addDoc(tripCol(tripState.currentTripId, 'plano'), {
      ordem, lugar, noites: 1, notas: '', frase: '', estadias: [], spots: [], timestamp: Date.now(), autorUid: session.uid,
    });
    toast(`${lugar.nome} juntado ao plano`);
  },
  'plan:open': ({ data }) => openDest(data.id),
  'plan:nights': async ({ data, el }) => {
    const id = data.cur ? tripState.currentDestId : data.id;
    const d = tripState.plan.find((x) => x.id === id);
    if (!d) return;
    const noites = Math.max(0, (Number(d.noites) || 0) + Number(data.d));
    if (noites === d.noites) return;
    d.noites = noites; // resposta imediata; o Firestore confirma a seguir
    el.closest('.stepper')?.classList.remove('bump');
    void el.offsetWidth;
    el.closest('.stepper')?.classList.add('bump');
    drawPlan();
    drawDest();
    await updateDoc(destRef(id), { noites });
  },
  'plan:fit-end': async () => {
    const t = currentTrip();
    const { planeadas } = nightsSummary(t, tripState.plan);
    if (!t?.dataInicio) return;
    const dataFim = addDaysISO(t.dataInicio, planeadas);
    await updateDoc(tripDoc(t.id), { dataFim });
    toast(`Fim da viagem: ${dayMonYear(dataFim)}`);
  },
  'plan:origin': async () => {
    const lugar = await pickPlace({ title: 'Início da viagem', hint: 'De onde partem? Por omissão é a tua casa (definida nas Estatísticas).', near: origin() });
    if (!lugar) return;
    await updateDoc(tripDoc(tripState.currentTripId), { origem: lugar });
    toast('Início da viagem atualizado');
  },
  'plan:tagline': async ({ value }) => {
    await updateDoc(destRef(tripState.currentDestId), { frase: value.trim() });
  },
  'plan:notes': async ({ value }) => {
    await updateDoc(destRef(tripState.currentDestId), { notas: value });
    toast('Notas guardadas');
  },
  'plan:delete': async () => {
    const d = currentDest();
    if (!d) return;
    const ok = await confirmDialog(`${d.lugar?.nome || 'Este destino'}, as estadias e os spots saem do plano.`, { title: 'Remover destino?', confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    back();
    await deleteDoc(destRef(d.id));
  },
  // Estadias
  'plan:stay-new': () => {
    const d = currentDest();
    if (!d) return;
    byId('stay-i').value = '';
    byId('stay-name').value = '';
    byId('stay-addr').value = '';
    byId('stay-in').value = d.inicio || '';
    byId('stay-out').value = d.fim || '';
    byId('stay-in-h').value = '15:00';
    byId('stay-out-h').value = '12:00';
    byId('stay-del').hidden = true;
    openModal('modal-stay');
  },
  'plan:stay-edit': ({ data }) => {
    const s = currentDest()?.estadias?.[Number(data.i)];
    if (!s) return;
    byId('stay-i').value = data.i;
    byId('stay-name').value = s.nome || '';
    byId('stay-addr').value = s.morada || '';
    byId('stay-in').value = s.checkin || '';
    byId('stay-out').value = s.checkout || '';
    byId('stay-in-h').value = s.horaIn || '';
    byId('stay-out-h').value = s.horaOut || '';
    byId('stay-del').hidden = false;
    openModal('modal-stay');
  },
  'plan:stay-save': async ({ el }) => {
    const d = currentDest();
    if (!d) return;
    const nome = byId('stay-name').value.trim();
    if (!nome) return toast('Escreve o nome do alojamento.', 'error');
    const checkin = byId('stay-in').value;
    const checkout = byId('stay-out').value;
    if (checkin && checkout && checkout < checkin) return toast('O check-out é antes do check-in.', 'error');
    const s = { nome, morada: byId('stay-addr').value.trim(), checkin, checkout, horaIn: byId('stay-in-h').value, horaOut: byId('stay-out-h').value };
    const list = [...(d.estadias || [])];
    const i = byId('stay-i').value;
    if (i === '') list.push(s); else list[Number(i)] = s;
    await withLoading(el, () => updateDoc(destRef(d.id), { estadias: list }));
    closeModal('modal-stay');
    toast('Estadia guardada');
  },
  'plan:stay-delete': async () => {
    const d = currentDest();
    const i = byId('stay-i').value;
    if (!d || i === '') return;
    await updateDoc(destRef(d.id), { estadias: (d.estadias || []).filter((_, k) => k !== Number(i)) });
    closeModal('modal-stay');
  },
  // Spots
  'plan:spots-tab': ({ data }) => {
    ui.spotsTab = data.tab;
    const d = currentDest();
    if (d) drawSpots(d);
  },
  'plan:spots-more': () => { ui.showAllSpots = true; const d = currentDest(); if (d) drawSpots(d); },
  'plan:spot-new': async () => {
    const d = currentDest();
    if (!d) return;
    const p = await pickPlace({ title: 'Adicionar spot', hint: `Um sítio a visitar em ${d.lugar?.nome || 'este destino'}.`, placeholder: 'ex: Templo Romano, restaurante…', near: d.lugar });
    if (!p) return;
    const fresh = currentDest();
    await saveSpots(fresh, [...(fresh.spots || []), { id: uid36(), nome: p.nome, tipo: p.tipo || '', lat: p.lat, lng: p.lng, data: '', notas: '', feito: false }]);
    toast(`${p.nome} juntado aos spots`);
  },
  'plan:discover-add': async ({ data }) => {
    const d = currentDest();
    const s = ui.discover[d?.id]?.[Number(data.i)];
    if (!d || !s) return;
    await saveSpots(d, [...(d.spots || []), { id: uid36(), nome: s.nome, tipo: s.tipo, lat: s.lat, lng: s.lng, data: '', notas: '', feito: false }]);
    toast(`${s.nome} juntado aos spots`);
  },
  'plan:spot-done': async ({ data }) => {
    const d = currentDest();
    if (!d) return;
    await saveSpots(d, (d.spots || []).map((s) => (s.id === data.sid ? { ...s, feito: !s.feito } : s)));
  },
  'plan:spot-edit': ({ data }) => {
    const d = currentDest();
    const s = d?.spots?.find((x) => x.id === data.sid);
    if (!s) return;
    byId('spot-id').value = s.id;
    byId('spot-name').value = s.nome || '';
    const date = byId('spot-date');
    date.value = s.data || '';
    date.min = d.inicio || '';
    date.max = d.fim || '';
    byId('spot-notes').value = s.notas || '';
    openModal('modal-spot');
  },
  'plan:spot-save': async () => {
    const d = currentDest();
    const id = byId('spot-id').value;
    if (!d) return;
    const nome = byId('spot-name').value.trim();
    if (!nome) return toast('O spot precisa de um nome.', 'error');
    await saveSpots(d, (d.spots || []).map((s) => (s.id === id ? { ...s, nome, data: byId('spot-date').value, notas: byId('spot-notes').value.trim() } : s)));
    closeModal('modal-spot');
  },
  'plan:spot-delete': async () => {
    const d = currentDest();
    const id = byId('spot-id').value;
    if (!d) return;
    await saveSpots(d, (d.spots || []).filter((s) => s.id !== id));
    closeModal('modal-spot');
  },
  'plan:to-journal': async ({ el }) => {
    const d = currentDest();
    if (!d) return;
    const dup = tripState.timeline.some((s) => hasCoords(s.lugar) && hasCoords(d.lugar) && haversineKm(s.lugar, d.lugar) < 0.3 && (s.data || '') === (d.inicio || ''));
    if (dup) return toast('Este destino já está no diário.', 'info');
    const today = todayISO();
    await withLoading(el, () => addDoc(tripCol(tripState.currentTripId, 'timeline'), {
      data: d.inicio && d.inicio <= today ? d.inicio : today,
      hora: '',
      titulo: d.lugar?.nome || 'Paragem',
      notas: d.notas || '',
      lugar: d.lugar || null,
      fotos: [],
      foto: '',
      timestamp: Date.now(),
      autorUid: session.uid,
      autorNome: session.name || '',
    }));
    toast('Juntado ao diário. Já podes pôr fotos!');
  },
};
