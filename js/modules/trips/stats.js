// Estatísticas de viagens (funções puras, testadas em tests/viagens-stats.test.mjs).
import { hasCoords, haversineKm, sortSteps } from './geo.js';
import { continentOf, worldPercent } from './countries.js';

const DAY_MS = 86400000;
const toDate = (iso) => new Date(`${iso}T00:00:00`);
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);
export const addDaysISO = (iso, n) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Destinos do plano ordenados, com as datas calculadas a partir do início da viagem e das noites. */
export function planWithDates(trip, destinos = []) {
  const list = [...destinos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  let cursor = trip?.dataInicio || '';
  return list.map((d) => {
    const noites = Math.max(0, Number(d.noites) || 0);
    const inicio = cursor;
    const fim = cursor ? addDaysISO(cursor, noites) : '';
    cursor = fim;
    return { ...d, noites, inicio, fim };
  });
}

/** Noites da viagem (pelas datas) e noites já distribuídas pelos destinos. */
export function nightsSummary(trip, destinos = []) {
  const total = trip?.dataInicio && trip?.dataFim ? Math.max(0, diffDays(trip.dataInicio, trip.dataFim)) : null;
  const planeadas = destinos.reduce((s, d) => s + (Math.max(0, Number(d.noites) || 0)), 0);
  return { total, planeadas };
}

/** Estado temporal de uma viagem. */
export function tripPhase(trip, today) {
  const ini = trip?.dataInicio;
  const fim = trip?.dataFim || ini;
  if (!ini) return 'sem-datas';
  if (ini > today) return 'futura';
  if (fim >= today) return 'a-decorrer';
  return 'passada';
}

/**
 * Lugares por onde já se passou numa viagem: paragens do diário (até hoje) e,
 * quando o diário não tem locais, os destinos do plano cujo início já passou.
 */
export function visitedPlaces(trip, steps = [], destinos = [], today) {
  const fromSteps = sortSteps(steps).filter((s) => hasCoords(s.lugar) && (!s.data || s.data <= today)).map((s) => s.lugar);
  if (fromSteps.length) return fromSteps;
  const phase = tripPhase(trip, today);
  if (phase === 'futura') return [];
  return planWithDates(trip, destinos).filter((d) => hasCoords(d.lugar) && (!d.inicio || d.inicio <= today)).map((d) => d.lugar);
}

function routeKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i += 1) km += haversineKm(points[i - 1], points[i]);
  return km;
}

/**
 * Todas as estatísticas do perfil de viagens.
 * trips: viagens; stepsByTrip/planByTrip: { [tripId]: [] }; extraCountries: códigos ISO2 juntados à mão;
 * home: { lat, lng, ... } (casa); today: 'AAAA-MM-DD'; now: ms.
 */
export function travelStats({ trips = [], stepsByTrip = {}, planByTrip = {}, extraCountries = [], home = null, today, now = Date.now() }) {
  const countries = new Map();
  const continents = new Set();
  const points = [];
  let km = 0;
  let ms = 0;
  let steps = 0;
  let photos = 0;
  let started = 0;
  let lastEnd = null;
  let ongoing = null;
  let next = null;

  trips.forEach((t) => {
    const tSteps = stepsByTrip[t.id] || [];
    const tPlan = planByTrip[t.id] || [];
    const phase = tripPhase(t, today);
    const pastSteps = tSteps.filter((s) => !s.data || s.data <= today);
    const visited = visitedPlaces(t, tSteps, tPlan, today);
    const hasPast = phase === 'passada' || phase === 'a-decorrer' || pastSteps.length > 0;

    if (phase === 'futura' && (!next || t.dataInicio < next.dataInicio)) next = t;
    if (phase === 'a-decorrer') ongoing = t;
    if (!hasPast) return;
    started += 1;
    steps += pastSteps.length;
    photos += pastSteps.reduce((n, s) => n + (s.fotos?.length || (s.foto ? 1 : 0)), 0);

    visited.forEach((p) => {
      points.push(p);
      if (p.paisCode) countries.set(p.paisCode.toLowerCase(), p.pais || p.paisCode.toUpperCase());
    });

    const origin = hasCoords(t.origem) ? t.origem : hasCoords(home) ? home : null;
    const route = origin ? [origin, ...visited] : [...visited];
    if (origin && phase === 'passada' && visited.length) route.push(origin);
    km += routeKm(route);

    if (t.dataInicio) {
      const fim = t.dataFim && t.dataFim >= t.dataInicio ? t.dataFim : t.dataInicio;
      if (phase === 'a-decorrer') {
        const midnight = toDate(today).getTime();
        ms += diffDays(t.dataInicio, today) * DAY_MS + Math.max(0, now - midnight);
      } else {
        ms += (diffDays(t.dataInicio, fim) + 1) * DAY_MS;
      }
      if (phase === 'passada' && (!lastEnd || fim > lastEnd)) lastEnd = fim;
    }
  });

  extraCountries.forEach((c) => { if (c && !countries.has(c.toLowerCase())) countries.set(c.toLowerCase(), c.toUpperCase()); });
  countries.forEach((_, code) => { const k = continentOf(code); if (k >= 0) continents.add(k); });

  let farthest = null;
  if (hasCoords(home)) {
    points.forEach((p) => {
      const d = haversineKm(home, p);
      if (!farthest || d > farthest.km) farthest = { place: p, km: d };
    });
  }

  const totalSec = Math.floor(ms / 1000);
  return {
    countries: [...countries.entries()].map(([code, nome]) => ({ code, nome })),
    continents,
    worldPct: worldPercent(countries.size),
    trips: started,
    km,
    steps,
    photos,
    time: {
      ms,
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
    },
    farthest,
    points,
    ongoing,
    next,
    daysUntilNext: next ? diffDays(today, next.dataInicio) : null,
    daysSinceTravel: ongoing ? 0 : lastEnd ? diffDays(lastEnd, today) : null,
  };
}
