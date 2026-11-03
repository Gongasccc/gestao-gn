import test from 'node:test';
import assert from 'node:assert/strict';
import { removerFundo, corDasMargens } from '../js/modules/cards/fundo.js';
import { normalizarLink } from '../js/modules/cards/util.js';

// Imagem sintética: fundo cinzento claro com ruído, cartão vermelho ao centro.
function imagem(w, h, { fundo = [235, 235, 232], cartao = [200, 30, 40], caixa = [20, 15, 60, 40], ruido = 6 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dentro = x >= caixa[0] && x < caixa[0] + caixa[2] && y >= caixa[1] && y < caixa[1] + caixa[3];
      const c = dentro ? cartao : fundo;
      const n = ((x * 7 + y * 13) % (ruido * 2 + 1)) - ruido;
      data[i] = c[0] + n; data[i + 1] = c[1] + n; data[i + 2] = c[2] + n; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

test('corDasMargens encontra a cor do fundo', () => {
  const { cor } = corDasMargens(imagem(100, 70));
  assert.ok(Math.abs(cor[0] - 235) < 8 && Math.abs(cor[2] - 232) < 8);
});

test('removerFundo recorta o cartão e torna o fundo transparente', () => {
  const img = imagem(100, 70);
  const { ok, caixa } = removerFundo(img);
  assert.equal(ok, true);
  assert.deepEqual(caixa, { x: 20, y: 15, w: 60, h: 40 });
  assert.equal(img.data[3], 0); // canto
  assert.equal(img.data[(40 * 100 + 50) * 4 + 3], 255); // centro do cartão
});

test('removerFundo desiste quando não há um objeto claro', () => {
  const img = imagem(60, 40, { caixa: [0, 0, 0, 0] });
  assert.equal(removerFundo(img).ok, false);
});

test('removerFundo com cartão branco sobre mesa escura', () => {
  const img = imagem(120, 90, { fundo: [60, 45, 35], cartao: [245, 245, 245], caixa: [10, 10, 100, 64], ruido: 10 });
  const { ok, caixa } = removerFundo(img);
  assert.equal(ok, true);
  assert.deepEqual(caixa, { x: 10, y: 10, w: 100, h: 64 });
});

test('normalizarLink', () => {
  assert.equal(normalizarLink('folhetos.continente.pt'), 'https://folhetos.continente.pt/');
  assert.equal(normalizarLink('https://www.lidl.pt/folhetos'), 'https://www.lidl.pt/folhetos');
  assert.equal(normalizarLink(''), '');
  assert.equal(normalizarLink('javascript:alert(1)'), '');
  assert.equal(normalizarLink('nada'), '');
});
