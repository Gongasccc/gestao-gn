// Grupos (households): família, amigos, casal ou casa partilhada. Cada pessoa pode estar em vários
// e escolhe o ativo. O antigo casal é simplesmente um grupo do tipo 'casal'.
// artifacts/{APP_ID}/households/{hid} com subcoleções por funcionalidade (tarefas, finanças, ...).
import {
  db, doc, getDoc, setDoc, updateDoc, getDocs, deleteDoc, onSnapshot, writeBatch,
  arrayUnion, arrayRemove, serverTimestamp,
} from './firebase.js';
import {
  profileDoc, householdsCol, householdDoc, householdDocOf, inviteDoc, userColOf,
} from './paths.js';
import { session, emit } from '../core/state.js';
import { gruposDoPerfil } from './espacos.js';

/** Coleções que eram pessoais e passam a ser do primeiro grupo. As subcoleções listadas também são copiadas. */
const MIGRATE = {
  tarefas: [],
  semanais: [],
  rapidas: [],
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

/** Lê o nome, o tipo e o número de membros de cada grupo meu (para o seletor de grupos). */
export async function loadGrupos() {
  const ids = session.householdIds || [];
  const lidos = await Promise.all(ids.map(async (id) => {
    if (id === session.householdId && session.household) return session.household;
    try {
      const s = await getDoc(householdDocOf(id));
      return s.exists() && s.data().members?.includes(session.uid) ? { id, ...s.data() } : null;
    } catch { return session.grupos?.find((g) => g.id === id) || { id, name: 'Grupo' }; }
  }));
  session.grupos = lidos.filter(Boolean).map((g) => ({
    id: g.id, name: g.name || 'Grupo', tipo: g.tipo || 'casal', n: g.members?.length || 1,
  }));
  emit('grupos:update', session.grupos);
  return session.grupos;
}

/** Carrega o grupo ativo do perfil para a sessão (chamado no login). */
export async function loadHousehold(profile) {
  session.householdIds = gruposDoPerfil(profile);
  session.householdId = profile?.householdId || null;
  session.household = null;
  session.members = [{ uid: session.uid, name: session.name, avatar: session.avatar }];
  // Migração do casal antigo: o perfil passa a guardar a lista de grupos (nada é apagado).
  if (session.householdIds.length && !Array.isArray(profile?.householdIds)) {
    setDoc(profileDoc(), { householdIds: session.householdIds }, { merge: true }).catch(() => {});
    if (profile) profile.householdIds = [...session.householdIds];
  }
  if (!session.householdId) { loadGrupos().catch(() => {}); return null; }
  try {
    const snap = await getDoc(householdDoc());
    if (!snap.exists() || !snap.data().members?.includes(session.uid)) {
      session.householdIds = session.householdIds.filter((id) => id !== session.householdId);
      session.householdId = null;
      loadGrupos().catch(() => {});
      return null;
    }
    session.household = { id: snap.id, ...snap.data() };
    session.members = await loadMembers(session.household.members);
    loadGrupos().catch(() => {});
    return session.household;
  } catch (err) {
    // Sem resposta do servidor não sabemos se ainda é membro: mantém o grupo do perfil
    // (assim nada é gravado por engano no espaço pessoal) e o watchHousehold atualiza depois.
    console.error('[household] load', err);
    throw err;
  }
}

/** Mantém a sessão atualizada quando alguém entra ou sai do grupo. */
export function watchHousehold(scope) {
  if (!session.householdId) return;
  scope.add(onSnapshot(householdDoc(), async (s) => {
    if (!s.exists()) return;
    const prev = session.household?.members?.join(',');
    const prevLig = JSON.stringify(session.household?.ligacoes || {});
    session.household = { id: s.id, ...s.data() };
    if (prev !== session.household.members.join(',')) {
      session.members = await loadMembers(session.household.members);
    }
    emit('household:update', session.household);
    // Uma página do grupo passou a estar (ou deixou de estar) partilhada: os dados mudam de sítio.
    if (prevLig !== JSON.stringify(session.household.ligacoes || {})) emit('household:changed');
  }));
}

async function ativarNoPerfil(hid) {
  const primeiro = !(session.householdIds || []).length;
  await setDoc(profileDoc(), { householdId: hid, householdIds: arrayUnion(hid) }, { merge: true });
  session.profile.householdId = hid;
  session.profile.householdIds = [...new Set([...(session.householdIds || []), hid])];
  // Só o primeiro grupo recebe uma cópia dos dados pessoais antigos (os originais ficam).
  if (primeiro) await migratePersonalData(hid);
}

export async function createHousehold(name, tipo = 'familia') {
  const ref = doc(householdsCol());
  const code = newCode();
  await setDoc(ref, {
    name: name || 'O nosso grupo',
    tipo,
    ownerUid: session.uid,
    members: [session.uid],
    inviteCode: code,
    createdAt: serverTimestamp(),
  });
  await setDoc(inviteDoc(code), { householdId: ref.id, createdBy: session.uid, createdAt: serverTimestamp() });
  await ativarNoPerfil(ref.id);
  return ref.id;
}

/** Entra num grupo com o código de convite. O código continua válido para mais pessoas. */
export async function joinHousehold(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new Error('O código tem 6 caracteres.');
  const inv = await getDoc(inviteDoc(code));
  if (!inv.exists()) throw new Error('Código inválido ou já substituído por um novo.');
  const { householdId: hid, partilhaId } = inv.data();
  if (partilhaId) throw new Error('Este código é de uma página partilhada: usa "Entrar numa partilha".');
  if ((session.householdIds || []).includes(hid)) {
    await switchHousehold(hid);
    return hid;
  }
  try {
    await updateDoc(householdDocOf(hid), { members: arrayUnion(session.uid), joinCode: code });
  } catch {
    throw new Error('Não foi possível entrar: o grupo está cheio ou o código mudou.');
  }
  await updateDoc(householdDocOf(hid), { joinCode: null }).catch(() => {});
  await ativarNoPerfil(hid);
  return hid;
}

/** Muda o grupo ativo (null = só eu, espaço pessoal). */
export async function switchHousehold(hid) {
  await setDoc(profileDoc(), { householdId: hid || null }, { merge: true });
  session.profile.householdId = hid || null;
  await loadHousehold(session.profile);
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
export const setTipoHousehold = (tipo) => updateDoc(householdDoc(), { tipo });

/** O dono tira alguém do grupo (os dados do grupo ficam). */
export const removeMember = (uid) => updateDoc(householdDoc(), { members: arrayRemove(uid) });

/** Sai do grupo ativo. Os dados ficam no grupo para quem lá continua. */
export async function leaveHousehold() {
  const hid = session.householdId;
  const h = session.household || {};
  const resto = (h.members || []).filter((u) => u !== session.uid);
  const patch = { members: arrayRemove(session.uid) };
  if (h.ownerUid === session.uid && resto.length) patch.ownerUid = resto[0];
  if (!resto.length && h.inviteCode) await deleteDoc(inviteDoc(h.inviteCode)).catch(() => {});
  await updateDoc(householdDocOf(hid), patch);
  const ids = (session.householdIds || []).filter((id) => id !== hid);
  const proximo = ids[0] || null;
  await setDoc(profileDoc(), { householdId: proximo, householdIds: arrayRemove(hid) }, { merge: true });
  session.profile.householdId = proximo;
  session.profile.householdIds = ids;
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
