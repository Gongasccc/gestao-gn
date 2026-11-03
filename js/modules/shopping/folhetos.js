// Promoções dos folhetos com o Gemini: ler um folheto (fotos ou PDF) ou pesquisar na web as promoções
// da semana para os artigos da lista. O resultado é normalizado em precos.js (normalizarPromos).
import { pedirJson, pedirComPesquisa } from '../../services/gemini.js';
import { normalizarPromos } from './precos.js';

const FORMATO = `{
  "loja": "cadeia do folheto, ex.: Lidl, Pingo Doce, Continente",
  "inicio": "AAAA-MM-DD (primeiro dia de validade das promoções)",
  "fim": "AAAA-MM-DD (último dia de validade)",
  "promocoes": [
    {
      "produto": "nome padrão: tipo + variante + marca + embalagem, ex.: Queijo flamengo fatiado Limiano 200 g",
      "preco": 0.00,
      "precoAntes": 0.00,
      "desconto": "ex.: -30%, Leve 2 pague 1, 2.ª unidade -50% (vazio se for só preço baixo)",
      "condicao": "ex.: com cartão Continente, só 6.ª a domingo, mín. 2 unidades (vazio se não houver)",
      "inicio": "AAAA-MM-DD só se este produto tiver datas diferentes do folheto",
      "fim": "AAAA-MM-DD só se este produto tiver datas diferentes do folheto"
    }
  ]
}`;

const REGRAS = (hoje) => `Hoje é ${hoje}. Quando o folheto só diz dia e mês ("de 5 a 11 nov", "válido até 2.ª feira"), usa o ano certo a partir de hoje.
Regras:
- "preco" é o preço final de UMA unidade/embalagem na promoção (com o desconto aplicado). Em "Leve 2 pague 1" o preco é o que cada unidade fica a custar.
- Produtos ao peso: "preco" é o preço por kg e o nome acaba em "(kg)".
- Português de Portugal, palavras completas, só a primeira letra maiúscula (e as marcas).
- Números com ponto decimal, sem símbolo de euro. "precoAntes" 0 se não aparecer.
- Nunca inventes produtos, preços ou datas.`;

/**
 * Lê as promoções de um folheto: ficheiros = [{ base64, mime }] (fotos JPEG das páginas ou um PDF).
 * lojaSugerida: a loja escolhida na app (a IA confirma pelo folheto). Devolve { loja, inicio, fim, promocoes }.
 */
export async function lerFolheto(ficheiros, { hoje, lojaSugerida = '' } = {}) {
  const partes = [{
    texto: `Lês folhetos de promoções de supermercados portugueses${lojaSugerida ? ` (este deve ser do ${lojaSugerida})` : ''}.
Extrai TODOS os produtos em promoção com o preço, e as datas de validade do folheto.
Devolve APENAS um objeto JSON com esta forma exata:
${FORMATO}
${REGRAS(hoje)}
Se não for um folheto de promoções, devolve {"promocoes": []}.`,
  }, ...ficheiros];
  const d = await pedirJson(partes);
  const promocoes = normalizarPromos(d, { lojaPadrao: lojaSugerida });
  return { loja: promocoes[0]?.loja || String(d?.loja || lojaSugerida).trim(), inicio: d?.inicio || '', fim: d?.fim || '', promocoes };
}

/**
 * Pesquisa na web (Google, através do Gemini) as promoções desta semana destes supermercados
 * para os artigos da lista. Devolve { promocoes, fontes }.
 */
export async function pesquisarPromos(lojas, artigos, { hoje } = {}) {
  const { json, fontes } = await pedirComPesquisa(`Pesquisa no Google os folhetos e promoções em vigor esta semana (hoje é ${hoje}) nestes supermercados em Portugal: ${lojas.join(', ')}.
Procura sobretudo promoções destes artigos da lista de compras: ${artigos.slice(0, 40).join('; ')}.
Inclui só promoções que as páginas encontradas mostram claramente, com preço e datas. Cada promoção leva o campo "loja".
Devolve APENAS um objeto JSON:
${FORMATO.replace('"loja": "cadeia do folheto, ex.: Lidl, Pingo Doce, Continente",', '').replace('"produto":', '"loja": "Lidl",\n      "produto":')}
${REGRAS(hoje)}
Se não encontrares nada fiável, devolve {"promocoes": []}.`);
  return { promocoes: normalizarPromos(json), fontes };
}
