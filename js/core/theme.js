// Tema claro/escuro. A cor de destaque é o verde esmeralda, definido por tema em css/tokens.css.

export const DEFAULT_ACCENT = '#10B981';
const THEME_COLOR = { dark: '#0F172A', light: '#F8FAFC' };

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* modo privado */ }
}
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t]);
  store('gn-theme', t);
  return t;
}

/** Mantido por compatibilidade: a cor vem dos tokens; limpa cores antigas guardadas em linha. */
export function applyAccent() {
  const root = document.documentElement.style;
  ['--accent', '--accent-rgb', '--on-accent'].forEach((p) => root.removeProperty(p));
}

export const currentTheme = () => document.documentElement.dataset.theme || 'dark';

export const toggleTheme = () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light');

export function restoreThemeFromCache() {
  applyTheme(read('gn-theme') || 'dark');
  applyAccent();
}
