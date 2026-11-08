// Quanto vai custar a lista: estimativa por supermercado a partir dos preços que o casal já pagou
// (faturas) e das promoções dos folhetos. Se um artigo nunca foi comprado naquela loja, usa o preço
// pago noutras lojas como aproximação. Funções puras (testadas em tests/lista-precos.test.mjs).
import { palavras, chaveLoja } from './seccoes.js';
import { lerEmbalagem } from '../faturas/produtos.js';

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Quantidade pedida no texto do artigo: "2x leite", "leite x2", "3 iogurtes" -> 2, 2, 3. Por omissão 1. */
export function quantidadeArtigo(texto) {
  const t = String(texto || '').trim().toLowerCase();
  // "200 g de carne", "1,5 kg batatas": é o peso, não o número de embalagens.
  if (/^\d+(?:[.,]\d+)?\s?(?:kg|g|gr|grs|l|lt|cl|ml)\b/.test(t)) return 1;
  const m = t.match(/^(\d{1,2})\s*(?:x|×)?\s+\D/) || t.match(/^(\d{1,2})\s*(?:x|×)(?=\s*\D)/) || t.match(/\D\s(?:x|×)\s*(\d{1,2})$/);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 50 ? n : 1;
}

/** As palavras do artigo aparecem todas no nome do produto? ("queijo flamengo" ~ "Queijo flamengo fatiado Limiano 200 g") */
const LIGACOES = new Set(['de', 'da', 'do', 'com', 'e', 'em', 'a', 'o', 'para', 'sem']);

/** Peso ou volume pedido no artigo ("200g carne picada" -> { qtd: 0.2, unidade: 'kg' }), ou null. */
export function pesoPedido(texto) {
  const e = lerEmbalagem(texto);
  return e && (e.unidade === 'kg' || e.unidade === 'L') ? e : null;
}

/** Preço por kg ou litro de uma compra (ao peso, ou pela embalagem "500 g"), ou null. */
function precoMedida(item) {
  const q = Number(item.quantidade) || 1;
  const pu = Number(item.precoUnitario) || (Number(item.total) || 0) / q;
  if (!(pu > 0)) return null;
  if (item.unidade === 'kg') return { valor: pu, unidade: 'kg' };
  const e = item.embalagem || lerEmbalagem(item.produto || item.nome);
  return e && e.qtd > 0 && (e.unidade === 'kg' || e.unidade === 'L') ? { valor: pu / e.qtd, unidade: e.unidade } : null;
}

export function condiz(texto, nomeProduto) {
  const q = palavras(texto).filter((w) => !LIGACOES.has(w));
  if (!q.length) return false;
  const n = palavras(nomeProduto);
  return q.every((w) => n.some((x) => x === w || (w.length >= 4 && x.startsWith(w))));
}

/** Valor de UMA compra do item (sem descontos): ao peso conta o que se costuma levar, à unidade o preço unitário. */
function valorCompra(item) {
  const q = Number(item.quantidade) || 1;
  const pu = Number(item.precoUnitario) || (Number(item.total) || 0) / q;
  if (!(pu > 0)) return 0;
  return arred(item.unidade === 'kg' ? pu * q : pu);
}

/**
 * Índice dos preços pagos: [{ nome, vezes, lojas: { chaveLoja: { loja, preco, data } } }].
 * Fica o preço da compra mais recente em cada loja. Os mais comprados primeiro (ganham quando vários condizem).
 */
export function indicePrecos(faturas) {
  const mapa = new Map();
  const ordenadas = [...(faturas || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  for (const f of ordenadas) {
    const loja = String(f.loja || '').trim();
    if (!loja || loja === 'Supermercado' || loja === 'Outra loja') continue;
    for (const i of f.itens || []) {
      const nome = i.produto || i.nome;
      const k = palavras(nome).join(' ');
      const preco = valorCompra(i);
      if (!k || !preco) continue;
      let p = mapa.get(k);
      if (!p) { p = { nome, vezes: 0, lojas: {} }; mapa.set(k, p); }
      p.vezes += 1;
      p.nome = nome;
      const medida = precoMedida(i);
      p.lojas[chaveLoja(loja)] = { loja, preco, data: f.data || '', ...(medida ? { medida } : {}) };
      if (i.unidade === 'kg' && Number(i.quantidade) > 0) p.kg = Number(i.quantidade); // quanto costuma levar
    }
  }
  return [...mapa.values()].sort((a, b) => b.vezes - a.vezes);
}

/** Promoção ao peso (preço por kg)? */
export const promoAoPeso = (p) => /\(kg\)|\/\s*kg|\bkg\)?$/i.test(String(p?.produto || '')) || p?.unidade === 'kg';

/** Promoção válida num dia ('AAAA-MM-DD'). Sem datas conta como válida. */
export const promoAtiva = (p, hoje) => (!p.inicio || p.inicio <= hoje) && (!p.fim || p.fim >= hoje);

/** Promoções ativas que condizem com o artigo, da mais barata para a mais cara. */
export function promosDoArtigo(texto, promos, hoje) {
  return (promos || [])
    .filter((p) => Number(p.preco) > 0 && promoAtiva(p, hoje) && condiz(texto, p.produto))
    .sort((a, b) => a.preco - b.preco);
}

/**
 * Estimativa do preço de um artigo numa loja.
 * Devolve null (sem dados) ou { preco (total, já × quantidade), unitario, quantidade, fonte, ref, promo? }
 * fonte: 'promo' (folheto desta loja), 'loja' (pago nesta loja), 'outras' (pago noutras lojas; ref = essas lojas)
 * Sem loja: usa a média das lojas onde já foi comprado.
 */
export function estimarArtigo(texto, loja, { indice = [], promos = [], hoje = '' } = {}) {
  const quantidade = quantidadeArtigo(texto);
  const peso = pesoPedido(texto);
  const k = loja ? chaveLoja(loja) : '';
  const out = (unitario, fonte, extra = {}) => ({ preco: arred(unitario * quantidade), unitario: arred(unitario), quantidade, fonte, ...extra });
  // Com peso pedido ("200 g"): preço por kg/L da última compra × o peso. Sem peso: o que se pagou da última vez.
  const valor = (l) => (peso && l.medida?.unidade === peso.unidade ? l.medida.valor * peso.qtd : l.preco);
  const porPeso = (ls) => !!peso && ls.some((l) => l.medida?.unidade === peso.unidade);

  const produto = (indice || []).find((p) => condiz(texto, p.nome));
  const promosAqui = promosDoArtigo(texto, promos, hoje);
  const promo = k && promosAqui.find((p) => chaveLoja(p.loja) === k);
  // Ao peso, o folheto dá o preço por kg: conta com o peso pedido ou o que costumam levar (1 kg se não souber).
  if (promo) return out(Number(promo.preco) * (promoAoPeso(promo) ? (peso?.qtd || produto?.kg || 1) : 1), 'promo', { promo, ref: [promo.loja] });

  if (!produto) return null;
  const aqui = k && produto.lojas[k];
  if (aqui) return out(valor(aqui), 'loja', { ref: [aqui.loja], produto: produto.nome, porPeso: porPeso([aqui]) ? aqui.medida : null });
  const outras = Object.values(produto.lojas);
  if (!outras.length) return null;
  const media = outras.reduce((s, l) => s + valor(l), 0) / outras.length;
  const comMedida = outras.filter((l) => peso && l.medida?.unidade === peso.unidade);
  return out(media, 'outras', {
    ref: outras.map((l) => l.loja),
    produto: produto.nome,
    porPeso: comMedida.length ? { valor: comMedida.reduce((s, l) => s + l.medida.valor, 0) / comMedida.length, unidade: peso.unidade } : null,
  });
}

/**
 * Soma a estimativa dos artigos por comprar de um supermercado.
 * Devolve { total, comPreco, aproximados (de outras lojas), emPromo, semPreco, porItem: Map(id -> estimativa) }.
 */
export function estimarLoja(itens, loja, ctx) {
  const porItem = new Map();
  let total = 0; let comPreco = 0; let aproximados = 0; let emPromo = 0; let semPreco = 0;
  for (const i of itens || []) {
    if (i.feita) continue;
    const e = estimarArtigo(i.texto, loja, ctx);
    if (!e) { semPreco += 1; continue; }
    porItem.set(i.id, e);
    total += e.preco;
    comPreco += 1;
    if (e.fonte === 'outras') aproximados += 1;
    if (e.fonte === 'promo') emPromo += 1;
  }
  return { total: arred(total), comPreco, aproximados, emPromo, semPreco, porItem };
}

/** Promoção noutra loja mais barata do que a estimativa nesta (para avisar "no Lidl está a 0,99 €"). */
export function melhorNoutraLoja(texto, loja, estimativa, { indice = [], promos = [], hoje = '' } = {}) {
  const k = chaveLoja(loja || '');
  const p = promosDoArtigo(texto, promos, hoje).find((x) => chaveLoja(x.loja) !== k);
  if (!p) return null;
  if (!estimativa) return p;
  const kg = pesoPedido(texto)?.qtd || (indice || []).find((x) => condiz(texto, x.nome))?.kg || 1;
  const custo = p.preco * (promoAoPeso(p) ? kg : quantidadeArtigo(texto));
  return arred(custo) < estimativa.preco ? p : null;
}

// ---------- Folhetos ----------

const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const dataOk = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? d : '');

/**
 * Normaliza a resposta da IA a um folheto ou pesquisa.
 * d: { loja, inicio, fim, promocoes: [{ produto, preco, precoAntes, desconto, condicao, inicio?, fim?, loja? }] }
 * Devolve [{ loja, produto, preco, precoAntes, desconto, condicao, inicio, fim }] sem repetidos.
 */
export function normalizarPromos(d, { lojaPadrao = '' } = {}) {
  const lojaGeral = String(d?.loja || lojaPadrao || '').trim();
  const vistas = new Set();
  const out = [];
  for (const x of Array.isArray(d?.promocoes) ? d.promocoes : []) {
    const produto = String(x?.produto || '').trim();
    const preco = Math.round(num(x?.preco) * 100) / 100;
    const loja = String(x?.loja || lojaGeral).trim();
    if (!produto || !loja || !(preco > 0) || preco > 500) continue;
    const inicio = dataOk(x.inicio) || dataOk(d.inicio);
    let fim = dataOk(x.fim) || dataOk(d.fim);
    if (inicio && fim && fim < inicio) fim = '';
    const precoAntes = Math.round(num(x.precoAntes) * 100) / 100;
    const chave = `${chaveLoja(loja)}|${palavras(produto).join(' ')}|${preco}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push({
      loja,
      produto,
      preco,
      precoAntes: precoAntes > preco ? precoAntes : 0,
      desconto: String(x.desconto || '').trim().slice(0, 40),
      condicao: String(x.condicao || '').trim().slice(0, 80),
      inicio,
      fim,
    });
  }
  return out;
}

/** Semana ISO 'AAAA-Www' de uma data (para pesquisar promoções no máximo uma vez por semana). */
export function semanaIso(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ano = t.getUTCFullYear();
  const semana = Math.ceil(((t - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

// ---------- Dia das compras ----------

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Data ('AAAA-MM-DD') das próximas compras para um dia da semana fixo (0 = domingo). Hoje conta. */
export function proximasCompras(dia, hoje = new Date()) {
  const d = dia == null || dia === '' ? NaN : Number(dia);
  if (!Number.isInteger(d) || d < 0 || d > 6) return '';
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + ((d - hoje.getDay() + 7) % 7));
  return isoLocal(alvo);
}

/** "hoje", "amanhã" ou "daqui a 3 dias". */
export function quandoCompras(dia, hoje = new Date()) {
  const d = dia == null || dia === '' ? NaN : Number(dia);
  if (!Number.isInteger(d) || d < 0 || d > 6) return '';
  const falta = (d - hoje.getDay() + 7) % 7;
  return falta === 0 ? 'hoje' : falta === 1 ? 'amanhã' : `daqui a ${falta} dias`;
}
