// Interpreta o texto de um talão (lido por OCR no dispositivo ou extraído de um PDF)
// e tenta tirar a loja, a data, o total e as linhas de produtos. É heurístico:
// o resultado é sempre mostrado para confirmar antes de guardar.
import { arred } from './stats.js';
import { nifValido } from './qr.js';
import { agruparRepetidos, expandirNome } from './produtos.js';

const CADEIAS = [
  ['Continente', /CONTINENTE|MODELO CONTINENTE/],
  ['Pingo Doce', /PINGO\s*DOCE/],
  ['Lidl', /\bLIDL\b/],
  ['Auchan', /AUCHAN|JUMBO/],
  ['Intermarché', /INTERMARCH/],
  ['Mercadona', /MERCADONA/],
  ['Minipreço', /MINIPRE[CÇ]O|\bDIA PORTUGAL/],
  ['Aldi', /\bALDI\b/],
  ['E.Leclerc', /LECLERC/],
  ['Spar', /\bSPAR\b/],
  ['Meu Super', /MEU\s*SUPER/],
  ['Froiz', /FROIZ/],
  ['Coviran', /COVIRAN/],
  ['Amanhecer', /AMANHECER/],
  ['Recheio', /RECHEIO/],
  ['Makro', /MAKRO/],
];

// Linhas que têm valores mas não são produtos.
const NAO_PRODUTO = /TOTAL|SUBTOTAL|SUB-TOTAL|\bIVA\b|TAXA|\bBASE\b|INCID|TROCO|ENTREGUE|MULTIBANCO|NUMER[AÁ]RIO|DINHEIRO|\bVISA\b|MASTERCARD|MB\s?WAY|CART[AÃ]O|PAGAMENTO|\bPAGO\b|SALDO|ACUMUL|\bNIF\b|NIPC|CONTRIBUINTE|CAPITAL|TELEF|\bTEL\b|ATCUD|\bDATA\b|\bHORA\b|OPERADOR|CAIXA|N\.?º|DOC\b|FATURA|FACTURA|CONTA\b|PONTOS|CUP[AÃ]O GERADO|TALAO|TALÃO/;
const DESCONTO = /DESC|POUPAN|PROMO|CUP[AÃ]O|OFERTA|LEVE\s*\d|DESCONTO|REDU[CÇ]/;
const eTotal = (rotulo) => /^(TOTAL|A PAGAR|VALOR A PAGAR)\b/.test(rotulo)
  && !/SUB|IVA|BASE|S\/|SEM|ITENS|ARTIGOS|POUPAN|DESC|PONTOS|QTD|UNID/.test(rotulo);

// Valor no fim da linha, ex.: "1,99", "-0,50", "1.234,56 €", "0,89 A", "2,49 C".
const VALOR_FIM = /(-?\s?\d{1,4}(?:[.\s]\d{3})*[.,]\d{2})\s*(?:€|EUR)?\s*(?:[A-F]|\d{1,2}%)?\s*\*?\s*$/;
// Linha de quantidade, ex.: "2 X 0,89", "1,234 kg x 1,29 EUR/kg", "3 UN x 1,00".
const QTD = /^(\d+(?:[.,]\d{1,3})?)\s*(KG|UN|L|X)?\s*[X×*]\s*(\d+[.,]\d{2})/;
// Quantidade no meio da linha do produto, ex.: "IOGURTE NAT 4 X 0,45 1,80" ou "BANANA 1,234 KG X 1,29 1,59".
const QTD_MEIO = /\s(\d+(?:[.,]\d{1,3})?)\s*(KG|UN|L)?\s*[X×*]\s*(\d+[.,]\d{2})(?:\s*(?:€|EUR)?\/?\s*(?:KG|UN|L)?)?\s+(?=-?\d)/;
// Formato Lidl: preço × quantidade, ex.: "LEITE MEIO GORDO 0,79 X 2 1,58 A".
const PRECO_X_QTD = /\s(\d+[.,]\d{2})\s*[X×*]\s*(\d{1,3})\s+(?=-?\d)/;

const paraNumero = (s) => {
  const limpo = String(s).replace(/\s/g, '');
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  return parseFloat(normal);
};

const titulo = (s) => s.toLowerCase()
  .replace(/(^|\s|[-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(\d+(?:[.,]\d+)?)\s?(kg|gr|g|ml|cl|l|un)\b/gi, (m, n, u) => `${n} ${u.toLowerCase() === 'l' ? 'L' : u.toLowerCase()}`);

const limparNome = (s) => s
  .replace(/^\(?[A-Z]\)\s*/, '') // "(C) LEITE…" (marcação de taxa de IVA)
  .replace(/^\d{6,14}\s+/, '') // código EAN no início
  .replace(/\s{2,}/g, ' ')
  .replace(/[*#|_]+/g, ' ')
  .trim();

const CATEGORIA_POR_PALAVRA = [
  ['charcutaria', /FIAMBRE|PRESUNTO|CHOURI|SALPIC|\bPAIO\b|MORTADELA|BACON|SALAME|ALHEIRA|FARINHEIRA|PEPERONI|PEPPERONI|\bLOMBO FUM|PERU FUM/],
  ['laticinios', /LEITE|IOGURTE|QUEIJO|MANTEIGA|NATAS|OVOS|\bOVO\b|BEBIDA VEG/],
  ['frescos', /BANANA|MA[CÇ][AÃ]|LARANJA|PERA\b|TOMATE|ALFACE|BATATA|CEBOLA|CENOURA|ALHO|FRUTA|LEGUM|SALADA|KIWI|LIM[AÃ]O|ESPINAF|BR[OÓ]COL|COUVE|PIMENTO|COGUMELO|ABACATE|MORANGO|UVA/],
  ['talho', /FRANGO|PERU|PORCO|VACA|NOVILHO|BIFE|CARNE|SALSICH|BACALHAU|PESCADA|SALM[AÃ]O|ATUM FRESCO|DOURADA|ROBALO|PEIXE|CAMAR[AÃ]O|LOMBO|COSTELET|HAMB[UÚ]RG/],
  ['padaria', /\bP[AÃ]O\b|CARCA[CÇ]|BROA|CROISSANT|BOLO|TOSTA|BAGUETE|BOLA[CÇ]/],
  ['congelados', /CONGEL|GELADO|ULTRACONG/],
  ['bebidas', /[AÁ]GUA|SUMO|REFRIG|COLA\b|CERVEJA|VINHO|NECTAR|N[EÉ]CTAR|CAF[EÉ]|CH[AÁ]\b|ICE TEA|SPRITE|FANTA|SUPER BOCK|SAGRES/],
  ['limpeza', /DETERG|LIXIVIA|LIX[IÍ]VIA|AMACIADOR|LAVA|LIMPA|ESFREG|SACOS LIXO|PAPEL COZINHA|GUARDANAPO|ROLO/],
  ['higiene', /CHAMP|GEL BANHO|SABONETE|DENT[IÍ]FR|PASTA DENT|ESCOVA|DESODOR|PAPEL HIG|COTONETE|PENSO|CREME|L[AÂ]MINA|TOALHITA/],
  ['bebe', /FRALDA|PAPA\b|BEB[EÉ]/],
  ['animais', /\bC[AÃ]O\b|GATO|RA[CÇ][AÃ]O|PET\b|AREIA GATO/],
  ['mercearia', /ARROZ|MASSA|ESPARGUETE|FEIJ[AÃ]O|GR[AÃ]O|AZEITE|[OÓ]LEO|A[CÇ][UÚ]CAR|FARINHA|SAL\b|CEREA|BOLACHA|ATUM|SARDINHA|CONSERVA|MOLHO|KETCHUP|MAIONESE|CHOCOLATE|COMPOTA|MEL\b|VINAGRE|ESPECIARIA|BATATAS FRITAS|SNACK/],
];

export function categoriaPorNome(nome) {
  const n = String(nome || '').toUpperCase().normalize('NFC');
  const hit = CATEGORIA_POR_PALAVRA.find(([, re]) => re.test(n));
  return hit ? hit[0] : 'outros';
}

function lerData(linhas) {
  for (const l of linhas) {
    let m = l.match(/\b(\d{4})[-/.](\d{2})[-/.](\d{2})\b/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = l.match(/\b(\d{2})[-/.](\d{2})[-/.](\d{4}|\d{2})\b/);
    if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) {
      const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${ano}-${m[2]}-${m[1]}`;
    }
  }
  return '';
}

function lerHora(linhas) {
  for (const l of linhas) {
    const m = l.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)(?::[0-5]\d)?\b/);
    if (m && !/\d[.,]\d{2}\s*$/.test(l.slice(0, m.index))) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return '';
}

function lerNif(linhas) {
  for (const l of linhas) {
    const m = l.match(/(?:NIF|NIPC|CONTRIB\w*|N\.?\s?I\.?\s?F\.?)\D{0,12}(?:PT)?\s?(\d{9})\b/);
    if (m && nifValido(m[1]) && m[1] !== '999999990') return m[1];
  }
  return '';
}

/** Interpreta o texto completo de um talão. Devolve uma fatura parcial no formato da app. */
export function analisarTexto(texto) {
  const linhas = String(texto || '')
    .normalize('NFC')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(Boolean);

  const textoTodo = linhas.join('\n');
  const cadeia = CADEIAS.find(([, re]) => re.test(textoTodo));

  const itens = [];
  const descontos = [];
  let total = 0;
  let nomePendente = '';
  let terminou = false;

  for (const linha of linhas) {
    if (terminou) break;
    const valorM = linha.match(VALOR_FIM);
    const qtdM = linha.match(QTD);

    if (valorM && eTotal(linha.slice(0, valorM.index).trim())) {
      const v = paraNumero(valorM[1]);
      if (v > 0) { total = arred(v); terminou = itens.length > 0; }
      continue;
    }

    // Linha de quantidade: aplica-se ao último produto (ou ao nome pendente na linha anterior).
    if (qtdM) {
      const quantidade = paraNumero(qtdM[1]);
      const precoUnitario = paraNumero(qtdM[3]);
      const unidade = /KG/.test(linha) ? 'kg' : (qtdM[2] === 'L' ? 'L' : 'un');
      const linhaTotal = valorM && valorM.index > qtdM[0].length - 2 ? paraNumero(valorM[1]) : arred(quantidade * precoUnitario);
      if (nomePendente) {
        itens.push(novoItem(nomePendente, quantidade, unidade, precoUnitario, linhaTotal));
        nomePendente = '';
      } else if (itens.length) {
        Object.assign(itens[itens.length - 1], {
          quantidade, unidade, precoUnitario: arred(precoUnitario), total: arred(linhaTotal),
        });
      }
      continue;
    }

    if (!valorM) {
      // Um nome sem preço costuma ser seguido da linha da quantidade.
      const nome = limparNome(linha);
      nomePendente = /\p{L}{3}/u.test(nome) && !NAO_PRODUTO.test(nome) && nome.length <= 60 ? nome : '';
      continue;
    }

    const valor = paraNumero(valorM[1]);
    const nome = limparNome(linha.slice(0, valorM.index));
    if (!/\p{L}{2}/u.test(nome)) continue;

    if (valor < 0 || DESCONTO.test(nome)) {
      const v = arred(Math.abs(valor));
      if (!v) continue;
      descontos.push({ descricao: titulo(nome), valor: v });
      const ultimo = itens[itens.length - 1];
      if (ultimo && valor < 0) {
        ultimo.desconto = arred(ultimo.desconto + v);
        ultimo.total = arred(ultimo.total - v);
      }
      nomePendente = '';
      continue;
    }

    nomePendente = '';
    if (NAO_PRODUTO.test(nome) || valor <= 0 || valor > 500) continue;
    const meio = linha.match(QTD_MEIO);
    const lidl = !meio && linha.match(PRECO_X_QTD);
    if (meio || lidl) {
      const quantidade = paraNumero(meio ? meio[1] : lidl[2]);
      const precoUnitario = paraNumero(meio ? meio[3] : lidl[1]);
      const unidade = meio && meio[2] === 'KG' ? 'kg' : (meio && meio[2] === 'L' ? 'L' : 'un');
      const nomeLimpo = limparNome(linha.slice(0, (meio || lidl).index));
      // Só aceita se a conta bater certo (evita confundir "6X1L" com uma quantidade).
      if (quantidade > 0 && Math.abs(quantidade * precoUnitario - valor) <= 0.02 + valor * 0.01 && /\p{L}{2}/u.test(nomeLimpo)) {
        itens.push(novoItem(nomeLimpo, quantidade, unidade, precoUnitario, valor));
        continue;
      }
    }
    itens.push(novoItem(nome, 1, 'un', valor, valor));
  }

  const poupanca = arred(descontos.reduce((s, d) => s + d.valor, 0));
  return {
    loja: cadeia ? cadeia[0] : '',
    nif: lerNif(linhas),
    data: lerData(linhas),
    hora: lerHora(linhas),
    total: total || arred(itens.reduce((s, i) => s + i.total, 0)),
    poupanca,
    itens: agruparRepetidos(itens),
    descontos,
  };
}

function novoItem(nome, quantidade, unidade, precoUnitario, total) {
  const produto = expandirNome(nome);
  const cat = categoriaPorNome(nome);
  return {
    nome,
    produto,
    quantidade: quantidade || 1,
    unidade,
    precoUnitario: arred(precoUnitario),
    total: arred(total),
    desconto: 0,
    categoria: cat !== 'outros' ? cat : categoriaPorNome(produto),
  };
}

/**
 * Junta os dados do QR (fiáveis: NIF, data, total) com os do texto (produtos).
 * O QR ganha sempre nos campos fiscais.
 */
export function juntarLeituras(qr, texto) {
  const base = texto || { itens: [], descontos: [], poupanca: 0 };
  if (!qr) return base;
  return {
    ...base,
    ...Object.fromEntries(Object.entries(qr).filter(([, v]) => v !== '' && v != null)),
    loja: qr.loja || base.loja || '',
    hora: base.hora || '',
    itens: base.itens || [],
    descontos: base.descontos || [],
    poupanca: base.poupanca || 0,
  };
}

/**
 * Nova categoria "charcutaria" (antes ficava em "talho"): devolve os itens com fiambre, presunto,
 * chouriço… passados para charcutaria, ou null se nada mudou. Não mexe no que foi corrigido à mão.
 */
export function reclassificarCharcutaria(itens) {
  let mudou = false;
  const out = (itens || []).map((i) => {
    if (i.confirmado || i.categoria === 'charcutaria') return i;
    if (categoriaPorNome(i.produto || i.nome) !== 'charcutaria') return i;
    mudou = true;
    return { ...i, categoria: 'charcutaria' };
  });
  return mudou ? out : null;
}
