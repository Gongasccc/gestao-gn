// Estado global mínimo da sessão + um pequeno event bus para comunicação entre módulos.

export const session = {
  uid: null,
  name: '',
  avatar: '',
  profile: {},
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => fn(payload));
}

/** Agrupa funções de unsubscribe (Firestore onSnapshot, timers...) para limpar de uma vez. */
export function createScope() {
  let fns = [];
  return {
    add(fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
    clear() { fns.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); fns = []; },
  };
}
