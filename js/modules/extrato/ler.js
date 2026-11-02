// Leitura de extratos bancários (PDF) com o Gemini: extrai os movimentos e categoriza-os.
// Este ficheiro não depende do Firebase para poder ser testado em Node (o pedido à IA é injetado).

export const CATEGORIAS_EXTRATO = ['casa', 'supermercado', 'restaurante', 'contas', 'transportes', 'saude', 'lazer', 'compras', 'viagens', 'outros'];

export const PROMPT = `Lês extratos bancários portugueses em PDF (CGD, Millennium BCP, Novo Banco, Santander, BPI, Montepio, Crédito Agrícola, ActivoBank, Moey, Revolut, N26, etc.).
Extrai TODOS os movimentos da lista de movimentos (todas as páginas) e devolve APENAS um objeto JSON com esta forma exata:
{
  "eExtrato": true,
  "banco": "ex.: Caixa Geral de Depósitos",
  "periodo": { "inicio": "AAAA-MM-DD", "fim": "AAAA-MM-DD" },
  "movimentos": [
    {
      "data": "AAAA-MM-DD",
      "descricao": "texto tal como aparece no extrato, ex.: COMPRA 1234 CONTINENTE BRAGA CONTACTLESS",
      "comerciante": "nome curto e legível, ex.: Continente",
      "valor": 0.00,
      "tipo": "debito | credito",
      "transferencia": false,
      "categoria": "${CATEGORIAS_EXTRATO.join(' | ')}"
    }
  ]
}
Regras:
- "data" é a data do movimento (data-valor se só houver essa). Se o extrato só tiver dia e mês, usa o ano do período do extrato.
- "valor" é sempre positivo; "tipo" diz se saiu dinheiro ("debito") ou entrou ("credito").
- "transferencia": true para transferências entre contas próprias, poupanças, levantamentos de multibanco e pagamentos do cartão de crédito.
- Categorias:
  supermercado: Continente, Pingo Doce, Lidl, Auchan, Intermarché, Mercadona, Minipreço, Aldi, mercearias, talhos, padarias.
  restaurante: restaurantes, cafés, pastelarias, McDonald's, Burger King, Uber Eats, Glovo, Bolt Food, Too Good To Go.
  contas: EDP, Galp Energia (luz/gás), Endesa, Goldenergy, água/SMAS, MEO, NOS, Vodafone, Digi, seguros, condomínio, comissões bancárias, impostos.
  casa: renda, prestação da casa, IKEA, Leroy Merlin, Aki, Worten casa, limpezas, obras.
  transportes: combustível (Galp, BP, Repsol, Prio, Cepsa), portagens, Via Verde, estacionamento, CP, Metro, Carris, Uber, Bolt, oficina.
  saude: farmácias, clínicas, hospitais, dentista, óticas, ginásio.
  lazer: Netflix, Spotify, Disney+, HBO, Apple, Google, PlayStation, cinema, concertos, bares.
  compras: Amazon, Zara, Primark, Fnac, Worten, El Corte Inglés, Decathlon, roupa, eletrónica, prendas.
  viagens: hotéis, Booking, Airbnb, Ryanair, TAP, easyJet, aluguer de carros.
  outros: o que não encaixa nas anteriores, entradas de dinheiro e transferências.
- Ignora saldos, saldo inicial/final, totais, cabeçalhos e rodapés. Não repitas movimentos.
- Números com ponto decimal, sem símbolo de euro.
- Se o PDF não for um extrato bancário, devolve {"eExtrato": false}.
Nunca inventes movimentos ou valores que não estão no extrato.`;

const num = (v) => {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[^\d,.-]/g, '');
  // "1.234,56" → "1234.56"; "1,234.56" → "1234.56"
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
};
const arred = (n) => Math.round(n * 100) / 100;

/** Chave estável de um comerciante, para aprender categorias ("CONTINENTE BRAGA" → "continente braga"). */
export function chaveComerciante(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(compra|pagamento|pag|trf|transf|mb ?way|contactless|apple ?pay|google ?pay|cartao|card|debito|dd|sepa)\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

// Reserva local caso a IA não devolva categoria válida.
const PALAVRAS = [
  ['supermercado', /continente|pingo doce|lidl|auchan|intermarch|mercadona|minipre|aldi|froiz|el corte ingles super|mercearia|talho|padaria/],
  ['restaurante', /restaur|cafe|pastelaria|mcdonald|burger king|uber ?eats|glovo|bolt food|telepizza|pizza|kfc|starbucks/],
  ['contas', /edp|endesa|goldenergy|iberdrola|smas|aguas|meo|nos comunica|vodafone|digi|seguro|condominio|comissao|imposto|at autoridade/],
  ['transportes', /galp|bp |repsol|prio|cepsa|via verde|portagem|brisa|estacion|parque|cp comboios|metro|carris|uber|bolt/],
  ['saude', /farmacia|clinica|hospital|dentist|otica|ginasio|fitness|wells/],
  ['lazer', /netflix|spotify|disney|hbo|max\.com|apple\.com|google|playstation|steam|cinema|nos cinemas|ticketline|bar /],
  ['compras', /amazon|zara|primark|fnac|worten|decathlon|h&m|pull|bershka|shein|aliexpress/],
  ['viagens', /hotel|booking|airbnb|ryanair|tap air|easyjet|vueling|hertz|europcar/],
  ['casa', /renda|ikea|leroy|aki |prestacao|habitacao/],
];

export function categoriaPorPalavras(texto) {
  const t = ` ${String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()} `;
  return PALAVRAS.find(([, re]) => re.test(t))?.[0] || 'outros';
}

/**
 * Normaliza a resposta da IA. `aprendidas` é { chaveComerciante: categoria } com as correções do casal,
 * que têm sempre prioridade sobre a IA.
 */
export function normalizarExtrato(d, { aprendidas = {}, ano = new Date().getFullYear() } = {}) {
  if (!d || d.eExtrato === false) return null;
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(d.periodo?.inicio) ? d.periodo.inicio : '';
  const anoBase = inicio ? Number(inicio.slice(0, 4)) : ano;
  const movimentos = (Array.isArray(d.movimentos) ? d.movimentos : [])
    .map((m) => {
      const valorBruto = num(m?.valor);
      const valor = arred(Math.abs(valorBruto));
      const descricao = String(m?.descricao || m?.comerciante || '').replace(/\s+/g, ' ').trim();
      const comerciante = String(m?.comerciante || '').trim() || descricao;
      let data = String(m?.data || '').trim();
      const dm = data.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
      if (dm) {
        const y = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : anoBase;
        data = `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) data = '';
      const tipo = /cr[eé]dito|entrada/i.test(String(m?.tipo || '')) ? 'credito' : 'debito';
      const chave = chaveComerciante(comerciante) || chaveComerciante(descricao);
      const categoria = aprendidas[chave]
        || (CATEGORIAS_EXTRATO.includes(m?.categoria) ? m.categoria : categoriaPorPalavras(`${comerciante} ${descricao}`));
      return { data, descricao, comerciante, valor, tipo, transferencia: Boolean(m?.transferencia), categoria, chave };
    })
    .filter((m) => m.valor > 0 && (m.descricao || m.comerciante));
  return {
    banco: String(d.banco || '').trim(),
    periodo: { inicio, fim: /^\d{4}-\d{2}-\d{2}$/.test(d.periodo?.fim) ? d.periodo.fim : '' },
    movimentos: movimentos.sort((a, b) => a.data.localeCompare(b.data)),
  };
}

/** Um movimento já existe nas despesas se tiver a mesma data e o mesmo valor. */
export function marcarDuplicados(movimentos, despesas) {
  const existentes = new Map();
  for (const e of despesas || []) {
    const k = `${e.data}|${arred(Number(e.valor) || 0).toFixed(2)}`;
    existentes.set(k, (existentes.get(k) || 0) + 1);
  }
  return movimentos.map((m) => {
    const k = `${m.data}|${m.valor.toFixed(2)}`;
    const n = existentes.get(k) || 0;
    if (n > 0) existentes.set(k, n - 1);
    return { ...m, duplicado: n > 0 };
  });
}

/** Lê o extrato. `pedir` é a função que fala com a IA (pedirJson do serviço Gemini). */
export async function lerExtrato(ficheiro, { pedir, aprendidas, ano } = {}) {
  const resposta = await pedir([{ texto: PROMPT }, ficheiro]);
  const extrato = normalizarExtrato(resposta, { aprendidas, ano });
  if (!extrato) throw new Error('Este PDF não parece um extrato bancário.');
  if (!extrato.movimentos.length) throw new Error('Não encontrei movimentos neste extrato.');
  return extrato;
}
