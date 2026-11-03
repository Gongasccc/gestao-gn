// Lista semanal: secções (corredores) do supermercado e agrupamento por loja.
// A ordem padrão segue o percurso habitual de um supermercado português: frescos à entrada,
// depois padaria, talho/peixaria, charcutaria, laticínios, mercearia… e os congelados no fim,
// para não descongelarem no carrinho. Cada loja pode ter a sua própria ordem.
// Funções puras (testadas em tests/lista-compras.test.mjs).

export const SECCOES = [
  { id: 'frescos', emoji: '🥦', nome: 'Fruta e legumes' },
  { id: 'padaria', emoji: '🥖', nome: 'Padaria e pastelaria' },
  { id: 'talho', emoji: '🥩', nome: 'Talho e peixaria' },
  { id: 'charcutaria', emoji: '🧀', nome: 'Charcutaria e queijos' },
  { id: 'laticinios', emoji: '🥛', nome: 'Laticínios e ovos' },
  { id: 'mercearia', emoji: '🍝', nome: 'Mercearia' },
  { id: 'pequeno', emoji: '🥣', nome: 'Pequeno-almoço, doces e snacks' },
  { id: 'bebidas', emoji: '🥤', nome: 'Bebidas' },
  { id: 'limpeza', emoji: '🧽', nome: 'Limpeza e casa' },
  { id: 'higiene', emoji: '🧴', nome: 'Higiene' },
  { id: 'bebe', emoji: '🍼', nome: 'Bebé' },
  { id: 'animais', emoji: '🐾', nome: 'Animais' },
  { id: 'congelados', emoji: '🧊', nome: 'Congelados' },
  { id: 'outros', emoji: '🛒', nome: 'Outros' },
];

export const ORDEM_PADRAO = SECCOES.map((s) => s.id);
export const emojiSeccao = (id) => SECCOES.find((s) => s.id === id)?.emoji || '🛒';
export const nomeSeccao = (id) => SECCOES.find((s) => s.id === id)?.nome || 'Outros';

/**
 * Identidade visual de cada cadeia (cores da marca + sigla), para os cabeçalhos da lista.
 * As lojas desconhecidas recebem uma cor estável a partir do nome.
 */
const MARCAS = {
  continente: { cor: '#E30613', cor2: '#B0000E', texto: '#fff', sigla: 'C' },
  pingodoce: { cor: '#7AB51D', cor2: '#3E8E1F', texto: '#fff', sigla: 'PD' },
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

// Categorias das faturas -> secções da lista.
const DE_CATEGORIA = {
  frescos: 'frescos', talho: 'talho', laticinios: 'laticinios', padaria: 'padaria', mercearia: 'mercearia',
  congelados: 'congelados', bebidas: 'bebidas', limpeza: 'limpeza', higiene: 'higiene', bebe: 'bebe', animais: 'animais',
};
export const seccaoDeCategoria = (cat) => DE_CATEGORIA[cat] || '';

// Palavras-chave por secção (sem acentos; plurais tratados automaticamente).
// Ganha a expressão mais comprida que aparecer no nome ("leite de coco" ganha a "leite").
const PALAVRAS = {
  frescos: `fruta maca banana laranja limao lima pera uva morango kiwi ananas melao melancia pessego ameixa abacate manga
    tangerina clementina mirtilo framboesa figo romã roma cereja diospiro legume alface tomate tomate cherry cebola alho batata
    batata doce cenoura courgette curgete pepino pimento brocolo couve couve flor espinafre rucula cogumelo abobora beringela
    feijao verde salsa coentro hortela manjericao alho frances nabo beterraba gengibre rabanete agriao salada alecrim`,
  padaria: `pao paozinho baguete broa bola de berlim croissant regueifa bolo pao de forma pao de leite carcaca papo seco
    pastel de nata queque`,
  talho: `carne frango peru porco vaca novilho vitela borrego bife costeleta entrecosto febra lombo carne picada hamburguer
    almondega entremeada peito de frango perna de frango coxa asa de frango peixe pescada bacalhau salmao dourada robalo
    sardinha carapau polvo lula choco camarao marisco ameijoa mexilhao atum fresco espetada`,
  charcutaria: `fiambre presunto chourico salpicao paio mortadela bacon salame alheira farinheira queijo mozzarella requeijao
    queijo fresco queijo ralado queijo flamengo`,
  laticinios: `leite iogurte manteiga nata ovo margarina kefir skyr bebida de aveia bebida de soja bebida de amendoa
    bebida vegetal tofu pudim leite condensado`,
  mercearia: `arroz massa esparguete macarrao fusilli lasanha farinha acucar sal azeite oleo vinagre feijao grao grao de bico
    lentilha atum conserva lata enlatado molho ketchup maionese mostarda tempero especiaria pimenta oregao caldo sopa
    tomate pelado polpa de tomate passata milho azeitona tortilha wrap tosta pao ralado fermento leite de coco pure bechamel
    noodles cuscuz quinoa`,
  pequeno: `cereal aveia flocos de aveia granola muesli cafe capsula cha cacau chocolate bolacha biscoito compota doce mel
    nutella creme de barrar manteiga de amendoim goma snack batata frita pipoca fruto seco amendoim noz amendoa caju
    barra de cereais gelatina`,
  bebidas: `agua sumo nectar refrigerante coca cola ice tea cerveja vinho espumante gin whisky vodka licor sidra tonica
    bebida agua com gas`,
  limpeza: `detergente lixivia amaciador esfregao esponja papel de cozinha rolo de cozinha guardanapo saco do lixo saco de lixo
    lava loica loica limpa vidros desengordurante multiusos pastilha para maquina sal para maquina ambientador pano luva
    papel de aluminio pelicula aderente papel vegetal vela fosforo pilha lampada tira nodoas`,
  higiene: `papel higienico champo gel de banho sabonete pasta de dentes dentifrico escova de dentes desodorizante creme
    lamina gilete cotonete penso tampao algodao elixir fio dental protetor solar condicionador lenco lenco de papel
    creme hidratante desmaquilhante`,
  bebe: `fralda toalhita papa leite de transicao biberao chupeta boiao`,
  animais: `racao areia para gato areia de gato comida de cao comida de gato comida para cao comida para gato petisco para cao
    snack para cao snack para gato`,
  congelados: `gelado pizza douradinho nugget legumes congelados ervilha`,
};

// Palavras que decidem sozinhas (ex.: "ervilhas congeladas", "sardinhas em lata").
const FORTES = { congelado: 'congelados', ultracongelado: 'congelados', lata: 'mercearia', conserva: 'mercearia', enlatado: 'mercearia' };

const semAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Singular aproximado em português ("pães" -> "pao", "ovos" -> "ovo", "limões" -> "limao"). */
function singular(p) {
  if (p.length <= 3) return p;
  if (/oes$|aes$/.test(p)) return `${p.slice(0, -3)}ao`;
  if (/ns$/.test(p)) return `${p.slice(0, -2)}m`;
  if (/(r|z)es$/.test(p)) return p.slice(0, -2);
  if (/is$/.test(p) && !/(lis|tis|ris)$/.test(p)) return `${p.slice(0, -2)}l`; // cereais -> cereal
  if (/s$/.test(p)) return p.slice(0, -1);
  return p;
}

/** Palavras normalizadas (minúsculas, sem acentos, no singular), sem números nem unidades. */
export function palavras(texto) {
  return semAcentos(texto).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && !/^\d/.test(p) && !/^(x|un|kg|g|gr|l|lt|ml|cl)$/.test(p))
    .map((p) => (/^(congelad|ultracongelad)/.test(p) ? p.replace(/(a|o)s?$/, 'o') : singular(p)));
}

// Expressões conhecidas com várias palavras; o resto da lista são palavras soltas.
const MULTI = [
  'tomate cherry', 'batata doce', 'couve flor', 'feijao verde', 'alho frances', 'bola de berlim', 'pao de forma', 'pao de leite',
  'papo seco', 'pastel de nata', 'carne picada', 'peito de frango', 'perna de frango', 'asa de frango', 'atum fresco',
  'queijo fresco', 'queijo ralado', 'queijo flamengo', 'bebida de aveia', 'bebida de soja', 'bebida de amendoa', 'bebida vegetal',
  'leite condensado', 'grao de bico', 'tomate pelado', 'polpa de tomate', 'pao ralado', 'leite de coco', 'flocos de aveia',
  'creme de barrar', 'manteiga de amendoim', 'batata frita', 'fruto seco', 'barra de cereais', 'coca cola', 'ice tea',
  'agua com gas', 'papel de cozinha', 'rolo de cozinha', 'saco do lixo', 'saco de lixo', 'lava loica', 'limpa vidros',
  'pastilha para maquina', 'sal para maquina', 'papel de aluminio', 'pelicula aderente', 'papel vegetal', 'tira nodoas',
  'papel higienico', 'gel de banho', 'pasta de dentes', 'escova de dentes', 'fio dental', 'protetor solar', 'lenco de papel',
  'creme hidratante', 'leite de transicao', 'areia para gato', 'areia de gato', 'comida de cao', 'comida de gato',
  'comida para cao', 'comida para gato', 'petisco para cao', 'snack para cao', 'snack para gato', 'legumes congelados',
];

const INDICE = Object.entries(PALAVRAS).flatMap(([sec, lista]) => {
  const tokens = lista.trim().split(/\s+/);
  return frases(tokens).map((f) => ({ sec, frase: palavras(f).join(' ') }));
});

function frases(tokens) {
  const juntas = new Set(MULTI);
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    let usada = false;
    for (let n = 4; n >= 2 && !usada; n -= 1) {
      const f = tokens.slice(i, i + n).join(' ');
      if (juntas.has(f)) { out.push(f); i += n - 1; usada = true; }
    }
    if (!usada) out.push(tokens[i]);
  }
  return out;
}


/** Secção provável de um artigo pelo nome ("2 pacotes de leite" -> 'laticinios'). '' se não souber. */
export function adivinharSeccao(texto) {
  const ps = palavras(texto);
  if (!ps.length) return '';
  for (const p of ps) if (FORTES[p]) return FORTES[p];
  const alvo = ` ${ps.join(' ')} `;
  let melhor = null;
  for (const e of INDICE) {
    if (!alvo.includes(` ${e.frase} `)) continue;
    const peso = e.frase.split(' ').length * 100 + e.frase.length;
    if (!melhor || peso > melhor.peso) melhor = { sec: e.sec, peso };
  }
  return melhor?.sec || '';
}

/** Chave para lembrar a loja/secção de um artigo ("2x Leite Mimosa" e "leite mimosa" são o mesmo). */
export function chaveArtigo(texto) {
  return palavras(texto).join(' ');
}

/** Ordem das secções para uma loja: a personalizada, completada com as que faltarem. */
export function ordemDaLoja(personalizada) {
  const valida = (Array.isArray(personalizada) ? personalizada : []).filter((id) => ORDEM_PADRAO.includes(id));
  const vistas = new Set(valida);
  return [...valida, ...ORDEM_PADRAO.filter((id) => !vistas.has(id))];
}

export const chaveLoja = (loja) => semAcentos(loja).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'geral';

/**
 * Agrupa os artigos por supermercado e, dentro de cada um, por secção na ordem dos corredores.
 * itens: [{ id, texto, feita, loja?, seccao?, timestamp }]
 * opts.memoria: { [chaveArtigo]: { loja?, seccao? } }  (escolhas anteriores do casal)
 * opts.ordens: { [chaveLoja]: [seccaoId…] }
 * opts.categoria: (texto) => categoria das faturas ou '' (opcional, quando as palavras não chegam)
 * Devolve { grupos: [{ loja, chave, total, seccoes: [{ id, nome, itens }] }], feitos: [...] }.
 * Os artigos sem loja ficam no grupo loja '' (primeiro), as lojas seguem por n.º de artigos.
 */
export function agruparLista(itens, { memoria = {}, ordens = {}, categoria = () => '' } = {}) {
  const pendentes = [];
  const feitos = [];
  for (const i of itens) {
    const lembrado = memoria[chaveArtigo(i.texto)] || {};
    const loja = (i.loja ?? lembrado.loja ?? '').trim();
    const seccao = (ORDEM_PADRAO.includes(i.seccao) && i.seccao)
      || (ORDEM_PADRAO.includes(lembrado.seccao) && lembrado.seccao)
      || adivinharSeccao(i.texto)
      || seccaoDeCategoria(categoria(i.texto))
      || 'outros';
    (i.feita ? feitos : pendentes).push({ ...i, loja, seccao });
  }
  const porLoja = new Map();
  for (const i of pendentes) {
    const k = i.loja ? chaveLoja(i.loja) : '';
    if (!porLoja.has(k)) porLoja.set(k, { loja: i.loja, chave: k, itens: [] });
    porLoja.get(k).itens.push(i);
  }
  const grupos = [...porLoja.values()].map((g) => {
    const ordem = ordemDaLoja(ordens[g.chave]);
    const seccoes = ordem
      .map((id) => ({
        id,
        nome: nomeSeccao(id),
        itens: g.itens.filter((i) => i.seccao === id).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)),
      }))
      .filter((s) => s.itens.length);
    return { loja: g.loja, chave: g.chave, total: g.itens.length, seccoes };
  }).sort((a, b) => (a.chave === '' ? -1 : b.chave === '' ? 1 : b.total - a.total || a.loja.localeCompare(b.loja)));
  feitos.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
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
