import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumoMes, mudarMes, mediaMensal, consumoMedio } from '../js/modules/garagem/gastos.js';

const G = [
  { carroId: 'a', categoria: 'combustivel', valor: 60, data: '2026-11-02', km: 10000, litros: 40 },
  { carroId: 'a', categoria: 'combustivel', valor: 55.5, data: '2026-11-20', km: 10600, litros: 36 },
  { carroId: 'b', categoria: 'seguro', valor: 200, data: '2026-11-05' },
  { carroId: 'b', categoria: 'portagens', valor: 10, data: '2026-10-05' },
  { carroId: 'a', valor: 4.5, data: '2026-11-07' },
];

test('mudar de mês atravessa anos', () => {
  assert.equal(mudarMes('2026-01', -1), '2025-12');
  assert.equal(mudarMes('2026-12', 1), '2027-01');
});

test('resumo do mês: total, por carro e por categoria', () => {
  const r = resumoMes(G, '2026-11');
  assert.equal(r.total, 320);
  assert.equal(r.count, 4);
  assert.equal(r.totalAnterior, 10);
  assert.deepEqual(r.porCarro, [{ id: 'b', total: 200 }, { id: 'a', total: 120 }]);
  assert.deepEqual(r.porCategoria.map((c) => c.id), ['seguro', 'combustivel', 'outros']);
});

test('resumo de um só carro', () => {
  const r = resumoMes(G, '2026-11', 'a');
  assert.equal(r.total, 120);
  assert.equal(r.totalAnterior, 0);
});

test('média mensal só conta meses desde o primeiro gasto', () => {
  assert.equal(mediaMensal(G, '2026-12'), 165); // (10 + 320) / 2
  assert.equal(mediaMensal([], '2026-12'), 0);
});

test('consumo médio em L/100 km', () => {
  assert.equal(consumoMedio(G, 'a'), 6);
  assert.equal(consumoMedio(G, 'b'), null);
});
