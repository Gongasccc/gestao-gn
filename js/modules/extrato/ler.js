// Leitura de extratos bancários (PDF) no próprio dispositivo: o PDF nunca sai do telemóvel/computador.
// Recebe o texto do PDF (com as posições, vindo do pdf.js), encontra os movimentos e categoriza-os
// com regras por palavras-chave e com as correções que o casal já fez. Sem IA e sem Firebase,
// para poder ser testado em Node.
// Os dados pessoais (titular, IBAN, NIF, cartões, morada…) são retirados aqui, logo a seguir à leitura,
// antes de qualquer coisa ser guardada ou enviada à IA (ver privacidade.js).
import { identificarTitular, removerDadosPessoais } from './privacidade.js';

export const CATEGORIAS_EXTRATO = ['casa', 'supermercado', 'restaurante', 'contas', 'transportes', 'saude', 'lazer', 'compras', 'viagens', 'outros'];

const arred = (n) => Math.round(n * 100) / 100;
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------------------------------
// 1. Texto do PDF → linhas

/**
 * Agrupa os itens de texto de cada página (pdf.js getTextContent) em linhas ordenadas.
 * paginas: [[{ str, x, y, w }]] (y cresce para cima, como no PDF).
 */
export function agruparLinhas(paginas, tolerancia = 3) {
  const linhas = [];
  paginas.forEach((itens, pagina) => {
    const validos = itens.filter((i) => String(i.str).trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const daPagina = [];
    for (const it of validos) {
      let linha = daPagina.find((l) => Math.abs(l.y - it.y) <= tolerancia);
      if (!linha) { linha = { pagina, y: it.y, partes: [] }; daPagina.push(linha); }
      linha.partes.push({ str: String(it.str), x: it.x, w: it.w || 0 });
    }
    daPagina.sort((a, b) => b.y - a.y);
    for (const l of daPagina) {
      l.partes.sort((a, b) => a.x - b.x);
      // Junta pedaços muito próximos ("1.234" + ",56") numa só parte.
      const juntas = [];
      for (const p of l.partes) {
        const ant = juntas[juntas.length - 1];
        if (ant && p.x - (ant.x + ant.w) < 1.5) { ant.str += p.str; ant.w = p.x + p.w - ant.x; } else juntas.push({ ...p });
      }
      l.partes = juntas;
      l.texto = juntas.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim();
      linhas.push(l);
    }
  });
  return linhas;
}

// ---------------------------------------------------------------------------------------------
// 2. Linhas → movimentos

const RE_DATA = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{1,2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+\d{4})?)\b/i;
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
// Montantes em formato português (1.234,56 / 1 234,56 / -12,30 / 12,30- / 12,30 D) e, se for o caso, inglês (1,234.56).
const RE_PT = /(?<![\d,.])([-+]?)\s?(\d{1,3}(?:[.  ]\d{3})*|\d+),(\d{2})(?![\d])\s?(?:€|EUR)?\s?(-|D|C|DB|CR)?(?![A-Za-z\d])/g;
const RE_EN = /(?<![\d,.])([-+]?)\s?€?\s?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?![\d])\s?(?:€|EUR)?\s?(-|D|C|DB|CR)?(?![A-Za-z\d])/g;

function montantes(str, formato) {
  const re = new RegExp((formato === 'en' ? RE_EN : RE_PT).source, 'g');
  const out = [];
  let m;
  while ((m = re.exec(str))) {
    const inteiro = m[2].replace(/[^\d]/g, '');
    const valor = Number(`${inteiro}.${m[3]}`);
    const sufixo = (m[4] || '').toUpperCase();
    const sinal = m[1] === '-' || sufixo === '-' || sufixo === 'D' || sufixo === 'DB' ? -1 : m[1] === '+' || sufixo === 'C' || sufixo === 'CR' ? 1 : 0;
    out.push({ valor, sinal, inicio: m.index, fim: m.index + m[0].length });
  }
  return out;
}

function detetarFormato(linhas) {
  let pt = 0;
  let en = 0;
  for (const l of linhas) {
    pt += (l.texto.match(/\d,\d{2}(?!\d)/g) || []).length;
    en += (l.texto.match(/\d\.\d{2}(?!\d)/g) || []).length;
  }
  return en > pt * 2 ? 'en' : 'pt';
}

function anoDoDocumento(linhas) {
  const contagem = {};
  for (const l of linhas) for (const a of l.texto.match(/\b20\d{2}\b/g) || []) contagem[a] = (contagem[a] || 0) + 1;
  const top = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  return top ? Number(top[0]) : new Date().getFullYear();
}

export function dataIso(txt, ano) {
  const t = semAcentos(txt).toLowerCase().trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : ano;
    const mes = Number(m[2]);
    const dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
    return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  m = t.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/);
  if (m && MESES[m[2]]) return `${m[3] || ano}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const RE_CABECALHO = /\b(debito|credito|saldo|montante|valor|descri|movimento|data)\b/;
const RE_SALDO_INICIAL = /saldo\s+(anterior|inicial|de abertura)/;
const RE_IGNORAR = /saldo\s+(final|disponivel|contabilistico|atual)|^total|total de (movimentos|debitos|creditos)|^saldo$/;

/** Posições x (centro) das colunas Débito / Crédito / Saldo, se o extrato tiver cabeçalho. */
function colunas(linha) {
  const out = {};
  for (const p of linha.partes) {
    const t = semAcentos(p.str).toLowerCase();
    const centro = p.x + (p.w || 0) / 2;
    if (/\bdebito|levantamento|saida|money out|a debito/.test(t)) out.debito = centro;
    else if (/\bcredito|deposito|entrada|money in|a credito/.test(t)) out.credito = centro;
    else if (/\bsaldo|balance/.test(t)) out.saldo = centro;
  }
  return out.debito || out.credito || out.saldo ? out : null;
}

/** Montantes de uma linha, com a posição x aproximada de cada um. */
function montantesDaLinha(linha, formato) {
  const out = [];
  for (const p of linha.partes) {
    for (const m of montantes(p.str, formato)) {
      const len = p.str.length || 1;
      const centro = p.x + ((p.w || len * 5) * ((m.inicio + m.fim) / 2)) / len;
      out.push({ ...m, centro, parte: p });
    }
  }
  return out;
}

function limparDescricao(texto, formato) {
  let t = texto.replace(RE_DATA, '').trim();
  t = t.replace(RE_DATA, '').trim(); // data-valor a seguir à data do movimento
  t = t.replace(new RegExp((formato === 'en' ? RE_EN : RE_PT).source, 'g'), ' ');
  return t.replace(/\s+/g, ' ').replace(/^[-–·:|]+|[-–·:|]+$/g, '').trim();
}

/**
 * Encontra os movimentos nas linhas do extrato.
 * Decide se é débito ou crédito pelo sinal, pela coluna (Débito/Crédito) ou pela variação do saldo.
 */
export function extrairMovimentos(linhas, { ano } = {}) {
  const formato = detetarFormato(linhas);
  const anoBase = ano || anoDoDocumento(linhas);
  let cols = null;
  let saldoAnterior = null;
  let ultimo = null;
  const movimentos = [];

  for (const linha of linhas) {
    const baixo = semAcentos(linha.texto).toLowerCase();
    const temData = RE_DATA.test(linha.texto);
    const nums = montantesDaLinha(linha, formato);

    if (!temData && RE_CABECALHO.test(baixo) && !nums.length) {
      const c = colunas(linha);
      if (c) cols = c;
      ultimo = null;
      continue;
    }
    if (RE_SALDO_INICIAL.test(baixo) && nums.length) {
      saldoAnterior = nums[nums.length - 1].valor * (nums[nums.length - 1].sinal || 1);
      ultimo = null;
      continue;
    }
    if (RE_IGNORAR.test(baixo)) { ultimo = null; continue; }

    if (!temData || !nums.length) {
      // Linha de continuação da descrição (alguns bancos partem a descrição em duas linhas).
      if (ultimo && !temData && !nums.length && linha.pagina === ultimo.pagina && ultimo.y - linha.y < 18 && linha.texto.length < 70 && !RE_CABECALHO.test(baixo)) {
        ultimo.descricao = `${ultimo.descricao} ${linha.texto}`.trim();
        ultimo.y = linha.y;
      } else ultimo = null;
      continue;
    }

    const dataTxt = linha.texto.match(RE_DATA)[1];
    const data = dataIso(dataTxt, anoBase);
    if (!data) continue;

    // Separar o saldo do valor do movimento.
    let saldo = null;
    let candidatos = nums;
    if (cols?.saldo != null && nums.length > 1) {
      const maisPerto = nums.reduce((a, b) => (Math.abs(b.centro - cols.saldo) < Math.abs(a.centro - cols.saldo) ? b : a));
      if (Math.abs(maisPerto.centro - cols.saldo) < 60) { saldo = maisPerto; candidatos = nums.filter((n) => n !== maisPerto); }
    } else if (nums.length >= 2) {
      saldo = nums[nums.length - 1];
      candidatos = nums.slice(0, -1);
    }
    const mov = candidatos.find((n) => n.valor > 0) || candidatos[0];
    if (!mov || !(mov.valor > 0)) continue;

    let tipo = null;
    if (mov.sinal) tipo = mov.sinal < 0 ? 'debito' : 'credito';
    if (!tipo && cols?.debito != null && cols?.credito != null) {
      tipo = Math.abs(mov.centro - cols.debito) <= Math.abs(mov.centro - cols.credito) ? 'debito' : 'credito';
    }
    const saldoValor = saldo ? saldo.valor * (saldo.sinal || 1) : null;
    if (!tipo && saldoValor != null && saldoAnterior != null) {
      if (Math.abs(saldoAnterior - mov.valor - saldoValor) < 0.011) tipo = 'debito';
      else if (Math.abs(saldoAnterior + mov.valor - saldoValor) < 0.011) tipo = 'credito';
    }
    if (saldoValor != null) saldoAnterior = saldoValor;

    const descricao = limparDescricao(linha.texto, formato);
    if (!descricao) continue;
    ultimo = { data, descricao, valor: arred(mov.valor), tipo: tipo || 'debito', pagina: linha.pagina, y: linha.y };
    movimentos.push(ultimo);
  }
  return movimentos.map(({ pagina, y, ...m }) => m);
}

// ---------------------------------------------------------------------------------------------
// 3. Nomes e categorias

const RUIDO = /\b(compra|compras|pag(amento)?|pagto|trf|transf(erencia)?|mb ?way|mbway|contactless|c\/less|apple ?pay|google ?pay|cartao|card|visa|mastercard|maestro|debito|dd|sepa|cred|deb|ref|op|n\.?º?|nr|mov|tpa|pos|ec|cx|data|valor|eur|lda|sa|unipessoal)\b\.?/gi;

/** Nome curto e legível do comerciante ("COMPRA 4321 CONTINENTE BRAGA CONTACTLESS" → "Continente Braga"). */
export function nomeComerciante(descricao) {
  const t = String(descricao || '')
    .replace(/\*+\d+/g, ' ')
    .replace(/\b\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(RUIDO, ' ')
    .replace(/[^\p{L}\p{N}&'+. -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const palavras = t.split(' ').filter((p) => p && !/^[.\-']+$/.test(p)).slice(0, 4);
  if (!palavras.length) return String(descricao || '').trim();
  return palavras.map((p, i) => {
    if (i > 0 && /^(de|da|do|das|dos|e)$/i.test(p)) return p.toLowerCase();
    if (p.length <= 3 && /^[A-Z]+$/.test(p)) return p; // siglas: EDP, MEO, BP
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ');
}

/** Chave estável de um comerciante, para aprender categorias ("Continente Braga" → "continente braga"). */
export function chaveComerciante(texto) {
  return semAcentos(nomeComerciante(texto)).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
}

const PALAVRAS = [
  ['supermercado', /continente|pingo doce|lidl|auchan|intermarch|mercadona|minipre|aldi|froiz|e\.?leclerc|meu super|amanhecer|coviran|spar|mercearia|talho|padaria|celeiro|supermerc|hipermerc/],
  ['restaurante', /restaur|cafe|snack|pastelaria|tasca|churrasq|marisq|sushi|mcdonald|burger|uber ?eats|glovo|bolt food|telepizza|pizza|kfc|starbucks|h3|vitaminas|padaria portuguesa|nicola|delta q|tgtg|too good/],
  ['contas', /\bedp\b|endesa|goldenergy|iberdrola|galp energia|smas|aguas|indaqua|epal|\bmeo\b|nos comunica|\bnos\b|vodafone|\bdigi\b|nowo|seguro|fidelidade|ageas|tranquilidade|allianz|generali|liberty|condominio|comiss|imposto|manutencao de conta|\biuc\b|\bimi\b|autoridade tributaria|seg social|seguranca social/],
  ['transportes', /galp|\bbp\b|repsol|prio|cepsa|\bshell\b|via verde|portagem|brisa|ascendi|estacion|parque|\bemel\b|cp comboios|comboios|metro|carris|\bstcp\b|fertagus|uber|bolt|cabify|free ?now|oficina|pneu|norauto|midas/],
  ['saude', /farmac|clinica|hospital|cuf|lusiadas|luz saude|trofa saude|dentist|medic|otica|oculista|multiopticas|ginasio|fitness|holmes place|solinca|wells|analises|laboratorio/],
  ['lazer', /netflix|spotify|disney|hbo|\bmax\b|prime video|apple\.com|itunes|google|youtube|playstation|xbox|steam|nintendo|cinema|cinemas|ticketline|blueticket|bilheteira|museu|teatro|\bbar\b|discoteca|bowling/],
  ['compras', /amazon|zara|primark|fnac|worten|decathlon|h&m|pull|bershka|stradivarius|mango|shein|aliexpress|temu|el corte ingles|sport zone|perfumes|sephora|wells|douglas|radio popular|mediamarkt|staples|normal|tiger|action/],
  ['viagens', /hotel|hostel|booking|airbnb|ryanair|\btap\b|easyjet|vueling|iberia|hertz|europcar|sixt|avis|expedia|rumbo|edreams|pousada/],
  ['casa', /renda|ikea|leroy|\baki\b|bricomarche|maxmat|prestacao|habitacao|credito habit|jysk|conforama|moviflor|area|zara home|casa\b/],
];

export function categoriaPorPalavras(texto) {
  const t = ` ${semAcentos(texto).toLowerCase()} `;
  return PALAVRAS.find(([, re]) => re.test(t))?.[0] || 'outros';
}

const RE_TRANSFERENCIA = /\b(lev(antamento)?|trf|transf(erencia)?|mb ?way|poupanca|cartao (de )?credito|pag(amento)? cartao|amortiz|aplicacao|deposito a prazo)\b/;

/** Junta nome, chave, categoria (aprendida > palavras-chave) e se parece uma transferência. */
export function categorizar(movimentos, aprendidas = {}) {
  return movimentos.map((m) => {
    let comerciante = nomeComerciante(m.descricao);
    if (comerciante.replace(/[^\p{L}]/gu, '').length < 3) {
      // Ex.: "MBWAY P/" depois de retirado o nome da pessoa.
      const t = semAcentos(m.descricao).toLowerCase();
      comerciante = /mb ?way/.test(t) ? 'MB WAY' : /lev/.test(t) ? 'Levantamento' : RE_TRANSFERENCIA.test(t) ? 'Transferência' : m.descricao;
    }
    const chave = chaveComerciante(m.descricao);
    const categoria = aprendidas[chave] || categoriaPorPalavras(m.descricao);
    const transferencia = RE_TRANSFERENCIA.test(semAcentos(m.descricao).toLowerCase()) && !aprendidas[chave];
    return { ...m, comerciante, chave, categoria, transferencia };
  });
}

const BANCOS = [
  ['Caixa Geral de Depósitos', /caixa geral|\bcgd\b/], ['Millennium bcp', /millennium|\bbcp\b/], ['Novo Banco', /novo ?banco/],
  ['Santander', /santander/], ['BPI', /\bbpi\b/], ['Montepio', /montepio/], ['Crédito Agrícola', /credito agricola/],
  ['ActivoBank', /activo ?bank/], ['Moey!', /\bmoey/], ['Revolut', /revolut/], ['N26', /\bn26\b/], ['Bankinter', /bankinter/],
  ['UCI', /\buci\b/], ['Banco CTT', /banco ctt/], ['EuroBic', /eurobic|abanca/],
];

/**
 * Retira os dados pessoais das descrições dos movimentos (o perfil vem do cabeçalho do extrato).
 * Nas transferências e MB WAY retira também palavras soltas dos nomes do titular/casal.
 * Devolve { movimentos, removidos: { tipo: n.º de movimentos } }.
 */
export function limparMovimentos(movimentos, perfil) {
  const removidos = {};
  const limpos = movimentos.map((m) => {
    const transferencia = RE_TRANSFERENCIA.test(semAcentos(m.descricao).toLowerCase());
    const r = removerDadosPessoais(m.descricao, perfil, { nomesSoltos: transferencia });
    r.removidos.forEach((t) => { removidos[t] = (removidos[t] || 0) + 1; });
    const descricao = r.texto.replace(/\s+/g, ' ').trim() || (transferencia ? 'Transferência' : 'Movimento');
    return { ...m, descricao };
  });
  return { movimentos: limpos, removidos };
}

/** Juntar o que se retirou do cabeçalho (titular, morada, IBAN…) com o que se retirou dos movimentos. */
function resumoPrivacidade(linhas, perfil, removidosMovs) {
  const cabecalho = {};
  const texto = linhas.slice(0, 60).map((l) => l.texto).join('\n');
  removerDadosPessoais(texto, perfil).removidos.forEach((t) => { cabecalho[t] = true; });
  return { cabecalho: Object.keys(cabecalho), movimentos: removidosMovs };
}

/**
 * Extrato completo a partir das páginas do pdf.js (ou de uma folha de cálculo convertida em linhas).
 * nomesConhecidos: nomes dos membros do casal, que também são retirados.
 */
export function lerExtratoDeTexto(paginas, { aprendidas = {}, ano, nomesConhecidos = [] } = {}) {
  const linhas = agruparLinhas(paginas);
  return montarExtrato(linhas, extrairMovimentos(linhas, { ano }), { aprendidas, nomesConhecidos });
}

function montarExtrato(linhas, brutos, { aprendidas = {}, nomesConhecidos = [] } = {}) {
  const tudo = semAcentos(linhas.slice(0, 40).map((l) => l.texto).join(' ')).toLowerCase();
  const banco = BANCOS.find(([, re]) => re.test(tudo))?.[0] || '';
  const perfil = identificarTitular(linhas.map((l) => l.texto), { nomesConhecidos });
  const { movimentos: limpos, removidos } = limparMovimentos(brutos, perfil);
  const movimentos = categorizar(limpos, aprendidas).sort((a, b) => a.data.localeCompare(b.data));
  const datas = movimentos.map((m) => m.data);
  return {
    banco,
    periodo: { inicio: datas[0] || '', fim: datas[datas.length - 1] || '' },
    movimentos,
    linhas: linhas.length,
    privacidade: resumoPrivacidade(linhas, perfil, removidos),
  };
}

// ---------------------------------------------------------------------------------------------
// Folhas de cálculo (CSV / Excel exportado pelo banco)

const COL_DATA = /^(data( (de )?(mov(imento)?|operacao|lancamento|transacao))?|data mov\.?|date|completed date|started date)$/;
const COL_DESC = /^(descri(cao|tivo)?( do movimento)?|movimento|designacao|description|detalhe|texto|referencia)$/;
const COL_DEB = /^(debito|debitos|levantamentos?|saidas?|money out|a debito|valor a debito)$/;
const COL_CRED = /^(credito|creditos|depositos?|entradas?|money in|a credito|valor a credito)$/;
const COL_MONT = /^(montante|valor|importancia|amount|montante \(eur\)|valor \(eur\)|montante eur)$/;
const COL_SALDO = /^(saldo|saldo (contabilistico|disponivel|apos movimento)|balance)$/;

const celula = (v) => semAcentos(String(v ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();

function numeroCelula(v) {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[€\s ]|EUR/gi, '').trim();
  if (!t) return null;
  let sinal = 1;
  if (/^\(.*\)$/.test(t) || /-$/.test(t) || /^-/.test(t)) sinal = -1;
  t = t.replace(/[()+-]/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n * sinal : null;
}

function dataCelula(v, ano) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // O SheetJS cria as datas à meia-noite local: usar a data local (não UTC) para não recuar um dia.
    const d = new Date(v.getTime() + 12 * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) { // data de série do Excel
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const t = String(v ?? '').trim().split(/[ T]/)[0];
  return dataIso(t, ano);
}

/** Divide um CSV (separador ; , ou tab, com aspas) em linhas de células. */
export function lerCsv(texto) {
  const linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const amostra = linhas.slice(0, 15).join('\n');
  const sep = [';', '\t', ','].map((s) => [s, amostra.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  return linhas.map((linha) => {
    const out = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < linha.length; i += 1) {
      const c = linha[i];
      if (c === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i += 1; } else aspas = !aspas; } else if (c === sep && !aspas) { out.push(atual); atual = ''; } else atual += c;
    }
    out.push(atual);
    return out.map((x) => x.trim());
  });
}

/**
 * Extrato a partir de uma tabela (linhas de células) de um CSV/Excel do banco.
 * Encontra a linha de cabeçalho (Data, Descrição, Débito/Crédito ou Montante, Saldo).
 */
export function lerExtratoDeTabela(tabela, { aprendidas = {}, ano, nomesConhecidos = [] } = {}) {
  const linhasTexto = tabela.map((cels, i) => ({ texto: cels.map((c) => String(c ?? '')).join(' ').replace(/\s+/g, ' ').trim(), pagina: 0, y: -i }));
  const anoBase = ano || anoDoDocumento(linhasTexto);
  let cab = -1;
  let col = {};
  for (let i = 0; i < Math.min(tabela.length, 40) && cab < 0; i += 1) {
    const c = {};
    tabela[i].forEach((v, j) => {
      const t = celula(v);
      if (c.data == null && COL_DATA.test(t)) c.data = j;
      else if (c.desc == null && COL_DESC.test(t)) c.desc = j;
      else if (c.deb == null && COL_DEB.test(t)) c.deb = j;
      else if (c.cred == null && COL_CRED.test(t)) c.cred = j;
      else if (c.mont == null && COL_MONT.test(t)) c.mont = j;
      else if (c.saldo == null && COL_SALDO.test(t)) c.saldo = j;
    });
    if (c.data != null && c.desc != null && (c.mont != null || c.deb != null || c.cred != null)) { cab = i; col = c; }
  }
  if (cab < 0) return montarExtrato(linhasTexto, [], { aprendidas, nomesConhecidos });
  const brutos = [];
  for (const cels of tabela.slice(cab + 1)) {
    const data = dataCelula(cels[col.data], anoBase);
    const descricao = String(cels[col.desc] ?? '').replace(/\s+/g, ' ').trim();
    if (!data || !descricao) continue;
    let valor = null;
    let tipo = null;
    const deb = col.deb != null ? numeroCelula(cels[col.deb]) : null;
    const cred = col.cred != null ? numeroCelula(cels[col.cred]) : null;
    if (deb) { valor = Math.abs(deb); tipo = 'debito'; } else if (cred) { valor = Math.abs(cred); tipo = 'credito'; } else if (col.mont != null) {
      const m = numeroCelula(cels[col.mont]);
      if (m) { valor = Math.abs(m); tipo = m < 0 ? 'debito' : 'credito'; }
    }
    if (!valor) continue;
    brutos.push({ data, descricao, valor: arred(valor), tipo });
  }
  return montarExtrato(linhasTexto.slice(0, cab + 1), brutos, { aprendidas, nomesConhecidos });
}

/** Um movimento já existe nas despesas se tiver a mesma data e o mesmo valor. */
export function marcarDuplicados(movimentos, despesas) {
  const existentes = new Map();
  for (const e of despesas || []) {
    const k = `${e.data}|${arred(Number(e.valor) || 0).toFixed(2)}`;
    existentes.set(k, (existentes.get(k) || 0) + 1);
  }
  return movimentos.map((m) => {
    const k = `${m.data}|${m.valor.toFixed(2)}`;
    const n = existentes.get(k) || 0;
    if (n > 0) existentes.set(k, n - 1);
    return { ...m, duplicado: n > 0 };
  });
}

// ---------------------------------------------------------------------------------------------
// 4. Afinar categorias com a IA, sem dados sensíveis
// Só se envia o nome limpo de cada comerciante (sem números de cartão, referências, IBAN, valores,
// saldos ou datas). Transferências e MB WAY não são enviados (costumam ter nomes de pessoas),
// nem os comerciantes que o casal já categorizou.

const RE_SENSIVEL = /\b[A-Z]{2}\d{2}[\s\d]{10,}\b|\d{3,}|@|\*+/g;

export function textoSeguro(descricao) {
  return nomeComerciante(String(descricao || '').replace(RE_SENSIVEL, ' ')).slice(0, 40);
}

/** Lista de { chave, texto } única por comerciante, a enviar à IA. */
export function pedidoCategorias(movimentos, aprendidas = {}) {
  const vistos = new Map();
  for (const m of movimentos) {
    if (!m.chave || aprendidas[m.chave] || m.transferencia || vistos.has(m.chave)) continue;
    const texto = textoSeguro(m.descricao);
    if (texto.replace(/[^\p{L}]/gu, '').length >= 3) vistos.set(m.chave, texto);
  }
  return [...vistos.entries()].slice(0, 150).map(([chave, texto]) => ({ chave, texto }));
}

export function promptCategorias(itens) {
  return `Categoriza despesas de um casal em Portugal a partir do nome do comerciante que aparece no extrato bancário
e dá um nome limpo e legível a cada comerciante (ex.: "Pd Braga Lamacaes" -> "Pingo Doce", "Wwwamazon Es" -> "Amazon",
"Mcdonalds 0234" -> "McDonald's"). O nome deve ser a marca ou loja, sem localidades, códigos nem formas jurídicas.
Categorias possíveis: ${CATEGORIAS_EXTRATO.join(', ')}.
(casa = renda, prestação, mobília, bricolage; contas = luz, gás, água, telecomunicações, seguros, impostos, comissões;
supermercado = supermercados e mercearias; restaurante = restaurantes, cafés, entregas de comida; transportes = combustível,
portagens, estacionamento, transportes públicos, TVDE, oficina; saude = farmácias, clínicas, ginásio; lazer = streaming,
subscrições digitais, cinema, espetáculos, bares; compras = roupa, eletrónica, lojas online; viagens = hotéis, voos, alojamento.)
Se não souberes a categoria usa "outros"; se não souberes o nome, repete-o. Devolve APENAS JSON:
{"itens": {"0": {"categoria": "supermercado", "nome": "Pingo Doce"}, "1": {"categoria": "lazer", "nome": "Netflix"}}} com o número de cada linha.
${itens.map((it, i) => `${i}: ${it.texto}`).join('\n')}`;
}

/** Converte a resposta da IA em { categorias: { chave: categoria }, nomes: { chave: nome } }. */
export function lerRespostaIa(resposta, itens) {
  const categorias = {};
  const nomes = {};
  const porItem = resposta?.itens || {};
  const antigas = resposta?.categorias || {};
  itens.forEach((it, i) => {
    const r = porItem[i] ?? porItem[String(i)];
    const c = typeof r === 'string' ? r : r?.categoria ?? antigas[i] ?? antigas[String(i)];
    if (CATEGORIAS_EXTRATO.includes(c)) categorias[it.chave] = c;
    const nome = typeof r === 'object' && r ? String(r.nome || '').replace(/\s+/g, ' ').trim() : '';
    // Só aceita nomes curtos e sem números (não deixa a IA "inventar" dados).
    if (nome && nome.length <= 40 && !/\d{3,}/.test(nome)) nomes[it.chave] = nome;
  });
  return { categorias, nomes };
}

/** Converte a resposta da IA em { chave: categoria }, ignorando categorias inválidas. */
export function lerRespostaCategorias(resposta, itens) {
  return lerRespostaIa(resposta, itens).categorias;
}
