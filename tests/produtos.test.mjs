import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandirNome, lerEmbalagem, chaveTalao, aplicarDicionario, aprenderFatura, procurarAlias, exemplosParaIa,
  precoPorUnidade, agruparRepetidos,
} from '../js/modules/faturas/produtos.js';
import { analisarTexto } from '../js/modules/faturas/texto.js';
import { compararPrecos } from '../js/modules/faturas/stats.js';

test('expandirNome decifra abreviaturas dos talões', () => {
  assert.equal(expandirNome('LEITE UHT M/G MIM 1L'), 'Leite UHT meio-gordo Mimosa 1 L');
  assert.equal(expandirNome('IOG NAT CONT 4X125G'), 'Iogurte natural Continente 4 × 125 g');
  assert.equal(expandirNome('AG MIN LUSO 6X1,5L'), 'Água mineral Luso 6 × 1,5 L');
  assert.equal(expandirNome('(C) DET ROUP SKIP LIQ 40D'), 'Detergente roupa Skip líquido 40 doses');
});

test('lerEmbalagem dá o total da embalagem em kg, L ou un', () => {
  assert.deepEqual(lerEmbalagem('AG MIN LUSO 6X1,5L').qtd, 9);
  assert.equal(lerEmbalagem('Iogurte natural 4 × 125 g').qtd, 0.5);
  assert.equal(lerEmbalagem('Cerveja 33CL').qtd, 0.33);
  assert.equal(lerEmbalagem('Ovos 12 un').unidade, 'un');
  assert.equal(lerEmbalagem('Banana'), null);
});

test('precoPorUnidade compara €/L', () => {
  assert.deepEqual(precoPorUnidade({ produto: 'Água 6 × 1,5 L', precoUnitario: 2.7, quantidade: 1 }), { valor: 0.3, unidade: 'L' });
  assert.equal(precoPorUnidade({ produto: 'Banana', unidade: 'kg', precoUnitario: 1.2 }), null);
});

test('o dicionário aprende com as faturas guardadas e as correções ganham', () => {
  const fatura = { loja: 'Continente', itens: [
    { nome: 'LT MG MIM 1L', produto: 'Leite meio-gordo Mimosa 1 L', categoria: 'laticinios' },
    { nome: 'XPTO 22', produto: 'Coisa', categoria: 'outros' },
  ] };
  let dic = aprenderFatura(fatura, {}, new Set([0]), 1);
  assert.equal(dic[`continente:${chaveTalao('LT MG MIM 1L')}`].c, true);
  assert.equal(dic[`*:${chaveTalao('XPTO 22')}`].produto, 'Coisa');
  // Uma leitura automática não substitui uma correção confirmada.
  const outra = { loja: 'Continente', itens: [{ nome: 'LT MG MIM 1L', produto: 'Lata mg', categoria: 'outros' }] };
  const novas = aprenderFatura(outra, dic, new Set(), 2);
  assert.equal(novas[`continente:${chaveTalao('LT MG MIM 1L')}`], undefined);
  dic = { ...dic, ...novas };
  // Noutra loja, a mesma linha usa o nome global.
  assert.equal(procurarAlias(dic, 'Pingo Doce', 'LT MG MIM 1L').produto, 'Leite meio-gordo Mimosa 1 L');
  const [i] = aplicarDicionario([{ nome: 'LT  MG MIM 1L', produto: 'outro nome da IA', categoria: 'outros' }], dic, 'Continente');
  assert.equal(i.produto, 'Leite meio-gordo Mimosa 1 L');
  assert.equal(i.categoria, 'laticinios');
  assert.equal(i.aprendido, true);
  assert.ok(exemplosParaIa(dic, 'Continente')[0].includes('=> Leite meio-gordo Mimosa 1 L'));
});

test('quantidades: linhas repetidas, "2 X 0,89" no meio e formato Lidl', () => {
  const f = analisarTexto(`LIDL
IOGURTE GREGO 0,99
IOGURTE GREGO 0,99
LEITE MEIO GORDO 0,79 X 3 2,37 A
AGUA 2 X 0,45 0,90
AG MIN LUSO 6X1,5L 2,49
TOTAL 7,74`);
  assert.deepEqual(f.itens.map((i) => [i.nome, i.quantidade, i.precoUnitario, i.total]), [
    ['IOGURTE GREGO', 2, 0.99, 1.98],
    ['LEITE MEIO GORDO', 3, 0.79, 2.37],
    ['AGUA', 2, 0.45, 0.9],
    ['AG MIN LUSO 6X1,5L', 1, 2.49, 2.49],
  ]);
  assert.equal(agruparRepetidos([{ nome: 'A', unidade: 'un', quantidade: 1, precoUnitario: 1, total: 1, desconto: 0 }, { nome: 'A', unidade: 'un', quantidade: 1, precoUnitario: 1.2, total: 1.2, desconto: 0 }]).length, 2);
});

test('compararPrecos mostra o preço por litro', () => {
  const [p] = compararPrecos([{ loja: 'Lidl', data: '2026-11-01', itens: [{ produto: 'Água mineral 6 × 1,5 L', quantidade: 1, precoUnitario: 1.8, total: 1.8 }] }]);
  assert.equal(p.porUnidade, 'L');
  assert.equal(p.lojas[0].porUnidade, 0.2);
});

test('corresponde procura por palavras sem acentos', async () => {
  const { corresponde } = await import('../js/modules/faturas/produtos.js');
  assert.equal(corresponde('Leite UHT meio-gordo Mimosa 1 L', 'leite meio-gordo'), true);
  assert.equal(corresponde('Pão de forma', 'pao'), true);
  assert.equal(corresponde('Banana', 'leite'), false);
});
