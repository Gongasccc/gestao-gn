// Lista semanal: secções (corredores) do supermercado e agrupamento por loja.
// A ordem padrão segue o percurso habitual de um supermercado português: frescos à entrada,
// depois padaria, talho/peixaria, charcutaria, laticínios, mercearia… e os congelados no fim,
// para não descongelarem no carrinho. Cada loja pode ter a sua própria ordem.
// Funções puras (testadas em tests/lista-compras.test.mjs).
import {
  categoria, nomeCategoria, emojiCategoria, idAtual, classificar, subcategoriaDe, palavras, semAcentos, nomeSub, ordemSub,
} from '../../data/categorias.js';

// Corredores = categorias do SuperSave (js/data/categorias.js). Os congelados vão para o fim do percurso.
const ORDEM_CORREDORES = ['frescos', 'padaria', 'talho', 'charcutaria', 'laticinios', 'mercearia', 'bio', 'bebidas', 'limpeza',
  'higiene', 'bebe', 'animais', 'casa', 'papelaria', 'brinquedos', 'desporto', 'livros', 'congelados', 'outros'];
export const SECCOES = ORDEM_CORREDORES.map((id) => { const c = categoria(id); return { id: c.id, emoji: c.emoji, nome: c.nome }; });

export const ORDEM_PADRAO = SECCOES.map((s) => s.id);
export const emojiSeccao = (id) => emojiCategoria(id);
export const nomeSeccao = (id) => nomeCategoria(id);

/**
 * Identidade visual de cada cadeia (cores da marca + sigla), para os cabeçalhos da lista.
 * As lojas desconhecidas recebem uma cor estável a partir do nome.
 */
const MARCAS = {
  continente: { cor: '#E30613', cor2: '#B0000E', texto: '#fff', sigla: 'C' },
  pingodoce: { cor: '#1A1A1A', cor2: '#95C11F', texto: '#fff', sigla: 'PD' },
  lidl: { cor: '#0050AA', cor2: '#003C82', texto: '#FFF000', sigla: 'L' },
  auchan: { cor: '#E2001A', cor2: '#00A04A', texto: '#fff', sigla: 'A' },
  intermarche: { cor: '#E30613', cor2: '#1D1D1B', texto: '#fff', sigla: 'I' },
  mercadona: { cor: '#00A650', cor2: '#F18E00', texto: '#fff', sigla: 'M' },
  aldi: { cor: '#00005F', cor2: '#00B4DC', texto: '#fff', sigla: 'A' },
  minipreco: { cor: '#E30613', cor2: '#F7A600', texto: '#fff', sigla: 'Mp' },
  elcorteingles: { cor: '#00843D', cor2: '#005C2A', texto: '#fff', sigla: 'ECI' },
  spar: { cor: '#00843D', cor2: '#E30613', texto: '#fff', sigla: 'S' },
  meusuper: { cor: '#E4032E', cor2: '#7A1F2B', texto: '#fff', sigla: 'MS' },
};
const PALETA = ['#0EA5E9', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#6366F1', '#F97316'];

export function marcaLoja(loja) {
  const k = chaveLoja(loja);
  const conhecida = Object.entries(MARCAS).find(([m]) => k.startsWith(m) || k.includes(m));
  if (conhecida) return { id: conhecida[0], ...conhecida[1] };
  const n = [...k].reduce((a, c) => a + c.charCodeAt(0), 0);
  const cor = PALETA[n % PALETA.length];
  const sigla = String(loja || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
  return { id: '', cor, cor2: cor, texto: '#fff', sigla };
}

/** Lojas sugeridas (as que aparecem nas faturas e as personalizadas juntam-se a estas). */
export const LOJAS_PADRAO = ['Pingo Doce', 'Mercadona', 'Lidl', 'Auchan', 'Continente', 'Intermarché', 'Aldi'];

// Categorias das faturas -> secções da lista (são as mesmas).
export const seccaoDeCategoria = (cat) => { const id = idAtual(cat); return id && id !== 'outros' ? id : ''; };

export { palavras };

/** Secção provável de um artigo pelo nome ("2 pacotes de leite" -> 'laticinios'). '' se não souber. */
export const adivinharSeccao = (texto) => classificar(texto).cat;

/** Subcategoria provável de um artigo ('mercearia:arroz-e-massa'), dentro da secção dada. */
export const adivinharSub = (texto, seccao) => subcategoriaDe(texto, seccao);

/** Chave para lembrar a loja/secção de um artigo ("2x Leite Mimosa" e "leite mimosa" são o mesmo). */
export function chaveArtigo(texto) {
  return palavras(texto).join(' ');
}

/** Ordem das secções para uma loja: a personalizada, completada com as que faltarem. */
export function ordemDaLoja(personalizada) {
  const valida = [...new Set((Array.isArray(personalizada) ? personalizada : []).map(idAtual))]
    .filter((id) => ORDEM_PADRAO.includes(id));
  const vistas = new Set(valida);
  return [...valida, ...ORDEM_PADRAO.filter((id) => !vistas.has(id))];
}

export const chaveLoja = (loja) => semAcentos(loja).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'geral';

/**
 * Agrupa os artigos por supermercado e, dentro de cada um, por secção na ordem dos corredores.
 * itens: [{ id, texto, feita, loja?, seccao?, sub?, timestamp }]  (sub = subcategoria do SuperSave)
 * opts.memoria: { [chaveArtigo]: { loja?, seccao?, sub? } }  (escolhas anteriores do casal)
 * opts.ordens: { [chaveLoja]: [seccaoId…] }
 * opts.categoria: (texto) => categoria das faturas ou '' (opcional, quando as palavras não chegam)
 * Devolve { grupos: [{ loja, chave, total (por comprar), comprados, seccoes: [{ id, nome, itens }] }], feitos: [...] }.
 * Os artigos sem loja ficam no grupo loja '' (primeiro), as lojas seguem por n.º de artigos.
 */
export function agruparLista(itens, { memoria = {}, ordens = {}, categoria = () => '' } = {}) {
  // A lista semanal é fixa: os artigos marcados ("já tenho") continuam no seu corredor, no fim.
  const todos = itens.map((i) => {
    const lembrado = memoria[chaveArtigo(i.texto)] || {};
    const loja = (i.loja ?? lembrado.loja ?? '').trim();
    const valida = (id) => { const s = idAtual(id); return ORDEM_PADRAO.includes(s) ? s : ''; };
    const seccao = valida(i.seccao)
      || valida(lembrado.seccao)
      || adivinharSeccao(i.texto)
      || seccaoDeCategoria(categoria(i.texto))
      || 'outros';
    const daSeccao = (sub) => (sub && String(sub).startsWith(`${seccao}:`) && nomeSub(sub) ? sub : '');
    const sub = daSeccao(i.sub) || daSeccao(lembrado.sub) || adivinharSub(i.texto, seccao);
    return { ...i, loja, seccao, sub };
  });
  const porLoja = new Map();
  for (const i of todos) {
    const k = i.loja ? chaveLoja(i.loja) : '';
    if (!porLoja.has(k)) porLoja.set(k, { loja: i.loja, chave: k, itens: [] });
    porLoja.get(k).itens.push(i);
  }
  // Dentro do corredor: por subcategoria (prateleira), pela ordem do SuperSave; os marcados no fim.
  const posSub = (i) => (i.sub ? ordemSub(i.sub) : 999);
  const porOrdem = (a, b) => (a.feita ? 1 : 0) - (b.feita ? 1 : 0) || posSub(a) - posSub(b) || (a.timestamp || 0) - (b.timestamp || 0);
  const grupos = [...porLoja.values()].map((g) => {
    const ordem = ordemDaLoja(ordens[g.chave]);
    const seccoes = ordem
      .map((id) => ({ id, nome: nomeSeccao(id), itens: g.itens.filter((i) => i.seccao === id).sort(porOrdem) }))
      .filter((s) => s.itens.length);
    const comprados = g.itens.filter((i) => i.feita).length;
    return { loja: g.loja, chave: g.chave, total: g.itens.length - comprados, comprados, seccoes };
  }).sort((a, b) => (a.chave === '' ? -1 : b.chave === '' ? 1 : b.total - a.total || a.loja.localeCompare(b.loja)));
  const feitos = todos.filter((i) => i.feita).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return { grupos, feitos };
}

/** Lojas para escolher: as padrão, as das faturas e as personalizadas, sem repetidos. */
export function listaLojas(...fontes) {
  const vistas = new Map();
  for (const nome of fontes.flat()) {
    const n = String(nome || '').trim();
    if (!n || n === 'Supermercado' || n === 'Outra loja') continue;
    const k = chaveLoja(n);
    if (!vistas.has(k)) vistas.set(k, n);
  }
  return [...vistas.values()];
}
