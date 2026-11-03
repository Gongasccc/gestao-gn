// Extrai o texto (com posições) de um PDF no próprio dispositivo, com o pdf.js da Mozilla.
// Nada é enviado para servidores: só se descarrega a biblioteca, uma vez, a partir do CDN.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build';

let biblioteca;
async function pdfjs() {
  if (!biblioteca) {
    biblioteca = import(`${PDFJS}/pdf.min.mjs`).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
      return lib;
    }).catch((e) => { biblioteca = null; throw e; });
  }
  return biblioteca;
}

export class PdfProtegido extends Error {
  constructor(errada) {
    super(errada ? 'Palavra-passe errada.' : 'Este PDF está protegido com palavra-passe.');
    this.name = 'PdfProtegido';
    this.errada = errada;
  }
}

/** Devolve as páginas do PDF como listas de { str, x, y, w }. */
/** progresso(0..1) é chamado a cada página lida. */
export async function textoDoPdf(bytes, { password, progresso } = {}) {
  let lib;
  try {
    lib = await pdfjs();
  } catch {
    throw new Error('Não foi possível carregar o leitor de PDF. Verifica a ligação à internet.');
  }
  let pdf;
  try {
    pdf = await lib.getDocument({ data: bytes, password, isEvalSupported: false }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new PdfProtegido(e.code === 2);
    throw new Error('Não foi possível abrir este PDF.');
  }
  const paginas = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    paginas.push(items.filter((i) => 'str' in i).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
    progresso?.(n / pdf.numPages);
  }
  await pdf.destroy();
  return paginas;
}

// Folhas de cálculo (Excel .xlsx/.xls) lidas no dispositivo com o SheetJS; o CSV não precisa de biblioteca.
const SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
let sheetjs;

/** Devolve a primeira folha com dados como lista de linhas de células. */
export async function tabelaDoExcel(bytes) {
  try {
    sheetjs ??= import(SHEETJS).catch((e) => { sheetjs = null; throw e; });
    const XLSX = await sheetjs;
    const livro = XLSX.read(bytes, { type: 'array', cellDates: true });
    for (const nome of livro.SheetNames) {
      const linhas = XLSX.utils.sheet_to_json(livro.Sheets[nome], { header: 1, raw: true, defval: '' });
      if (linhas.length > 1) return linhas;
    }
    return [];
  } catch (e) {
    console.error('[extrato] excel', e);
    throw new Error('Não foi possível abrir esta folha de cálculo. Tenta exportar em PDF ou CSV.');
  }
}
