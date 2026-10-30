// Casal (household): o espaço partilhado pelos dois membros.
// artifacts/{APP_ID}/households/{hid} com subcoleções por funcionalidade (tarefas, finanças, ...).
import {
  db, doc, getDoc, setDoc, updateDoc, getDocs, deleteDoc, onSnapshot, writeBatch,
  arrayUnion, arrayRemove, serverTimestamp,
} from './firebase.js';
import {
  profileDoc, householdsCol, householdDoc, householdDocOf, inviteDoc, userColOf,
} from './paths.js';
import { session, emit } from '../core/state.js';

/** Coleções que eram pessoais e passam a ser do casal. As subcoleções listadas também são copiadas. */
const MIGRATE = {
  tarefas: [],
  semanais: [],
  rapidas: [],
  supermercados: [],
  documentos: [],
  pastas_docs: [],
  carros: ['documentos', 'pastas'],
  livros_receitas: ['itens'],
  farmacia: [],
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(len = 6) {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function loadMembers(uids) {
  const snaps = await Promise.all(uids.map((uid) => getDoc(profileDoc(uid)).catch(() => null)));
  return snaps.map((s, i) => {
    const p = s?.exists() ? s.data() : {};
    return { uid: uids[i], name: p.username || 'Utilizador', avatar: p.avatarUrl || '' };
  });
}

/** Carrega o casal do perfil para a sessão (chamado no login). */
export async function loadHousehold(profile) {
  session.householdId = profile?.householdId || null;
  session.household = null;
  session.members = [{ uid: session.uid, name: session.name, avatar: session.avatar }];
  if (!session.householdId) return null;
  try {
    const snap = await getDoc(householdDoc());
    if (!snap.exists() || !snap.data().members?.includes(session.uid)) {
      session.householdId = null;
      return null;
    }
    session.household = { id: snap.id, ...snap.data() };
    session.members = await loadMembers(session.household.members);
    return session.household;
  } catch (err) {
    console.error('[household] load', err);
    session.householdId = null;
    return null;
  }
}

/** Mantém a sessão atualizada quando o outro membro entra ou sai. */
export function watchHousehold(scope) {
  if (!session.householdId) return;
  scope.add(onSnapshot(householdDoc(), async (s) => {
    if (!s.exists()) return;
    const prev = session.household?.members?.join(',');
    session.household = { id: s.id, ...s.data() };
    if (prev !== session.household.members.join(',')) {
      session.members = await loadMembers(session.household.members);
    }
    emit('household:update', session.household);
  }));
}

export async function createHousehold(name) {
  const ref = doc(householdsCol());
  const code = newCode();
  await setDoc(ref, {
    name: name || 'O nosso casal',
    ownerUid: session.uid,
    members: [session.uid],
    inviteCode: code,
    createdAt: serverTimestamp(),
  });
  await setDoc(inviteDoc(code), { householdId: ref.id, createdBy: session.uid, createdAt: serverTimestamp() });
  await setDoc(profileDoc(), { householdId: ref.id }, { merge: true });
  session.profile.householdId = ref.id;
  await migratePersonalData(ref.id);
  return ref.id;
}

export async function joinHousehold(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new Error('O código tem 6 caracteres.');
  const inv = await getDoc(inviteDoc(code));
  if (!inv.exists()) throw new Error('Código inválido ou já usado.');
  const hid = inv.data().householdId;
  try {
    await updateDoc(householdDocOf(hid), { members: arrayUnion(session.uid), joinCode: code });
  } catch {
    throw new Error('Este casal já está completo ou o código expirou.');
  }
  await setDoc(profileDoc(), { householdId: hid }, { merge: true });
  session.profile.householdId = hid;
  // O convite deixa de servir depois de usado.
  await updateDoc(householdDocOf(hid), { inviteCode: null, joinCode: null });
  await deleteDoc(inviteDoc(code)).catch(() => {});
  await migratePersonalData(hid);
  return hid;
}

export async function newInviteCode() {
  const old = session.household?.inviteCode;
  const code = newCode();
  await setDoc(inviteDoc(code), { householdId: session.householdId, createdBy: session.uid, createdAt: serverTimestamp() });
  await updateDoc(householdDoc(), { inviteCode: code });
  if (old) await deleteDoc(inviteDoc(old)).catch(() => {});
  return code;
}

export const renameHousehold = (name) => updateDoc(householdDoc(), { name });

export async function leaveHousehold() {
  const hid = session.householdId;
  if (session.household?.inviteCode) await deleteDoc(inviteDoc(session.household.inviteCode)).catch(() => {});
  await updateDoc(householdDocOf(hid), { members: arrayRemove(session.uid) });
  await setDoc(profileDoc(), { householdId: null }, { merge: true });
  session.profile.householdId = null;
}

/** Copia users/{uid}/{...segs} para households/{hid}/{...segs}, incluindo as subcoleções indicadas. */
async function copyCollection(hid, segs, subs = []) {
  const snap = await getDocs(userColOf(session.uid, ...segs));
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.set(householdDocOf(hid, ...segs, d.id), { ...d.data(), createdBy: session.uid });
    if (++n === 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n) await batch.commit();
  for (const d of snap.docs) {
    for (const sub of subs) await copyCollection(hid, [...segs, d.id, sub]);
  }
  return snap.size;
}

/**
 * Copia os dados pessoais antigos para o casal (uma vez por utilizador).
 * Os originais ficam onde estavam, por segurança.
 */
export async function migratePersonalData(hid) {
  const flag = householdDocOf(hid, 'migrations', session.uid);
  if ((await getDoc(flag)).exists()) return 0;
  let copied = 0;
  for (const [name, subs] of Object.entries(MIGRATE)) {
    try {
      copied += await copyCollection(hid, [name], subs);
    } catch (err) {
      console.error(`[household] migrar ${name}`, err);
    }
  }
  await setDoc(flag, { at: serverTimestamp(), copied });
  return copied;
}
