// Categorias e subcategorias de produtos, as mesmas do SuperSave (supersave.pt/web/categorias),
// usadas em toda a app: corredores da lista de compras, categorias das faturas e leitura dos talões.
//
// O SuperSave tem 16 categorias. Na loja, "Frescos" ocupa vários corredores (fruta, padaria, talho,
// charcutaria), por isso na app essa categoria aparece repartida pelas suas subcategorias; as outras 15
// são um corredor cada. Os ids antigos (frescos, talho, padaria…) mantêm-se para não mexer nos dados.
// Funções puras (testadas em tests/categorias.test.mjs).

/**
 * Cada subcategoria traz as palavras que a identificam (separadas por vírgulas; podem ter várias
 * palavras, sem acentos, no singular ou plural). Ganha a expressão mais comprida que aparecer no nome.
 */
export const CATEGORIAS = [
  {
    id: 'frescos', supersave: 'Frescos', nome: 'Fruta e legumes', emoji: '🥦',
    subs: [
      ['Frutas', `fruta, maca, banana, laranja, limao, lima, pera, uva, morango, kiwi, ananas, melao, melancia, pessego, ameixa,
        abacate, manga, tangerina, clementina, mirtilo, framboesa, figo, roma, cereja, diospiro, papaia, maracuja, nespera, alperce`],
      ['Legumes', `legume, alface, tomate, tomate cherry, cebola, alho, batata, batata doce, cenoura, courgette, curgete, pepino,
        pimento, brocolo, couve, couve flor, espinafre, rucula, cogumelo, abobora, beringela, feijao verde, salsa, coentro,
        hortela, manjericao, alho frances, nabo, beterraba, gengibre, rabanete, agriao, salada, alecrim, ervilha torta, espargo`],
    ],
  },
  {
    id: 'padaria', supersave: 'Frescos', nome: 'Padaria e pastelaria', emoji: '🥖',
    subs: [
      ['Padaria e Pastelaria', `pao, paozinho, baguete, broa, bola de berlim, croissant, regueifa, bolo, pao de forma, pao de leite,
        carcaca, papo seco, pastel de nata, queque, bolo rei, pao de lo, folar, tarte`],
    ],
  },
  {
    id: 'talho', supersave: 'Frescos', nome: 'Talho e peixaria', emoji: '🥩',
    subs: [
      ['Talho', `carne, frango, peru, porco, vaca, novilho, vitela, borrego, cabrito, coelho, bife, costeleta, entrecosto, febra,
        lombo, carne picada, hamburguer, almondega, entremeada, peito de frango, perna de frango, coxa, asa de frango, espetada,
        salsicha fresca, frango assado`],
      ['Peixaria', `peixe, pescada, bacalhau, salmao, dourada, robalo, sardinha, carapau, polvo, lula, choco, camarao, marisco,
        ameijoa, mexilhao, atum fresco, cavala, peixe espada, linguado, gamba, sapateira`],
    ],
  },
  {
    id: 'charcutaria', supersave: 'Frescos', nome: 'Charcutaria e queijos', emoji: '🧀',
    subs: [
      ['Charcutaria', `fiambre, presunto, chourico, salpicao, paio, mortadela, bacon, salame, alheira, farinheira, peito de peru,
        pepperoni, morcela, toucinho`],
      ['Queijaria', `queijo, mozzarella, queijo ralado, queijo flamengo, queijo da serra, queijo de cabra, brie, camembert, parmesao,
        gouda, emmental, cheddar, queijo creme`],
    ],
  },
  {
    id: 'laticinios', supersave: 'Laticínios e Ovos', nome: 'Laticínios e ovos', emoji: '🥛',
    subs: [
      ['Leite', `leite, leite meio gordo, leite magro, leite gordo, leite com chocolate, achocolatado, leite condensado, leite em po`],
      ['Bebidas vegetais', `bebida de aveia, bebida de soja, bebida de amendoa, bebida de arroz, bebida de coco, bebida vegetal`],
      ['Iogurtes', `iogurte, iogurte grego, iogurte liquido, kefir, skyr, iogurte natural`],
      ['Sobremesas lácteas', `pudim, mousse, leite creme, arroz doce, gelatina, sobremesa lactea`],
      ['Manteiga e margarina', `manteiga, margarina, creme vegetal`],
      ['Natas', `nata, natas, nata para culinaria, chantilly`],
      ['Ovos', `ovo, ovos, ovos caipira, clara de ovo`],
      ['Queijo fresco e requeijão', `queijo fresco, requeijao, queijo cottage, ricotta`],
    ],
  },
  {
    id: 'mercearia', supersave: 'Mercearia', nome: 'Mercearia', emoji: '🍝',
    subs: [
      ['Arroz e massa', `arroz, massa, esparguete, macarrao, fusilli, penne, lasanha, noodles, cuscuz, aletria, massa fresca`],
      ['Azeite, óleo e vinagre', `azeite, oleo, vinagre, oleo de girassol`],
      ['Conservas', `atum, conserva, lata, enlatado, sardinha em lata, cavala em lata, salsicha, milho, azeitona, cogumelo em lata,
        tomate pelado, polpa de tomate, passata`],
      ['Molhos, temperos e especiarias', `molho, ketchup, maionese, mostarda, tempero, especiaria, pimenta, oregao, caldo, sal,
        piri piri, molho de soja, pesto, bechamel`],
      ['Leguminosas e sopas', `feijao, grao, grao de bico, lentilha, ervilha seca, sopa, pure, pure de batata`],
      ['Farinha, açúcar e fermento', `farinha, acucar, fermento, pao ralado, amido, maizena, leite de coco, cacau em po para bolo`],
      ['Pequeno-almoço e cereais', `cereal, aveia, flocos de aveia, granola, muesli, papa de aveia, tosta, wrap, tortilha`],
      ['Café, chá e cacau', `cafe, capsula, cafe moido, cafe soluvel, cha, infusao, cacau, cevada`],
      ['Bolachas e biscoitos', `bolacha, biscoito, wafer, bolacha maria, cookie`],
      ['Chocolates, doces e compotas', `chocolate, compota, doce, mel, nutella, creme de barrar, manteiga de amendoim, goma, rebucado,
        chiclete, barra de cereais`],
      ['Snacks e frutos secos', `snack, batata frita, pipoca, fruto seco, amendoim, noz, amendoa, caju, pistacho, tremoco, aperitivo`],
    ],
  },
  {
    id: 'bebidas', supersave: 'Bebidas e Garrafeira', nome: 'Bebidas e garrafeira', emoji: '🥤',
    subs: [
      ['Águas', `agua, agua com gas, agua mineral, agua com sabor`],
      ['Sumos e néctares', `sumo, nectar, sumo de laranja, smoothie`],
      ['Refrigerantes', `refrigerante, coca cola, ice tea, tonica, sprite, fanta, sumol, bebida energetica, red bull`],
      ['Cervejas e sidras', `cerveja, sidra, super bock, sagres, cerveja sem alcool`],
      ['Vinhos', `vinho, vinho tinto, vinho branco, vinho rose, vinho verde, vinho do porto`],
      ['Espumantes e champanhes', `espumante, champanhe, champagne, prosecco`],
      ['Bebidas espirituosas', `gin, whisky, vodka, licor, rum, aguardente, ginja, tequila, vermute`],
    ],
  },
  {
    id: 'bio', supersave: 'Bio e Saudável', nome: 'Bio e saudável', emoji: '🌱',
    subs: [
      ['Biológicos', `biologico, produto biologico`],
      ['Sem glúten', `sem gluten`],
      ['Sem lactose', ''],
      ['Vegetariano e vegan', `vegan, vegano, vegetariano, tofu, seitan, tempeh, hamburguer vegetal, bebida proteica vegetal`],
      ['Proteína e desporto', `proteina, whey, barra proteica, iogurte proteico, creatina`],
      ['Superalimentos e sem açúcar', `quinoa, chia, sementes, linhaca, goji, sem acucar, adocante, stevia, aveia biologica`],
    ],
  },
  {
    id: 'limpeza', supersave: 'Limpeza', nome: 'Limpeza', emoji: '🧽',
    subs: [
      ['Detergente para roupa', `detergente, detergente para roupa, detergente roupa, capsulas para roupa`],
      ['Amaciador e tira-nódoas', `amaciador, tira nodoas, branqueador`],
      ['Loiça', `lava loica, loica, detergente da loica, pastilha para maquina, sal para maquina, abrilhantador`],
      ['Cozinha', `desengordurante, limpa forno, limpa vitro`],
      ['Casa de banho', `limpa wc, gel wc, anticalcario, pastilha sanita`],
      ['Multiusos e chão', `multiusos, limpa vidros, limpa chao, lava tudo, limpa moveis, cera`],
      ['Lixívia e desinfetantes', `lixivia, desinfetante, alcool, toalhita desinfetante`],
      ['Papel de cozinha e guardanapos', `papel de cozinha, rolo de cozinha, guardanapo`],
      ['Sacos do lixo', `saco do lixo, saco de lixo`],
      ['Esponjas, panos e luvas', `esfregao, esponja, pano, luva, esfregona, vassoura, balde`],
      ['Ambientadores', `ambientador, vela perfumada, mikado`],
      ['Inseticidas', `inseticida, repelente, anti traca, mata baratas`],
    ],
  },
  {
    id: 'higiene', supersave: 'Beleza e Higiene', nome: 'Beleza e higiene', emoji: '🧴',
    subs: [
      ['Cabelo', `champo, condicionador, mascara de cabelo, laca, gel de cabelo, tinta de cabelo, espuma de cabelo`],
      ['Banho', `gel de banho, sabonete, sabonete liquido, esponja de banho`],
      ['Higiene oral', `pasta de dentes, dentifrico, escova de dentes, elixir, fio dental`],
      ['Desodorizantes', `desodorizante, antitranspirante`],
      ['Rosto', `creme de rosto, desmaquilhante, agua micelar, serum, creme`],
      ['Corpo', `creme hidratante, creme de corpo, oleo de corpo, creme de maos`],
      ['Proteção solar', `protetor solar, after sun, autobronzeador`],
      ['Barbear e depilação', `lamina, gilete, espuma de barbear, cera depilatoria, maquina de barbear`],
      ['Higiene íntima', `penso, tampao, penso diario, gel intimo, copo menstrual`],
      ['Papel higiénico e lenços', `papel higienico, lenco, lenco de papel, cotonete, algodao`],
      ['Maquilhagem', `maquilhagem, rimel, batom, base, verniz, lapis de olhos`],
      ['Perfumes', `perfume, agua de colonia, eau de toilette`],
    ],
  },
  {
    id: 'bebe', supersave: 'Bebé', nome: 'Bebé', emoji: '🍼',
    subs: [
      ['Fraldas', `fralda, fralda cueca`],
      ['Toalhitas', `toalhita`],
      ['Leite infantil', `leite de transicao, leite infantil, leite em po bebe`],
      ['Papas', `papa, papa infantil`],
      ['Boiões e refeições', `boiao, refeicao bebe, pure bebe`],
      ['Snacks de bebé', `bolacha bebe, snack bebe, saqueta de fruta`],
      ['Higiene do bebé', `champo bebe, gel de banho bebe, creme muda fralda, pomada bebe`],
      ['Biberões e chupetas', `biberao, chupeta, tetina`],
      ['Acessórios', `babete, copo bebe, prato bebe`],
      ['Saúde do bebé', `soro fisiologico, termometro`],
    ],
  },
  {
    id: 'animais', supersave: 'Animais', nome: 'Animais', emoji: '🐾',
    subs: [
      ['Cão', `racao cao, comida de cao, comida para cao, petisco para cao, snack para cao, osso para cao, cao`],
      ['Gato', `racao gato, comida de gato, comida para gato, snack para gato, areia para gato, areia de gato, gato`],
      ['Outros animais', `racao, alpista, comida para peixe, comida para passaro, roedor`],
    ],
  },
  {
    id: 'congelados', supersave: 'Congelados', nome: 'Congelados', emoji: '🧊',
    subs: [
      ['Gelados', `gelado, cone, sorvete`],
      ['Pizzas', `pizza`],
      ['Legumes congelados', `legumes congelados, ervilha, espinafres congelados, brocolos congelados, mistura de legumes`],
      ['Batatas fritas congeladas', `batata frita congelada, batatas pala pala, batata congelada`],
      ['Peixe congelado', `peixe congelado, filete de pescada, posta de pescada, bacalhau congelado`],
      ['Marisco congelado', `camarao congelado, miolo de camarao, marisco congelado, delicias do mar`],
      ['Carne congelada', `carne congelada, frango congelado, hamburguer congelado`],
      ['Refeições prontas', `refeicao pronta, lasanha congelada, arroz congelado`],
      ['Douradinhos e panados', `douradinho, nugget, panado`],
      ['Salgados congelados', `rissol, croquete, pastel de bacalhau, chamuca, empada`],
      ['Fruta congelada', `fruta congelada, frutos vermelhos congelados`],
      ['Sobremesas congeladas', `sobremesa congelada, bolo gelado, tarte gelada`],
    ],
  },
  {
    id: 'casa', supersave: 'Casa, Bricolage e Jardim', nome: 'Casa, bricolage e jardim', emoji: '🏠',
    subs: [
      ['Cozinha', `papel de aluminio, pelicula aderente, papel vegetal, saco de congelacao, frigideira, panela, tacho, caixa hermetica`],
      ['Mesa', `prato, copo, talher, caneca, toalha de mesa, guardanapo de papel`],
      ['Arrumação', `caixa de arrumacao, cabide, cesto`],
      ['Têxteis', `toalha de banho, lencol, almofada, edredao, manta`],
      ['Casa de banho', `tapete de banho, cortina de banho, escova de sanita`],
      ['Decoração', `vela, moldura, vaso decorativo`],
      ['Pilhas e lâmpadas', `pilha, lampada, extensao, fosforo, isqueiro`],
      ['Eletrodomésticos', `torradeira, chaleira, ventilador, aquecedor, liquidificadora, ferro de engomar`],
      ['Ferramentas', `chave de fendas, martelo, berbequim, parafuso, fita cola`],
      ['Bricolage', `tinta, pincel, rolo de pintura, cola de contacto, silicone`],
      ['Jardim', `terra, adubo, semente, planta, vaso, mangueira`],
      ['Churrasco e exterior', `carvao, acendalha, grelha`],
    ],
  },
  {
    id: 'brinquedos', supersave: 'Brinquedos e Jogos', nome: 'Brinquedos e jogos', emoji: '🧸',
    subs: [
      ['Bonecas', `boneca, barbie, nenuco`],
      ['Carros e veículos', `carrinho de brincar, hot wheels, pista`],
      ['Construções', `lego, construcao, blocos de construcao`],
      ['Jogos de tabuleiro', `jogo de tabuleiro, monopoly, jogo de cartas, baralho`],
      ['Puzzles', `puzzle`],
      ['Peluches', `peluche`],
      ['Primeira infância', `brinquedo bebe, roca, mobile`],
      ['Educativos', `jogo educativo, brinquedo educativo`],
      ['Exterior', `bola de futebol, bicicleta, trotinete, insuflavel`],
      ['Figuras e acessórios', `figura, boneco`],
      ['Trabalhos manuais', `plasticina, slime, missanga`],
      ['Videojogos', `videojogo, jogo playstation, jogo switch, comando`],
    ],
  },
  {
    id: 'papelaria', supersave: 'Papelaria', nome: 'Papelaria', emoji: '✏️',
    subs: [
      ['Cadernos e blocos', `caderno, bloco de notas, agenda, post it`],
      ['Escrita', `caneta, lapis, esferografica, marcador, marca texto, corretor`],
      ['Material escolar', `borracha, afia, regua, tesoura, cola batom, compasso`],
      ['Mochilas e estojos', `mochila, estojo, lancheira`],
      ['Papel', `papel a4, resma, papel de impressao, cartolina`],
      ['Arquivo e organização', `pasta, dossier, capa, agrafador, agrafo, clip`],
      ['Envelopes e correio', `envelope, selo`],
      ['Pintura e desenho', `lapis de cor, marcador de cor, aguarela, guache, caderno de desenho`],
      ['Embrulho e festas', `papel de embrulho, laco, saco de presente, balao, vela de aniversario`],
    ],
  },
  {
    id: 'desporto', supersave: 'Desporto, Roupa e Viagem', nome: 'Desporto, roupa e viagem', emoji: '👟',
    subs: [
      ['Roupa', `t shirt, camisola, pijama, calcas, casaco`],
      ['Roupa interior e meias', `meia, cueca, boxer, soutien, collants`],
      ['Calçado', `chinelo, sapatilha, sapato, bota`],
      ['Desporto e fitness', `haltere, tapete de yoga, garrafa de desporto, bola`],
      ['Malas e viagem', `mala de viagem, trolley, necessaire, almofada de viagem`],
      ['Acessórios', `chapeu, oculos de sol, guarda chuva, chapeu de chuva`],
      ['Campismo e praia', `toalha de praia, chapeu de sol, geleira, tenda, saco cama`],
    ],
  },
  {
    id: 'livros', supersave: 'Livros', nome: 'Livros', emoji: '📚',
    subs: [['Livros', `livro, revista, jornal`]],
  },
  { id: 'outros', supersave: '', nome: 'Outros', emoji: '🛒', subs: [] },
].map((c) => ({
  ...c,
  subs: c.subs.map(([nome, palavras]) => ({ id: `${c.id}:${slug(nome)}`, nome, palavras: lista(palavras) })),
}));

function slug(s) {
  return semAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function lista(s) {
  return String(s).split(',').map((p) => p.trim()).filter(Boolean);
}

/** As 16 categorias do SuperSave e as suas subcategorias, tal como aparecem no site (para mostrar). */
export const SUPERSAVE = (() => {
  const out = [];
  for (const c of CATEGORIAS) {
    if (!c.supersave) continue;
    let g = out.find((x) => x.nome === c.supersave);
    if (!g) out.push(g = { nome: c.supersave, emoji: c.emoji, subs: [] });
    g.subs.push(...c.subs.map((s) => s.nome));
  }
  const frescos = out.find((x) => x.nome === 'Frescos');
  if (frescos) frescos.emoji = '🥕';
  const livros = out.find((x) => x.nome === 'Livros');
  if (livros) livros.subs = [];
  // Pela ordem do site.
  const ordem = ['Frescos', 'Laticínios e Ovos', 'Congelados', 'Mercearia', 'Bebidas e Garrafeira', 'Bio e Saudável', 'Limpeza',
    'Beleza e Higiene', 'Bebé', 'Animais', 'Casa, Bricolage e Jardim', 'Brinquedos e Jogos', 'Papelaria', 'Desporto, Roupa e Viagem', 'Livros'];
  return out.sort((a, b) => ordem.indexOf(a.nome) - ordem.indexOf(b.nome));
})();

export const IDS = CATEGORIAS.map((c) => c.id);
const POR_ID = new Map(CATEGORIAS.map((c) => [c.id, c]));
const SUB_POR_ID = new Map(CATEGORIAS.flatMap((c) => c.subs.map((s) => [s.id, { ...s, cat: c.id }])));

/** Ids antigos que deixaram de existir -> id atual (dados guardados antes desta versão). */
const ALIAS = { pequeno: 'mercearia' };
export const idAtual = (id) => (POR_ID.has(id) ? id : (ALIAS[id] || ''));

export const categoria = (id) => POR_ID.get(idAtual(id)) || POR_ID.get('outros');
export const nomeCategoria = (id) => categoria(id).nome;
export const emojiCategoria = (id) => categoria(id).emoji;
export const subcategoria = (id) => SUB_POR_ID.get(id) || null;
export const nomeSub = (id) => SUB_POR_ID.get(id)?.nome || '';
const ORDEM_SUB = new Map(CATEGORIAS.flatMap((c) => c.subs.map((s, n) => [s.id, n])));
/** Posição da subcategoria dentro da sua categoria (para ordenar as prateleiras). */
export const ordemSub = (id) => ORDEM_SUB.get(id) ?? 999;

/** "Mercearia › Arroz e massa" (ou só a categoria). */
export function rotulo(cat, sub) {
  const s = SUB_POR_ID.get(sub);
  const c = nomeCategoria(s && s.cat === idAtual(cat) ? s.cat : cat);
  return s && s.cat === idAtual(cat) ? `${c} › ${s.nome}` : c;
}

// ---------- Reconhecer um produto pelo nome ----------

export function semAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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

// Palavras que decidem sozinhas a categoria (ex.: "ervilhas congeladas", "sardinhas em lata").
const FORTES = { congelado: 'congelados', ultracongelado: 'congelados', lata: 'mercearia', conserva: 'mercearia', enlatado: 'mercearia' };

const INDICE = CATEGORIAS.flatMap((c) => c.subs.flatMap((s) => s.palavras.map((f) => ({ cat: c.id, sub: s.id, frase: palavras(f).join(' ') }))))
  .filter((e) => e.frase);

function melhorEntrada(ps, so) {
  const alvo = ` ${ps.join(' ')} `;
  let melhor = null;
  for (const e of INDICE) {
    if (so && e.cat !== so) continue;
    if (!alvo.includes(` ${e.frase} `)) continue;
    const peso = e.frase.split(' ').length * 100 + e.frase.length;
    if (!melhor || peso > melhor.peso) melhor = { ...e, peso };
  }
  return melhor;
}

/**
 * Categoria e subcategoria prováveis de um produto pelo nome.
 * "2 pacotes de leite" -> { cat: 'laticinios', sub: 'laticinios:leite' }; { cat: '', sub: '' } se não souber.
 */
export function classificar(texto) {
  const ps = palavras(texto);
  if (!ps.length) return { cat: '', sub: '' };
  for (const p of ps) {
    if (FORTES[p]) {
      const e = melhorEntrada(ps, FORTES[p]);
      return { cat: FORTES[p], sub: e?.sub || '' };
    }
  }
  const e = melhorEntrada(ps);
  return e ? { cat: e.cat, sub: e.sub } : { cat: '', sub: '' };
}

/** Subcategoria de um produto dentro de uma categoria já conhecida ('' se não souber). */
export function subcategoriaDe(texto, cat) {
  const c = idAtual(cat);
  if (!c || c === 'outros') return '';
  const ps = palavras(texto);
  if (!ps.length) return '';
  const e = melhorEntrada(ps, c);
  if (e) return e.sub;
  const subs = POR_ID.get(c)?.subs || [];
  return subs.length === 1 ? subs[0].id : '';
}

/** Lista para a IA: "mercearia: Arroz e massa | Conservas | …" (uma linha por categoria). */
export function listaParaIa() {
  return CATEGORIAS.map((c) => `- ${c.id} (${c.nome})${c.subs.length ? `: ${c.subs.map((s) => s.nome).join(' | ')}` : ''}`).join('\n');
}

/** Converte o nome de subcategoria que a IA devolveu no id ('' se não existir nessa categoria). */
export function subPorNome(cat, nome) {
  const c = POR_ID.get(idAtual(cat));
  if (!c || !nome) return '';
  const alvo = slug(nome);
  return c.subs.find((s) => slug(s.nome) === alvo || s.id === nome)?.id || '';
}
