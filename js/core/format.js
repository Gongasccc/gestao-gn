// Formatação de datas, valores e nomes (pt-PT).

const currency = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
export const money = (value) => currency.format(Number(value) || 0);

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function longDate(d = new Date()) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function timeHM(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "2026-10-30" -> "30 Out 2026" */
export function isoToShort(iso, withYear = true) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export function dateRange(start, end) {
  if (!start && !end) return 'Sem datas';
  if (start && end) {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${isoToShort(start, !sameYear)} – ${isoToShort(end)}`;
  }
  return isoToShort(start || end);
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function daysBetween(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso);
  return Math.round(ms / 86400000);
}

export function initials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
