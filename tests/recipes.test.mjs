import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIngredient, parseIngredients, quantityText, shoppingText, parseSteps, formatDuration, formatNumber, sourceName,
} from '../js/modules/recipes/parse.js';
import { recipeFromHtml, recipeFromText } from '../js/modules/recipes/importer.js';

test('lê quantidade, unidade e nome', () => {
  assert.deepEqual(
    (({ qty, unit, name }) => ({ qty, unit, name }))(parseIngredient('125 g de manteiga')),
    { qty: 125, unit: 'g', name: 'manteiga' },
  );
  const a = parseIngredient('½ c. de sopa manteiga');
  assert.equal(a.qty, 0.5);
  assert.equal(a.unit, 'c. de sopa');
  assert.equal(a.name, 'manteiga');
  assert.equal(parseIngredient('8 unid. claras de ovo').name, 'claras de ovo');
  assert.equal(parseIngredient('2 laranjas').unit, '');
  assert.equal(parseIngredient('2 laranjas').name, 'laranjas');
  assert.equal(parseIngredient('Sal q.b.').qty, null);
  assert.equal(parseIngredient('1 1/2 chávena de leite').qty, 1.5);
  assert.equal(parseIngredient('Para a cobertura:').header, 'Para a cobertura');
});

test('escala quantidades com frações bonitas', () => {
  const ing = parseIngredient('½ c. de chá sal');
  assert.equal(quantityText(ing, 1), '½ c. chá');
  assert.equal(quantityText(ing, 3), '1½ c. chá');
  assert.equal(quantityText(parseIngredient('8 unid. claras de ovo')), '8 un.');
  assert.equal(quantityText(parseIngredient('2-3 dentes de alho'), 2), '4-6 dentes');
  assert.equal(formatNumber(2.4), '2,4');
  assert.equal(formatNumber(1 / 3), '⅓');
  assert.equal(shoppingText(parseIngredient('200 g farinha'), 0.5), 'farinha (100 g)');
  assert.equal(shoppingText(parseIngredient('Sal q.b.')), 'Sal q.b.');
  assert.equal(parseIngredients('a\n\n# Massa\nb').length, 3);
});

test('divide passos e remove numeração', () => {
  const steps = parseSteps('1. Pré-aqueça o forno.\n\nPasso 2: Bata os ovos.\nCobertura:\nDerreta o chocolate.');
  assert.deepEqual(steps, [
    { text: 'Pré-aqueça o forno.' }, { text: 'Bata os ovos.' }, { header: 'Cobertura' }, { text: 'Derreta o chocolate.' },
  ]);
});

test('durações e fontes', () => {
  assert.equal(formatDuration('PT50M'), '50 min');
  assert.equal(formatDuration('PT1H20M'), '1 h 20 min');
  assert.equal(formatDuration('45 min'), '45 min');
  assert.equal(sourceName('https://www.pingodoce.pt/receitas/bolo'), 'pingodoce.pt');
});

test('importa JSON-LD schema.org/Recipe', () => {
  const page = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'WebPage' }, {
      '@type': ['Recipe'],
      name: 'Bolo de claras',
      image: [{ url: 'https://x.pt/bolo.jpg' }],
      prepTime: 'PT50M',
      recipeYield: '10 fatias',
      recipeIngredient: ['8 unid. claras de ovo', '125 g manteiga'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Pré-aqueça o forno a 180 &ordm;C.' },
        { '@type': 'HowToSection', name: 'Massa', itemListElement: [{ '@type': 'HowToStep', text: 'Bata a manteiga.' }] },
      ],
      description: 'O bolo ideal para aproveitar claras &amp; mais.',
      nutrition: { calories: '2810 kcal' },
    }],
  })}</script></head></html>`;
  const r = recipeFromHtml(page, 'https://www.pingodoce.pt/receitas/bolo-de-claras/');
  assert.equal(r.titulo, 'Bolo de claras');
  assert.equal(r.fonteNome, 'pingodoce.pt');
  assert.equal(r.foto, 'https://x.pt/bolo.jpg');
  assert.equal(r.tempoPrep, '50 min');
  assert.equal(r.porcoes, '10');
  assert.equal(r.ingredientes, '8 unid. claras de ovo\n125 g manteiga');
  assert.equal(r.passos.split('\n')[1], 'Massa:');
  assert.equal(r.notas, 'O bolo ideal para aproveitar claras & mais.');
  assert.equal(r.nutricao, 'Calorias: 2810 kcal');
});

test('sem JSON-LD usa og:title e marca como incompleta', () => {
  const r = recipeFromHtml('<meta property="og:title" content="Arroz de pato"><meta property="og:image" content="https://x/y.jpg">', 'https://blog.pt/a');
  assert.equal(r.titulo, 'Arroz de pato');
  assert.equal(r.incompleta, true);
});

test('lê receita colada como texto', () => {
  const r = recipeFromText('Bolo de laranja\n\nIngredientes:\n3 ovos\n200 g açúcar\n\nPreparação\nBata tudo.\nLeve ao forno.');
  assert.equal(r.titulo, 'Bolo de laranja');
  assert.equal(r.ingredientes, '3 ovos\n200 g açúcar');
  assert.equal(r.passos, 'Bata tudo.\nLeve ao forno.');
});
