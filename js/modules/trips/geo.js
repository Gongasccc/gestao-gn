// Geografia do diário de viagem: distâncias, pesquisa de locais (OpenStreetMap) e mapa (Leaflet).

const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

export const hasCoords = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

/** Distância em km entre dois pontos { lat, lng } (fórmula de Haversine). */
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ordena paragens por data e hora (as sem data ficam no fim). */
export function sortSteps(steps) {
  return [...steps].sort((a, b) => `${a.data || '9999'} ${a.hora || ''}`.localeCompare(`${b.data || '9999'} ${b.hora || ''}`));
}

/** Distância de cada paragem à anterior com coordenadas, e total. */
export function routeLegs(steps) {
  let prev = null;
  let total = 0;
  const legs = {};
  sortSteps(steps).forEach((s) => {
    const p = s.lugar;
    if (!hasCoords(p)) return;
    if (prev) {
      const km = haversineKm(prev, p);
      legs[s.id] = km;
      total += km;
    }
    prev = p;
  });
  return { legs, total };
}

/** Países distintos visitados (pelo código ISO). */
export function countriesOf(steps) {
  const map = new Map();
  steps.forEach((s) => {
    const code = s.lugar?.paisCode;
    if (code && !map.has(code)) map.set(code, s.lugar.pais || code.toUpperCase());
  });
  return [...map.entries()].map(([code, nome]) => ({ code, nome }));
}

/** Bandeira em emoji a partir do código ISO de 2 letras. */
export function flag(code = '') {
  if (!/^[a-z]{2}$/i.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
}

export function formatKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km).toLocaleString('pt-PT')} km`;
}

/** Converte um resultado do Nominatim no formato guardado em `lugar`. */
export function placeFromNominatim(r) {
  const a = r.address || {};
  const cidade = a.city || a.town || a.village || a.municipality || a.county || '';
  const nome = r.name || cidade || (r.display_name || '').split(',')[0];
  return {
    nome,
    cidade: cidade && cidade !== nome ? cidade : '',
    pais: a.country || '',
    paisCode: (a.country_code || '').toLowerCase(),
    lat: Number(r.lat),
    lng: Number(r.lon),
  };
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchPlaces(q) {
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=pt-PT&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).map(placeFromNominatim);
}

export async function reversePlace(lat, lng) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=pt-PT&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { ...placeFromNominatim(await res.json()), lat, lng };
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Sem geolocalização'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

// ---------- Leaflet (carregado só quando é preciso) ----------

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
let leafletPromise = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `${LEAFLET}/leaflet.js`;
    s.onload = () => resolve(window.L);
    s.onerror = () => { leafletPromise = null; reject(new Error('Leaflet indisponível')); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

export function tileUrl(theme) {
  return theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}

export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
