// Contas das faturas do supermercado: gastos por mês, por loja e por categoria,
// poupanças e comparação de preços. Funções puras (testadas em tests/faturas.test.mjs).

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const CATEGORIAS = {
  frescos: 'Fruta e legumes',
  talho: 'Carne e peixe',
  laticinios: 'Laticínios e ovos',
  padaria: 'Padaria',
  mercearia: 'Mercearia',
  congelados: 'Congelados',
  bebidas: 'Bebidas',
  limpeza: 'Limpeza',
  higiene: 'Higiene',
  bebe: 'Bebé',
  animais: 'Animais',
  outros: 'Outros',
};

export const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Mês 'AAAA-MM' de uma data 'AAAA-MM-DD'. */
export const mesDe = (data) => String(data || '').slice(0, 7);

/** 'AAAA-MM' -> 'Outubro 2026' */
export function nomeMes(ym, curto = false) {
  const [a, m] = String(ym).split('-').map(Number);
  if (!a || !m) return '';
  return curto ? MESES[m - 1] : `${MESES_LONGOS[m - 1]} ${a}`;
}

export function deslocarMes(ym, delta) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const mesAtual = (hoje = new Date()) => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

/** Normaliza o nome de um produto para o comparar entre faturas e lojas. */
export function chaveProduto(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

export const daMes = (faturas, ym) => faturas.filter((f) => mesDe(f.data) === ym);

export function totalDe(faturas) {
  return arred(faturas.reduce((s, f) => s + (Number(f.total) || 0), 0));
}

export function poupancaDe(faturas) {
  return arred(faturas.reduce((s, f) => s + (Number(f.poupanca) || 0), 0));
}

/** Total gasto em cada um dos últimos `n` meses até `ate` (inclusive), do mais antigo para o mais recente. */
export function evolucaoMensal(faturas, ate, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const ym = deslocarMes(ate, i - n + 1);
    const doMes = daMes(faturas, ym);
    return { ym, total: totalDe(doMes), poupanca: poupancaDe(doMes), compras: doMes.length };
  });
}

/** Resumo de um mês, com a variação face ao mês anterior. */
export function resumoMes(faturas, ym) {
  const doMes = daMes(faturas, ym);
  const total = totalDe(doMes);
  const anterior = totalDe(daMes(faturas, deslocarMes(ym, -1)));
  return {
    total,
    compras: doMes.length,
    media: doMes.length ? arred(total / doMes.length) : 0,
    poupanca: poupancaDe(doMes),
    anterior,
    variacao: anterior ? Math.round(((total - anterior) / anterior) * 100) : null,
  };
}

function agrupar(lista, chave, valor) {
  const out = new Map();
  for (const x of lista) {
    const k = chave(x);
    out.set(k, arred((out.get(k) || 0) + (Number(valor(x)) || 0)));
  }
  return [...out.entries()].map(([k, total]) => ({ k, total })).sort((a, b) => b.total - a.total);
}

export const porLoja = (faturas) => agrupar(faturas, (f) => f.loja || 'Outra loja', (f) => f.total)
  .map(({ k, total }) => ({ loja: k, total, compras: faturas.filter((f) => (f.loja || 'Outra loja') === k).length }));

export const porCategoria = (faturas) => agrupar(
  faturas.flatMap((f) => f.itens || []),
  (i) => (CATEGORIAS[i.categoria] ? i.categoria : 'outros'),
  (i) => i.total,
).map(({ k, total }) => ({ categoria: k, nome: CATEGORIAS[k], total }));

/** Preço por unidade de um item (o que se compara entre lojas). */
export function precoUnitario(item) {
  const pu = Number(item.precoUnitario);
  if (pu > 0) return arred(pu);
  const q = Number(item.quantidade) || 1;
  return arred((Number(item.total) || 0) / q);
}

/**
 * Agrupa todos os produtos comprados e mostra, para cada um, o preço em cada loja
 * (o último pago), o mais barato e o histórico.
 */
export function compararPrecos(faturas) {
  const produtos = new Map();
  const ordenadas = [...faturas].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  for (const f of ordenadas) {
    for (const item of f.itens || []) {
      const chave = chaveProduto(item.produto || item.nome);
      if (!chave) continue;
      const preco = precoUnitario(item);
      if (!preco) continue;
      let p = produtos.get(chave);
      if (!p) {
        p = { chave, nome: item.produto || item.nome, categoria: item.categoria || 'outros', unidade: item.unidade || '', lojas: {}, historico: [] };
        produtos.set(chave, p);
      }
      const loja = f.loja || 'Outra loja';
      p.lojas[loja] = { preco, data: f.data };
      p.historico.push({ data: f.data, loja, preco });
    }
  }
  return [...produtos.values()].map((p) => {
    const lojas = Object.entries(p.lojas).map(([loja, v]) => ({ loja, ...v })).sort((a, b) => a.preco - b.preco);
    const precos = p.historico.map((h) => h.preco);
    const ultimo = p.historico[p.historico.length - 1];
    const primeiro = p.historico[0];
    return {
      ...p,
      lojas,
      vezes: p.historico.length,
      maisBarata: lojas[0],
      min: Math.min(...precos),
      max: Math.max(...precos),
      ultimo,
      // Diferença entre a loja mais cara e a mais barata (só faz sentido com 2+ lojas).
      diferenca: lojas.length > 1 ? arred(lojas[lojas.length - 1].preco - lojas[0].preco) : 0,
      tendencia: p.historico.length > 1 ? arred(ultimo.preco - primeiro.preco) : 0,
    };
  }).sort((a, b) => b.vezes - a.vezes || a.nome.localeCompare(b.nome));
}

/** Produtos mais comprados num conjunto de faturas. */
export function maisComprados(faturas, n = 5) {
  const cont = new Map();
  for (const item of faturas.flatMap((f) => f.itens || [])) {
    const k = chaveProduto(item.produto || item.nome);
    if (!k) continue;
    const c = cont.get(k) || { nome: item.produto || item.nome, vezes: 0, total: 0 };
    c.vezes += 1;
    c.total = arred(c.total + (Number(item.total) || 0));
    cont.set(k, c);
  }
  return [...cont.values()].sort((a, b) => b.vezes - a.vezes || b.total - a.total).slice(0, n);
}

/** Procura uma fatura igual (mesma loja, dia e total) para evitar duplicados. */
export function duplicada(faturas, nova) {
  return faturas.find((f) => f.data === nova.data
    && arred(f.total) === arred(nova.total)
    && chaveProduto(f.loja) === chaveProduto(nova.loja)) || null;
}
