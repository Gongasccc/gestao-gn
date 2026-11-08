// Categorias e subcategorias de produtos, as mesmas do SuperSave (supersave.pt/web/categorias),
// usadas em toda a app: corredores da lista de compras, categorias das faturas e leitura dos talões.
//
// O SuperSave tem 15 categorias; os nomes das subcategorias são os do site (lidos a 8/11/2026).
// Na loja, "Frescos" ocupa vários corredores (fruta, padaria, talho, charcutaria), por isso na app essa
// categoria aparece repartida pelas suas subcategorias; as outras 14 são um corredor cada. Os ids antigos (frescos, talho, padaria…) mantêm-se para não mexer nos dados.
// Funções puras (testadas em tests/categorias.test.mjs).

/**
 * Cada subcategoria traz as palavras que a identificam (separadas por vírgulas; podem ter várias
 * palavras, sem acentos, no singular ou plural). Ganha a expressão mais comprida que aparecer no nome.
 */
export const CATEGORIAS = [
  {
    id: 'frescos', supersave: 'Frescos', nome: 'Fruta e legumes', emoji: '🥦',
    subs: [
      ['Frutas', `fruta, maca, banana, laranja, limao, lima, pera, uva, morango, kiwi, ananas, melao, meloa, melancia, pessego, ameixa,
        abacate, manga, mamao, tangerina, clementina, mirtilo, framboesa, figo, roma, cereja, diospiro, papaia, maracuja, nespera,
        alperce, frutos vermelhos, sumo espremido`],
      ['Legumes', `legume, alface, tomate, tomate cherry, cebola, alho, batata, batata doce, cenoura, courgette, curgete, pepino,
        pimento, brocolo, couve, couve flor, espinafre, rucula, cogumelo, abobora, beringela, feijao verde, salsa, coentro,
        hortela, manjericao, alho frances, nabo, beterraba, gengibre, rabanete, agriao, salada, alecrim, ervilha torta, espargo`],
    ],
  },
  {
    id: 'padaria', supersave: 'Frescos', nome: 'Padaria e pastelaria', emoji: '🥖',
    subs: [
      ['Padaria e Pastelaria', `pao, paozinho, baguete, broa, bola de berlim, croissant, regueifa, bolo, pao de forma, pao de leite,
        carcaca, papo seco, pastel de nata, queque, bolo rei, pao de lo, folar, tarte, pao de agua, pao de mafra, pao de hamburguer,
        pao de cachorro, gressino, crouton, massa folhada fresca, massa quebrada`],
    ],
  },
  {
    id: 'talho', supersave: 'Frescos', nome: 'Talho e peixaria', emoji: '🥩',
    subs: [
      ['Peixaria', `peixe, pescada, bacalhau, salmao, dourada, robalo, sardinha, carapau, polvo, lula, choco, camarao, marisco,
        ameijoa, mexilhao, atum fresco, cavala, peixe espada, linguado, gamba, sapateira, salmao fumado, filete de pescada,
        posta de pescada, lombo de salmao, bacalhau demolhado`],
      ['Talho', `carne, frango, peru, porco, vaca, novilho, vitela, borrego, cabrito, coelho, bife, bifana, costeleta, entrecosto, febra,
        lombo, carne picada, hamburguer, almondega, entremeada, peito de frango, perna de frango, coxa, asa de frango, espetada,
        salsicha fresca, frango assado, frango inteiro`],
    ],
  },
  {
    id: 'charcutaria', supersave: 'Frescos', nome: 'Charcutaria e queijos', emoji: '🧀',
    subs: [
      ['Queijos', `queijo, mozzarella, queijo flamengo, queijo da serra, queijo de cabra, queijo de ovelha, queijo curado, queijo fatiado,
        queijo bola, brie, camembert, parmesao, gouda, emmental, cheddar`],
      ['Charcutaria', `fiambre, presunto, chourico, salpicao, paio, mortadela, bacon, salame, alheira, farinheira, peito de peru,
        fiambre de peru, fiambre da perna, pepperoni, morcela, toucinho, enchido`],
    ],
  },
  {
    id: 'laticinios', supersave: 'Laticínios e Ovos', nome: 'Laticínios e ovos', emoji: '🥛',
    subs: [
      ['Leite', `leite, leite meio gordo, leite magro, leite gordo, leite uht, leite com chocolate, achocolatado, leite sem lactose,
        leite em po, bebida lactea`],
      ['Iogurtes', `iogurte, iogurte grego, iogurte liquido, kefir, skyr, iogurte natural, iogurte aromatizado, iogurte de pedacos`],
      ['Ovos', `ovo, ovos, ovos caipira, ovos bio, clara de ovo`],
      ['Manteigas e Cremes', `manteiga, margarina, creme vegetal, creme culinario, creme para barrar`],
      ['Natas e Bechamel', `nata, natas, nata para culinaria, natas para bater, chantilly, bechamel, molho bechamel`],
      ['Bebidas Vegetais', `bebida de aveia, bebida de soja, bebida de amendoa, bebida de arroz, bebida de coco, bebida vegetal`],
      ['Sobremesas', `pudim, mousse, leite creme, arroz doce, gelatina, pudim flan, mousse de chocolate`],
      ['Queijos', `queijo fresco, requeijao, queijo ralado, queijo creme, queijo para barrar, queijo cottage, ricotta`],
    ],
  },
  {
    id: 'mercearia', supersave: 'Mercearia', nome: 'Mercearia', emoji: '🍝',
    subs: [
      ['Café, Chá e Bebidas', `cafe, capsula, cafe moido, cafe soluvel, cafe torrado, cafe em grao, cha, infusao, camomila, cha verde,
        cevada, chocolate em po, cacau soluvel`],
      ['Cereais e Barras', `cereal, aveia, flocos de aveia, granola, muesli, papa de aveia, barra de cereais, barra de fruta`],
      ['Bolachas, Biscoitos e Tostas', `bolacha, biscoito, wafer, bolacha maria, cookie, tosta, tortita, napolitana, torrada`],
      ['Chocolate, Gomas e Rebuçados', `chocolate, bombom, goma, rebucado, chiclete, pastilha elastica`],
      ['Arroz, Massa e Farinha', `arroz, arroz agulha, arroz basmati, arroz carolino, massa, esparguete, macarrao, macarronete, espirai,
        fusilli, penne, lasanha, noodles, cuscuz, aletria, farinha`],
      ['Azeite, Óleo e Vinagre', `azeite, oleo, vinagre, oleo de girassol, vinagre balsamico`],
      ['Conservas', `atum, conserva, lata, enlatado, sardinha em lata, cavala em lata, salsicha, milho, azeitona, cogumelo em lata,
        tomate pelado, polpa de tomate, passata, feijao, grao, grao de bico, lentilha, ervilha seca`],
      ['Molhos, Temperos e Sal', `molho, ketchup, maionese, mostarda, tempero, especiaria, pimenta, oregao, caldo, sal, piri piri,
        molho de soja, pesto`],
      ['Snacks e Batatas Fritas', `snack, batata frita, pipoca, fruto seco, amendoim, noz, amendoa, caju, pistacho, tremoco, aperitivo`],
      ['Compotas, Cremes e Mel', `compota, doce, mel, marmelada, goiabada, nutella, creme de barrar, manteiga de amendoim`],
      ['Açúcar e Sobremesas', `acucar, adocante, fermento, leite condensado, leite de coco, pao ralado, amido, maizena, cacau em po,
        chocolate de culinaria, sopa, pure, pure de batata`],
    ],
  },
  {
    id: 'bebidas', supersave: 'Bebidas e Garrafeira', nome: 'Bebidas e garrafeira', emoji: '🥤',
    subs: [
      ['Sumos e Refrigerantes', `sumo, nectar, sumo de laranja, smoothie, refrigerante, coca cola, ice tea, sprite, fanta, sumol,
        kombucha, tisana`],
      ['Água', `agua, agua com gas, agua mineral, agua com sabor, agua tonica, tonica, ginger ale`],
      ['Bebidas Energéticas e Isotónicas', `bebida energetica, red bull, isotonica, monster`],
      ['Cervejas e Sidras', `cerveja, sidra, super bock, sagres, cerveja sem alcool, hard seltzer`],
      ['Vinhos', `vinho, vinho tinto, vinho branco, vinho rose, vinho verde, vinho do porto, moscatel, sangria`],
      ['Bebidas Espirituosas', `gin, whisky, vodka, licor, rum, aguardente, ginja, tequila, vermute, brandy, conhaque, cachaca`],
      ['Champanhe e Espumante', `espumante, champanhe, champagne, prosecco`],
    ],
  },
  {
    id: 'bio', supersave: 'Bio e Saudável', nome: 'Bio e saudável', emoji: '🌱',
    subs: [
      ['Suplementos e Vitaminas', `suplemento, vitamina, magnesio, omega`],
      ['Nutrição Desportiva', `proteina, whey, barra proteica, iogurte proteico, creatina`],
      ['Vegetariano e Vegan', `vegan, vegano, vegetariano, tofu, seitan, tempeh, hamburguer vegetal, vegegurte`],
      ['Biológicos', `biologico, produto biologico, quinoa, chia, sementes, linhaca`],
      ['Sem Glúten', `sem gluten`],
      ['Sem Lactose', `iogurte sem lactose, queijo sem lactose, natas sem lactose`],
    ],
  },
  {
    id: 'limpeza', supersave: 'Limpeza', nome: 'Limpeza', emoji: '🧽',
    subs: [
      ['Roupa', `detergente, detergente para roupa, detergente roupa, capsulas para roupa, amaciador, tira nodoas, branqueador`],
      ['Cozinha', `lava loica, loica, detergente da loica, pastilha para maquina, sal para maquina, abrilhantador, desengordurante,
        limpa forno, desentupidor, papel de aluminio, pelicula aderente, papel vegetal, saco de congelacao`],
      ['Casa de Banho', `limpa wc, gel wc, anticalcario, pastilha sanita, bloco sanitario`],
      ['Chão e Superfícies', `multiusos, limpa vidros, limpa chao, lava tudo, limpa moveis, lixivia, desinfetante, alcool`],
      ['Papel Higiénico', ''],
      ['Guardanapos e Rolos', `papel de cozinha, rolo de cozinha, guardanapo`],
      ['Velas e Ambientadores', `ambientador, vela perfumada, mikado, absorve odores`],
      ['Sacos e Baldes do Lixo', `saco do lixo, saco de lixo, balde do lixo`],
      ['Mopas, Esfregonas e Vassouras', `mopa, esfregona, vassoura, balde`],
      ['Panos, Esfregões e Luvas', `esfregao, esponja, pano, luva`],
      ['Inseticidas e Desumidificadores', `inseticida, repelente, anti traca, mata baratas, desumidificador`],
      ['Limpeza Auto e Motos', `limpeza auto, champo auto`],
    ],
  },
  {
    id: 'higiene', supersave: 'Beleza e Higiene', nome: 'Beleza e higiene', emoji: '🧴',
    subs: [
      ['Cabelo', `champo, condicionador, mascara de cabelo, laca, gel de cabelo, tinta de cabelo, espuma de cabelo`],
      ['Corpo', `gel de banho, sabonete, sabonete liquido, desodorizante, antitranspirante, creme hidratante, creme de corpo,
        creme de maos, perfume, agua de colonia, cera depilatoria`],
      ['Rosto', `creme de rosto, desmaquilhante, agua micelar, serum, creme, tonico`],
      ['Maquilhagem', `maquilhagem, rimel, batom, base, verniz, lapis de olhos`],
      ['Higiene Oral', `pasta de dentes, dentifrico, escova de dentes, elixir, fio dental`],
      ['Higiene Íntima', `penso, tampao, penso diario, gel intimo, copo menstrual`],
      ['Homem', `lamina, gilete, espuma de barbear, maquina de barbear, after shave`],
      ['Preservativos e Estimuladores', `preservativo`],
      ['Lenços e Cuidados de Saúde', `lenco, lenco de papel, cotonete, algodao, penso rapido`],
      ['Papel Higiénico', `papel higienico, papel higienico humido`],
      ['Solares e Bronzeadores', `protetor solar, after sun, autobronzeador`],
      ['Coffrets e Presentes em Beleza', `coffret`],
    ],
  },
  {
    id: 'bebe', supersave: 'Bebé', nome: 'Bebé', emoji: '🍼',
    subs: [
      ['Alimentação Infantil', `papa, papa infantil, boiao, leite de transicao, leite infantil, saqueta de fruta, bolacha bebe`],
      ['Fraldas e Toalhitas', `fralda, fralda cueca, toalhita, resguardo`],
      ['Banho e Higiene', `champo bebe, gel de banho bebe, creme muda fralda, pomada bebe, soro fisiologico`],
      ['Cadeiras Auto e Carrinhos', `cadeira auto, carrinho de bebe`],
      ['Cadeiras e Acessórios de Refeição', `babete, biberao, tetina, cadeira de refeicao`],
      ['Mobiliário e Colchões', `berco, colchao de bebe`],
      ['Têxtil de Bebé', `saco de dormir, fralda de pano, doudou`],
      ['Banheiras e Complementos', `banheira, bacio, redutor`],
      ['Chupetas e Mordedores', `chupeta, mordedor`],
      ['Brinquedos de Bebé', `brinquedo bebe, roca`],
    ],
  },
  {
    id: 'animais', supersave: 'Animais', nome: 'Animais', emoji: '🐾',
    subs: [
      ['Cão', `racao cao, comida de cao, comida para cao, petisco para cao, snack para cao, osso para cao, cao`],
      ['Gato', `racao gato, comida de gato, comida para gato, snack para gato, areia para gato, areia de gato, gato`],
      ['Outros Animais', `racao, alpista, comida para peixe, comida para passaro, roedor, tartaruga`],
    ],
  },
  {
    id: 'congelados', supersave: 'Congelados', nome: 'Congelados', emoji: '🧊',
    subs: [
      ['Frutas e Legumes', `legumes congelados, ervilha, espinafres congelados, brocolos congelados, fruta congelada`],
      ['Batata Frita e Puré', `batata frita congelada, batatas pala pala, batata congelada, pure congelado`],
      ['Nuggets e Crocantes Congelados', `nugget, panado, crocante`],
      ['Douradinhos e Filetes', `douradinho, filete congelado`],
      ['Hambúrgueres e Almôndegas Congeladas', `hamburguer congelado, almondega congelada`],
      ['Peixe, Marisco e Carne', `peixe congelado, bacalhau congelado, camarao congelado, miolo de camarao, marisco congelado,
        carne congelada, frango congelado, delicias do mar`],
      ['Pizzas Congeladas', `pizza`],
      ['Refeições Prontas', `refeicao pronta, lasanha congelada, arroz congelado, gnocchi, salteado`],
      ['Salgados, Folhados e Pastelaria', `rissol, croquete, pastel de bacalhau, chamuca, empada, massa folhada`],
      ['Vegetariano e Vegan', `falafel, hamburguer vegetariano`],
      ['Gelados', `gelado, cone, sorvete, viennetta`],
      ['Sobremesas', `sobremesa congelada, bolo gelado, tarte gelada, petit gateau, crepe`],
    ],
  },
  {
    id: 'casa', supersave: 'Casa, Bricolage e Jardim', nome: 'Casa, bricolage e jardim', emoji: '🏠',
    subs: [
      ['Mobiliário e Colchões', `cadeira, mesa, sofa, estante, colchao`],
      ['Têxtil Lar', `toalha de banho, lencol, almofada, edredao, manta, tapete, toalha de mesa`],
      ['Decoração', `vela, moldura, candeeiro, planta artificial`],
      ['Cozinha', `frigideira, panela, tacho, caixa hermetica, faca, forma de bolo, jarro filtrante`],
      ['Mesa', `prato, copo, talher, caneca, chavena`],
      ['Eletrodomésticos', `torradeira, chaleira, ventilador, aquecedor, liquidificadora, ferro de engomar, maquina de cafe`],
      ['Lavandaria e Organização', `caixa de arrumacao, cabide, cesto, estendal, mola, tabua de engomar`],
      ['Festa', `vela de aniversario, prato de papel, copo de plastico`],
      ['Jardim', `terra, adubo, semente, planta, vaso, mangueira, carvao, acendalha, grelha, piscina`],
      ['Pilhas e Lâmpadas', `pilha, lampada, extensao, fosforo, isqueiro`],
      ['Bricolage', `chave de fendas, martelo, berbequim, parafuso, fita cola, tinta, pincel, rolo de pintura, cola de contacto, silicone`],
      ['Bazarão', `bazar`],
    ],
  },
  {
    id: 'brinquedos', supersave: 'Brinquedos e Jogos', nome: 'Brinquedos e jogos', emoji: '🧸',
    subs: [
      ['LEGO', `lego`],
      ['Jogos', `jogo de tabuleiro, monopoly, jogo de cartas, baralho, jogo educativo`],
      ['Puzzles', `puzzle`],
      ['Bonecas', `boneca, barbie, nenuco`],
      ['Carrinhos e Pistas', `carrinho de brincar, hot wheels, pista, telecomandado`],
      ['Peluches e Brinquedos de Bebé', `peluche`],
      ['Brinquedos de Exterior', `bola de futebol, bicicleta, trotinete, insuflavel, nerf, baloico`],
      ['Faz de Conta', `cozinha de brincar, disfarce`],
      ['Didáticos e Criativos', `plasticina, slime, missanga, livro de pintar`],
      ['Eletrónicos', `drone, robo, brinquedo eletronico`],
      ['Funko, Personagens e Heróis', `funko, figura, boneco`],
      ['Marvel', `marvel`],
    ],
  },
  {
    id: 'papelaria', supersave: 'Papelaria', nome: 'Papelaria', emoji: '✏️',
    subs: [
      ['Mochilas, Estojos e Lancheiras', `mochila, estojo, lancheira`],
      ['Cadernos, Blocos e Agendas', `caderno, bloco de notas, agenda, post it`],
      ['Papel de Impressão', `papel a4, resma, papel de impressao, cartolina`],
      ['Escrita', `caneta, lapis, esferografica, marcador, marca texto, corretor`],
      ['Desenho, Arte e Pintura', `lapis de cor, marcador de cor, aguarela, guache, caderno de desenho`],
      ['Organização e Arquivo', `pasta, dossier, capa, envelope`],
      ['Material de Escritório', `agrafador, agrafo, clip, borracha, afia, regua, tesoura, cola batom, calculadora`],
      ['Embrulhos e Sacos para Presentes', `papel de embrulho, laco, saco de presente`],
      ['Packs Experiência', `pack experiencia`],
    ],
  },
  {
    id: 'desporto', supersave: 'Desporto, Roupa e Viagem', nome: 'Desporto, roupa e viagem', emoji: '👟',
    subs: [
      ['Bicicletas, Trotinetes e Patins', `capacete, patins, skate`],
      ['Mobilidade Elétrica', `trotinete eletrica, bicicleta eletrica`],
      ['Desportos', `haltere, tapete de yoga, garrafa de desporto, bola, raquete`],
      ['Campismo', `tenda, saco cama, geleira, lanterna`],
      ['Roupa e Calçado', `t shirt, camisola, pijama, calcas, casaco, meia, cueca, boxer, soutien, collants, chinelo, sapatilha,
        sapato, bota`],
      ['Malas e Acessórios de Viagem', `mala de viagem, trolley, necessaire, almofada de viagem, mochila de viagem`],
      ['Automóvel e Motos', `oleo de motor, liquido de refrigeracao, limpa para brisas`],
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
