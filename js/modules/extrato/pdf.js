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
export async function textoDoPdf(bytes, { password } = {}) {
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
  }
  await pdf.destroy();
  return paginas;
}
