// Nomes padrão dos produtos. Os talões encurtam os nomes ("LEITE UHT M/G MIM 1L"), por isso:
// 1) expandimos as abreviaturas mais comuns dos talões portugueses;
// 2) lemos a embalagem (1 L, 6x1 L, 500 g…) para comparar o preço por litro/quilo;
// 3) a app aprende: cada fatura guardada ensina o nome padrão e a categoria de cada linha
//    do talão (dicionário do casal em config/produtos). Correções feitas à mão ganham sempre.
// Funções puras (testadas em tests/produtos.test.mjs).

// Abreviaturas por palavra (já em maiúsculas e sem acentos). A ordem não importa.
const ABREV = {
  // laticínios
  MG: 'meio-gordo', 'M/G': 'meio-gordo', 'M.G': 'meio-gordo', 'M.G.': 'meio-gordo', MGORDO: 'meio-gordo', 'M/GORDO': 'meio-gordo',
  MAG: 'magro', MAGR: 'magro', GORD: 'gordo', 'S/LACT': 'sem lactose', 'S/LACTOSE': 'sem lactose', SLACT: 'sem lactose',
  IOG: 'iogurte', IOGT: 'iogurte', IOGUR: 'iogurte', QJ: 'queijo', QJO: 'queijo', QUEIJ: 'queijo', FLAM: 'flamengo',
  MANT: 'manteiga', MARG: 'margarina', NAT: 'natural', NATUR: 'natural', LIQ: 'líquido', AROM: 'aromatizado',
  FAT: 'fatiado', FATIAD: 'fatiado', RAL: 'ralado', BEB: 'bebida', VEG: 'vegetal', AVEI: 'aveia', SOJ: 'soja',
  // mercearia
  AZ: 'azeite', AZT: 'azeite', 'V.EXTRA': 'virgem extra', VEXTRA: 'virgem extra', VIRG: 'virgem', EXT: 'extra',
  ACUC: 'açúcar', ACUCAR: 'açúcar', FAR: 'farinha', FARIN: 'farinha', ARR: 'arroz', CAROL: 'carolino', AGULH: 'agulha',
  ESPARG: 'esparguete', MAS: 'massa', MASS: 'massa', FEIJ: 'feijão', GRAO: 'grão', CER: 'cereais', CEREAIS: 'cereais',
  BOL: 'bolacha', BOLAC: 'bolacha', BOLACH: 'bolacha', CHOC: 'chocolate', CHOCOL: 'chocolate', COMP: 'compota',
  CONS: 'conserva', ATU: 'atum', SARD: 'sardinha', OLE: 'óleo', OLEO: 'óleo', VIN: 'vinagre', MOL: 'molho', MAION: 'maionese',
  INTEG: 'integral', INT: 'integral', BIO: 'biológico', 'S/ACUC': 'sem açúcar', 'S/ACUCAR': 'sem açúcar', 'S/SAL': 'sem sal',
  'C/': 'com', 'S/': 'sem', CAF: 'café', CAPS: 'cápsulas', SOL: 'solúvel', MOID: 'moído', GRAOS: 'em grão',
  // bebidas
  AG: 'água', AGUA: 'água', MIN: 'mineral', GAS: 'com gás', SUM: 'sumo', REFR: 'refrigerante', REFRIG: 'refrigerante',
  CERV: 'cerveja', VINH: 'vinho', TTO: 'tinto', TINT: 'tinto', BCO: 'branco', BRANC: 'branco', NECT: 'néctar',
  // frescos, talho e peixaria
  FGO: 'frango', FRANG: 'frango', FRAN: 'frango', PEIT: 'peito', PERN: 'perna', BIF: 'bife', BIFS: 'bifes',
  PORC: 'porco', NOV: 'novilho', NOVIL: 'novilho', VAC: 'vaca', CARN: 'carne', PIC: 'picada', PICAD: 'picada',
  FIAMB: 'fiambre', FIAM: 'fiambre', PRES: 'presunto', CHOUR: 'chouriço', SALS: 'salsichas', HAMB: 'hambúrguer',
  BACAL: 'bacalhau', BAC: 'bacalhau', PESC: 'pescada', SALM: 'salmão', CONG: 'congelado', CONGEL: 'congelado', ULTRAC: 'ultracongelado',
  TOM: 'tomate', BAT: 'batata', CEB: 'cebola', CENOUR: 'cenoura', ALF: 'alface', LEG: 'legumes', FRUT: 'fruta',
  // limpeza e higiene
  DET: 'detergente', DETERG: 'detergente', ROUP: 'roupa', LOIC: 'loiça', LOICA: 'loiça', MAQ: 'máquina', AMAC: 'amaciador',
  LIX: 'lixívia', LIXIV: 'lixívia', PAP: 'papel', HIG: 'higiénico', COZ: 'cozinha', GUARD: 'guardanapos',
  CHAMP: 'champô', GEL: 'gel', BAN: 'banho', DENT: 'dentífrico', DESOD: 'desodorizante', TOALH: 'toalhitas', FRALD: 'fraldas',
  // embalagens
  EMB: 'embalagem', PCT: 'pacote', PAC: 'pacote', CX: 'caixa', GARR: 'garrafa', LT: 'lata', FRASC: 'frasco', SAQ: 'saqueta',
  UHT: 'UHT', UN: 'un', UNID: 'un', PACK: 'pack', FAM: 'familiar', MINI: 'mini', GDE: 'grande', PEQ: 'pequeno', SORT: 'sortido',
};

// Marcas próprias e marcas frequentes (para escrever bem e não as abreviar).
const MARCAS = {
  CONT: 'Continente', CNT: 'Continente', CONTINENTE: 'Continente', PD: 'Pingo Doce', 'P.DOCE': 'Pingo Doce', PDOCE: 'Pingo Doce',
  AUCH: 'Auchan', AUCHAN: 'Auchan', MIM: 'Mimosa', MIMOSA: 'Mimosa', MIMOS: 'Mimosa', AGROS: 'Agros', LACTOG: 'Lactogal',
  GRESS: 'Gresso', MILBONA: 'Milbona', NESTLE: 'Nestlé', DANONE: 'Danone', MATINAL: 'Matinal', GALLO: 'Gallo', OLIVEIRA: 'Oliveira da Serra',
  COMPAL: 'Compal', LUSO: 'Luso', VITALIS: 'Vitalis', NAVIGATOR: 'Navigator', RENOVA: 'Renova', SKIP: 'Skip', FAIRY: 'Fairy',
  DELTA: 'Delta', SICAL: 'Sical', NICOLA: 'Nicola', SAGRES: 'Sagres', 'S.BOCK': 'Super Bock', SBOCK: 'Super Bock',
  NOBRE: 'Nobre', IZIDORO: 'Izidoro', PANRICO: 'Panrico', BIMBO: 'Bimbo', ACTIVIA: 'Activia', ADAGIO: 'Adagio', LONGA: 'Longa Vida',
};

const semAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lê a embalagem no nome: "6X1L" -> { qtd: 6, unidade: 'L' } (total da embalagem, em kg, L ou un). */
export function lerEmbalagem(nome) {
  const s = semAcentos(nome).toUpperCase().replace(/×/g, 'X').replace(/(\d),(\d)/g, '$1.$2');
  const fator = { KG: 1, G: 0.001, GR: 0.001, GRS: 0.001, MG: 0.000001, L: 1, LT: 1, LTS: 1, CL: 0.01, ML: 0.001, DL: 0.1 };
  const base = (u) => (/^(KG|G|GR|GRS|MG)$/.test(u) ? 'kg' : 'L');
  // Multipack: "6X1L", "4 X 125G", "2X0,5KG"
  let m = s.match(/\b(\d{1,3})\s?X\s?(\d+(?:\.\d+)?)\s?(KG|GRS?|G|LTS?|L|CL|ML|DL)\b/);
  if (m) return { qtd: Number(m[1]) * Number(m[2]) * fator[m[3]], unidade: base(m[3]), texto: `${m[1]} × ${m[2]} ${m[3].toLowerCase().replace(/^l.*/, 'L')}` };
  m = s.match(/\b(\d+(?:\.\d+)?)\s?(KG|GRS?|G|LTS?|L|CL|ML|DL)\b/);
  if (m && !(m[2] === 'MG' && /LEITE/.test(s))) {
    return { qtd: Number(m[1]) * fator[m[2]], unidade: base(m[2]), texto: `${m[1]} ${m[2].toLowerCase().replace(/^l.*/, 'L')}` };
  }
  m = s.match(/\b(\d{1,3})\s?(UN|UNID|UNIDADES|DOSES|ROLOS|CAPS|SAQUETAS|OVOS)\b/);
  if (m) return { qtd: Number(m[1]), unidade: 'un', texto: `${m[1]} un` };
  return null;
}

/** Expande as abreviaturas de um nome de talão e devolve um nome legível. */
export function expandirNome(nome) {
  const limpo = semAcentos(nome).toUpperCase()
    .replace(/^\(?[A-Z]\)\s*/, '')
    .replace(/[*#|_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const palavras = limpo.split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < palavras.length; i += 1) {
    const p = palavras[i];
    const semPonto = p.replace(/\.$/, '');
    if (MARCAS[p] || MARCAS[semPonto]) { out.push(MARCAS[p] || MARCAS[semPonto]); continue; }
    // Embalagens e números: "1L", "500G", "6X1L"
    if (/\d/.test(p)) {
      out.push(p.replace(/(\d),(\d)/g, '$1,$2')
        .replace(/^(\d+(?:[.,]\d+)?)(KG|GRS?|G|LTS?|L|CL|ML)$/, (x, n, u) => `${n.replace('.', ',')} ${/^L/.test(u) ? 'L' : u.toLowerCase().replace(/^gr.*/, 'g')}`)
        .replace(/^(\d+)X(\d+(?:[.,]\d+)?)(KG|GRS?|G|LTS?|L|CL|ML)$/, (x, q, n, u) => `${q} × ${n.replace('.', ',')} ${/^L/.test(u) ? 'L' : u.toLowerCase().replace(/^gr.*/, 'g')}`)
        .replace(/^(\d+)D$/, '$1 doses')
        .toLowerCase().replace(/ l$/, ' L'));
      continue;
    }
    const exp = ABREV[p] || ABREV[semPonto];
    if (exp) { out.push(exp); continue; }
    // "S/LACT" escrito junto com outra coisa
    if (/^[SC]\//.test(p)) { out.push(`${p[0] === 'S' ? 'sem' : 'com'} ${(ABREV[p.slice(2)] || p.slice(2)).toLowerCase()}`); continue; }
    out.push(p.toLowerCase());
  }
  const frase = out.join(' ').replace(/\s+/g, ' ').trim();
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

/** Chave de uma linha de talão (para o dicionário): sem acentos, espaços nem pontuação. */
export function chaveTalao(nome) {
  return semAcentos(nome).toUpperCase()
    .replace(/^\(?[A-Z]\)\s*/, '')
    .replace(/^\d{6,14}\s+/, '')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 80);
}

/** Chave da cadeia (os talões de cada cadeia abreviam de maneira diferente). */
export const chaveLoja = (loja) => semAcentos(loja).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'geral';

/** Procura uma linha de talão no dicionário: primeiro na mesma cadeia, depois em qualquer loja. */
export function procurarAlias(dic, loja, nome) {
  const k = chaveTalao(nome);
  if (!k || !dic) return null;
  return dic[`${chaveLoja(loja)}:${k}`] || dic[`*:${k}`] || null;
}

/**
 * Aplica o dicionário aprendido (e as abreviaturas) aos produtos de uma fatura lida.
 * - Linhas já conhecidas ficam com o nome padrão e a categoria aprendidos.
 * - Linhas novas ficam com o nome da IA, ou com o nome expandido se a IA não o deu.
 */
export function aplicarDicionario(itens, dic, loja) {
  return (itens || []).map((i) => {
    const alias = procurarAlias(dic, loja, i.nome);
    const embalagem = lerEmbalagem(alias?.produto || i.produto || i.nome) || lerEmbalagem(i.nome);
    const item = { ...i };
    if (alias) {
      item.produto = alias.produto;
      if (alias.categoria) item.categoria = alias.categoria;
      if (alias.sub) item.sub = alias.sub;
      item.aprendido = true;
    } else if (!i.produto || chaveTalao(i.produto) === chaveTalao(i.nome)) {
      item.produto = expandirNome(i.nome || i.produto);
    }
    if (embalagem) item.embalagem = { qtd: Math.round(embalagem.qtd * 1000) / 1000, unidade: embalagem.unidade };
    return item;
  });
}

/**
 * Entradas a acrescentar ao dicionário a partir de uma fatura guardada.
 * `editados` são os índices dos produtos corrigidos à mão (ficam "confirmados" e a IA nunca os muda).
 */
export function aprenderFatura(fatura, dic = {}, editados = new Set(), agora = Date.now()) {
  const loja = chaveLoja(fatura.loja);
  const novas = {};
  (fatura.itens || []).forEach((i, idx) => {
    const k = chaveTalao(i.nome);
    if (!k || !i.produto) return;
    const confirmado = editados.has(idx) || !!i.confirmado;
    for (const chave of [`${loja}:${k}`, `*:${k}`]) {
      const antes = dic[chave];
      // Uma correção confirmada não é substituída por uma leitura automática.
      if (antes?.c && !confirmado && antes.produto !== i.produto) continue;
      if (chave.startsWith('*:') && antes && antes.produto !== i.produto && !confirmado) continue;
      novas[chave] = {
        o: i.nome,
        produto: i.produto,
        categoria: i.categoria || 'outros',
        sub: i.sub || '',
        n: (antes?.produto === i.produto ? antes.n || 1 : 0) + 1,
        c: confirmado || !!(antes?.c && antes.produto === i.produto),
        t: agora,
      };
    }
  });
  return novas;
}

/** As entradas do dicionário mais úteis para dar como exemplo à IA (as da mesma cadeia primeiro). */
export function exemplosParaIa(dic, loja, max = 60) {
  const l = `${chaveLoja(loja)}:`;
  return Object.entries(dic || {})
    .filter(([k]) => k.startsWith(l) || k.startsWith('*:'))
    .sort(([ka, a], [kb, b]) => (kb.startsWith(l) - ka.startsWith(l)) || (b.c - a.c) || (b.n - a.n))
    .slice(0, max)
    .map(([k, v]) => `${v.o || k.split(':')[1]} => ${v.produto}`);
}

/** Preço por litro/quilo/unidade de um item com embalagem conhecida. */
export function precoPorUnidade(item) {
  const e = item?.embalagem || lerEmbalagem(item?.produto || item?.nome);
  const pu = Number(item?.precoUnitario) || (Number(item?.total) || 0) / (Number(item?.quantidade) || 1);
  if (!e || !e.qtd || !pu || item?.unidade === 'kg') return null;
  return { valor: Math.round((pu / e.qtd) * 100) / 100, unidade: e.unidade };
}

/** Junta linhas repetidas do mesmo produto ao mesmo preço (o talão às vezes repete a linha). */
export function agruparRepetidos(itens) {
  const out = [];
  for (const i of itens || []) {
    const igual = out.find((o) => o.unidade === 'un' && i.unidade === 'un' && !o.desconto && !i.desconto
      && chaveTalao(o.nome) === chaveTalao(i.nome) && Math.abs(o.precoUnitario - i.precoUnitario) < 0.005);
    if (igual) {
      igual.quantidade += i.quantidade;
      igual.total = Math.round((igual.total + i.total) * 100) / 100;
    } else out.push({ ...i });
  }
  return out;
}

/** Procura por palavras: "leite meio-gordo" encontra "Leite UHT meio-gordo Mimosa 1 L". */
export function corresponde(nome, q) {
  const n = semAcentos(nome).toLowerCase();
  return semAcentos(q).toLowerCase().split(/\s+/).filter(Boolean).every((p) => n.includes(p));
}

// ---------- Consistência com as compras anteriores ----------
// O dicionário acima reconhece linhas de talão já vistas. Mas o mesmo produto pode aparecer com
// outra abreviatura (ou noutra loja) e a IA pode dar-lhe um nome ligeiramente diferente
// ("Leite meio-gordo UHT Mimosa 1 L" vs "Leite UHT meio-gordo Mimosa 1 L") ou outra categoria.
// O catálogo junta os nomes padrão já usados nas faturas guardadas e serve para:
// 1) mostrar à IA os nomes e categorias que o casal já usa; 2) corrigir no fim as pequenas diferenças.

const PALAVRAS_VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'o', 'a', 'os', 'as', 'para', 'c', 's']);

/** Chave que ignora a ordem das palavras, acentos, maiúsculas e palavras vazias. */
export function chaveNome(nome) {
  return semAcentos(nome).toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/×/g, 'x')
    .replace(/(\d)\s*(kg|g|l|ml|cl|un)\b/g, '$1$2')
    .split(/[^a-z0-9.]+/)
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .sort()
    .join(' ');
}

/**
 * Catálogo dos nomes padrão já usados: chaveNome -> { produto, categoria, n }.
 * A categoria é a mais usada para esse produto (correções à mão valem mais).
 */
export function catalogoProdutos(faturas) {
  const mapa = new Map();
  for (const f of faturas || []) {
    for (const i of f.itens || []) {
      const nome = String(i.produto || '').trim();
      const k = chaveNome(nome);
      if (!k) continue;
      let p = mapa.get(k);
      if (!p) { p = { nomes: {}, cats: {}, n: 0 }; mapa.set(k, p); }
      const peso = i.confirmado ? 3 : 1;
      p.n += 1;
      p.nomes[nome] = (p.nomes[nome] || 0) + peso;
      const cat = i.categoria || 'outros';
      p.cats[cat] = (p.cats[cat] || 0) + peso;
    }
  }
  const melhor = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0];
  const out = new Map();
  for (const [k, p] of mapa) {
    const cats = { ...p.cats };
    // "outros" só ganha se não houver outra categoria.
    if (Object.keys(cats).length > 1) delete cats.outros;
    out.set(k, { produto: melhor(p.nomes), categoria: melhor(cats), n: p.n });
  }
  return out;
}

/**
 * Alinha os produtos de uma fatura nova com o catálogo: mesmo produto => mesmo nome e mesma categoria.
 * Não toca nos produtos corrigidos à mão.
 */
export function harmonizarItens(itens, catalogo) {
  if (!catalogo?.size) return itens || [];
  return (itens || []).map((i) => {
    if (i.confirmado) return i;
    const c = catalogo.get(chaveNome(i.produto || i.nome));
    if (!c) return i;
    const item = { ...i };
    if (!i.aprendido) item.produto = c.produto;
    if (c.categoria) item.categoria = c.categoria;
    return item;
  });
}

/** Nomes padrão mais comprados, para a IA reutilizar ("Nome — categoria"). */
export function nomesParaIa(catalogo, max = 150) {
  return [...(catalogo || new Map()).values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => `${c.produto} — ${c.categoria}`);
}
