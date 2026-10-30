// Tema claro/escuro. A cor de destaque é sempre o amarelo da app (sem escolha de cores).

export const DEFAULT_ACCENT = '#FFD60A';

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* modo privado */ }
}
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f3ef' : '#07070a');
  store('gn-theme', t);
  return t;
}

export function applyAccent(color = DEFAULT_ACCENT) {
  const [r, g, b] = hexToRgb(color);
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  root.setProperty('--on-accent', luminance > 0.6 ? '#141414' : '#ffffff');
}

export const currentTheme = () => document.documentElement.dataset.theme || 'dark';

export function restoreThemeFromCache() {
  applyTheme(read('gn-theme') || 'dark');
  applyAccent(DEFAULT_ACCENT);
}
