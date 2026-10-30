// Tema claro/escuro e cor de destaque. Guardado também em localStorage para evitar "flash" ao abrir a app.

export const ACCENTS = ['#FF6B00', '#FF3B30', '#28CD41', '#007AFF', '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00', '#5856D6', '#2ECC71'];
export const DEFAULT_ACCENT = '#FF6B00';

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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f1ee' : '#0b0b0f');
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
  store('gn-accent', color);
}

export const currentTheme = () => document.documentElement.dataset.theme || 'dark';

export function restoreThemeFromCache() {
  applyTheme(read('gn-theme') || 'dark');
  applyAccent(read('gn-accent') || DEFAULT_ACCENT);
}
