// Moedas das despesas de viagem. Os totais e saldos ficam sempre em euros;
// cada despesa noutra moeda guarda o valor original e a taxa usada.

export const BASE = 'EUR';

// Moedas com taxa diária do BCE (via frankfurter.app). Outras podem ser usadas com taxa manual.
export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'BRL', 'JPY', 'CAD', 'AUD', 'DKK', 'SEK', 'NOK', 'PLN', 'CZK',
  'HUF', 'RON', 'BGN', 'ISK', 'TRY', 'MXN', 'THB', 'CNY', 'HKD', 'SGD', 'KRW', 'INR', 'IDR',
  'MYR', 'PHP', 'NZD', 'ZAR', 'ILS',
];

const cache = new Map();

/** Quantos euros vale 1 unidade de `code` (na data ISO indicada, ou a mais recente). */
export async function fetchRate(code, date = '') {
  if (!code || code === BASE) return 1;
  const day = date && date <= new Date().toISOString().slice(0, 10) ? date : 'latest';
  const key = `${code}@${day}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`https://api.frankfurter.app/${day}?from=${code}&to=${BASE}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rate = Number((await res.json())?.rates?.[BASE]);
  if (!rate) throw new Error('Taxa indisponível');
  cache.set(key, rate);
  return rate;
}

/** Converte um valor em `code` para euros, arredondado ao cêntimo. */
export const toEur = (valor, rate) => Math.round((Number(valor) || 0) * (Number(rate) || 0) * 100) / 100;

export function formatIn(valor, code = BASE) {
  try {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: code }).format(Number(valor) || 0);
  } catch {
    return `${(Number(valor) || 0).toFixed(2)} ${code}`;
  }
}
