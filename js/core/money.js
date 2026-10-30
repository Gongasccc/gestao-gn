// Contas do casal: totais, saldos e acertos. Funções puras (testadas em tests/).
export { money as eur } from './format.js';

/**
 * Partes de cada membro numa despesa.
 * divisao: 'metade' (por omissão) | 'pagador' (só de quem pagou) | 'outro' (toda do outro membro)
 */
export function shares(e, members) {
  const valor = Number(e.valor) || 0;
  const others = members.filter((m) => m !== e.pagoPor);
  if (e.divisao === 'pagador') return { [e.pagoPor]: valor };
  if (e.divisao === 'outro' && others.length) {
    return Object.fromEntries(others.map((m) => [m, valor / others.length]));
  }
  return Object.fromEntries(members.map((m) => [m, valor / members.length]));
}

/** Saldo de cada membro: positivo = tem a receber, negativo = deve. */
export function balances(expenses, members) {
  const bal = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of expenses) {
    const valor = Number(e.valor) || 0;
    if (!valor || !(e.pagoPor in bal)) continue;
    bal[e.pagoPor] += valor;
    for (const [uid, part] of Object.entries(shares(e, members))) if (uid in bal) bal[uid] -= part;
  }
  for (const k in bal) bal[k] = Math.round(bal[k] * 100) / 100;
  return bal;
}

/** Quem deve a quem (para dois membros). Devolve { from, to, valor } ou null. */
export function settlement(bal) {
  const entries = Object.entries(bal);
  const debtor = entries.find(([, v]) => v < -0.004);
  const creditor = entries.find(([, v]) => v > 0.004);
  if (!debtor || !creditor) return null;
  return { from: debtor[0], to: creditor[0], valor: Math.min(-debtor[1], creditor[1]) };
}

/** Totais por categoria num mês ('YYYY-MM'), ignorando acertos. */
export function totalsByCategory(expenses, ym) {
  const out = {};
  for (const e of expenses) {
    if (e.tipo === 'acerto') continue;
    if (ym && !String(e.data || '').startsWith(ym)) continue;
    const c = e.categoria || 'outros';
    out[c] = (out[c] || 0) + (Number(e.valor) || 0);
  }
  return out;
}

export const sum = (arr, key = 'valor') => arr.reduce((a, x) => a + (Number(x[key]) || 0), 0);
