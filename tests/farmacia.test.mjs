import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasRestantes, estadoStock, textoStock, textoFimStock, chaveNome } from '../js/modules/farmacia/util.js';

test('dias restantes com toma diária', () => {
  assert.equal(diasRestantes({ quantidade: 20, tomaDiaria: 2 }), 10);
  assert.equal(diasRestantes({ quantidade: 20 }), null);
  assert.equal(diasRestantes({ quantidade: 5, tomaDiaria: 0 }), null);
});

test('estado do stock', () => {
  assert.equal(estadoStock({}), 'sem');
  assert.equal(estadoStock({ quantidade: 0 }), 'vazio');
  assert.equal(estadoStock({ quantidade: 4 }), 'baixo');
  assert.equal(estadoStock({ quantidade: 20 }), 'ok');
  assert.equal(estadoStock({ quantidade: 20, tomaDiaria: 3 }), 'baixo');
  assert.equal(estadoStock({ quantidade: 30, tomaDiaria: 1 }), 'ok');
});

test('textos do stock', () => {
  assert.equal(textoStock({ quantidade: 1, unidade: 'comprimidos' }), '1 comprimido');
  assert.equal(textoStock({ quantidade: 12, unidade: 'comprimidos' }), '12 comprimidos');
  assert.equal(textoStock({ quantidade: 0 }), 'Acabou');
  assert.equal(textoFimStock({ quantidade: 6, tomaDiaria: 2 }, new Date(2026, 10, 2)), 'Dá para 3 dias (até 05/11)');
});

test('chave do nome ignora acentos e maiúsculas', () => {
  assert.equal(chaveNome('Ben-u-ron 500'), chaveNome('ben u ron 500'));
  assert.equal(chaveNome('Fenistil Gél'), 'fenistil gel');
});
