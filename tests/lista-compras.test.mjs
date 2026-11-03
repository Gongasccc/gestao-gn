import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adivinharSeccao, agruparLista, chaveArtigo, ordemDaLoja, ORDEM_PADRAO, listaLojas, marcaLoja,
} from '../js/modules/shopping/seccoes.js';

test('adivinha a secção pelo nome do artigo', () => {
  const casos = {
    '2 pacotes de leite': 'laticinios', 'Leite de coco': 'mercearia', bananas: 'frescos', Pães: 'padaria',
    'ervilhas congeladas': 'congelados', 'Sardinhas em lata': 'mercearia', sardinhas: 'talho',
    'papel higiénico': 'higiene', 'Papel de cozinha': 'limpeza', 'Bebida de aveia': 'laticinios',
    cereais: 'pequeno', 'batata doce': 'frescos', queijo: 'charcutaria', fraldas: 'bebe', 'ração gato': 'animais',
    '6 ovos': 'laticinios', pizza: 'congelados', limões: 'frescos',
  };
  for (const [t, s] of Object.entries(casos)) assert.equal(adivinharSeccao(t), s, t);
  assert.equal(adivinharSeccao('xpto'), '');
});

test('chave do artigo ignora quantidades, acentos e plurais', () => {
  assert.equal(chaveArtigo('2x Limões'), chaveArtigo('limao'));
});

test('ordem da loja completa a personalizada com as secções em falta', () => {
  const o = ordemDaLoja(['congelados', 'frescos', 'inexistente']);
  assert.deepEqual(o.slice(0, 2), ['congelados', 'frescos']);
  assert.equal(o.length, ORDEM_PADRAO.length);
});

test('agrupa por supermercado e por corredor, sem loja primeiro', () => {
  const itens = [
    { id: 1, texto: 'gelado', loja: 'Lidl', timestamp: 1 },
    { id: 2, texto: 'bananas', loja: 'Lidl', timestamp: 2 },
    { id: 3, texto: 'leite', timestamp: 3 },
    { id: 4, texto: 'detergente', timestamp: 4 },
    { id: 5, texto: 'pão', loja: 'Continente', feita: true, timestamp: 5 },
    { id: 6, texto: 'iogurtes', loja: 'Lidl', seccao: 'outros', timestamp: 6 },
  ];
  const { grupos, feitos } = agruparLista(itens, { memoria: { detergente: { loja: 'Continente' } }, ordens: { lidl: ['congelados'] } });
  assert.deepEqual(grupos.map((g) => g.loja), ['', 'Lidl', 'Continente']);
  assert.deepEqual(grupos[1].seccoes.map((s) => s.id), ['congelados', 'frescos', 'outros']);
  // Os artigos marcados ("já tenho") ficam no seu corredor: a lista semanal é fixa.
  assert.deepEqual(grupos[2].seccoes.map((s) => s.itens[0].texto), ['pão', 'detergente']);
  assert.equal(grupos[2].total, 1);
  assert.equal(grupos[2].comprados, 1);
  assert.equal(feitos.length, 1);
});

test('lista de lojas sem repetidos e cores da marca', () => {
  assert.deepEqual(listaLojas(['Continente', 'Lidl'], ['continente', 'Supermercado', 'Mercado X']), ['Continente', 'Lidl', 'Mercado X']);
  assert.equal(marcaLoja('Pingo Doce').sigla, 'PD');
  assert.ok(marcaLoja('Loja da esquina').cor.startsWith('#'));
});
