// Países e continentes (para as estatísticas, o mapa-mundo e o globo).
import { COUNTRY_ROWS } from './countries-data.js';

export const CONTINENTS = ['Europa', 'Ásia', 'África', 'América do Norte', 'América do Sul', 'Oceânia', 'Antártida'];
/** Países reconhecidos pela ONU + observadores: base para a "% do mundo". */
export const WORLD_COUNTRIES = 195;

const byCode = new Map();
const byNum = new Map();
COUNTRY_ROWS.forEach(([code, num, cont, nome, lat, lng, un]) => {
  const c = { code, num, continente: cont, nome, lat, lng, un: !!un };
  byCode.set(code, c);
  if (num) byNum.set(num, c);
});

export const country = (code = '') => byCode.get(String(code).toLowerCase()) || null;
export const countryByNumeric = (num) => byNum.get(String(num).padStart(3, '0')) || null;
export const countryName = (code) => country(code)?.nome || String(code || '').toUpperCase();
export const continentOf = (code) => {
  const c = country(code);
  return c && c.continente >= 0 ? c.continente : -1;
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pesquisa por nome (sem acentos), para "Adicionar países". */
export function searchCountries(q, limit = 12) {
  const n = norm(q).trim();
  const all = [...byCode.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  if (!n) return all;
  const starts = all.filter((c) => norm(c.nome).startsWith(n));
  const inside = all.filter((c) => !norm(c.nome).startsWith(n) && norm(c.nome).includes(n));
  return [...starts, ...inside].slice(0, limit);
}

/** Percentagem do mundo (mínimo 1% quando já há algum país). */
export function worldPercent(n) {
  if (!n) return 0;
  return Math.min(100, Math.max(1, Math.round((n / WORLD_COUNTRIES) * 100)));
}
