// Limpeza única dos dados dos menus que já saíram da app (Calendário, Datas importantes, Metas,
// Documentos, Casa, Desejos, Memórias, Cartões e a antiga página das lojas). Pedido do casal em 3 nov 2026.
// Apaga no espaço do casal e no espaço pessoal de quem entra. Corre uma vez por pessoa (marca em config/limpeza).
import { getDocs, deleteDoc, setDoc, getDoc } from './firebase.js';
import { sharedCol, sharedDoc, userCol } from './paths.js';
import { session } from '../core/state.js';

export const VERSAO = 1;
export const COLECOES_ANTIGAS = [
  'eventos', 'datas', 'metas', 'documentos', 'pastas_docs', 'manutencao', 'garantias', 'contactos', 'animais',
  'desejos', 'memorias', 'cartoes', 'supermercados',
];

async function apagarColecao(col) {
  const snap = await getDocs(col);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

export async function limparMenusAntigos() {
  if (!session.uid) return;
  try {
    const marca = sharedDoc('config', 'limpeza');
    const feito = await getDoc(marca);
    if ((feito.exists() ? feito.data()[session.uid] : 0) >= VERSAO) return;
    let total = 0;
    for (const nome of COLECOES_ANTIGAS) {
      try {
        total += await apagarColecao(sharedCol(nome));
        if (session.householdId) total += await apagarColecao(userCol(nome));
      } catch (e) { console.warn(`[limpeza] ${nome}`, e); }
    }
    try { await deleteDoc(sharedDoc('config', 'cartoes')); } catch { /* já não existe */ }
    await setDoc(marca, { [session.uid]: VERSAO }, { merge: true });
    if (total) console.info(`[limpeza] ${total} documentos antigos apagados`);
  } catch (e) {
    console.warn('[limpeza]', e);
  }
}
