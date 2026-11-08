// Partilhar só uma página (ex.: a Lista de compras ou as Receitas) com pessoas de fora do grupo.
// partilhas/{sid}: { page, nome, ownerUid, membros_uids, inviteCode } com as coleções dessa página.
// O grupo (ou o espaço pessoal) guarda a ligação página -> { sid, code, nome } e a partir daí
// essa página lê e grava na partilha. Nada é apagado: ao criar copia-se, ao sair copia-se de volta.
import {
  db, APP_ID, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  arrayUnion, arrayRemove, serverTimestamp, deleteField,
} from './firebase.js';
import {
  partilhasCol, partilhaDoc, inviteDoc, profileDoc, householdDoc,
} from './paths.js';
import { session } from '../core/state.js';
import { paginaPartilhavel, ligacoesAtivas } from './espacos.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = (len = 6) => Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => ALPHABET[b % ALPHABET.length]).join('');

/** Subcoleções que também se copiam. */
const SUBS = { livros_receitas: ['itens'], carros: ['documentos', 'pastas'] };

const base = (espaco) => ['artifacts', APP_ID, ...espaco];
const espacoProprio = () => (session.householdId ? ['households', session.householdId] : ['users', session.uid]);

async function copiarColecao(de, para, segs) {
  const snap = await getDocs(collection(db, ...base(de), ...segs));
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.set(doc(db, ...base(para), ...segs, d.id), d.data());
    if (++n === 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n) await batch.commit();
  for (const d of snap.docs) {
    for (const sub of SUBS[segs[0]] && segs.length === 1 ? SUBS[segs[0]] : []) {
      await copiarColecao(de, para, [...segs, d.id, sub]);
    }
  }
}

async function copiarPagina(page, de, para) {
  for (const chave of paginaPartilhavel(page)?.colecoes || []) {
    try {
      if (chave.startsWith('config/')) {
        const id = chave.slice(7);
        const s = await getDoc(doc(db, ...base(de), 'config', id));
        if (s.exists()) await setDoc(doc(db, ...base(para), 'config', id), s.data());
      } else {
        await copiarColecao(de, para, [chave]);
      }
    } catch (err) { console.warn(`[partilhas] copiar ${chave}`, err); }
  }
}

/** Grava (ou apaga, com null) a ligação desta página no grupo ativo ou no perfil. */
async function gravarLigacao(page, valor) {
  const v = valor ?? deleteField();
  if (session.householdId) {
    await updateDoc(householdDoc(), { [`ligacoes.${page}`]: v });
    session.household = { ...session.household, ligacoes: { ...(session.household?.ligacoes || {}) } };
    if (valor) session.household.ligacoes[page] = valor; else delete session.household.ligacoes[page];
  } else {
    if (valor) await setDoc(profileDoc(), { ligacoes: { [page]: valor } }, { merge: true });
    else await updateDoc(profileDoc(), { [`ligacoes.${page}`]: v });
    session.profile.ligacoes = { ...(session.profile.ligacoes || {}) };
    if (valor) session.profile.ligacoes[page] = valor; else delete session.profile.ligacoes[page];
  }
}

export const ligacaoDe = (page) => ligacoesAtivas(session)[page] || null;

/** Cria a partilha desta página (com uma cópia dos dados atuais) e devolve o código de convite. */
export async function partilharPagina(page) {
  const p = paginaPartilhavel(page);
  if (!p) throw new Error('Esta página não se pode partilhar.');
  const atual = ligacaoDe(page);
  if (atual) return atual.code;
  const ref = doc(partilhasCol());
  const code = newCode();
  const membros = [...new Set([session.uid, ...(session.household?.members || [])])];
  await setDoc(ref, {
    page, nome: p.label, ownerUid: session.uid, membros_uids: membros, inviteCode: code,
    origem: session.householdId || null, createdAt: serverTimestamp(),
  });
  await setDoc(inviteDoc(code), { partilhaId: ref.id, createdBy: session.uid, createdAt: serverTimestamp() });
  await copiarPagina(page, espacoProprio(), ['partilhas', ref.id]);
  await gravarLigacao(page, { sid: ref.id, code, nome: p.label });
  return code;
}

/** Entra numa página partilhada por outra pessoa. Devolve a página. */
export async function entrarPartilha(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new Error('O código tem 6 caracteres.');
  const inv = await getDoc(inviteDoc(code));
  if (!inv.exists()) throw new Error('Código inválido ou já substituído por um novo.');
  const sid = inv.data().partilhaId;
  if (!sid) throw new Error('Este código é de um grupo: usa "Entrar num grupo".');
  try {
    await updateDoc(partilhaDoc(sid), { membros_uids: arrayUnion(session.uid), joinCode: code });
  } catch {
    throw new Error('Não foi possível entrar nesta partilha.');
  }
  await updateDoc(partilhaDoc(sid), { joinCode: null }).catch(() => {});
  const s = await getDoc(partilhaDoc(sid));
  const { page, nome } = s.data();
  await gravarLigacao(page, { sid, code, nome: nome || paginaPartilhavel(page)?.label || 'Página' });
  return page;
}

/**
 * Deixa de usar a partilha nesta página. Por defeito traz uma cópia dos dados da partilha
 * para o grupo/espaço pessoal, para nada se perder.
 */
export async function sairPartilha(page, { trazerCopia = true } = {}) {
  const lig = ligacaoDe(page);
  if (!lig) return;
  if (trazerCopia) await copiarPagina(page, ['partilhas', lig.sid], espacoProprio());
  await gravarLigacao(page, null);
  await updateDoc(partilhaDoc(lig.sid), { membros_uids: arrayRemove(session.uid) }).catch(() => {});
}

/** Novo código para esta partilha (o antigo deixa de servir). */
export async function novoCodigoPartilha(page) {
  const lig = ligacaoDe(page);
  if (!lig) return null;
  const code = newCode();
  await setDoc(inviteDoc(code), { partilhaId: lig.sid, createdBy: session.uid, createdAt: serverTimestamp() });
  await updateDoc(partilhaDoc(lig.sid), { inviteCode: code });
  await deleteDoc(inviteDoc(lig.code)).catch(() => {});
  await gravarLigacao(page, { ...lig, code });
  return code;
}

/** Quem está numa partilha: [{ uid, name, avatar }]. */
export async function membrosPartilha(sid) {
  const s = await getDoc(partilhaDoc(sid));
  const uids = s.exists() ? s.data().membros_uids || [] : [];
  const perfis = await Promise.all(uids.map((u) => getDoc(profileDoc(u)).catch(() => null)));
  return perfis.map((p, i) => ({ uid: uids[i], name: p?.data()?.username || 'Utilizador', avatar: p?.data()?.avatarUrl || '' }));
}

/**
 * Quem entra num grupo que já tinha páginas partilhadas ainda não está nessas partilhas:
 * entra sozinho com o código guardado no grupo. Devolve true se entrou em alguma.
 */
export async function garantirPartilhas() {
  if (!session.householdId) return false;
  let entrou = false;
  for (const lig of Object.values(session.household?.ligacoes || {})) {
    if (!lig?.sid) continue;
    try {
      await getDoc(partilhaDoc(lig.sid));
    } catch (err) {
      if (err?.code !== 'permission-denied' || !lig.code) continue;
      try {
        await updateDoc(partilhaDoc(lig.sid), { membros_uids: arrayUnion(session.uid), joinCode: lig.code });
        await updateDoc(partilhaDoc(lig.sid), { joinCode: null }).catch(() => {});
        entrou = true;
      } catch (e) { console.warn('[partilhas] entrar', e?.message); }
    }
  }
  return entrou;
}
