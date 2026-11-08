// Perfil de viagens (globo + próximas/passadas) e Estatísticas de viagens.
import { html, render, byId, setText, countUp, raw } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { currentPage } from '../../core/router.js';
import { modalTemplate, openModal, toast } from '../../core/ui.js';
import { todayISO, dateRange } from '../../core/format.js';
import { getDocs, setDoc } from '../../services/firebase.js';
import { tripCol, userDoc, snapToList } from '../../services/paths.js';
import { avatar } from '../../components/avatar.js';
import { tripState, FALLBACK_COVER } from './store.js';
import { travelStats, tripPhase } from './stats.js';
import { CONTINENTS, searchCountries, countryName } from './countries.js';
import { flag, formatKm, hasCoords } from './geo.js';
import { createGlobe, worldMapSvg } from './globe.js';
import { pickPlace } from './place-picker.js';

const perfilRef = () => userDoc('viagens', 'perfil');
let stats = null;
let heroGlobe = null;
let miniGlobe = null;
let farGlobe = null;
let clockTimer = 0;

// ---------- Dados de todas as viagens ----------

/** Lê paragens e planos de todas as viagens (com cache de 1 minuto). */
export async function loadAllTripData(force = false) {
  const fresh = Date.now() - tripState.allLoadedAt < 60000;
  const missing = tripState.trips.some((t) => !(t.id in tripState.allSteps));
  if (!force && fresh && !missing) return;
  tripState.allLoadedAt = Date.now();
  await Promise.all(tripState.trips.map(async (t) => {
    try {
      const [steps, plan] = await Promise.all([getDocs(tripCol(t.id, 'timeline')), getDocs(tripCol(t.id, 'plano'))]);
      tripState.allSteps[t.id] = snapToList(steps);
      tripState.allPlans[t.id] = snapToList(plan);
    } catch (err) {
      console.warn('[trips] dados da viagem', t.id, err);
    }
  }));
}

function computeStats() {
  // A viagem aberta usa os dados em tempo real.
  if (tripState.currentTripId) {
    tripState.allSteps[tripState.currentTripId] = tripState.timeline;
    tripState.allPlans[tripState.currentTripId] = tripState.plan;
  }
  stats = travelStats({
    trips: tripState.trips,
    stepsByTrip: tripState.allSteps,
    planByTrip: tripState.allPlans,
    extraCountries: tripState.perfil?.paisesExtra || [],
    home: tripState.perfil?.casa || null,
    today: todayISO(),
  });
  return stats;
}

// ---------- Perfil (página principal das Viagens) ----------

export function overviewTpl() {
  return html`
    <div class="tw-hero">
      <div class="tw-stars" aria-hidden="true"></div>
      <canvas class="tw-globe" id="tw-globe" aria-label="Globo com os sítios visitados"></canvas>
      <div class="tw-bubbles" id="tw-bubbles"></div>
    </div>
    <div class="tw-sheet card glass">
      <div class="tw-me" id="tw-me"></div>
      <div class="tw-counts">
        <button class="tw-count pressable" data-action="nav:go" data-page="page-viagens-stats"><strong id="tw-c-countries">0</strong><span>Países</span></button>
        <div class="tw-count"><strong id="tw-c-trips">0</strong><span>Viagens</span></div>
        <div class="tw-count"><strong id="tw-c-km">0</strong><span>Quilómetros</span></div>
      </div>
      <div class="tw-actions">
        <button class="btn btn--primary pressable" data-action="nav:go" data-page="menu-nova-viagem">${icon('plus', 16)} Nova viagem</button>
        <button class="btn btn--glass pressable" data-action="nav:go" data-page="page-viagens-stats">${icon('trendUp', 16)} Estatísticas</button>
      </div>
    </div>
    <h3 class="section-title">Próximas viagens</h3>
    <div class="card-stack" id="trips-upcoming"></div>
    <div class="section-head tw-past-head">
      <h3 class="section-title">Viagens passadas</h3>
      <button class="tw-link pressable" data-action="nav:go" data-page="menu-nova-viagem">${icon('plus', 15)} Adicionar viagem passada</button>
    </div>
    <div class="card-stack" id="trips-past"></div>`;
}

function countdown(t) {
  const today = todayISO();
  const phase = tripPhase(t, today);
  if (phase === 'a-decorrer') return 'A decorrer';
  if (phase !== 'futura') return '';
  const n = Math.round((new Date(`${t.dataInicio}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  return n === 1 ? 'Amanhã' : `Faltam ${n} dias`;
}

function tripCard(t, i) {
  const badge = countdown(t);
  const people = t.membros_info || [];
  const codes = [...new Set([...(tripState.allSteps[t.id] || []), ...(tripState.allPlans[t.id] || [])].map((x) => x.lugar?.paisCode).filter(Boolean))];
  return html`
    <article class="media-card glass pressable" data-action="trips:open" data-id="${t.id}" style="--i:${i}">
      <img class="media-card__img" src="${t.capa || FALLBACK_COVER}" alt="" loading="lazy">
      ${badge ? html`<span class="media-card__badge glass-chip">${badge}</span>` : ''}
      <div class="media-card__overlay">
        <div>
          <h3 class="media-card__title">${t.nome || 'Sem título'} ${codes.slice(0, 3).map((c) => flag(c)).join(' ')}</h3>
          <span class="media-card__sub">${icon('calendar', 12)} ${dateRange(t.dataInicio, t.dataFim)}${t.paisCode ? ` · ${t.paisCode}` : ''}</span>
        </div>
        ${people.length > 1 ? html`<span class="avatar-stack">${people.slice(0, 4).map((m) => avatar(m.nome, m.avatarUrl, 'xs'))}</span>` : ''}
      </div>
    </article>`;
}

const EMPTY_PLAN = html`
  <div class="tw-plan-empty">
    <h4>Começa a planear a próxima viagem</h4>
    <button class="btn btn--glass pressable" data-action="nav:go" data-page="menu-nova-viagem">${icon('plus', 16)} Planear uma viagem</button>
    <div class="tw-plan-empty__art" aria-hidden="true">
      <span class="tw-card tw-card--1">${icon('plane', 18)}</span>
      <span class="tw-card tw-card--2">${icon('pin', 18)}</span>
      <span class="tw-card tw-card--3">${icon('bed', 18)}</span>
      <span class="tw-folder"></span>
    </div>
  </div>`;

function bubbles() {
  // Uma foto por viagem, pousada no primeiro sítio visitado (ou planeado).
  const out = [];
  tripState.trips.forEach((t) => {
    const steps = (tripState.allSteps[t.id] || []).filter((s) => hasCoords(s.lugar));
    const plan = (tripState.allPlans[t.id] || []).filter((d) => hasCoords(d.lugar));
    const p = steps[0]?.lugar || plan[0]?.lugar;
    if (!p) return;
    const img = steps.find((s) => s.fotos?.length)?.fotos[0] || t.capa || '';
    out.push({ id: t.id, lat: p.lat, lng: p.lng, img, nome: t.nome });
  });
  return out.slice(0, 12);
}

export function drawOverview() {
  if (!byId('trips-upcoming')) return;
  const s = computeStats();
  const today = todayISO();
  const trips = [...tripState.trips];
  const upcoming = trips.filter((t) => ['futura', 'a-decorrer'].includes(tripPhase(t, today)) || (!t.dataInicio && !(tripState.allSteps[t.id] || []).length))
    .sort((a, b) => (a.dataInicio || '9999').localeCompare(b.dataInicio || '9999'));
  const past = trips.filter((t) => !upcoming.includes(t)).sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));

  render('tw-me', html`
    ${avatar(session.name, session.avatar, 'lg')}
    <div class="tw-me__text">
      <h2 class="tw-me__name">${session.name || 'Eu'} ${tripState.perfil?.casa?.paisCode ? flag(tripState.perfil.casa.paisCode) : ''}</h2>
      <button class="tw-me__home tw-link pressable" data-action="tw:home">${icon('home', 13)} ${tripState.perfil?.casa?.nome ? `Casa: ${tripState.perfil.casa.nome}` : 'Define a tua casa'}</button>
    </div>`);
  countUp('tw-c-countries', s.countries.length);
  countUp('tw-c-trips', s.trips);
  countUp('tw-c-km', Math.round(s.km), { format: (v) => Math.round(v).toLocaleString('pt-PT') });
  render('trips-upcoming', upcoming.length ? upcoming.map(tripCard) : EMPTY_PLAN, { stagger: true });
  render('trips-past', past.length ? past.map(tripCard) : html`<p class="muted small">As viagens que já fizeram aparecem aqui.</p>`, { stagger: true });

  // Globo
  const list = bubbles();
  render('tw-bubbles', list.map((b, i) => html`
    <button class="tw-bubble pressable" data-action="trips:open" data-id="${b.id}" data-lat="${b.lat}" data-lng="${b.lng}" style="--i:${i}" aria-label="${b.nome}">
      ${b.img ? html`<img src="${b.img}" alt="">` : html`<span>${icon('pin', 16)}</span>`}
    </button>`));
  const visited = new Set(s.countries.map((c) => c.code));
  const canvas = byId('tw-globe');
  if (!heroGlobe && canvas) {
    const home = tripState.perfil?.casa;
    heroGlobe = createGlobe(canvas, { visited, bubbles: byId('tw-bubbles'), center: hasCoords(home) ? [home.lng, home.lat] : [-5, 30], speed: 0.05 });
    heroGlobe.ready.catch(() => canvas.classList.add('is-off'));
  } else {
    heroGlobe?.update({ visited });
    heroGlobe?.resume();
  }
}

// ---------- Estatísticas ----------

export function statsTpl() {
  return html`
    <div class="tw-stats">
      <div id="st-hint"></div>
      <h3 class="tw-h">Já estiveste em</h3>
      <div class="tw-duo">
        <button class="tw-tile tw-tile--hills pressable" data-action="tw:countries">
          <svg class="tw-hills" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
            <path class="h1" d="M0 80 Q40 52 80 70 T160 62 T200 66 V120 H0z"/>
            <path class="h2" d="M0 96 Q50 70 100 88 T200 84 V120 H0z"/>
            <g class="tw-flagpole"><line x1="150" y1="40" x2="150" y2="74"/><path d="M150 40 L170 46 L150 53z"/></g>
          </svg>
          <span class="tw-tile__num"><strong id="st-countries">0</strong><span>países</span></span>
        </button>
        <div class="tw-tile tw-tile--space">
          <canvas class="tw-mini-globe" id="st-mini-globe"></canvas>
          <span class="tw-tile__num"><strong id="st-world">0%</strong><span>do mundo</span></span>
        </div>
      </div>

      <h3 class="tw-h">Continentes visitados</h3>
      <div class="tw-worldmap" id="st-worldmap"><div class="tw-worldmap__ph"></div></div>
      <div class="tw-legend" id="st-legend"></div>

      <div class="section-head"><h3 class="tw-h">Bandeiras recolhidas</h3>
        <button class="tw-link pressable" data-action="tw:countries">${icon('plus', 15)} Adicionar países</button></div>
      <div class="tw-flags" id="st-flags"></div>

      <h3 class="tw-h">Todas as estatísticas</h3>
      <div class="tw-clock" id="st-clock">
        ${['dias', 'horas', 'minutos', 'segundos'].map((l, i) => html`<div class="tw-clock__cell" style="--k:${i}"><strong id="st-t-${i}">0</strong><span>${l}</span></div>`)}
      </div>
      <div class="tw-grid">
        <div class="tw-stat glass">${icon('map', 22)}<span><strong id="st-trips">0</strong><small>viagens</small></span></div>
        <div class="tw-stat glass">${icon('compass', 22)}<span><strong id="st-km">0</strong><small>quilómetros</small></span></div>
        <div class="tw-stat glass">${icon('pin', 22)}<span><strong id="st-steps">0</strong><small>paragens</small></span></div>
        <div class="tw-stat glass">${icon('image', 22)}<span><strong id="st-photos">0</strong><small>fotos</small></span></div>
      </div>

      <h3 class="tw-h">Lugar mais longe de casa</h3>
      <div class="tw-far" id="st-far"></div>

      <h3 class="tw-h">Quando é a tua próxima aventura?</h3>
      <div class="tw-night">
        <span class="tw-night__moon"></span>
        <span class="tw-night__star s1"></span><span class="tw-night__star s2"></span><span class="tw-night__star s3"></span>
        <span class="tw-night__star s4"></span><span class="tw-night__star s5"></span><span class="tw-night__star s6"></span>
        <span class="tw-night__shoot"></span>
        <svg class="tw-dunes" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
          <path class="d1" d="M0 70 C80 40 160 60 230 80 S340 30 400 20 V140 H0z"/>
          <path class="d2" d="M0 110 C90 80 200 100 260 120 S360 100 400 95 V140 H0z"/>
        </svg>
        <div class="tw-night__body" id="st-night"></div>
      </div>
      <button class="btn btn--primary btn--block pressable" data-action="nav:go" data-page="menu-nova-viagem">${icon('plus', 16)} Planear nova viagem</button>
    </div>`;
}

function flipDigits(n) {
  return String(n).split('').map((d, i) => html`<span class="flip" style="--k:${i}"><span>${d}</span></span>`);
}

function drawClock() {
  if (!stats) return;
  const { time } = stats;
  const vals = [time.days, time.hours, time.minutes, time.seconds];
  vals.forEach((v, i) => {
    const el = byId(`st-t-${i}`);
    if (el && el.textContent !== String(v)) el.textContent = String(v);
  });
}

export async function drawStats() {
  if (!byId('st-countries')) return;
  const s = computeStats();
  const visited = new Set(s.countries.map((c) => c.code));

  const empty = tripState.trips.filter((t) => tripPhase(t, todayISO()) === 'passada' && !(tripState.allSteps[t.id] || []).length && !(tripState.allPlans[t.id] || []).length);
  render('st-hint', empty.length ? html`
    <div class="tw-hint">
      <strong>Junta paragens às tuas viagens</strong>
      <span>${empty.length === 1 ? 'Tens 1 viagem passada sem paragens.' : `Tens ${empty.length} viagens passadas sem paragens.`} Com paragens ou destinos, entram nas estatísticas.</span>
    </div>` : '');

  countUp('st-countries', s.countries.length);
  countUp('st-world', s.worldPct, { suffix: '%' });
  countUp('st-trips', s.trips);
  countUp('st-km', Math.round(s.km), { format: (v) => Math.round(v).toLocaleString('pt-PT') });
  countUp('st-steps', s.steps);
  countUp('st-photos', s.photos);

  render('st-legend', CONTINENTS.map((c, i) => html`<span class="tw-legend__item ${s.continents.has(i) ? 'is-on' : ''}"><i></i>${c}</span>`));
  render('st-flags', s.countries.length
    ? s.countries.map((c, i) => html`<span class="tw-flag" style="--i:${i}" title="${countryName(c.code)}">${flag(c.code)}</span>`)
    : html`<p class="muted small">Ainda sem bandeiras. Junta paragens com local às viagens ou adiciona países à mão.</p>`);

  // Relógio: se estiveres a viajar agora, os segundos andam.
  drawClock();
  clearInterval(clockTimer);
  if (s.ongoing) {
    clockTimer = setInterval(() => {
      if (currentPage() !== 'page-viagens-stats') { clearInterval(clockTimer); return; }
      computeStats();
      drawClock();
    }, 1000);
  }

  // Lugar mais longe
  const home = tripState.perfil?.casa;
  if (!hasCoords(home)) {
    render('st-far', html`
      <button class="tw-far__setup glass-soft pressable" data-action="tw:home">${icon('home', 22)}<span><strong>Define a tua casa</strong><small>Para saber qual o sítio mais longe onde já estiveste.</small></span></button>`);
  } else if (!s.farthest) {
    render('st-far', html`<p class="muted small">Quando houver paragens com local, mostramos aqui o sítio mais longe de ${home.nome}.</p>`);
  } else {
    const f = s.farthest;
    render('st-far', html`
      <div class="tw-far__bar"><span id="st-far-km">0 km</span></div>
      <div class="tw-far__globe">
        <span class="tw-far__label tw-far__label--home">${icon('home', 16)}<span><strong>${home.nome}</strong><small>${home.pais || ''}</small></span></span>
        <svg class="tw-far__arc" viewBox="0 0 40 200" aria-hidden="true"><path d="M34 6 Q-6 100 34 194"/></svg>
        <canvas id="st-far-globe"></canvas>
        <span class="tw-far__label tw-far__label--far">${icon('pin', 16)}<span><strong>${f.place.nome}</strong><small>${f.place.pais || ''}</small></span></span>
      </div>`);
    countUp('st-far-km', Math.round(f.km), { duration: 1200, format: (v) => formatKm(v) });
    const c = byId('st-far-globe');
    const mid = { lng: (home.lng + f.place.lng) / 2, lat: (home.lat + f.place.lat) / 2 };
    farGlobe?.destroy();
    farGlobe = createGlobe(c, { visited, center: [mid.lng, mid.lat], speed: 0, interactive: false, arc: [home, f.place], markers: [{ ...home, color: '#fff' }, { ...f.place, color: '#F43F5E' }], margin: 4 });
  }

  // Próxima aventura
  let body;
  if (s.ongoing) {
    body = html`<span class="tw-night__lead">Boa viagem!</span><div class="flips">${raw(icon('plane', 30))}</div><span class="tw-night__unit">Estás em ${s.ongoing.nome}</span>`;
  } else if (s.daysSinceTravel != null) {
    body = html`<span class="tw-night__lead">Não viajas há</span><div class="flips">${flipDigits(s.daysSinceTravel)}</div><span class="tw-night__unit">${s.daysSinceTravel === 1 ? 'dia' : 'dias'}</span>
      ${s.next ? html`<span class="tw-night__next">${icon('calendar', 13)} ${s.next.nome} daqui a ${s.daysUntilNext} ${s.daysUntilNext === 1 ? 'dia' : 'dias'}</span>` : ''}`;
  } else if (s.next) {
    body = html`<span class="tw-night__lead">A próxima aventura é daqui a</span><div class="flips">${flipDigits(s.daysUntilNext)}</div><span class="tw-night__unit">${s.daysUntilNext === 1 ? 'dia' : 'dias'}</span>`;
  } else {
    body = html`<span class="tw-night__lead">A primeira aventura está à espera</span><span class="tw-night__unit">Planeia uma viagem!</span>`;
  }
  render('st-night', body);

  // Globo pequeno e mapa-mundo
  const mini = byId('st-mini-globe');
  if (!miniGlobe && mini) miniGlobe = createGlobe(mini, { visited, speed: 0.12, interactive: false, margin: 2 });
  else { miniGlobe?.update({ visited }); miniGlobe?.resume(); }
  try {
    const svg = await worldMapSvg({ continents: s.continents, countries: visited });
    render('st-worldmap', raw(svg));
  } catch {
    render('st-worldmap', html`<p class="muted small">Não foi possível carregar o mapa.</p>`);
  }
}

export async function shareStats() {
  const s = stats || computeStats();
  const text = `As minhas viagens no Ninho: ${s.countries.length} ${s.countries.length === 1 ? 'país' : 'países'} (${s.worldPct}% do mundo), ${s.trips} ${s.trips === 1 ? 'viagem' : 'viagens'} e ${formatKm(s.km)} percorridos. ${s.countries.map((c) => flag(c.code)).join(' ')}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Estatísticas de viagens', text });
    else { await navigator.clipboard.writeText(text); toast('Copiado. Já podes colar onde quiseres.'); }
  } catch { /* partilha cancelada */ }
}

// ---------- Países à mão ----------

export function overviewModalsTpl() {
  return modalTemplate('modal-countries', 'Adicionar países', html`
    <p class="muted small">Países onde já estiveste mas que não estão nas viagens do Ninho.</p>
    <input type="search" id="countries-q" class="input" placeholder="Procurar país…" data-input="tw:countries-search" autocomplete="off">
    <div class="tw-country-list" id="countries-list"></div>`);
}

function drawCountryList() {
  const q = byId('countries-q')?.value || '';
  const extra = new Set(tripState.perfil?.paisesExtra || []);
  const fromTrips = new Set((stats?.countries || []).map((c) => c.code).filter((c) => !extra.has(c)));
  render('countries-list', searchCountries(q, 400).filter((c) => c.code !== 'aq' || q).map((c) => {
    const on = extra.has(c.code) || fromTrips.has(c.code);
    return html`
      <button class="tw-country ${on ? 'is-on' : ''}" data-action="tw:country-toggle" data-code="${c.code}" ${fromTrips.has(c.code) ? 'disabled' : ''}>
        <span class="tw-country__flag">${flag(c.code)}</span><span class="tw-country__name">${c.nome}</span>
        <span class="tw-country__check">${icon('check', 14)}</span>
      </button>`;
  }));
}

async function savePerfil(patch) {
  tripState.perfil = { ...tripState.perfil, ...patch };
  await setDoc(perfilRef(), patch, { merge: true });
}

export const overviewActions = {
  'tw:countries': () => {
    byId('countries-q').value = '';
    drawCountryList();
    openModal('modal-countries');
  },
  'tw:countries-search': () => drawCountryList(),
  'tw:country-toggle': async ({ data }) => {
    const set = new Set(tripState.perfil?.paisesExtra || []);
    if (set.has(data.code)) set.delete(data.code); else set.add(data.code);
    await savePerfil({ paisesExtra: [...set] });
    drawCountryList();
    if (currentPage() === 'page-viagens-stats') drawStats();
  },
  'tw:home': async () => {
    const casa = await pickPlace({ title: 'A tua casa', hint: 'Usada para o "lugar mais longe de casa", os quilómetros e o início das viagens.', placeholder: 'ex: Setúbal' });
    if (!casa) return;
    await savePerfil({ casa });
    toast(`Casa: ${casa.nome}`);
    if (currentPage() === 'page-viagens-stats') drawStats(); else drawOverview();
  },
  'tw:share': () => shareStats(),
};

/** Para limpar ao terminar sessão. */
export function resetOverview() {
  heroGlobe?.destroy(); miniGlobe?.destroy(); farGlobe?.destroy();
  heroGlobe = null; miniGlobe = null; farGlobe = null;
  clearInterval(clockTimer);
  stats = null;
}
