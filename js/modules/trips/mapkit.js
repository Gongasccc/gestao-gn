// Utilitários partilhados pelos mapas Leaflet das Viagens (plano, diário e destino).
import { currentTheme } from '../../core/theme.js';
import { loadLeaflet, tileUrl, TILE_ATTRIBUTION, SATELLITE_URL, SATELLITE_ATTRIBUTION } from './geo.js';

/** Estado de um mapa: { map, tiles, theme, sat, layer } */
export const newMapState = () => ({ map: null, tiles: null, theme: null, sat: false, layer: null, markers: {} });

/**
 * Garante um mapa Leaflet dentro de `el` (cria ou reaproveita) com o fundo certo.
 * Devolve L, ou null se o Leaflet não carregar.
 */
export async function ensureMap(ms, el, { zoom = true, scroll = false, dragging = true } = {}) {
  let L;
  try { L = await loadLeaflet(); } catch { return null; }
  if (!ms.map || ms.map.getContainer() !== el) {
    if (ms.map) ms.map.remove();
    ms.map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: scroll, dragging, tap: true });
    if (zoom) L.control.zoom({ position: 'bottomright' }).addTo(ms.map);
    ms.layer = L.layerGroup().addTo(ms.map);
    ms.tiles = null;
  }
  const theme = currentTheme();
  const key = ms.sat ? 'sat' : theme;
  if (!ms.tiles || ms.theme !== key) {
    if (ms.tiles) ms.tiles.remove();
    ms.tiles = ms.sat
      ? L.tileLayer(SATELLITE_URL, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 18 })
      : L.tileLayer(tileUrl(theme), { attribution: TILE_ATTRIBUTION, maxZoom: 19, subdomains: 'abcd' });
    ms.tiles.addTo(ms.map);
    ms.theme = key;
  }
  el.classList.toggle('is-satellite', ms.sat);
  ms.map.invalidateSize();
  return L;
}

export function resetMapState(ms) {
  if (ms.map) ms.map.remove();
  Object.assign(ms, newMapState());
}

/** Desenha a linha aos poucos (efeito de rota a ser traçada). */
export function animateLine(polyline, duration = 1400, delay = 0) {
  const p = polyline?._path || polyline?.getElement?.();
  if (!p || typeof p.getTotalLength !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const len = p.getTotalLength();
  if (!len) return;
  p.style.transition = 'none';
  p.style.strokeDasharray = `${len} ${len}`;
  p.style.strokeDashoffset = String(len);
  p.getBoundingClientRect();
  p.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.4,0,.2,1) ${delay}ms`;
  p.style.strokeDashoffset = '0';
  setTimeout(() => {
    // Ao acabar, volta ao estilo normal (para continuar a funcionar ao fazer zoom).
    p.style.strokeDasharray = '';
    p.style.strokeDashoffset = '';
    p.style.transition = '';
  }, duration + delay + 60);
}

export function fitTo(ms, pts, { maxZoom = 12, padding = 36 } = {}) {
  if (!ms.map || !pts.length) return;
  if (pts.length === 1) ms.map.setView(pts[0], Math.min(maxZoom, 11));
  else ms.map.fitBounds(pts, { padding: [padding, padding], maxZoom });
}
