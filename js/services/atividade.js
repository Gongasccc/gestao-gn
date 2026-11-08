// Atividade recente do grupo: "Ana riscou leite da lista", "João pagou 12 €"…
// Cada módulo chama registarAtividade() depois de uma ação partilhada. Os dados ficam em sharedCol('atividade')
// e a página Juntos > Atividade mostra os últimos 80. Nunca falha a ação principal: erros são ignorados.
import { addDoc } from './firebase.js';
import { sharedCol } from './paths.js';
import { session } from '../core/state.js';

export const COL_ATIVIDADE = 'atividade';

/**
 * texto: o que aconteceu, sem o nome de quem fez (ex.: "riscou leite da lista").
 * opcoes: { icon: nome do ícone, page: página a abrir ao tocar }
 */
export function registarAtividade(texto, { icon = 'sparkles', page = '' } = {}) {
  if (!session.uid || !texto) return;
  // Sozinho no espaço pessoal não há ninguém a quem mostrar a atividade.
  if (!session.householdId) return;
  addDoc(sharedCol(COL_ATIVIDADE), {
    texto: String(texto).slice(0, 160),
    quem: session.uid,
    nome: (session.name || '').split(' ')[0],
    icon,
    page,
    quando: Date.now(),
  }).catch(() => {});
}
