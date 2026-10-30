// Leitura automática de faturas/talões de supermercado com o Gemini.
import { pedirJson } from '../../services/gemini.js';
import { CATEGORIAS, arred } from './stats.js';

const PROMPT = `Lês talões e faturas de supermercados portugueses (Continente, Pingo Doce, Lidl, Auchan, Intermarché, Mercadona, Minipreço, Aldi, etc.).
Extrai a informação e devolve APENAS um objeto JSON com esta forma exata:
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
      "nome": "texto tal como aparece na fatura, ex.: LEITE MG MIMOSA 1L",
      "produto": "nome legível e genérico para comparar entre lojas, com marca e tamanho, ex.: Leite meio-gordo Mimosa 1 L",
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
Regras:
- "total" é o valor efetivamente pago (depois de descontos).
- "poupanca" é a soma de todos os descontos e promoções aplicados no talão (descontos imediatos, promoções, cupões). Valores positivos.
- "saldoCartao" é o valor acumulado em cartão/cupão para usar depois (ex.: "Acumulou em cartão Continente"), 0 se não houver.
- Em "itens", "total" é o valor da linha já com o desconto da própria linha; "desconto" é esse desconto (0 se não houver).
- Produtos ao peso: quantidade em kg e precoUnitario por kg.
- Ignora linhas que não são produtos (sacos podem entrar como "outros", IVA, subtotais, troco).
- Números com ponto decimal, sem símbolo de euro.
- Se a data não estiver legível usa "".
- Se a imagem não for uma fatura ou talão de compras, devolve {"eFatura": false}.
Nunca inventes produtos ou valores que não estão no talão.`;

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

/** ficheiro: { base64, mime } de uma foto (JPEG) ou de um PDF. */
export async function lerFatura(ficheiro) {
  const dados = await pedirJson([{ texto: PROMPT }, ficheiro]);
  const fatura = normalizarFatura(dados);
  if (!fatura) throw new Error('Não parece uma fatura. Tenta outra foto, com o talão inteiro e bem iluminado.');
  if (!fatura.itens.length && !fatura.total) throw new Error('Não consegui ler a fatura. Tenta uma foto mais nítida.');
  return fatura;
}
