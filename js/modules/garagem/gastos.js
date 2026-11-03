// Gastos da Garagem: categorias e totais por mês (funções puras, testadas em tests/).

export const CATEGORIAS_CARRO = [
  { value: 'combustivel', label: 'Combustível', icon: 'fuel' },
  { value: 'manutencao', label: 'Manutenção / Oficina', icon: 'tool' },
  { value: 'seguro', label: 'Seguro', icon: 'shield' },
  { value: 'iuc', label: 'IUC / Impostos', icon: 'file' },
  { value: 'inspecao', label: 'Inspeção', icon: 'check' },
  { value: 'portagens', label: 'Portagens / Via Verde', icon: 'map' },
  { value: 'estacionamento', label: 'Estacionamento', icon: 'pin' },
  { value: 'lavagem', label: 'Lavagem', icon: 'sparkles' },
  { value: 'outros', label: 'Outros', icon: 'coin' },
];

export const categoriaCarro = (v) => CATEGORIAS_CARRO.find((c) => c.value === v) || CATEGORIAS_CARRO[CATEGORIAS_CARRO.length - 1];

const valor = (g) => Number(g.valor) || 0;
const doMes = (g, ym) => String(g.data || '').startsWith(ym);
const arred = (n) => Math.round(n * 100) / 100;

/** Mês anterior/seguinte a partir de 'YYYY-MM'. */
export function mudarMes(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resumo de um mês: total, nº de gastos, totais por carro e por categoria
 * (ordenados do maior para o menor) e o total do mês anterior para comparar.
 */
export function resumoMes(gastos, ym, carroId = null) {
  const lista = carroId ? gastos.filter((g) => g.carroId === carroId) : gastos;
  const mes = lista.filter((g) => doMes(g, ym));
  const anterior = mudarMes(ym, -1);
  const agrupar = (key) => {
    const out = {};
    for (const g of mes) { const k = g[key] || (key === 'categoria' ? 'outros' : ''); out[k] = (out[k] || 0) + valor(g); }
    return Object.entries(out).map(([id, total]) => ({ id, total: arred(total) })).sort((a, b) => b.total - a.total);
  };
  return {
    total: arred(mes.reduce((a, g) => a + valor(g), 0)),
    count: mes.length,
    totalAnterior: arred(lista.filter((g) => doMes(g, anterior)).reduce((a, g) => a + valor(g), 0)),
    porCarro: agrupar('carroId'),
    porCategoria: agrupar('categoria'),
  };
}

/** Média mensal dos últimos `n` meses completos antes de `ym` (só conta meses a partir do 1.º gasto). */
export function mediaMensal(gastos, ym, n = 6, carroId = null) {
  const lista = carroId ? gastos.filter((g) => g.carroId === carroId) : gastos;
  const primeiro = lista.map((g) => String(g.data || '').slice(0, 7)).filter(Boolean).sort()[0];
  if (!primeiro) return 0;
  let total = 0;
  let meses = 0;
  for (let i = 1; i <= n; i += 1) {
    const m = mudarMes(ym, -i);
    if (m < primeiro) break;
    total += lista.filter((g) => doMes(g, m)).reduce((a, g) => a + valor(g), 0);
    meses += 1;
  }
  return meses ? arred(total / meses) : 0;
}

/** Consumo médio (L/100 km) a partir dos abastecimentos com km e litros. */
export function consumoMedio(gastos, carroId) {
  const abast = gastos
    .filter((g) => g.carroId === carroId && g.categoria === 'combustivel' && Number(g.km) > 0 && Number(g.litros) > 0)
    .sort((a, b) => Number(a.km) - Number(b.km));
  if (abast.length < 2) return null;
  const km = Number(abast[abast.length - 1].km) - Number(abast[0].km);
  const litros = abast.slice(1).reduce((a, g) => a + Number(g.litros), 0);
  return km > 0 ? Math.round((litros / km) * 1000) / 10 : null;
}
