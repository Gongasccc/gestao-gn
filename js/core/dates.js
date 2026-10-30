// Utilitários de datas usados por calendário, datas importantes, validades e contas.
const DAY = 86400000;

export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const toISODate = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export const parseISODate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };

/** Dias inteiros entre hoje e a data (negativo = já passou). */
export function daysUntil(date, from = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(from)) / DAY);
}

/** Próxima ocorrência anual (aniversários). Devolve { date, years } com os anos que vai fazer. */
export function nextYearly(isoDate, from = new Date()) {
  const base = parseISODate(isoDate);
  const today = startOfDay(from);
  let next = new Date(today.getFullYear(), base.getMonth(), base.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate());
  return { date: next, years: next.getFullYear() - base.getFullYear() };
}

/** Próxima data de uma recorrência: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'. */
export function nextRecurrence(isoDate, every, from = new Date()) {
  const base = parseISODate(isoDate);
  const today = startOfDay(from);
  if (!every || every === 'none' || base >= today) return base;
  if (every === 'daily' || every === 'weekly') {
    const step = every === 'daily' ? 1 : 7;
    const n = Math.ceil(daysUntil(today, base) / step);
    const d = new Date(base); d.setDate(base.getDate() + n * step); return d;
  }
  const months = every === 'yearly' ? 12 : 1;
  let n = 0, d = base;
  while (d < today && n < 2400) d = addMonths(base, (n += months));
  return d;
}

export function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

/** Texto curto de contagem decrescente em PT-PT. */
export function countdownLabel(days) {
  if (days < 0) return days === -1 ? 'Ontem' : `Há ${-days} dias`;
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days < 31) return `Faltam ${days} dias`;
  const months = Math.round(days / 30.4);
  return months < 12 ? `Faltam ~${months} meses` : `Faltam ${days} dias`;
}

/** 'ok' | 'soon' (≤ warnDays) | 'expired' */
export function expiryState(isoDate, warnDays = 30) {
  if (!isoDate) return 'ok';
  const d = daysUntil(parseISODate(isoDate));
  return d < 0 ? 'expired' : d <= warnDays ? 'soon' : 'ok';
}

export const formatDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(d).toLocaleDateString('pt-PT', opts);

/** Grelha de um mês para o calendário (semanas a começar à segunda). */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { date: d, iso: toISODate(d), inMonth: d.getMonth() === month };
  });
}
