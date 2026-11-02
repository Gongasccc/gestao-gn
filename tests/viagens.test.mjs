import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareOf, netBalances, simplifyDebts, costOf } from '../js/modules/trips/balances.js';
import { haversineKm, routeLegs, countriesOf, flag, placeFromNominatim } from '../js/modules/trips/geo.js';
import { toEur } from '../js/modules/trips/currency.js';

const M = ['a', 'b', 'c'];

test('divisão em partes iguais entre quem participou', () => {
  const e = { valor: 90, pagadorUid: 'a', modoDivisao: 'iguais', divididoPor: ['a', 'b', 'c'] };
  assert.equal(shareOf(e, 'b', M), 30);
  assert.deepEqual(netBalances([e], M), { a: 60, b: -30, c: -30 });
});

test('percentagens e partes', () => {
  const pct = { valor: 200, pagadorUid: 'a', modoDivisao: 'percentagem', percentagens: { a: 50, b: 25, c: 25 } };
  assert.equal(shareOf(pct, 'c', M), 50);
  const partes = { valor: 120, pagadorUid: 'b', modoDivisao: 'partes', partes: { a: 2, b: 1, c: 1 } };
  assert.equal(shareOf(partes, 'a', M), 60);
  assert.equal(shareOf(partes, 'c', M), 30);
});

test('valores exatos', () => {
  const e = { valor: 50, pagadorUid: 'c', modoDivisao: 'exatos', quotasExatas: { a: 20, b: 30 } };
  assert.deepEqual(netBalances([e], M), { a: -20, b: -30, c: 50 });
});

test('simplificar dívidas: poucas transferências e tudo a zero', () => {
  const ex = [
    { valor: 90, pagadorUid: 'a', divididoPor: M },
    { valor: 30, pagadorUid: 'b', divididoPor: M },
  ];
  const net = netBalances(ex, M);
  assert.deepEqual(net, { a: 50, b: -10, c: -40 });
  const t = simplifyDebts(net);
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { from: 'c', to: 'a', valor: 40 });
  assert.deepEqual(t[1], { from: 'b', to: 'a', valor: 10 });
});

test('acerto de contas deixa os saldos a zero', () => {
  const ex = [
    { valor: 60, pagadorUid: 'a', divididoPor: ['a', 'b'] },
    { tipo: 'liquidacao', valor: 30, pagadorUid: 'b', modoDivisao: 'exatos', quotasExatas: { a: 30 }, divididoPor: ['a'] },
  ];
  const net = netBalances(ex, ['a', 'b']);
  assert.deepEqual(net, { a: 0, b: 0 });
  assert.deepEqual(simplifyDebts(net), []);
  assert.deepEqual(costOf(ex, ['a', 'b']), { a: 30, b: 30 });
});

test('dízimas: 10 € a três dá saldos que somam zero', () => {
  const net = netBalances([{ valor: 10, pagadorUid: 'a', divididoPor: M }], M);
  const t = simplifyDebts(net);
  assert.equal(Math.round(t.reduce((s, x) => s + x.valor, 0) * 100), Math.round(net.a * 100));
});

test('distâncias da rota', () => {
  const lisboa = { lat: 38.7223, lng: -9.1393 };
  const porto = { lat: 41.1579, lng: -8.6291 };
  const km = haversineKm(lisboa, porto);
  assert.ok(km > 270 && km < 280, `Lisboa-Porto ${km}`);
  const steps = [
    { id: '2', data: '2026-07-02', lugar: { ...porto, paisCode: 'pt', pais: 'Portugal' } },
    { id: '1', data: '2026-07-01', lugar: { ...lisboa, paisCode: 'pt', pais: 'Portugal' } },
    { id: '3', data: '2026-07-03', lugar: { nome: 'Sem coordenadas' } },
  ];
  const { legs, total } = routeLegs(steps);
  assert.equal(Object.keys(legs).length, 1);
  assert.equal(Math.round(total), Math.round(km));
  assert.deepEqual(countriesOf(steps), [{ code: 'pt', nome: 'Portugal' }]);
});

test('bandeiras, locais e câmbio', () => {
  assert.equal(flag('pt'), '🇵🇹');
  assert.equal(flag(''), '');
  const p = placeFromNominatim({ name: 'Torre de Belém', lat: '38.69', lon: '-9.21', address: { city: 'Lisboa', country: 'Portugal', country_code: 'pt' } });
  assert.deepEqual(p, { nome: 'Torre de Belém', cidade: 'Lisboa', pais: 'Portugal', paisCode: 'pt', lat: 38.69, lng: -9.21 });
  assert.equal(toEur(100, 0.9234), 92.34);
});
