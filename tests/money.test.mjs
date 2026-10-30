import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balances, settlement, totalsByCategory } from '../js/core/money.js';

const M = ['a', 'b'];

test('despesas a meias', () => {
  const bal = balances([{ valor: 60, pagoPor: 'a' }], M);
  assert.deepEqual(bal, { a: 30, b: -30 });
  assert.deepEqual(settlement(bal), { from: 'b', to: 'a', valor: 30 });
});

test('despesa pessoal não cria dívida', () => {
  assert.deepEqual(balances([{ valor: 40, pagoPor: 'a', divisao: 'pagador' }], M), { a: 0, b: 0 });
});

test('adiantamento: o outro deve tudo', () => {
  assert.deepEqual(balances([{ valor: 25, pagoPor: 'a', divisao: 'outro' }], M), { a: 25, b: -25 });
});

test('acerto de contas anula a dívida', () => {
  const ex = [{ valor: 60, pagoPor: 'a' }, { valor: 30, pagoPor: 'b', divisao: 'outro', tipo: 'acerto' }];
  assert.equal(settlement(balances(ex, M)), null);
});

test('totais por categoria ignoram acertos e outros meses', () => {
  const ex = [
    { valor: 10, categoria: 'casa', data: '2026-10-02' },
    { valor: 5, categoria: 'casa', data: '2026-09-02' },
    { valor: 99, tipo: 'acerto', data: '2026-10-03' },
  ];
  assert.deepEqual(totalsByCategory(ex, '2026-10'), { casa: 10 });
});
