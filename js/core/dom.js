// Helpers de DOM e templates seguros.
// `html` escapa automaticamente todos os valores interpolados (proteção contra XSS).
// Para inserir HTML já confiável (ícones, outros templates) usa `raw()` ou outro `html`.

class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const raw = (value) => new SafeHTML(String(value ?? ''));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"'`]/g, (c) => ESCAPES[c]);

function renderValue(value) {
  if (value == null || value === false) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => { out += str + (i < values.length ? renderValue(values[i]) : ''); });
  return new SafeHTML(out);
}

export const byId = (id) => document.getElementById(id);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Substitui o conteúdo de um elemento e anima a entrada dos filhos em cascata. */
export function render(target, content, { stagger = false } = {}) {
  const el = typeof target === 'string' ? byId(target) : target;
  if (!el) return null;
  el.innerHTML = Array.isArray(content) ? content.map(String).join('') : String(content ?? '');
  if (stagger) staggerChildren(el);
  return el;
}

export function staggerChildren(el, step = 40) {
  Array.from(el.children).forEach((child, i) => {
    child.style.setProperty('--i', i);
    child.style.setProperty('--stagger-step', `${step}ms`);
    child.classList.add('anim-rise');
  });
}

export function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text ?? '';
}

export function show(id, visible = true, display = '') {
  const el = typeof id === 'string' ? byId(id) : id;
  if (el) el.style.display = visible ? display : 'none';
}

/** Anima um número de 0 (ou do valor atual) até `to`. */
export function countUp(id, to, { decimals = 0, suffix = '', duration = 700, format } = {}) {
  const fmt = format || ((v) => v.toFixed(decimals) + suffix);
  const el = byId(id);
  if (!el) return;
  const from = parseFloat(el.dataset.value || '0') || 0;
  el.dataset.value = to;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function emptyState(text, iconSvg = '') {
  return html`<div class="empty-state">${raw(iconSvg)}<p>${text}</p></div>`;
}
