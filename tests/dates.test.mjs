import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, nextYearly, nextRecurrence, countdownLabel, expiryState, monthGrid, toISODate } from '../js/core/dates.js';

const today = new Date(2026, 9, 30); // 30 Out 2026

test('daysUntil conta dias inteiros', () => {
  assert.equal(daysUntil(new Date(2026, 10, 29), today), 30);
  assert.equal(daysUntil(new Date(2026, 9, 29), today), -1);
});

test('nextYearly devolve a próxima ocorrência e os anos', () => {
  const r = nextYearly('2020-02-14', today);
  assert.equal(toISODate(r.date), '2027-02-14');
  assert.equal(r.years, 7);
  assert.equal(toISODate(nextYearly('1999-10-30', today).date), '2026-10-30');
});

test('nextRecurrence mensal não perde o dia 31', () => {
  assert.equal(toISODate(nextRecurrence('2026-01-31', 'monthly', today)), '2026-10-31');
  assert.equal(toISODate(nextRecurrence('2026-10-01', 'weekly', today)), '2026-11-05');
});

test('countdownLabel em PT-PT', () => {
  assert.equal(countdownLabel(0), 'Hoje');
  assert.equal(countdownLabel(1), 'Amanhã');
  assert.equal(countdownLabel(5), 'Faltam 5 dias');
});

test('expiryState', () => {
  assert.equal(expiryState('2000-01-01'), 'expired');
  assert.equal(expiryState('2999-01-01'), 'ok');
});

test('monthGrid começa à segunda e tem 6 semanas', () => {
  const g = monthGrid(2026, 9);
  assert.equal(g.length, 42);
  assert.equal(g[0].date.getDay(), 1);
  assert.ok(g.some((c) => c.iso === '2026-10-01' && c.inMonth));
});
