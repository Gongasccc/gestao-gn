// Leitura e compressão de ficheiros. O Firestore tem um limite de 1 MB por documento,
// por isso todas as imagens são redimensionadas e comprimidas antes de serem guardadas.

export const MAX_FILE_BYTES = 900 * 1024;

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Redimensiona a imagem para `maxSize` px no lado maior e devolve um data URL JPEG. */
export async function compressImage(file, { maxSize = 1200, quality = 0.72 } = {}) {
  const img = await loadImage(await readAsDataURL(file));
  let { width: w, height: h } = img;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Primeiro ficheiro de um evento change de um <input type=file>, limpando o input. */
export function takeFile(ev) {
  const input = ev.target;
  const file = input.files?.[0];
  input.value = '';
  return file || null;
}

export const dataUrlBytes = (dataUrl) => Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

/** Igual a compressImage, mas devolve um File JPEG (para enviar para o Firebase Storage). */
export async function compressImageBlob(file, { maxSize = 2000, quality = 0.82 } = {}) {
  const dataUrl = await compressImage(file, { maxSize, quality });
  const blob = await (await fetch(dataUrl)).blob();
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
