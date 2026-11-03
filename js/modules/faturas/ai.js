// Leitura automática de faturas/talões de supermercado com o Gemini.
import { pedirJson } from '../../services/gemini.js';
import { CATEGORIAS, arred } from './stats.js';

const PROMPT = `Lês talões e faturas de supermercados portugueses (Continente, Pingo Doce, Lidl, Auchan, Intermarché, Mercadona, Minipreço, Aldi, etc.).
Os talões ENCURTAM os nomes (ex.: "LEITE UHT M/G MIM 1L", "IOG NAT CONT 4X125G", "DET ROUP SKIP LIQ 40D", "FGO PEITO BIFE KG").
O teu trabalho é DECIFRAR cada linha: perceber que produto é e dar-lhe um nome padrão, igual em todas as lojas, para comparar preços.
Devolve APENAS um objeto JSON com esta forma exata:
{
  "eFatura": true,
  "loja": "nome da cadeia, ex.: Continente, Pingo Doce, Lidl",
  "local": "loja/morada curta, ex.: Continente Modelo Braga",
  "data": "AAAA-MM-DD",
  "hora": "HH:MM",
  "total": 0.00,
  "poupanca": 0.00,
  "saldoCartao": 0.00,
  "pagamento": "ex.: Multibanco, Numerário, MB Way",
  "itens": [
    {
      "nome": "texto EXATO da linha no talão, ex.: LEITE UHT M/G MIM 1L",
      "produto": "nome padrão decifrado: tipo + variante + marca + embalagem, ex.: Leite UHT meio-gordo Mimosa 1 L",
      "marca": "ex.: Mimosa (marca própria = nome da cadeia, ex.: Continente; vazio se não houver)",
      "quantidade": 1,
      "unidade": "un | kg | L",
      "precoUnitario": 0.00,
      "total": 0.00,
      "desconto": 0.00,
      "categoria": "${Object.keys(CATEGORIAS).join(' | ')}"
    }
  ],
  "descontos": [{ "descricao": "ex.: Desconto imediato, Promoção leve 2 pague 1, Cupão", "valor": 0.00 }]
}
Regras do nome padrão ("produto"):
- Português de Portugal, palavras completas, só a primeira letra maiúscula (e as marcas): "Iogurte natural Continente 4 × 125 g", "Água mineral Luso 6 × 1,5 L", "Peito de frango", "Banana".
- Expande abreviaturas: MG ou M/G = meio-gordo, MAG = magro, IOG = iogurte, QJ = queijo, FGO = frango, DET = detergente, ROUP = roupa, LIQ = líquido, AG = água, S/ = sem, C/ = com, CONT = Continente, PD = Pingo Doce, 40D = 40 doses.
- Embalagem no fim com unidade normalizada: g, kg, ml, cl, L, un, doses. Produtos ao peso não levam embalagem.
- O mesmo produto deve ter SEMPRE o mesmo nome padrão, independentemente da loja.
Regras das quantidades:
- Se o produto foi comprado várias vezes, há uma linha tipo "2 X 0,89" (antes ou depois do nome) ou o nome repetido: junta tudo num só item com "quantidade" 2 e "precoUnitario" 0.89.
- No Lidl o formato é "NOME 0,79 x 2 1,58": quantidade 2, preço unitário 0,79.
- Produtos ao peso ("0,456 kg x 1,99 €/kg"): quantidade em kg, unidade "kg", precoUnitario por kg.
- quantidade × precoUnitario tem de dar o total da linha (antes do desconto).
Categorias: "charcutaria" é fiambre, presunto, chouriço, salpicão, paio, mortadela, bacon, salame, alheira e afins; carne e peixe frescos são "talho"; queijos são "laticinios".
Outras regras:
- "total" é o valor efetivamente pago (depois de descontos).
- "poupanca" é a soma de todos os descontos e promoções aplicados no talão. Valores positivos.
- "saldoCartao" é o valor acumulado em cartão/cupão para usar depois, 0 se não houver.
- Em "itens", "total" é o valor da linha já com o desconto da própria linha; "desconto" é esse desconto (0 se não houver).
- Ignora linhas que não são produtos (sacos podem entrar como "outros", IVA, subtotais, troco).
- Números com ponto decimal, sem símbolo de euro. Se a data não estiver legível usa "".
- Se a imagem não for uma fatura ou talão de compras, devolve {"eFatura": false}.
Nunca inventes produtos ou valores que não estão no talão.`;

/** Texto extra com o que a app já sabe: o texto lido no telemóvel e nomes padrão já aprendidos. */
function contextoTpl({ textoOcr = '', exemplos = [], catalogo = [] } = {}) {
  const partes = [];
  if (catalogo.length) {
    partes.push(`Produtos que este casal já comprou antes (nome padrão — categoria). Se uma linha for um destes produtos (mesmo tipo, variante, marca e embalagem), usa EXATAMENTE este nome e esta categoria, para as compras ficarem consistentes:\n${catalogo.join('\n')}`);
  }
  if (exemplos.length) {
    partes.push(`Nomes padrão que este casal já confirmou (linha do talão => nome padrão). Usa EXATAMENTE estes nomes quando a linha for a mesma ou equivalente, e segue o mesmo estilo nas outras:\n${exemplos.join('\n')}`);
  }
  if (textoOcr) partes.push(`Texto lido por OCR no telemóvel (pode ter erros; usa a imagem para confirmar):\n${String(textoOcr).slice(0, 6000)}`);
  return partes.join('\n\n');
}

const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function normalizarFatura(d) {
  if (!d || d.eFatura === false) return null;
  const itens = (Array.isArray(d.itens) ? d.itens : [])
    .filter((i) => i && (i.nome || i.produto))
    .map((i) => {
      const quantidade = num(i.quantidade) || 1;
      const total = arred(num(i.total));
      return {
        nome: String(i.nome || i.produto).trim(),
        produto: String(i.produto || i.nome).trim(),
        quantidade,
        unidade: ['kg', 'L'].includes(i.unidade) ? i.unidade : 'un',
        marca: String(i.marca || '').trim(),
        precoUnitario: arred(num(i.precoUnitario) || total / quantidade),
        total,
        desconto: arred(Math.abs(num(i.desconto))),
        categoria: CATEGORIAS[i.categoria] ? i.categoria : 'outros',
      };
    });
  const descontos = (Array.isArray(d.descontos) ? d.descontos : [])
    .filter((x) => x && num(x.valor))
    .map((x) => ({ descricao: String(x.descricao || 'Desconto'), valor: arred(Math.abs(num(x.valor))) }));
  const somaItens = arred(itens.reduce((s, i) => s + i.total, 0));
  const poupanca = arred(Math.abs(num(d.poupanca))
    || descontos.reduce((s, x) => s + x.valor, 0)
    || itens.reduce((s, i) => s + i.desconto, 0));
  return {
    loja: String(d.loja || '').trim() || 'Supermercado',
    local: String(d.local || '').trim(),
    data: /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : '',
    hora: /^\d{1,2}:\d{2}/.test(d.hora || '') ? String(d.hora).slice(0, 5) : '',
    total: arred(num(d.total) || somaItens),
    poupanca,
    saldoCartao: arred(Math.abs(num(d.saldoCartao))),
    pagamento: String(d.pagamento || '').trim(),
    itens,
    descontos,
  };
}

/**
 * ficheiro: { base64, mime } de uma foto (JPEG) ou de um PDF (pode faltar se só houver texto).
 * contexto: { textoOcr, exemplos } para a IA decifrar melhor (ver contextoTpl).
 */
export async function lerFatura(ficheiro, contexto = {}) {
  const extra = contextoTpl(contexto);
  const partes = [{ texto: PROMPT }];
  if (extra) partes.push({ texto: extra });
  if (ficheiro) partes.push(ficheiro);
  const dados = await pedirJson(partes);
  const fatura = normalizarFatura(dados);
  if (!fatura) throw new Error('Não parece uma fatura. Tenta outra foto, com o talão inteiro e bem iluminado.');
  if (!fatura.itens.length && !fatura.total) throw new Error('Não consegui ler a fatura. Tenta uma foto mais nítida.');
  return fatura;
}

const PROMPT_NOMES = `És especialista em talões de supermercados portugueses. Recebes linhas de produtos tal como aparecem nos talões (abreviadas), com a loja.
Para cada linha, decifra o produto e dá um nome padrão igual em todas as lojas: tipo + variante + marca + embalagem,
em português de Portugal, palavras completas, só a primeira letra maiúscula (e as marcas). Ex.: "LEITE UHT M/G MIM 1L" => "Leite UHT meio-gordo Mimosa 1 L".
Devolve APENAS JSON: {"itens": [{"i": 0, "produto": "...", "categoria": "${Object.keys(CATEGORIAS).join(' | ')}"}]}
Usa o mesmo "i" de cada linha. Se não souberes o que é, devolve o nome expandido o melhor possível.`;

/**
 * Decifra uma lista de nomes de talão de uma vez (só texto, sem imagens).
 * linhas: [{ loja, nome }] -> [{ produto, categoria } | null] na mesma ordem.
 */
export async function decifrarNomes(linhas, exemplos = [], catalogo = []) {
  const corpo = linhas.map((l, i) => `${i}\t${l.loja || ''}\t${l.nome}`).join('\n');
  const partes = [{ texto: PROMPT_NOMES }];
  if (exemplos.length) partes.push({ texto: `Nomes já confirmados (segue o mesmo estilo):\n${exemplos.join('\n')}` });
  if (catalogo.length) partes.push({ texto: `Produtos já comprados (nome padrão — categoria). Se for o mesmo produto, usa EXATAMENTE o mesmo nome e categoria:\n${catalogo.join('\n')}` });
  partes.push({ texto: `Linhas (i, loja, nome):\n${corpo}` });
  const r = await pedirJson(partes);
  const out = linhas.map(() => null);
  for (const x of Array.isArray(r?.itens) ? r.itens : []) {
    const i = Number(x?.i);
    if (Number.isInteger(i) && i >= 0 && i < out.length && x.produto) {
      out[i] = { produto: String(x.produto).trim(), categoria: CATEGORIAS[x.categoria] ? x.categoria : 'outros' };
    }
  }
  return out;
}
