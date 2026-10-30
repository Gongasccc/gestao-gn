// Estado global mínimo da sessão + um pequeno event bus para comunicação entre módulos.

export const session = {
  uid: null,
  name: '',
  avatar: '',
  profile: {},
  householdId: null,
  /** { id, name, members: [uid], ownerUid, inviteCode, ... } */
  household: null,
  /** Perfis dos membros do casal: [{ uid, name, avatar }] */
  members: [],
};

/** Nome curto de um membro do casal (ou "Eu"). */
export function memberName(uid, { short = true } = {}) {
  if (!uid) return '';
  const m = session.members.find((x) => x.uid === uid);
  const name = m?.name || (uid === session.uid ? session.name : 'Parceiro(a)');
  return short ? name.split(' ')[0] : name;
}

/** uid do outro membro do casal, se existir. */
export const partnerUid = () => session.members.find((m) => m.uid !== session.uid)?.uid || null;

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
