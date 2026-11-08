// Estado global mínimo da sessão + um pequeno event bus para comunicação entre módulos.

export const session = {
  uid: null,
  name: '',
  avatar: '',
  profile: {},
  /** Grupo ativo (família, amigos, casal...). null = só eu (espaço pessoal). */
  householdId: null,
  /** Todos os grupos de que faço parte (ids). */
  householdIds: [],
  /** Resumo dos meus grupos para o seletor: [{ id, name, tipo, n }] */
  grupos: [],
  /** { id, name, tipo, members: [uid], ownerUid, inviteCode, ligacoes, ... } */
  household: null,
  /** Perfis dos membros do grupo ativo: [{ uid, name, avatar }] */
  members: [],
};

/** Nome curto de um membro do grupo (ou "Eu"). */
export function memberName(uid, { short = true } = {}) {
  if (!uid) return '';
  const m = session.members.find((x) => x.uid === uid);
  const name = m?.name || (uid === session.uid ? session.name : 'Membro');
  return short ? name.split(' ')[0] : name;
}

/** uid de outro membro do grupo, se existir (o primeiro que não sou eu). */
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
