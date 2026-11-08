// Globo 3D (canvas) e mapa-mundo (SVG) das viagens.
// d3-geo + topojson e o mapa dos países ficam em assets/vendor (funcionam offline, sem CDN).
import { countryByNumeric } from './countries.js';

const VENDOR = 'assets/vendor';
let worldPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Falhou ${src}`));
    document.head.appendChild(s);
  });
}

/** Carrega (uma vez) as bibliotecas e os contornos dos países. */
export function loadWorld() {
  if (worldPromise) return worldPromise;
  worldPromise = (async () => {
    if (!window.d3?.geoPath) {
      await loadScript(`${VENDOR}/d3-array.min.js`);
      await loadScript(`${VENDOR}/d3-geo.min.js`);
    }
    if (!window.topojson) await loadScript(`${VENDOR}/topojson-client.min.js`);
    const topo = await (await fetch(`${VENDOR}/countries-110m.json`)).json();
    const fc = window.topojson.feature(topo, topo.objects.countries);
    fc.features.forEach((f) => {
      const c = countryByNumeric(f.id);
      f.properties.code = c?.code || '';
      f.properties.continente = c ? c.continente : (f.properties.name === 'Kosovo' || f.properties.name === 'N. Cyprus' ? 0 : -1);
      if (f.properties.name === 'Somaliland') f.properties.continente = 2;
    });
    const borders = window.topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    return { d3: window.d3, features: fc.features, borders };
  })().catch((e) => { worldPromise = null; throw e; });
  return worldPromise;
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Globo que roda sozinho, pode ser arrastado e mostra fotos/pinos sobre os sítios visitados.
 * opts: { visited: Set<código ISO2>, markers: [{ lat, lng, img?, label? }], bubbles: elemento para as fotos,
 *         arc: [{lat,lng},{lat,lng}] (linha animada), center: [lng, lat], speed, interactive, palette }
 */
export function createGlobe(canvas, opts = {}) {
  const state = {
    visited: opts.visited || new Set(),
    markers: opts.markers || [],
    arc: opts.arc || null,
    rotate: [-(opts.center?.[0] ?? 0), -(opts.center?.[1] ?? 25), 0],
    target: null,
    speed: opts.speed ?? 0.06,
    dragging: false,
    idleUntil: 0,
    vel: [0, 0],
    running: false,
    raf: 0,
    born: performance.now(),
    data: null,
  };
  // Começa ligeiramente rodado e "chega" ao centro (animação de entrada).
  const startRotate = [...state.rotate];
  state.rotate[0] -= 70;
  state.target = { from: [...state.rotate], to: startRotate, t0: performance.now(), dur: 1400 };

  const ctx = canvas.getContext('2d');
  let d3;
  let projection;
  let path;
  let graticule;
  let size = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(10, Math.min(rect.width, rect.height));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    if (projection) {
      projection.translate([rect.width / 2, rect.height / 2]).scale(size / 2 - (opts.margin ?? 6));
    }
  }

  function bubblePositions() {
    const host = opts.bubbles;
    if (!host) return;
    const c = [-state.rotate[0], -state.rotate[1]];
    host.querySelectorAll('[data-lng]').forEach((el) => {
      const ll = [Number(el.dataset.lng), Number(el.dataset.lat)];
      const visible = d3.geoDistance(ll, c) < Math.PI / 2 - 0.12;
      const [x, y] = projection(ll);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${visible ? 1 : 0.4})`;
      el.style.opacity = visible ? '1' : '0';
    });
  }

  function draw(now) {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    projection.rotate(state.rotate);
    const [cx, cy] = projection.translate();
    const r = projection.scale();
    const pal = opts.palette || {};

    // Atmosfera
    const glow = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.14);
    glow.addColorStop(0, pal.glow || 'rgba(16,185,129,.45)');
    glow.addColorStop(1, 'rgba(16,185,129,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2); ctx.fill();

    // Oceano
    const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    ocean.addColorStop(0, pal.ocean1 || '#21628a');
    ocean.addColorStop(1, pal.ocean2 || '#0a2238');
    ctx.fillStyle = ocean;
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();

    ctx.beginPath(); path(graticule);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 0.6; ctx.stroke();

    // Terra e países visitados
    ctx.beginPath();
    state.data.features.forEach((f) => { if (!state.visited.has(f.properties.code)) path(f); });
    ctx.fillStyle = pal.land || '#5f9479';
    ctx.fill();
    if (state.visited.size) {
      ctx.beginPath();
      state.data.features.forEach((f) => { if (state.visited.has(f.properties.code)) path(f); });
      const pulse = 0.85 + 0.15 * Math.sin(now / 700);
      ctx.fillStyle = pal.visited || `rgba(52, 211, 153, ${pulse})`;
      ctx.fill();
    }
    ctx.beginPath(); path(state.data.borders);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.5; ctx.stroke();

    // Arco (casa -> lugar mais longe)
    if (state.arc) {
      const [a, b] = state.arc;
      const interp = d3.geoInterpolate([a.lng, a.lat], [b.lng, b.lat]);
      const prog = reduceMotion() ? 1 : Math.min(1, (now - state.born - 500) / 1400);
      if (prog > 0) {
        const pts = [];
        for (let i = 0; i <= 48 * prog; i += 1) pts.push(interp(i / 48));
        pts.push(interp(prog));
        ctx.beginPath(); path({ type: 'LineString', coordinates: pts });
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Pinos simples
    state.markers.filter((m) => !m.img).forEach((m) => {
      const ll = [m.lng, m.lat];
      if (d3.geoDistance(ll, [-state.rotate[0], -state.rotate[1]]) > Math.PI / 2) return;
      const [x, y] = projection(ll);
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = m.color || '#fff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = pal.pinRing || '#10B981'; ctx.stroke();
    });

    // Luz: lado iluminado e sombra
    const shade = ctx.createRadialGradient(cx - r * 0.45, cy - r * 0.5, r * 0.05, cx, cy, r * 1.02);
    shade.addColorStop(0, 'rgba(255,255,255,.16)');
    shade.addColorStop(0.55, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = shade;
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();

    bubblePositions();
  }

  function frame(now) {
    if (!state.running) return;
    if (!canvas.isConnected || !canvas.offsetParent) { state.running = false; return; }
    if (state.target) {
      const t = Math.min(1, (now - state.target.t0) / state.target.dur);
      const e = reduceMotion() ? 1 : easeOut(t);
      state.rotate[0] = state.target.from[0] + (state.target.to[0] - state.target.from[0]) * e;
      state.rotate[1] = state.target.from[1] + (state.target.to[1] - state.target.from[1]) * e;
      if (t >= 1) state.target = null;
    } else if (!state.dragging) {
      if (Math.abs(state.vel[0]) > 0.01 || Math.abs(state.vel[1]) > 0.01) {
        state.rotate[0] += state.vel[0];
        state.rotate[1] = Math.max(-70, Math.min(70, state.rotate[1] + state.vel[1]));
        state.vel = [state.vel[0] * 0.94, state.vel[1] * 0.94];
      } else if (now > state.idleUntil && state.speed && !reduceMotion()) {
        state.rotate[0] += state.speed;
      }
    }
    draw(now);
    state.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (state.running || !state.data) return;
    resize();
    state.running = true;
    state.raf = requestAnimationFrame(frame);
  }

  // Arrastar para rodar
  if (opts.interactive !== false) {
    let last = null;
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', (e) => {
      state.dragging = true;
      state.target = null;
      last = [e.clientX, e.clientY];
      state.vel = [0, 0];
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!state.dragging || !last) return;
      const k = 70 / (projection?.scale() || 150);
      const dx = (e.clientX - last[0]) * k;
      const dy = (e.clientY - last[1]) * k;
      state.rotate[0] += dx;
      state.rotate[1] = Math.max(-70, Math.min(70, state.rotate[1] - dy));
      state.vel = [dx, -dy];
      last = [e.clientX, e.clientY];
    });
    const up = () => { state.dragging = false; last = null; state.idleUntil = performance.now() + 2500; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);

  const ready = loadWorld().then((data) => {
    d3 = data.d3;
    state.data = data;
    projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
    path = d3.geoPath(projection, ctx);
    graticule = d3.geoGraticule10();
    start();
  });

  return {
    ready,
    /** Volta a animar (ex.: ao regressar à página). */
    resume() { state.born = performance.now() - 2000; start(); },
    update(next = {}) {
      if (next.visited) state.visited = next.visited;
      if (next.markers) state.markers = next.markers;
      if ('arc' in next) { state.arc = next.arc; state.born = performance.now(); }
      start();
    },
    /** Roda suavemente até um ponto [lng, lat]. */
    focus([lng, lat], dur = 1200) {
      state.target = { from: [...state.rotate], to: [-lng, -lat], t0: performance.now(), dur };
      state.idleUntil = performance.now() + dur + 3000;
      start();
    },
    destroy() { state.running = false; cancelAnimationFrame(state.raf); ro?.disconnect(); },
  };
}

/**
 * Mapa-mundo em SVG com os continentes visitados destacados (e os países, mais fortes).
 * Devolve uma string SVG.
 */
export async function worldMapSvg({ continents = new Set(), countries = new Set() } = {}) {
  const { d3, features } = await loadWorld();
  const W = 960;
  const H = 470;
  const projection = d3.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
  const path = d3.geoPath(projection);
  const paths = features.map((f) => {
    const { code, continente } = f.properties;
    const cls = countries.has(code) ? 'wm-country is-visited' : continents.has(continente) ? 'wm-country is-continent' : 'wm-country';
    const delay = continents.has(continente) ? Math.round(Math.random() * 500) : 0;
    return `<path class="${cls}" style="--d:${delay}ms" d="${path(f)}"><title>${f.properties.name}</title></path>`;
  }).join('');
  return `<svg class="world-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa-mundo com os continentes visitados">${paths}</svg>`;
}

/** Paleta do globo de acordo com o tema atual (cartões claros/escuros). */
export function globePalette() {
  const accent = cssVar('--accent', '#10B981');
  return { pinRing: accent };
}
