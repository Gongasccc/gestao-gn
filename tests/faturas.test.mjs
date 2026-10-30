import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chaveProduto, evolucaoMensal, resumoMes, porLoja, porCategoria, compararPrecos, duplicada, deslocarMes, precoUnitario,
} from '../js/modules/faturas/stats.js';

const faturas = [
  { loja: 'Continente', data: '2026-09-10', total: 40, poupanca: 2, itens: [
    { nome: 'LEITE MG 1L', produto: 'Leite meio-gordo 1 L', quantidade: 6, precoUnitario: 0.85, total: 5.1, categoria: 'laticinios' },
    { nome: 'BANANA', produto: 'Banana', quantidade: 1.2, unidade: 'kg', precoUnitario: 1.29, total: 1.55, categoria: 'frescos' },
  ] },
  { loja: 'Pingo Doce', data: '2026-10-02', total: 25.5, poupanca: 1.5, itens: [
    { produto: 'Leite meio-gordo 1 L', quantidade: 6, precoUnitario: 0.79, total: 4.74, categoria: 'laticinios' },
  ] },
  { loja: 'Continente', data: '2026-10-20', total: 34.5, poupanca: 0, itens: [
    { produto: 'Leite Meio-Gordo 1 L', quantidade: 2, total: 1.8, categoria: 'laticinios' },
    { produto: 'Detergente', quantidade: 1, total: 4.99, categoria: 'xpto' },
  ] },
];

test('chaveProduto ignora acentos, maiúsculas e pontuação', () => {
  assert.equal(chaveProduto('Leite Meio-Gordo 1,5 L'), 'leite meio gordo 1.5 l');
  assert.equal(chaveProduto('Pão de Forma'), 'pao de forma');
});

test('deslocarMes atravessa anos', () => {
  assert.equal(deslocarMes('2026-01', -1), '2025-12');
  assert.equal(deslocarMes('2026-12', 1), '2027-01');
});

test('resumoMes calcula total, média, poupança e variação', () => {
  const r = resumoMes(faturas, '2026-10');
  assert.equal(r.total, 60);
  assert.equal(r.compras, 2);
  assert.equal(r.media, 30);
  assert.equal(r.poupanca, 1.5);
  assert.equal(r.anterior, 40);
  assert.equal(r.variacao, 50);
  assert.equal(resumoMes(faturas, '2026-09').variacao, null);
});

test('evolucaoMensal devolve n meses por ordem', () => {
  const ev = evolucaoMensal(faturas, '2026-10', 3);
  assert.deepEqual(ev.map((m) => m.ym), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(ev.map((m) => m.total), [0, 40, 60]);
});

test('porLoja e porCategoria agrupam e ordenam', () => {
  assert.deepEqual(porLoja(faturas)[0], { loja: 'Continente', total: 74.5, compras: 2 });
  const cats = porCategoria(faturas);
  assert.equal(cats[0].categoria, 'laticinios');
  assert.ok(cats.some((c) => c.categoria === 'outros'), 'categoria desconhecida cai em outros');
});

test('precoUnitario usa total/quantidade quando falta o preço unitário', () => {
  assert.equal(precoUnitario({ quantidade: 2, total: 1.8 }), 0.9);
});

test('compararPrecos encontra a loja mais barata e o histórico', () => {
  const leite = compararPrecos(faturas).find((p) => p.chave === 'leite meio gordo 1 l');
  assert.equal(leite.vezes, 3);
  assert.equal(leite.maisBarata.loja, 'Pingo Doce');
  assert.equal(leite.maisBarata.preco, 0.79);
  assert.equal(leite.lojas.find((l) => l.loja === 'Continente').preco, 0.9, 'usa o último preço de cada loja');
  assert.equal(leite.diferenca, 0.11);
  assert.equal(leite.tendencia, 0.05);
});

test('duplicada deteta a mesma fatura', () => {
  assert.ok(duplicada(faturas, { loja: 'continente', data: '2026-10-20', total: 34.5 }));
  assert.equal(duplicada(faturas, { loja: 'Lidl', data: '2026-10-20', total: 34.5 }), null);
});
