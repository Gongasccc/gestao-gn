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
  const place = {
    nome,
    cidade: cidade && cidade !== nome ? cidade : '',
    pais: a.country || '',
    paisCode: (a.country_code || '').toLowerCase(),
    lat: Number(r.lat),
    lng: Number(r.lon),
  };
  if (r.category) place.tipo = `${r.category}:${r.type || ''}`;
  return place;
}

/** Categoria legível de um sítio (spot), a partir do tipo do OpenStreetMap. */
export function spotCategory(tipo = '') {
  const [cat, type] = String(tipo).split(':');
  const T = {
    museum: 'Museu', gallery: 'Galeria', viewpoint: 'Miradouro', attraction: 'Atração', zoo: 'Zoo', theme_park: 'Parque temático',
    aquarium: 'Aquário', artwork: 'Arte', restaurant: 'Restaurante', cafe: 'Café', bar: 'Bar', pub: 'Bar', fast_food: 'Comida rápida',
    ice_cream: 'Gelataria', place_of_worship: 'Igreja / templo', castle: 'Castelo', monument: 'Monumento', memorial: 'Memorial',
    ruins: 'Ruínas', archaeological_site: 'Sítio arqueológico', park: 'Parque', garden: 'Jardim', beach: 'Praia', peak: 'Montanha',
    hotel: 'Alojamento', hostel: 'Alojamento', guest_house: 'Alojamento', marketplace: 'Mercado', theatre: 'Teatro', cinema: 'Cinema',
    station: 'Estação', aerodrome: 'Aeroporto', square: 'Praça', city: 'Cidade', town: 'Vila', village: 'Aldeia',
  };
  if (T[type]) return T[type];
  const C = { historic: 'Histórico', tourism: 'Turismo', natural: 'Natureza', leisure: 'Lazer', shop: 'Compras', amenity: 'Serviço', place: 'Local' };
  return C[cat] || '';
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchPlaces(q, { near = null } = {}) {
  let url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=pt-PT&q=${encodeURIComponent(q)}`;
  // Perto de um destino: dá prioridade a resultados nessa zona (sem excluir os outros).
  if (hasCoords(near)) url += `&viewbox=${near.lng - 0.35},${near.lat + 0.25},${near.lng + 0.35},${near.lat - 0.25}`;
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

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/**
 * Sítios populares perto de um ponto (OpenStreetMap / Overpass): monumentos, museus, miradouros…
 * Os que têm artigo na Wikipédia aparecem primeiro (são normalmente os mais conhecidos).
 */
export async function discoverSpots(center, radius = 5000) {
  if (!hasCoords(center)) return [];
  const a = `(around:${radius},${center.lat},${center.lng})`;
  const q = `[out:json][timeout:20];(
    nwr${a}[tourism~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"][name];
    nwr${a}[historic~"^(monument|castle|memorial|ruins|archaeological_site|fort|palace)$"][name];
    nwr${a}[natural=beach][name];
    nwr${a}[leisure~"^(park|garden)$"][name][wikidata];
  );out center tags 80;`;
  const res = await fetch(OVERPASS, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const seen = new Set();
  return (json.elements || [])
    .map((e) => {
      const t = e.tags || {};
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      const key = t.tourism ? 'tourism' : t.historic ? 'historic' : t.natural ? 'natural' : 'leisure';
      return {
        nome: t['name:pt'] || t.name,
        lat: Number(lat),
        lng: Number(lng),
        tipo: `${key}:${t[key]}`,
        fama: (t.wikipedia || t.wikidata ? 2 : 0) + (t.tourism === 'attraction' || t.tourism === 'museum' ? 1 : 0),
        dist: haversineKm(center, { lat: Number(lat), lng: Number(lng) }),
      };
    })
    .filter((p) => p.nome && hasCoords(p) && !seen.has(p.nome) && seen.add(p.nome))
    .sort((x, y) => y.fama - x.fama || x.dist - y.dist)
    .slice(0, 24);
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

export const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const SATELLITE_ATTRIBUTION = 'Imagens &copy; Esri, Maxar, Earthstar Geographics';

/** Pontos de um arco suave entre a e b (para trajetos de avião no mapa). */
export function arcPoints(a, b, n = 24) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const bend = 0.18;
  const cx = (a.lng + b.lng) / 2 - dy * bend;
  const cy = (a.lat + b.lat) / 2 + dx * bend;
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const lng = (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * cx + t ** 2 * b.lng;
    const lat = (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * cy + t ** 2 * b.lat;
    out.push([lat, lng]);
  }
  return out;
}

/** Meios de transporte (como se chegou a uma paragem). */
export const TRANSPORTS = [
  { id: 'carro', label: 'Carro', icon: 'car' },
  { id: 'aviao', label: 'Avião', icon: 'plane' },
  { id: 'comboio', label: 'Comboio', icon: 'train' },
  { id: 'autocarro', label: 'Autocarro', icon: 'bus' },
  { id: 'barco', label: 'Barco', icon: 'boat' },
  { id: 'a-pe', label: 'A pé', icon: 'walk' },
  { id: 'bicicleta', label: 'Bicicleta', icon: 'bike' },
];
export const transportOf = (id) => TRANSPORTS.find((t) => t.id === id) || null;

export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
