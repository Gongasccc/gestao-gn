// Leitura de faturas no próprio dispositivo (nada é enviado para servidores):
// 1) código QR da AT (BarcodeDetector do browser ou jsQR), 2) texto por OCR (Tesseract.js)
// ou, nos PDFs, o texto do próprio PDF (pdf.js). As bibliotecas só são descarregadas quando
// são precisas e ficam na cache do browser; o modelo de português do OCR tem ~2 MB.
const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
const TESSERACT_OPCOES = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int',
};
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const uma = (fn) => {
  let p = null;
  return () => (p ??= fn().catch((e) => { p = null; throw e; }));
};
const carregarJsQr = uma(() => import(JSQR_URL).then((m) => m.default || m));
const carregarTesseract = uma(() => import(TESSERACT_URL).then((m) => m.default || m));
const carregarPdfJs = uma(async () => {
  const pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return pdfjs;
});

// ---------- Imagens ----------

export function carregarImagem(fonte) {
  return new Promise((resolve, reject) => {
    const url = typeof fonte === 'string' ? fonte : URL.createObjectURL(fonte);
    const img = new Image();
    img.onload = () => { if (typeof fonte !== 'string') URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = url;
  });
}

/** Desenha (uma parte de) uma imagem num canvas com `lado` px no lado maior. */
function paraCanvas(img, lado, recorte = null) {
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  const [sx, sy, sw, sh] = recorte
    ? [recorte.x * largura, recorte.y * altura, recorte.w * largura, recorte.h * altura]
    : [0, 0, largura, altura];
  const escala = Math.min(1, lado / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * escala));
  canvas.height = Math.max(1, Math.round(sh * escala));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ---------- Código QR ----------

async function qrNativo(fonte) {
  if (!('BarcodeDetector' in globalThis)) return null;
  try {
    const formatos = await globalThis.BarcodeDetector.getSupportedFormats?.();
    if (formatos && !formatos.includes('qr_code')) return null;
    const detetor = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
    const codigos = await detetor.detect(fonte);
    return codigos.map((c) => c.rawValue).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Procura códigos QR numa imagem (ou canvas). Tenta a imagem toda e depois
 * zonas mais pequenas, porque o QR de um talão costuma ser pequeno na foto.
 * aceitar(texto) decide se o código serve (ex.: é o QR da AT).
 */
export async function procurarQr(img, aceitar = () => true) {
  const nativo = await qrNativo(img);
  const bom = nativo?.find(aceitar);
  if (bom) return bom;

  const jsQR = await carregarJsQr();
  const tentativas = [
    { lado: 1400 },
    { lado: 1400, recorte: { x: 0, y: 0.45, w: 1, h: 0.55 } },
    { lado: 1400, recorte: { x: 0, y: 0, w: 1, h: 0.55 } },
    { lado: 2200 },
    { lado: 1200, recorte: { x: 0, y: 0.6, w: 1, h: 0.4 } },
    { lado: 1000, recorte: { x: 0.15, y: 0.65, w: 0.7, h: 0.35 } },
  ];
  for (const t of tentativas) {
    const canvas = paraCanvas(img, t.lado, t.recorte);
    const dados = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const r = jsQR(dados.data, dados.width, dados.height, { inversionAttempts: 'dontInvert' });
    if (r?.data && aceitar(r.data)) return r.data;
    await new Promise((ok) => setTimeout(ok)); // não bloquear a interface
  }
  return null;
}

// ---------- OCR ----------

let trabalhador = null;

async function obterTrabalhador(progresso) {
  if (trabalhador) return trabalhador;
  const Tesseract = await carregarTesseract();
  trabalhador = Tesseract.createWorker('por', 1, {
    ...TESSERACT_OPCOES,
    logger: (m) => {
      if (m.status === 'recognizing text') progresso?.(m.progress);
    },
  }).catch((e) => { trabalhador = null; throw e; });
  return trabalhador;
}

/** Texto da imagem por OCR, no dispositivo. progresso(0..1) enquanto lê. */
export async function textoPorOcr(img, progresso) {
  const canvas = paraCanvas(img, 2000);
  // Escala de cinzentos com mais contraste: o papel térmico dos talões é claro e fraco.
  const ctx = canvas.getContext('2d');
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = dados.data;
  for (let i = 0; i < p.length; i += 4) {
    const cinza = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const v = Math.max(0, Math.min(255, (cinza - 128) * 1.5 + 140));
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(dados, 0, 0);
  const worker = await obterTrabalhador(progresso);
  const { data } = await worker.recognize(canvas);
  return data?.text || '';
}

// ---------- PDF ----------

/** Texto de todas as páginas de um PDF (sem OCR) e a primeira página como imagem para o QR. */
export async function lerPdf(file, { paginas = 4 } = {}) {
  const pdfjs = await carregarPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const linhas = [];
  const canvases = [];
  for (let n = 1; n <= Math.min(doc.numPages, paginas); n += 1) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    // Agrupa os pedaços de texto por linha (mesma coordenada y) e ordena da esquerda para a direita.
    const porLinha = new Map();
    for (const item of conteudo.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3);
      if (!porLinha.has(y)) porLinha.set(y, []);
      porLinha.get(y).push({ x: item.transform[4], s: item.str });
    }
    [...porLinha.entries()].sort((a, b) => b[0] - a[0])
      .forEach(([, partes]) => linhas.push(partes.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ')));

    const vista = pagina.getViewport({ scale: 1 });
    const escala = Math.min(3, 1800 / Math.max(vista.width, vista.height));
    const viewport = pagina.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  await doc.destroy();
  return { texto: linhas.join('\n'), paginas: canvases };
}
