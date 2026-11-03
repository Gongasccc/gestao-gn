import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quantidadeArtigo, condiz, indicePrecos, estimarArtigo, estimarLoja, melhorNoutraLoja, normalizarPromos, semanaIso, promoAtiva,
} from '../js/modules/shopping/precos.js';

const faturas = [
  { loja: 'Pingo Doce', data: '2026-10-01', itens: [
    { produto: 'Queijo flamengo fatiado Limiano 200 g', quantidade: 1, precoUnitario: 2.49, total: 2.49 },
    { produto: 'Leite UHT meio-gordo Mimosa 1 L', quantidade: 6, precoUnitario: 0.95, total: 5.7 },
    { produto: 'Banana', quantidade: 1.2, unidade: 'kg', precoUnitario: 1.19, total: 1.43 },
  ] },
  { loja: 'Pingo Doce', data: '2026-10-20', itens: [
    { produto: 'Queijo flamengo fatiado Limiano 200 g', quantidade: 1, precoUnitario: 2.69, total: 2.69 },
  ] },
  { loja: 'Continente', data: '2026-10-10', itens: [
    { produto: 'Leite UHT meio-gordo Mimosa 1 L', quantidade: 6, precoUnitario: 0.89, total: 5.34 },
  ] },
];
const indice = indicePrecos(faturas);
const hoje = '2026-11-05';

test('quantidade pedida no texto', () => {
  assert.equal(quantidadeArtigo('2x leite'), 2);
  assert.equal(quantidadeArtigo('leite x3'), 3);
  assert.equal(quantidadeArtigo('3 iogurtes'), 3);
  assert.equal(quantidadeArtigo('queijo flamengo'), 1);
  assert.equal(quantidadeArtigo('7up'), 1);
});

test('o artigo condiz com o produto pelas palavras', () => {
  assert.ok(condiz('queijo flamengo', 'Queijo flamengo fatiado Limiano 200 g'));
  assert.ok(condiz('2 bananas', 'Banana'));
  assert.ok(!condiz('queijo fresco', 'Queijo flamengo fatiado Limiano 200 g'));
});

test('usa o último preço pago na própria loja', () => {
  const e = estimarArtigo('queijo flamengo', 'Pingo Doce', { indice, hoje });
  assert.equal(e.fonte, 'loja');
  assert.equal(e.preco, 2.69);
});

test('nunca comprado nesta loja: usa o preço das outras lojas', () => {
  const e = estimarArtigo('queijo flamengo', 'Lidl', { indice, hoje });
  assert.equal(e.fonte, 'outras');
  assert.deepEqual(e.ref, ['Pingo Doce']);
  assert.equal(e.preco, 2.69);
  const leite = estimarArtigo('2x leite', 'Lidl', { indice, hoje });
  assert.equal(leite.unitario, 0.92); // média de 0,95 e 0,89
  assert.equal(leite.preco, 1.84);
});

test('ao peso conta o que se costuma levar', () => {
  assert.equal(estimarArtigo('bananas', 'Pingo Doce', { indice, hoje }).preco, 1.43);
});

test('a promoção do folheto ganha ao preço pago', () => {
  const promos = [{ loja: 'Lidl', produto: 'Queijo flamengo fatiado 200 g', preco: 1.79, inicio: '2026-11-03', fim: '2026-11-09' }];
  const e = estimarArtigo('queijo flamengo', 'Lidl', { indice, promos, hoje });
  assert.equal(e.fonte, 'promo');
  assert.equal(e.preco, 1.79);
  // Fora das datas não conta
  assert.equal(estimarArtigo('queijo flamengo', 'Lidl', { indice, promos, hoje: '2026-11-10' }).fonte, 'outras');
  // Avisa noutra loja quando a promoção é mais barata
  const pd = estimarArtigo('queijo flamengo', 'Pingo Doce', { indice, promos, hoje });
  assert.equal(melhorNoutraLoja('queijo flamengo', 'Pingo Doce', pd, { promos, hoje }).loja, 'Lidl');
});

test('total por loja ignora os artigos que já tem e conta os sem preço', () => {
  const itens = [
    { id: 'a', texto: 'queijo flamengo' }, { id: 'b', texto: '2x leite' }, { id: 'c', texto: 'xpto' }, { id: 'd', texto: 'bananas', feita: true },
  ];
  const r = estimarLoja(itens, 'Lidl', { indice, hoje });
  assert.equal(r.total, 4.53);
  assert.equal(r.comPreco, 2);
  assert.equal(r.aproximados, 2);
  assert.equal(r.semPreco, 1);
});

test('normaliza as promoções lidas pela IA', () => {
  const r = normalizarPromos({
    loja: 'Lidl', inicio: '2026-11-03', fim: '2026-11-09',
    promocoes: [
      { produto: 'Queijo flamengo 200 g', preco: '1,79', precoAntes: 2.49, desconto: '-28%' },
      { produto: 'Queijo flamengo 200 g', preco: 1.79 },
      { produto: 'Sem preço' },
      { produto: 'Iogurte', preco: 0.5, precoAntes: 0.4, fim: '2026-11-04' },
    ],
  });
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { loja: 'Lidl', produto: 'Queijo flamengo 200 g', preco: 1.79, precoAntes: 2.49, desconto: '-28%', condicao: '', inicio: '2026-11-03', fim: '2026-11-09' });
  assert.equal(r[1].precoAntes, 0);
  assert.equal(r[1].fim, '2026-11-04');
  assert.ok(promoAtiva(r[1], '2026-11-04'));
  assert.ok(!promoAtiva(r[1], '2026-11-05'));
});

test('semana ISO', () => {
  assert.equal(semanaIso(new Date(2026, 10, 3)), '2026-W45');
  assert.equal(semanaIso(new Date(2027, 0, 1)), '2026-W53');
});

test('promoção ao peso conta com o que costumam levar', () => {
  const promos = [{ loja: 'Pingo Doce', produto: 'Banana da Madeira (kg)', preco: 0.99, inicio: '2026-11-03', fim: '2026-11-09' }];
  const e = estimarArtigo('bananas', 'Pingo Doce', { indice, promos, hoje });
  assert.equal(e.fonte, 'promo');
  assert.equal(e.preco, 1.19); // 1,2 kg × 0,99
});
