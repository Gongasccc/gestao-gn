// Contas do grupo: totais, saldos e acertos. Funções puras (testadas em tests/).
export { money as eur } from './format.js';

/**
 * Partes de cada membro numa despesa.
 * divisao: 'metade' (partes iguais, por omissão) | 'pagador' (só de quem pagou) | 'outro' (toda dos outros)
 * entre: [uids] opcional, para dividir só por algumas pessoas do grupo.
 */
export function shares(e, members) {
  const valor = Number(e.valor) || 0;
  // "Dividir entre": só algumas pessoas do grupo (vazio = todos).
  const entre = Array.isArray(e.entre) ? e.entre.filter((m) => members.includes(m)) : [];
  if (entre.length) members = entre;
  const others = members.filter((m) => m !== e.pagoPor);
  if (e.divisao === 'pagador') return { [e.pagoPor]: valor };
  // Acerto num grupo com mais de duas pessoas: o valor vai todo para quem recebe.
  if (e.para && e.para !== e.pagoPor) return { [e.para]: valor };
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

/** Próximo acerto (quem mais deve paga a quem mais tem a receber). Devolve { from, to, valor } ou null. */
export function settlement(bal) {
  const entries = Object.entries(bal);
  const debtor = entries.filter(([, v]) => v < -0.004).sort((a, b) => a[1] - b[1])[0];
  const creditor = entries.filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1])[0];
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

/**
 * Todos os pagamentos para ficarem quites, no menor número razoável de transferências
 * (quem deve mais paga primeiro a quem tem mais a receber). Devolve [{ from, to, valor }].
 */
export function transfers(bal) {
  const dev = [];
  const cred = [];
  Object.entries(bal).forEach(([uid, v]) => {
    const c = Math.round(v * 100);
    if (c < 0) dev.push({ uid, c: -c }); else if (c > 0) cred.push({ uid, c });
  });
  dev.sort((a, b) => b.c - a.c);
  cred.sort((a, b) => b.c - a.c);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < dev.length && j < cred.length) {
    const p = Math.min(dev[i].c, cred[j].c);
    if (p > 0) out.push({ from: dev[i].uid, to: cred[j].uid, valor: p / 100 });
    dev[i].c -= p;
    cred[j].c -= p;
    if (!dev[i].c) i += 1;
    if (!cred[j].c) j += 1;
  }
  return out;
}
