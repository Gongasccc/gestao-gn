// Tratamento da foto do medicamento: redimensionar e remover o fundo no próprio dispositivo.
// A remoção de fundo usa @imgly/background-removal (modelo ONNX corre no browser, nada é enviado para servidores).
const BG_REMOVAL_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

let bibliotecaFundo = null;
const carregarBiblioteca = () => (bibliotecaFundo ??= import(BG_REMOVAL_URL).catch((e) => {
  bibliotecaFundo = null;
  throw e;
}));

// Começa a descarregar o modelo enquanto o utilizador escolhe a foto.
export function preCarregarRemocaoFundo() {
  carregarBiblioteca()
    .then(({ preload }) => preload?.({ model: 'isnet_quint8' }))
    .catch(() => { /* tenta outra vez quando for preciso */ });
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

async function redimensionar(blob, maxLado, tipo, qualidade) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await carregarImagem(url);
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(tipo, qualidade);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Recorta as margens transparentes para o medicamento ocupar a imagem toda.
async function recortarTransparencia(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await carregarImagem(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return blob;
    const margem = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
    minX = Math.max(0, minX - margem); minY = Math.max(0, minY - margem);
    maxX = Math.min(width - 1, maxX + margem); maxY = Math.min(height - 1, maxY + margem);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return await new Promise((r) => out.toBlob((b) => r(b || blob), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Foto para a IA: JPEG até 1280px (texto da embalagem legível, pedido leve).
export async function prepararParaIA(ficheiro) {
  const dataUrl = await redimensionar(ficheiro, 1280, 'image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}

// Devolve um data URL WebP com fundo transparente, pequeno o suficiente para o Firestore.
export async function removerFundo(ficheiro, aoProgredir = () => {}) {
  const { removeBackground } = await carregarBiblioteca();
  const entrada = await fetch(await redimensionar(ficheiro, 1280, 'image/jpeg', 0.92)).then((r) => r.blob());
  const semFundo = await removeBackground(entrada, {
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (chave, atual, total) => {
      if (total) aoProgredir(chave.startsWith('fetch') ? 'A preparar o modelo…' : 'A remover o fundo…', atual / total);
    },
  });
  const recortada = await recortarTransparencia(semFundo);
  return redimensionar(recortada, 560, 'image/webp', 0.82);
}

// Sem remoção de fundo (falha ou dispositivo fraco): guarda só uma miniatura.
export const miniatura = (ficheiro) => redimensionar(ficheiro, 560, 'image/webp', 0.8);
