import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faturaDoQr, lerCamposQr, nifValido } from '../js/modules/faturas/qr.js';
import { analisarTexto, juntarLeituras, categoriaPorNome } from '../js/modules/faturas/texto.js';

const QR = 'A:500829993*B:999999990*C:PT*D:FS*E:N*F:20261102*G:FS 0123/456789*H:JJ3K7XYZ-456789*I1:PT*I3:12.30*I4:0.74*I7:4.07*I8:0.93*N:1.67*O:18.04*Q:a1B2*R:1234';

test('nifValido confirma o dígito de controlo', () => {
  assert.equal(nifValido('500829993'), true);
  assert.equal(nifValido('502011475'), true);
  assert.equal(nifValido('503340855'), true);
  assert.equal(nifValido('500829994'), false);
  assert.equal(nifValido('12345'), false);
});

test('lerCamposQr só aceita QR da AT', () => {
  assert.equal(lerCamposQr('https://exemplo.pt'), null);
  assert.equal(lerCamposQr('A:123*B:4'), null);
  assert.equal(lerCamposQr(QR).H, 'JJ3K7XYZ-456789');
});

test('faturaDoQr tira loja, data, total, IVA e ATCUD', () => {
  const f = faturaDoQr(QR);
  assert.equal(f.loja, 'Pingo Doce');
  assert.equal(f.nif, '500829993');
  assert.equal(f.nifCliente, '');
  assert.equal(f.data, '2026-11-02');
  assert.equal(f.total, 18.04);
  assert.equal(f.iva, 1.67);
  assert.equal(f.atcud, 'JJ3K7XYZ-456789');
  assert.equal(f.documento, 'FS 0123/456789');
  assert.equal(f.tipoDocumento, 'Fatura simplificada');
});

test('faturaDoQr usa as lojas aprendidas para NIFs desconhecidos', () => {
  const qr = QR.replace('A:500829993', 'A:509999999');
  assert.equal(faturaDoQr(qr).loja, '');
  assert.equal(faturaDoQr(qr, { 509999999: 'Intermarché Braga' }).loja, 'Intermarché Braga');
});

const TALAO = `
MODELO CONTINENTE HIPERMERCADOS S.A.
CONTINENTE BRAGA
NIF: 502011475
Capital Social 1.000.000,00
02/11/2026 18:45
(C) LEITE UHT MG MIMOSA 1L
2 X 0,89                1,78
BANANA IMPORTADA
1,234 kg x 1,29 EUR/kg  1,59
(A) DETERGENTE SKIP 40D   9,99
DESC. IMEDIATO           -2,00
PAO DE FORMA BIMBO        1,49 C
SUBTOTAL                 12,85
TOTAL A PAGAR            12,85
MULTIBANCO               12,85
TROCO                     0,00
IVA 6% 3,08 0,19
`;

test('analisarTexto lê um talão típico', () => {
  const f = analisarTexto(TALAO);
  assert.equal(f.loja, 'Continente');
  assert.equal(f.nif, '502011475');
  assert.equal(f.data, '2026-11-02');
  assert.equal(f.hora, '18:45');
  assert.equal(f.total, 12.85);
  assert.equal(f.poupanca, 2);
  assert.deepEqual(f.itens.map((i) => [i.nome, i.quantidade, i.unidade, i.total]), [
    ['LEITE UHT MG MIMOSA 1L', 2, 'un', 1.78],
    ['BANANA IMPORTADA', 1.234, 'kg', 1.59],
    ['DETERGENTE SKIP 40D', 1, 'un', 7.99],
    ['PAO DE FORMA BIMBO', 1, 'un', 1.49],
  ]);
  assert.equal(f.itens[2].desconto, 2);
  assert.equal(f.itens[0].categoria, 'laticinios');
  assert.equal(f.itens[1].categoria, 'frescos');
  assert.equal(f.itens[0].produto, 'Leite UHT meio-gordo Mimosa 1 L');
});

test('analisarTexto não inventa produtos num texto vazio', () => {
  const f = analisarTexto('');
  assert.deepEqual(f.itens, []);
  assert.equal(f.total, 0);
});

test('juntarLeituras dá prioridade ao QR nos campos fiscais', () => {
  const f = juntarLeituras(faturaDoQr(QR), analisarTexto(TALAO));
  assert.equal(f.loja, 'Pingo Doce');
  assert.equal(f.total, 18.04);
  assert.equal(f.hora, '18:45');
  assert.equal(f.itens.length, 4);
  assert.equal(juntarLeituras(null, null).itens.length, 0);
});

test('categoriaPorNome', () => {
  assert.equal(categoriaPorNome('IOGURTE GREGO'), 'laticinios');
  assert.equal(categoriaPorNome('AGUA LUSO 1,5L'), 'bebidas');
  assert.equal(categoriaPorNome('XPTO'), 'outros');
});

test('duplicada reconhece o mesmo ATCUD', async () => {
  const { duplicada } = await import('../js/modules/faturas/stats.js');
  const a = { loja: 'Pingo Doce', nif: '500829993', atcud: 'X-1', data: '2026-11-02', total: 18.04 };
  assert.equal(duplicada([a], { ...a, loja: 'PD Braga', total: 18 }), a);
  assert.equal(duplicada([a], { ...a, atcud: 'X-2', loja: 'Outra' }), null);
});

test('charcutaria: categoria própria e reclassificação das faturas antigas', async () => {
  const { categoriaPorNome, reclassificarCharcutaria } = await import('../js/modules/faturas/texto.js');
  assert.equal(categoriaPorNome('FIAMBRE PERNA EXTRA'), 'charcutaria');
  assert.equal(categoriaPorNome('Chouriço de carne'), 'charcutaria');
  assert.equal(categoriaPorNome('PEITO FRANGO'), 'talho');
  const itens = [
    { produto: 'Fiambre da perna 200 g', categoria: 'talho' },
    { produto: 'Presunto', categoria: 'talho', confirmado: true },
    { produto: 'Peito de frango', categoria: 'talho' },
  ];
  const r = reclassificarCharcutaria(itens);
  assert.deepEqual(r.map((i) => i.categoria), ['charcutaria', 'talho', 'talho']);
  assert.equal(reclassificarCharcutaria(r), null);
});
