// Cálculos de despesas partilhadas (funções puras, fáceis de testar).

const round2 = (n) => Math.round(n * 100) / 100;

/** Parte de uma despesa (em €) que cabe a `uid`. */
export function shareOf(expense, uid, allMemberIds) {
  const valor = Number(expense.valor) || 0;
  switch (expense.modoDivisao) {
    case 'exatos':
      if (expense.quotasExatas) return Number(expense.quotasExatas[uid]) || 0;
      break;
    case 'percentagem':
      if (expense.percentagens) return valor * (Number(expense.percentagens[uid]) || 0) / 100;
      break;
    case 'partes': {
      if (!expense.partes) break;
      const total = Object.values(expense.partes).reduce((s, n) => s + (Number(n) || 0), 0);
      return total ? valor * (Number(expense.partes[uid]) || 0) / total : 0;
    }
    default:
  }
  const parts = expense.divididoPor?.length ? expense.divididoPor : allMemberIds;
  return parts.includes(uid) ? valor / parts.length : 0;
}

/**
 * Dívidas diretas entre pares: debts[a][b] = quanto `a` deve a `b`.
 * Cada participante deve ao pagador a sua parte de cada despesa.
 */
export function pairwiseDebts(expenses, allMemberIds) {
  const debts = {};
  allMemberIds.forEach((a) => { debts[a] = {}; allMemberIds.forEach((b) => { debts[a][b] = 0; }); });
  expenses.forEach((e) => {
    const payer = e.pagadorUid;
    if (!debts[payer]) return;
    allMemberIds.forEach((uid) => {
      if (uid === payer) return;
      debts[uid][payer] += shareOf(e, uid, allMemberIds);
    });
  });
  return debts;
}

/** Saldo líquido entre mim e outra pessoa. Positivo = essa pessoa deve-me. */
export function netWith(debts, me, other) {
  return (debts[other]?.[me] || 0) - (debts[me]?.[other] || 0);
}

/** Totais pagos por cada membro. */
export function paidBy(expenses, membersInfo) {
  const totals = Object.fromEntries(membersInfo.map((m) => [m.uid, 0]));
  expenses.forEach((e) => { if (e.pagadorUid in totals) totals[e.pagadorUid] += Number(e.valor) || 0; });
  return totals;
}

/** Quanto cabe a cada membro (o seu custo real), sem contar liquidações. */
export function costOf(expenses, allMemberIds, isSettlement = (e) => e.tipo === 'liquidacao') {
  const totals = Object.fromEntries(allMemberIds.map((u) => [u, 0]));
  expenses.filter((e) => !isSettlement(e)).forEach((e) => {
    allMemberIds.forEach((u) => { totals[u] += shareOf(e, u, allMemberIds); });
  });
  Object.keys(totals).forEach((u) => { totals[u] = round2(totals[u]); });
  return totals;
}

/**
 * Saldo de cada membro no grupo: o que pagou menos o que lhe cabe.
 * Positivo = tem a receber; negativo = tem a pagar. A soma é sempre 0.
 */
export function netBalances(expenses, allMemberIds) {
  const net = Object.fromEntries(allMemberIds.map((u) => [u, 0]));
  expenses.forEach((e) => {
    const valor = Number(e.valor) || 0;
    if (e.pagadorUid in net) net[e.pagadorUid] += valor;
    allMemberIds.forEach((u) => { net[u] -= shareOf(e, u, allMemberIds); });
  });
  Object.keys(net).forEach((u) => { net[u] = round2(net[u]); });
  // O arredondamento ao cêntimo pode deixar 1 cêntimo a mais ou a menos; acerta-o no maior saldo.
  const drift = round2(Object.values(net).reduce((s, v) => s + v, 0));
  if (drift) {
    const top = Object.keys(net).sort((x, y) => Math.abs(net[y]) - Math.abs(net[x]))[0];
    net[top] = round2(net[top] - drift);
  }
  return net;
}

/**
 * Simplifica as dívidas do grupo no menor número razoável de pagamentos:
 * quem deve mais paga primeiro a quem tem mais a receber.
 * Devolve [{ from, to, valor }].
 */
export function simplifyDebts(net) {
  const debtors = [];
  const creditors = [];
  Object.entries(net).forEach(([uid, v]) => {
    const cents = Math.round(v * 100);
    if (cents < 0) debtors.push({ uid, cents: -cents });
    else if (cents > 0) creditors.push({ uid, cents });
  });
  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].cents, creditors[j].cents);
    if (pay > 0) out.push({ from: debtors[i].uid, to: creditors[j].uid, valor: pay / 100 });
    debtors[i].cents -= pay;
    creditors[j].cents -= pay;
    if (!debtors[i].cents) i += 1;
    if (!creditors[j].cents) j += 1;
  }
  return out;
}
