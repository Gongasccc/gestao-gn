// Delegação de eventos: em vez de onclick="..." e funções em window,
// os elementos declaram data-action / data-change / data-input / data-enter
// e os módulos registam os handlers pelo nome.

const handlers = new Map();

export function registerActions(actions = {}) {
  for (const [name, fn] of Object.entries(actions)) {
    if (handlers.has(name)) console.warn(`[events] ação duplicada: ${name}`);
    handlers.set(name, fn);
  }
}

function dispatch(ev, attr) {
  const el = ev.target.closest(`[${attr}]`);
  if (!el) return;
  const name = el.getAttribute(attr);
  const fn = handlers.get(name);
  if (!fn) {
    console.warn(`[events] sem handler para ${attr}="${name}"`);
    return;
  }
  if (attr === 'data-action' && el.tagName === 'A' && !el.hasAttribute('href')) ev.preventDefault();
  Promise.resolve(fn({ el, ev, data: el.dataset, value: el.value })).catch((err) => {
    console.error(`[events] erro em ${name}`, err);
    import('./ui.js').then(({ toast }) => toast('Ocorreu um erro. Tenta novamente.', 'error'));
  });
}

export function initEvents() {
  document.addEventListener('click', (ev) => dispatch(ev, 'data-action'));
  document.addEventListener('change', (ev) => dispatch(ev, 'data-change'));
  document.addEventListener('input', (ev) => dispatch(ev, 'data-input'));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && ev.target.matches('[data-enter]')) {
      ev.preventDefault();
      dispatch(ev, 'data-enter');
    }
  });
}
