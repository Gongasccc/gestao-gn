import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveNome, catalogoProdutos, harmonizarItens, nomesParaIa } from '../js/modules/faturas/produtos.js';
import { sugestoesCompra } from '../js/modules/faturas/stats.js';

test('chaveNome ignora a ordem das palavras, acentos e "de"', () => {
  assert.equal(chaveNome('Leite UHT meio-gordo Mimosa 1 L'), chaveNome('Leite meio-gordo UHT Mimosa 1 L'));
  assert.equal(chaveNome('Peito de Frango'), chaveNome('peito frango'));
  assert.notEqual(chaveNome('Leite UHT meio-gordo Mimosa 1 L'), chaveNome('Leite UHT magro Mimosa 1 L'));
  assert.notEqual(chaveNome('Água Luso 1,5 L'), chaveNome('Água Luso 0,5 L'));
});

test('harmonizarItens reutiliza o nome e a categoria já usados', () => {
  const faturas = [
    { itens: [{ produto: 'Leite UHT meio-gordo Mimosa 1 L', categoria: 'laticinios' }] },
    { itens: [{ produto: 'Leite UHT meio-gordo Mimosa 1 L', categoria: 'laticinios' }, { produto: 'Banana', categoria: 'outros' }] },
    { itens: [{ produto: 'Banana', categoria: 'frescos', confirmado: true }] },
  ];
  const cat = catalogoProdutos(faturas);
  const [leite, banana, novo, mao] = harmonizarItens([
    { nome: 'LT MG MIM', produto: 'Leite meio-gordo UHT Mimosa 1 L', categoria: 'bebidas' },
    { nome: 'BANANA', produto: 'banana', categoria: 'outros' },
    { nome: 'X', produto: 'Coisa nova', categoria: 'mercearia' },
    { nome: 'BANANA', produto: 'Banana', categoria: 'animais', confirmado: true },
  ], cat);
  assert.equal(leite.produto, 'Leite UHT meio-gordo Mimosa 1 L');
  assert.equal(leite.categoria, 'laticinios');
  assert.equal(banana.produto, 'Banana');
  assert.equal(banana.categoria, 'frescos'); // "outros" nunca ganha a uma categoria real
  assert.equal(novo.produto, 'Coisa nova');
  assert.equal(mao.categoria, 'animais'); // correções à mão ficam
  assert.ok(nomesParaIa(cat).includes('Leite UHT meio-gordo Mimosa 1 L — laticinios'));
});

const compra = (data, itens, loja = 'Lidl') => ({ data, loja, itens });
const leite = (q = 6) => ({ produto: 'Leite UHT meio-gordo 1 L', quantidade: q, precoUnitario: 0.8, total: 0.8 * q, categoria: 'laticinios' });
const azeite = { produto: 'Azeite virgem extra 1 L', quantidade: 1, precoUnitario: 7, total: 7, categoria: 'mercearia' };

test('sugestoesCompra sugere o que costuma acabar', () => {
  const faturas = [
    compra('2026-10-01', [leite(), azeite, { produto: 'Saco plástico', quantidade: 1, total: 0.1 }]),
    compra('2026-10-08', [leite(), { produto: 'Saco plástico', quantidade: 1, total: 0.1 }]),
    compra('2026-10-15', [leite(4)]),
    compra('2026-10-22', [leite(6)]),
    compra('2026-10-24', [azeite]),
  ];
  const hoje = new Date('2026-10-30T10:00:00Z');
  const s = sugestoesCompra(faturas, { hoje });
  assert.deepEqual(s.map((x) => x.nome), ['Leite UHT meio-gordo 1 L']);
  assert.equal(s[0].intervalo, 7);
  assert.equal(s[0].desde, 8);
  assert.equal(s[0].quantidade, 6);
  assert.equal(s[0].estimativa, 4.8);
  // Já está na lista: não sugere.
  assert.equal(sugestoesCompra(faturas, { hoje, naLista: ['leite'] }).length, 0);
  // Há muito tempo que não compra: deixou de comprar, não sugere.
  assert.equal(sugestoesCompra(faturas, { hoje: new Date('2027-01-30') }).length, 0);
});
