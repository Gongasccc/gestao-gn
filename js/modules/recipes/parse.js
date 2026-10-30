// Funções puras do livro de receitas: ler ingredientes, escalar quantidades e dividir passos.
// Sem dependências do DOM, para poderem ser testadas em node (tests/recipes.test.mjs).

const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅕': 0.2 };
const NICE = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

// Unidades reconhecidas (as mais compridas primeiro para "c. de sopa" ganhar a "c.").
const UNITS = [
  'colheres de sobremesa', 'colher de sobremesa', 'colheres de sopa', 'colher de sopa', 'colheres de chá', 'colher de chá',
  'colheres de café', 'colher de café', 'c. de sobremesa', 'c. de sopa', 'c. de chá', 'c. de café', 'c. sopa', 'c. chá',
  'c.s.', 'c.c.', 'chávenas', 'chávena', 'copos', 'copo', 'tigelas', 'tigela', 'embalagens', 'embalagem', 'pacotes', 'pacote',
  'latas', 'lata', 'frascos', 'frasco', 'dentes', 'dente', 'fatias', 'fatia', 'pitadas', 'pitada', 'ramos', 'ramo',
  'molhos', 'molho', 'folhas', 'folha', 'unidades', 'unidade', 'unid.', 'unid', 'un.', 'un', 'kg', 'mg', 'g', 'ml', 'cl', 'dl', 'l',
  'tbsp', 'tsp', 'cups', 'cup', 'oz', 'lb',
];
const UNIT_RE = new RegExp(`^(${UNITS.map((u) => u.replace(/[.]/g, '\\.')).join('|')})(?=\\s|$|[,;)])`, 'i');

const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s*[½⅓⅔¼¾⅛⅕]?|[½⅓⅔¼¾⅛⅕])';
const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:-|–|a)\\s*(${NUM}))?\\s*`);

/** "1 1/2" → 1.5, "½" → 0.5, "2,5" → 2.5, "1½" → 1.5 */
export function parseNumber(str) {
  const s = String(str).trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([½⅓⅔¼¾⅛⅕])?$/);
  if (m && (m[1] || m[2])) return (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
  return NaN;
}

/** 1.5 → "1½", 0.333 → "⅓", 2.4 → "2,4" */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return '';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  const nice = NICE.find(([v]) => Math.abs(v - frac) < 0.02);
  if (nice) return `${whole || ''}${nice[1]}`;
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Uma linha é título de secção ("Para a cobertura:", "# Massa"). */
export const isHeader = (line) => /^#+\s*/.test(line) || (/:\s*$/.test(line) && !QTY_RE.test(line) && line.length < 60);

/**
 * Divide uma linha de ingrediente em quantidade, unidade e nome.
 * "125 g de manteiga" → { qty: 125, qtyMax: null, unit: 'g', name: 'manteiga' }
 */
export function parseIngredient(raw) {
  const line = String(raw).trim().replace(/^[-•*]\s*/, '');
  if (!line) return null;
  if (isHeader(line)) return { header: line.replace(/^#+\s*/, '').replace(/:\s*$/, ''), raw: line };
  let rest = line;
  let qty = null;
  let qtyMax = null;
  let unit = '';
  const q = rest.match(QTY_RE);
  if (q) {
    qty = parseNumber(q[1]);
    qtyMax = q[2] ? parseNumber(q[2]) : null;
    if (Number.isNaN(qty)) qty = null;
    rest = rest.slice(q[0].length);
  }
  if (qty != null) {
    const u = rest.match(UNIT_RE);
    if (u) {
      unit = u[1];
      rest = rest.slice(u[0].length).trim();
    }
    if (unit) rest = rest.replace(/^de\s+/i, '');
  }
  return { qty, qtyMax, unit, name: rest.trim() || line, raw: line };
}

// Formas curtas para caber na coluna da quantidade.
const UNIT_SHORT = [
  [/^(colheres|colher|c\.) de sopa$|^c\. sopa$|^c\.s\.$/i, 'c. sopa'],
  [/^(colheres|colher|c\.) de chá$|^c\. chá$|^c\.c\.$/i, 'c. chá'],
  [/^(colheres|colher|c\.) de sobremesa$/i, 'c. sobrem.'],
  [/^(colheres|colher|c\.) de café$/i, 'c. café'],
  [/^unidades?$|^unid\.?$|^un\.?$/i, 'un.'],
];
export const shortUnit = (unit) => (UNIT_SHORT.find(([re]) => re.test(unit))?.[1] || unit);

/** Texto da quantidade já escalada: "250 g", "1-2", "". */
export function quantityText(ing, factor = 1) {
  if (!ing || ing.qty == null) return '';
  const a = formatNumber(ing.qty * factor);
  const b = ing.qtyMax != null ? `-${formatNumber(ing.qtyMax * factor)}` : '';
  return `${a}${b}${ing.unit ? ` ${shortUnit(ing.unit)}` : ''}`;
}

/** Lista de ingredientes a partir do texto (uma linha por ingrediente). */
export const parseIngredients = (text) => String(text || '').split('\n').map(parseIngredient).filter(Boolean);

/** Texto para a lista de compras: "manteiga (250 g)". */
export function shoppingText(ing, factor = 1) {
  const q = quantityText(ing, factor);
  return q ? `${ing.name} (${q})` : ing.name;
}

/** Passos: um por linha (ou por parágrafo), sem a numeração que vier colada. */
export function parseSteps(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => {
    if (isHeader(l) && l.length < 40) return { header: l.replace(/^#+\s*/, '').replace(/:\s*$/, '') };
    return { text: l.replace(/^(?:passo\s*)?\d+\s*[.)º:-]\s*/i, '') };
  });
}

/** ISO 8601 (PT50M, PT1H20M) ou texto livre → "50 min", "1 h 20 min". */
export function formatDuration(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return s;
  const mins = Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return [h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
}

/** Domínio legível de um URL: "https://www.pingodoce.pt/receitas/x" → "pingodoce.pt". */
export function sourceName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Porções em número a partir de "10", "10 fatias", "Serve 4". */
export function servingsNumber(value) {
  const m = String(value ?? '').match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** Normaliza para pesquisa: minúsculas e sem acentos. */
export const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
