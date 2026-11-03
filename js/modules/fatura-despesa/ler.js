// Leitura de faturas para as Finanças (combustível, luz, água, telecomunicações, restaurantes…).
// Interpreta o texto lido no dispositivo (OCR ou PDF) e o QR da AT. Puro, para testar em Node.
import { analisarTexto } from '../faturas/texto.js';
import { categoriaPorPalavras, CATEGORIAS_EXTRATO } from '../extrato/ler.js';
import { removerDadosPessoais, RE_IBAN } from '../extrato/privacidade.js';

const arred = (n) => Math.round(n * 100) / 100;
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const numero = (s) => {
  const t = String(s ?? '').replace(/\s/g, '');
  const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
};

// Emitentes conhecidos: nome bonito e categoria. Combustível primeiro (os postos também vendem café).
export const EMITENTES = [
  ['Galp', /\bGALP\b|PETR[OÓ]LEOS DE PORTUGAL/, 'transportes'],
  ['BP', /\bBP\b(?! ?\d)|BP PORTUGAL/, 'transportes'],
  ['Repsol', /REPSOL/, 'transportes'],
  ['Prio', /\bPRIO\b/, 'transportes'],
  ['Cepsa', /CEPSA|MOEVE/, 'transportes'],
  ['Shell', /\bSHELL\b/, 'transportes'],
  ['Alves Bandeira', /ALVES BANDEIRA/, 'transportes'],
  ['Via Verde', /VIA VERDE/, 'transportes'],
  ['EDP', /\bEDP\b|E-REDES/, 'contas'],
  ['Endesa', /ENDESA/, 'contas'],
  ['Goldenergy', /GOLDENERGY/, 'contas'],
  ['Iberdrola', /IBERDROLA/, 'contas'],
  ['Galp Energia', /GALP POWER|GALP ENERGIA/, 'contas'],
  ['MEO', /\bMEO\b|ALTICE/, 'contas'],
  ['NOS', /\bNOS COMUNICA|\bNOS\b SGPS/, 'contas'],
  ['Vodafone', /VODAFONE/, 'contas'],
  ['Digi', /\bDIGI\b/, 'contas'],
  ['Águas', /[AÁ]GUAS D[EO]|SMAS|EPAL|INDAQUA/, 'contas'],
];

// Tipos de combustível que aparecem nos talões dos postos.
const COMBUSTIVEIS = [
  ['Gasóleo aditivado', /GAS[OÓ]LEO\s+(ADITIVADO|PREMIUM|EVOLUTION|V-?POWER|ULTIMATE|EFITEC|NEXT)|DIESEL\s+(PREMIUM|ULTIMATE|V-?POWER|E\+)/],
  ['Gasóleo', /GAS[OÓ]LEO|DIESEL|\bGASOIL\b/],
  ['Gasolina 98', /(GASOLINA|SP|SEM CHUMBO|G)\s*98|V-?POWER\s*(98|RACING)?(?!\s*DIESEL)|ULTIMATE\s*98/],
  ['Gasolina 95', /(GASOLINA|SP|SEM CHUMBO|G)\s*95|GASOLINA/],
  ['GPL', /\bGPL\b|AUTOG[AÁ]S/],
  ['AdBlue', /ADBLUE/],
  ['Carregamento elétrico', /\bKWH\b|CARREGAMENTO|MOBI\.?E/],
];

/** Litros, preço por litro, tipo e km de um talão de combustível. */
export function lerCombustivel(texto) {
  const t = semAcentos(String(texto || '')).toUpperCase().replace(/[ \t]+/g, ' ');
  const tipo = COMBUSTIVEIS.find(([, re]) => re.test(t))?.[0] || '';
  if (!tipo) return null;
  const sem = t.replace(/(\d)[.,](\d{1,3})\s*(?:€|EUR)?\s*\/\s*L(?:T|ITRO)?\b/g, (m, a, b) => `PRECO_L ${a}.${b}`);
  let litros = 0;
  let m = sem.match(/(\d{1,3}[.,]\d{1,3})\s*(?:L|LT|LTS|LITROS?)\b(?!\s*\/)/);
  if (m) litros = numero(m[1]);
  if (!litros) { m = sem.match(/(?:LITROS?|QTD\.?|QUANT(?:IDADE)?\.?|VOLUME)\s*:?\s*(\d{1,3}[.,]\d{1,3})/); if (m) litros = numero(m[1]); }
  if (!litros && tipo === 'Carregamento elétrico') { m = sem.match(/(\d{1,3}[.,]\d{1,3})\s*KWH/); if (m) litros = numero(m[1]); }
  let precoLitro = 0;
  m = sem.match(/PRECO_L (\d\.\d{1,3})/);
  if (m) precoLitro = numero(m[1]);
  if (!precoLitro) { m = sem.match(/(?:PRE[CÇ]O(?:\s*UNIT\w*)?|P\.?\s?U\.?|PVP)\s*:?\s*(\d[.,]\d{3})\b/); if (m) precoLitro = numero(m[1]); }
  if (!precoLitro) { m = sem.match(/(?<![\d.,])([0-3][.,]\d{3})(?![\d])/); if (m && numero(m[1]) > 0.5) precoLitro = numero(m[1]); }
  m = sem.match(/(?:\bKMS?\b|QUIL[OÓ]METROS)\s*:?\s*(\d{1,3}(?:[. ]\d{3})+|\d{3,7})\b/);
  const km = m ? Number(m[1].replace(/\D/g, '')) : 0;
  const matricula = (t.match(/\b(?:[A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-\d{2})\b/) || [''])[0];
  return { tipo, litros: arred(litros * 1000) / 1000, precoLitro, km, matricula };
}

/** Completa litros/preço a partir do total quando falta um deles. */
export function completarCombustivel(c, total) {
  if (!c) return c;
  const out = { ...c };
  if (total > 0 && out.precoLitro > 0 && !out.litros) out.litros = Math.round((total / out.precoLitro) * 100) / 100;
  if (total > 0 && out.litros > 0 && !out.precoLitro) out.precoLitro = Math.round((total / out.litros) * 1000) / 1000;
  return out;
}

const LINHA_NAO_NOME = /FATURA|FACTURA|RECIBO|TAL[AÃ]O|ORIGINAL|DUPLICADO|N\.?I\.?F|NIPC|CONTRIB|DATA|HORA|TEL|WWW|@|CAPITAL|CONSERV|MATR[IÍ]CULA|^\W*$|\d{4}-\d{3}/;

/** Nome de quem emitiu a fatura: um emitente conhecido ou a primeira linha que parece um nome. */
export function lerEmitente(texto) {
  const t = semAcentos(String(texto || '')).toUpperCase();
  const conhecido = EMITENTES.find(([, re]) => re.test(t));
  if (conhecido) return { nome: conhecido[0], categoria: conhecido[2] };
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const l of linhas.slice(0, 8)) {
    const u = semAcentos(l).toUpperCase();
    if (LINHA_NAO_NOME.test(u) || !/\p{L}{3}/u.test(l) || /\d[.,]\d{2}/.test(l) || l.length > 45) continue;
    const nome = l.replace(/,?\s*(LDA|S\.?A\.?|UNIPESSOAL|SOCIEDADE.*)\.?$/i, '').trim();
    if (nome.length < 3) continue;
    const bonito = nome.split(' ').map((p) => (p.length <= 3 && /^[A-Z]+$/.test(p) ? p : p.charAt(0) + p.slice(1).toLowerCase())).join(' ');
    return { nome: bonito, categoria: categoriaPorPalavras(nome) };
  }
  return { nome: '', categoria: 'outros' };
}

/**
 * Lê uma fatura a partir do texto (OCR/PDF) e/ou do QR da AT.
 * qr: resultado de faturaDoQr (ganha sempre no total, data e NIF).
 */
export function lerFaturaDespesa(texto, qr = null) {
  const base = texto ? analisarTexto(texto) : { total: 0, data: '', nif: '', hora: '', loja: '' };
  const emitente = lerEmitente(texto);
  const total = arred(qr?.total || base.total || 0);
  const combustivel = completarCombustivel(lerCombustivel(texto), total);
  const supermercado = !!base.loja && !combustivel;
  let categoria = combustivel && combustivel.tipo !== 'Carregamento elétrico' ? 'transportes' : emitente.categoria;
  if (combustivel?.tipo === 'Carregamento elétrico') categoria = 'transportes';
  if (supermercado) categoria = 'supermercado';
  if (categoria === 'outros') categoria = categoriaPorPalavras(texto);
  const nome = qr?.loja || emitente.nome || base.loja || '';
  return {
    descricao: combustivel && nome ? `${combustivel.tipo === 'Carregamento elétrico' ? 'Carregamento' : 'Combustível'} ${nome}` : nome,
    emitente: nome,
    valor: total,
    data: qr?.data || base.data || '',
    categoria: CATEGORIAS_EXTRATO.includes(categoria) ? categoria : 'outros',
    nif: qr?.nif || base.nif || '',
    atcud: qr?.atcud || '',
    documento: qr?.documento || '',
    tipoDocumento: qr?.tipoDocumento || '',
    combustivel,
    supermercado,
  };
}

// Linhas do bloco do cliente (nome, morada, NIF do adquirente): saem inteiras antes da IA.
const LINHA_CLIENTE = /^(EXMO|EXM\.|CLIENTE|ADQUIRENTE|NOME|MORADA|CONTRIBUINTE N|NIF (DO )?CLIENTE|N\.?º? CLIENTE|LOCAL DE CONSUMO|C[OÓ]DIGO POSTAL|CPE\b|N\.?º? (DE )?CONTA|CONTA CLIENTE|TITULAR)/;

/** Texto da fatura sem dados pessoais, para a IA. Devolve { texto, removidos }. */
export function textoFaturaParaIa(texto, perfil = {}) {
  const removidos = new Set();
  const linhas = String(texto || '').split(/\r?\n/).filter((l) => {
    const u = semAcentos(l).toUpperCase().trim();
    if (LINHA_CLIENTE.test(u)) { removidos.add(/MORADA|POSTAL|LOCAL/.test(u) ? 'morada' : 'nome'); return false; }
    return true;
  });
  const r = removerDadosPessoais(linhas.join('\n').replace(RE_IBAN, ' '), perfil);
  r.removidos.forEach((t) => removidos.add(t));
  return { texto: r.texto.slice(0, 4000), removidos: [...removidos] };
}

export function promptFatura(texto) {
  return `Este é o texto (lido por OCR, pode ter erros) de uma fatura ou talão português. Os dados pessoais foram retirados.
Diz quem emitiu, de que tipo de despesa se trata e, se for combustível, os litros e o preço por litro.
Devolve APENAS JSON:
{"emitente": "nome curto da marca/loja, ex.: Galp, EDP, Restaurante O Lagar",
 "descricao": "descrição curta da despesa em português, ex.: Combustível Galp, Eletricidade outubro, Jantar",
 "categoria": "${CATEGORIAS_EXTRATO.join(' | ')}",
 "total": 0.00, "data": "AAAA-MM-DD",
 "combustivel": {"tipo": "Gasóleo | Gasóleo aditivado | Gasolina 95 | Gasolina 98 | GPL | AdBlue | Carregamento elétrico", "litros": 0.00, "precoLitro": 0.000} ou null}
(transportes = combustível, portagens, estacionamento, oficina; contas = luz, gás, água, telecomunicações, seguros.)
Números com ponto decimal. Se não souberes um campo, usa "" ou 0. Nunca inventes valores.
---
${texto}`;
}

/** Junta a resposta da IA à leitura local: o QR e o que foi lido no dispositivo ganham; a IA só preenche o que falta. */
export function juntarRespostaIa(local, ia, { temQr = false } = {}) {
  if (!ia || typeof ia !== 'object') return { ...local };
  const out = { ...local };
  const limpo = (v, max = 50) => (typeof v === 'string' && v.trim() && v.length <= max && !/\d{5,}/.test(v) ? v.trim() : '');
  const emitente = limpo(ia.emitente, 40);
  if (emitente && (!out.emitente || out.emitente === out.descricao)) out.emitente = emitente;
  const descricao = limpo(ia.descricao, 60);
  if (descricao && (!out.descricao || out.descricao === local.emitente)) out.descricao = descricao;
  if (!out.descricao) out.descricao = out.emitente;
  if (CATEGORIAS_EXTRATO.includes(ia.categoria) && (out.categoria === 'outros' || !out.categoria)) out.categoria = ia.categoria;
  const total = numero(ia.total);
  if (!temQr && !out.valor && total > 0 && total < 100000) out.valor = arred(total);
  if (!temQr && !out.data && /^\d{4}-\d{2}-\d{2}$/.test(ia.data || '')) out.data = ia.data;
  const c = ia.combustivel;
  if (c && typeof c === 'object' && (c.tipo || numero(c.litros))) {
    const atual = out.combustivel || { tipo: '', litros: 0, precoLitro: 0, km: 0, matricula: '' };
    out.combustivel = completarCombustivel({
      ...atual,
      tipo: atual.tipo || limpo(c.tipo, 30),
      litros: atual.litros || numero(c.litros),
      precoLitro: atual.precoLitro || numero(c.precoLitro),
    }, out.valor);
    if (out.combustivel.tipo) out.categoria = 'transportes';
  }
  return out;
}
