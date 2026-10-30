// Cálculos de despesas partilhadas (funções puras, fáceis de testar).

/** Parte de uma despesa que cabe a `uid`. */
export function shareOf(expense, uid, allMemberIds) {
  if (expense.modoDivisao === 'exatos' && expense.quotasExatas) return Number(expense.quotasExatas[uid]) || 0;
  const parts = expense.divididoPor?.length ? expense.divididoPor : allMemberIds;
  return parts.includes(uid) ? (Number(expense.valor) || 0) / parts.length : 0;
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
