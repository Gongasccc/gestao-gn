// Retirar o fundo da capa de um cartão, no próprio dispositivo (sem IA nem envio de dados).
// Ideia: a cor do fundo é a das margens da foto. A partir das margens "inunda-se" tudo o que
// tem essa cor (ou muda de forma suave a partir dela), fica transparente e recorta-se o resto.

const dist = (d, i, r, g, b) => {
  const dr = d[i] - r; const dg = d[i + 1] - g; const db = d[i + 2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const mediana = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Cor do fundo (mediana das margens) e quão uniforme ela é. */
export function corDasMargens({ data, width, height }) {
  const rs = []; const gs = []; const bs = [];
  const add = (x, y) => { const i = (y * width + x) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); };
  const passo = Math.max(1, Math.floor(Math.max(width, height) / 200));
  for (let x = 0; x < width; x += passo) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y += passo) { add(0, y); add(width - 1, y); }
  const cor = [mediana(rs), mediana(gs), mediana(bs)];
  let soma = 0;
  for (let k = 0; k < rs.length; k++) {
    soma += Math.sqrt((rs[k] - cor[0]) ** 2 + (gs[k] - cor[1]) ** 2 + (bs[k] - cor[2]) ** 2);
  }
  return { cor, dispersao: rs.length ? soma / rs.length : 0 };
}

/**
 * Torna transparente o fundo de uma imagem (ImageData-like: { data, width, height }).
 * Altera `data` e devolve { ok, caixa: { x, y, w, h } } — ok=false quando não encontrou um
 * objeto claro (nesse caso a imagem original deve ser usada).
 */
export function removerFundo(img, { tolerancia } = {}) {
  const { data, width, height } = img;
  const total = width * height;
  const { cor, dispersao } = corDasMargens(img);
  const tol = tolerancia ?? Math.min(90, Math.max(28, 22 + dispersao * 1.6));
  const [r, g, b] = cor;
  const fundo = new Uint8Array(total);
  const fila = new Int32Array(total);
  let ini = 0; let fim = 0;

  const semente = (p) => {
    if (fundo[p]) return;
    if (dist(data, p * 4, r, g, b) < tol * 1.4) { fundo[p] = 1; fila[fim++] = p; }
  };
  for (let x = 0; x < width; x++) { semente(x); semente((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { semente(y * width); semente(y * width + width - 1); }

  while (ini < fim) {
    const p = fila[ini++];
    const x = p % width;
    const y = (p - x) / width;
    const vizinhos = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
    for (const n of vizinhos) {
      if (n < 0 || fundo[n]) continue;
      const i = n * 4;
      const dFundo = dist(data, i, r, g, b);
      // Parecido com o fundo, ou uma transição suave (sombras, gradientes) a partir do vizinho.
      if (dFundo < tol || (dFundo < tol * 4 && dist(data, i, data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) < 9)) {
        fundo[n] = 1;
        fila[fim++] = n;
      }
    }
  }

  // Caixa do que sobrou (o cartão).
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1; let frente = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (fundo[y * width + x]) continue;
      frente++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const fracao = frente / total;
  if (x1 < 0 || fracao < 0.06 || fracao > 0.97) return { ok: false, caixa: { x: 0, y: 0, w: width, h: height } };

  // Transparência, com a orla suavizada (meio transparente junto ao fundo).
  for (let p = 0; p < total; p++) {
    if (fundo[p]) { data[p * 4 + 3] = 0; continue; }
    const x = p % width;
    const junto = (x > 0 && fundo[p - 1]) || (x < width - 1 && fundo[p + 1])
      || (p >= width && fundo[p - width]) || (p + width < total && fundo[p + width]);
    if (junto) data[p * 4 + 3] = Math.min(data[p * 4 + 3], 140);
  }
  return { ok: true, caixa: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

const carregar = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Não foi possível abrir a imagem'));
  img.src = src;
});

function exportar(canvas) {
  // WebP mantém a transparência e é leve; se o browser não souber, sai PNG.
  let url = canvas.toDataURL('image/webp', 0.86);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
  return url;
}

/**
 * Prepara a capa: reduz, retira o fundo (se `semFundo`) e recorta. Devolve { url, semFundo }.
 * `semFundo` no resultado diz se a remoção correu bem.
 */
export async function prepararCapa(dataUrl, { semFundo = true, max = 720 } = {}) {
  const img = await carregar(dataUrl);
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  if (!semFundo) return { url: exportar(canvas), semFundo: false };

  const dados = ctx.getImageData(0, 0, w, h);
  const { ok, caixa } = removerFundo(dados);
  if (!ok) return { url: exportar(canvas), semFundo: false };
  ctx.putImageData(dados, 0, 0);
  const out = document.createElement('canvas');
  out.width = caixa.w;
  out.height = caixa.h;
  out.getContext('2d').drawImage(canvas, caixa.x, caixa.y, caixa.w, caixa.h, 0, 0, caixa.w, caixa.h);
  return { url: exportar(out), semFundo: true };
}
