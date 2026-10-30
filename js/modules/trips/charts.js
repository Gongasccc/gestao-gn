// Gráficos em canvas (linha de gastos diários e donut por categoria) com animação de entrada.
import { pad2 } from '../../core/format.js';

const PALETTE = ['#FF6B00', '#0A84FF', '#30D158', '#BF5AF2', '#FF453A', '#FFD60A', '#64D2FF', '#FF375F'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setupCanvas(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement.clientWidth - 32;
  if (width <= 0) return null;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width, height };
}

function animate(draw, duration = 900) {
  if (reduceMotion()) { draw(1); return; }
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    draw(1 - Math.pow(1 - t, 3));
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function drawDailyLine(canvas, expenses) {
  const setup = setupCanvas(canvas, 160);
  if (!setup) return;
  const { ctx, width, height } = setup;
  const accent = cssVar('--accent') || PALETTE[0];
  const muted = cssVar('--text-muted') || 'rgba(255,255,255,.5)';
  const grid = cssVar('--hairline') || 'rgba(255,255,255,.08)';

  const byDay = {};
  expenses.forEach((e) => {
    const d = new Date(e.timestamp || Date.now());
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    byDay[key] = (byDay[key] || 0) + (Number(e.valor) || 0);
  });
  const days = Object.keys(byDay).sort();
  const values = days.map((d) => byDay[d]);
  const max = Math.max(10, ...values);
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const pts = values.map((v, i) => ({
    x: pad.l + (days.length === 1 ? w / 2 : (i * w) / (days.length - 1)),
    y: pad.t + h - (v / max) * h,
  }));

  animate((p) => {
    ctx.clearRect(0, 0, width, height);
    ctx.font = '10px Poppins, system-ui';
    ctx.fillStyle = muted;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach((f) => {
      const y = pad.t + h - f * h;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
      ctx.fillText(`${Math.round(max * f)}€`, 4, y + 3);
    });
    if (!pts.length) {
      ctx.fillText('Sem dados ainda', pad.l + w / 2 - 36, pad.t + h / 2);
      return;
    }
    days.forEach((d, i) => {
      if (days.length > 7 && i % Math.ceil(days.length / 7)) return;
      const [, m, dd] = d.split('-');
      ctx.fillText(`${dd}/${m}`, pts[i].x - 12, height - 6);
    });

    const visible = Math.max(1, Math.ceil(pts.length * p));
    const shown = pts.slice(0, visible).map((pt) => ({ x: pt.x, y: pad.t + h - (pad.t + h - pt.y) * p }));

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    grad.addColorStop(0, `rgba(${cssVar('--accent-rgb') || '255,107,0'}, .35)`);
    grad.addColorStop(1, `rgba(${cssVar('--accent-rgb') || '255,107,0'}, 0)`);
    ctx.beginPath();
    ctx.moveTo(shown[0].x, pad.t + h);
    shown.forEach((pt) => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(shown[shown.length - 1].x, pad.t + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    shown.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    shown.forEach((pt) => {
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = accent; ctx.fill();
    });
  });
}

export function drawCategoryDonut(canvas, expenses, categoryOf) {
  const setup = setupCanvas(canvas, 170);
  if (!setup) return;
  const { ctx, width, height } = setup;
  const text = cssVar('--text') || '#fff';
  const muted = cssVar('--text-muted') || 'rgba(255,255,255,.5)';

  const byCat = {};
  expenses.forEach((e) => {
    const c = e.categoria || categoryOf(e.desc).nome;
    byCat[c] = (byCat[c] || 0) + (Number(e.valor) || 0);
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = Math.min(90, width / 4) + 10;
  const cy = height / 2;
  const r = Math.min(70, cy - 10);

  animate((p) => {
    ctx.clearRect(0, 0, width, height);
    if (!total) {
      ctx.strokeStyle = muted; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(cx, cy, r - 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = muted; ctx.font = '11px Poppins, system-ui';
      ctx.fillText('Sem dados', cx - 26, cy + 4);
      return;
    }
    let angle = -Math.PI / 2;
    entries.forEach(([, v], i) => {
      const slice = (v / total) * Math.PI * 2 * p;
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.arc(cx, cy, r * 0.62, angle + slice, angle, true);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      angle += slice;
    });
    ctx.fillStyle = text;
    ctx.font = '600 14px Poppins, system-ui';
    const label = `${Math.round(total * p)}€`;
    ctx.fillText(label, cx - ctx.measureText(label).width / 2, cy + 5);

    ctx.font = '11px Poppins, system-ui';
    const lx = cx + r + 24;
    entries.slice(0, 7).forEach(([cat, v], i) => {
      const y = 22 + i * 20;
      ctx.globalAlpha = p;
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.beginPath(); ctx.arc(lx, y - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = text;
      ctx.fillText(`${cat}`, lx + 12, y);
      ctx.fillStyle = muted;
      const val = `${v.toFixed(0)}€`;
      ctx.fillText(val, width - ctx.measureText(val).width - 4, y);
      ctx.globalAlpha = 1;
    });
  });
}
