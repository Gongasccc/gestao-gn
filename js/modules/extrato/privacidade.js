// Remover dados pessoais de texto lido no dispositivo (extratos e faturas) ANTES de o guardar
// ou de o mostrar à IA. Puro (sem DOM nem Firebase) para poder ser testado em Node.
//
// O que é retirado: nome do titular (e dos membros do casal), IBAN, NIF, números de cartão,
// e-mails, telefones, moradas/códigos postais, matrículas e referências numéricas longas.

const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t) => semAcentos(t).toUpperCase();

export const RE_IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
// Cartões: 4321 **** **** 1234, 432112******1234, ****1234, XXXX XXXX XXXX 1234, 4321 1234 1234 1234.
const RE_CARTAO = /\b\d{4}[ -]?[*xX•]{2,}[ -]?\d{4}\b|\b\d{4}[ -]?(?:[*xX•]{4}[ -]?){2}\d{4}\b|\b\d{6}[*xX•]{4,6}\d{4}\b|[*xX•]{2,}[ -]?\d{4}\b|\b(?:[xX]{4}[ -]?){3}\d{4}\b|\b\d{4}(?:[ -]\d{4}){3}\b/g;
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const RE_TELEFONE = /(?:\+351[ ]?)?\b(?:9[1236]\d|2\d{2})[ ]?\d{3}[ ]?\d{3}\b/g;
const RE_CODIGO_POSTAL = /\b\d{4}-\d{3}\b/g;
// Matrículas portuguesas: AA-00-AA, 00-AA-00, 00-00-AA, AA-00-00.
const RE_MATRICULA = /\b(?:[A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-\d{2})\b/g;
const RE_NIF = /\b(?:PT[ ]?)?[1-9]\d{8}\b/g;
const RE_NUMERO_LONGO = /\b\d{5,}\b/g;

const ROTULO_NOME = /^(?:1\.?º?\s*)?(?:titular(?:es)?|nome(?: do cliente| do titular)?|cliente|primeiro titular|segundo titular|account holder|name|adquirente|exmo\.?\(?a?\)?\.?\s*(?:sr\.?\(?a?\)?\.?)?)\s*[:\-–]?\s*(.+)$/i;
const ROTULO_MORADA = /^(?:morada|endere[cç]o|address|domic[ií]lio)\s*[:\-–]?\s*(.+)$/i;
const ROTULO_NIF = /(?:NIF|NIPC|contribuinte|tax id)\D{0,15}(?:PT)?\s?(\d{9})\b/i;
const PALAVRAS_NAO_NOME = /\b(BANCO|CAIXA|EXTRATO|CONTA|SALDO|IBAN|BIC|SWIFT|MOVIMENTOS|PERIODO|DATA|PAGINA|MORADA|NIF|LDA|S\.?A\.?|CLIENTE|N\.?º|NUMERO)\b/;

/** Valida um NIF português (9 dígitos com dígito de controlo módulo 11). */
export function nifValido(nif) {
  const s = String(nif ?? '').replace(/\D/g, '');
  if (!/^[1-9]\d{8}$/.test(s)) return false;
  const soma = [...s.slice(0, 8)].reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(s[8]);
}

function pareceNome(t) {
  const limpo = String(t || '').replace(/[,;].*$/, '').trim();
  const palavras = limpo.split(/\s+/).filter(Boolean);
  if (palavras.length < 2 || palavras.length > 7) return '';
  if (!palavras.every((p) => /^[\p{L}'.-]+$/u.test(p))) return '';
  if (PALAVRAS_NAO_NOME.test(norm(limpo))) return '';
  return limpo;
}

/**
 * Encontra os dados do titular no cabeçalho do documento (primeiras linhas):
 * nomes (linhas "Titular: …", "Nome: …"), moradas (linha com código postal e a anterior) e NIFs.
 * linhas: textos das linhas, pela ordem do documento.
 */
export function identificarTitular(linhas, { nomesConhecidos = [] } = {}) {
  const nomes = new Set(nomesConhecidos.map((n) => String(n || '').trim()).filter((n) => n.split(/\s+/).length >= 1 && n.length >= 3));
  const moradas = new Set();
  const nifs = new Set();
  const cabecalho = linhas.slice(0, 60);
  cabecalho.forEach((linha, i) => {
    const t = String(linha || '').trim();
    const nome = t.match(ROTULO_NOME);
    if (nome) {
      const n = pareceNome(nome[1].replace(RE_NIF, '').trim());
      if (n) nomes.add(n);
    }
    const morada = t.match(ROTULO_MORADA);
    if (morada && morada[1].length >= 6) moradas.add(morada[1].trim());
    if (RE_CODIGO_POSTAL.test(t)) {
      RE_CODIGO_POSTAL.lastIndex = 0;
      moradas.add(t);
      // A linha antes do código postal costuma ser a rua; a anterior, o nome (cartas dos bancos).
      const ant = String(cabecalho[i - 1] || '').trim();
      if (ant && /\d/.test(ant) && !/\d+[.,]\d{2}\b/.test(ant)) moradas.add(ant);
      const ant2 = pareceNome(cabecalho[i - 2]) || pareceNome(ant);
      if (ant2) nomes.add(ant2);
    }
    RE_CODIGO_POSTAL.lastIndex = 0;
    const nif = t.match(ROTULO_NIF);
    if (nif && nifValido(nif[1])) nifs.add(nif[1]);
  });
  return { nomes: [...nomes], moradas: [...moradas], nifs: [...nifs] };
}

/** Palavras dos nomes (sem acentos, maiúsculas, ≥ 3 letras) para encontrar o nome no meio do texto. */
function palavrasDosNomes(nomes) {
  const ignorar = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
  const out = new Set();
  for (const n of nomes) for (const p of norm(n).split(/[^A-Z']+/)) if (p.length >= 3 && !ignorar.has(p)) out.add(p);
  return out;
}

/**
 * Retira os dados pessoais de um texto. Devolve { texto, removidos } em que removidos é a lista
 * dos tipos encontrados (para mostrar ao utilizador o que foi limpo).
 * perfil: resultado de identificarTitular (nomes, moradas, nifs).
 * opcoes.nomesSoltos: retira também palavras soltas dos nomes (usado nas transferências).
 */
export function removerDadosPessoais(texto, perfil = {}, { nomesSoltos = false, substituto = ' ' } = {}) {
  let t = String(texto || '');
  const removidos = new Set();
  const trocar = (re, tipo, valida = () => true) => {
    t = t.replace(re, (m) => {
      if (!valida(m)) return m;
      removidos.add(tipo);
      return substituto;
    });
  };
  for (const morada of perfil.moradas || []) {
    if (morada && t.includes(morada)) { t = t.split(morada).join(substituto); removidos.add('morada'); }
  }
  trocar(RE_EMAIL, 'email');
  trocar(RE_IBAN, 'iban', (m) => /\d{8,}/.test(m.replace(/\s/g, '')));
  trocar(RE_CARTAO, 'cartao');
  // "COMPRA 4321 LOJA": os 4 dígitos a seguir a COMPRA/CARTÃO são o fim do n.º do cartão.
  t = t.replace(/\b(COMPRA|COMPRAS|CART[AÃ]O|CARD|CRT|C\/LESS|CONTACTLESS)(\s+(?:N\.?º?\s*)?)\d{4}\b/gi, (m, a, b) => { removidos.add('cartao'); return `${a}${b.replace(/N\.?º?\s*/i, '')}`.trimEnd(); });
  trocar(RE_MATRICULA, 'matricula');
  trocar(RE_CODIGO_POSTAL, 'morada');
  trocar(RE_NIF, 'nif', (m) => nifValido(m.replace(/^PT\s?/, '')));
  trocar(RE_TELEFONE, 'telefone');
  trocar(RE_NUMERO_LONGO, 'referencia');

  // Nomes: sequências de 2+ palavras do nome do titular/casal (ou palavras soltas, se pedido).
  const palavras = palavrasDosNomes(perfil.nomes || []);
  if (palavras.size) {
    const partes = t.split(/(\s+)/);
    const eNome = (p) => palavras.has(norm(p).replace(/[^A-Z']/g, ''));
    const marcar = new Array(partes.length).fill(false);
    for (let i = 0; i < partes.length; i += 2) {
      if (!eNome(partes[i])) continue;
      let j = i;
      while (j + 2 < partes.length && (eNome(partes[j + 2]) || /^(de|da|do|das|dos|e)$/i.test(partes[j + 2]))) j += 2;
      while (j > i && !eNome(partes[j])) j -= 2;
      if (j > i || nomesSoltos) { for (let k = i; k <= j; k += 1) marcar[k] = true; i = j; }
    }
    if (marcar.some(Boolean)) {
      removidos.add('nome');
      t = partes.map((p, i) => (marcar[i] ? (/^\s+$/.test(p) ? '' : substituto) : p)).join('');
    }
  }
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/gm, '');
  return { texto: t, removidos: [...removidos] };
}

export const NOMES_REMOVIDOS = {
  nome: 'nomes', morada: 'morada', iban: 'IBAN', nif: 'NIF', cartao: 'n.º de cartão', email: 'e-mail',
  telefone: 'telefone', matricula: 'matrícula', referencia: 'referências',
};

/** "nomes, IBAN e NIF" a partir de uma lista de tipos. */
export function descreverRemovidos(tipos) {
  const nomes = [...new Set(tipos)].map((t) => NOMES_REMOVIDOS[t] || t);
  if (nomes.length < 2) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
