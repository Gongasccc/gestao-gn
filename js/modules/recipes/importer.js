// Importar receitas da web. A maioria dos sites de receitas (Pingo Doce, Continente, SaborIntenso,
// Teleculinária, …) publica os dados em JSON-LD schema.org/Recipe, que lemos aqui.
// Como o browser não deixa ler outros sites diretamente (CORS), usamos primeiro a nossa função
// no Netlify (netlify/functions/receita.mjs), depois o pedido direto e por fim proxies públicos.
import { formatDuration, sourceName, servingsNumber } from './parse.js';

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(str) {
  return String(str ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#39);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const clean = (s) => decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isType = (node, type) => asArray(node?.['@type']).some((t) => String(t).toLowerCase() === type);

/** Procura um nó Recipe em qualquer profundidade (incl. @graph e listas). */
function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isType(node, 'recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function imageUrl(img) {
  const first = asArray(img)[0];
  if (!first) return '';
  if (typeof first === 'string') return first;
  return first.url || first.contentUrl || first['@id'] || '';
}

/** recipeInstructions pode ser texto, lista de textos, HowToStep ou HowToSection. */
function instructionLines(value) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') {
      v.split(/<\/(?:p|li)>|<br\s*\/?>|\n+/i).map(clean).filter(Boolean).forEach((l) => out.push(l));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (isType(v, 'howtosection')) {
      if (v.name) out.push(`${clean(v.name)}:`);
      return walk(v.itemListElement);
    }
    if (v.text) return out.push(clean(v.text));
    if (v.name) return out.push(clean(v.name));
    if (v.itemListElement) walk(v.itemListElement);
  };
  walk(value);
  return out;
}

function nutritionText(n) {
  if (!n || typeof n !== 'object') return '';
  const LABELS = {
    calories: 'Calorias', fatContent: 'Gordura', saturatedFatContent: 'Gordura saturada', carbohydrateContent: 'Hidratos de carbono',
    sugarContent: 'Açúcares', fiberContent: 'Fibra', proteinContent: 'Proteína', sodiumContent: 'Sódio', saltContent: 'Sal',
  };
  return Object.entries(LABELS).filter(([k]) => n[k]).map(([k, label]) => `${label}: ${clean(n[k])}`).join('\n');
}

/** Converte um nó schema.org/Recipe nos campos da app. */
export function recipeFromSchema(r, url = '') {
  const yieldVal = asArray(r.recipeYield).map(clean).find(Boolean) || '';
  return {
    titulo: clean(r.name || r.headline),
    fonte: url,
    fonteNome: sourceName(url),
    foto: imageUrl(r.image),
    tempoPrep: formatDuration(r.prepTime) || (!r.cookTime ? formatDuration(r.totalTime) : ''),
    tempoCozedura: formatDuration(r.cookTime),
    porcoes: servingsNumber(yieldVal) ? String(servingsNumber(yieldVal)) : yieldVal,
    ingredientes: asArray(r.recipeIngredient || r.ingredients).map(clean).filter(Boolean).join('\n'),
    passos: instructionLines(r.recipeInstructions).join('\n'),
    notas: clean(r.description),
    nutricao: nutritionText(r.nutrition),
  };
}

function metaContent(htmlText, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = htmlText.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] || '') : '';
}

/** Lê uma página HTML e devolve a receita (ou null se não houver dados estruturados). */
export function recipeFromHtml(htmlText, url = '') {
  const scripts = [...htmlText.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, body] of scripts) {
    try {
      const recipe = findRecipe(JSON.parse(body.trim().replace(/^<!\[CDATA\[|\]\]>$/g, '')));
      if (recipe) return recipeFromSchema(recipe, url);
    } catch { /* JSON inválido: tenta o próximo */ }
  }
  const title = metaContent(htmlText, 'og:title') || clean(htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (!title) return null;
  return {
    titulo: title,
    fonte: url,
    fonteNome: sourceName(url),
    foto: metaContent(htmlText, 'og:image'),
    notas: metaContent(htmlText, 'og:description') || metaContent(htmlText, 'description'),
    incompleta: true,
  };
}

async function fetchText(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Vai buscar a página e extrai a receita. Lança erro se não conseguir ler a página. */
export async function importRecipe(url) {
  const attempts = [(u) => `/.netlify/functions/receita?url=${encodeURIComponent(u)}`, (u) => u, ...PROXIES];
  let partial = null;
  for (const build of attempts) {
    try {
      const page = await fetchText(build(url));
      const recipe = recipeFromHtml(page, url);
      if (recipe && !recipe.incompleta) return recipe;
      partial = partial || recipe;
    } catch { /* tenta o próximo caminho */ }
  }
  if (partial) return partial;
  throw new Error('Não foi possível ler a página.');
}

/**
 * Texto colado (de uma mensagem, PDF, site sem dados estruturados) → receita.
 * Procura títulos "Ingredientes" e "Preparação/Modo de preparação"; a primeira linha é o título.
 */
export function recipeFromText(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const sections = { titulo: [], ingredientes: [], passos: [], notas: [] };
  let current = 'titulo';
  for (const line of lines) {
    const key = line.toLowerCase().replace(/[:#*]/g, '').trim();
    if (/^ingredientes?$/.test(key)) { current = 'ingredientes'; continue; }
    if (/^(modo de )?(prepara[çc][ãa]o|preparo|confe[çc][ãa]o|instru[çc][õo]es|passos)$/.test(key)) { current = 'passos'; continue; }
    if (/^(notas?|dicas?|observa[çc][õo]es)$/.test(key)) { current = 'notas'; continue; }
    if (!line) continue;
    if (current === 'titulo' && sections.titulo.length) current = 'notas';
    sections[current].push(line);
  }
  return {
    titulo: sections.titulo[0] || '',
    ingredientes: sections.ingredientes.join('\n'),
    passos: sections.passos.join('\n'),
    notas: sections.notas.join('\n'),
  };
}
