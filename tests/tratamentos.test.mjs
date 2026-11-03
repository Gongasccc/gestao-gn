import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularHoras, tomasDoDia, fimPlano, ultimoDiaTomas, progresso, consumoDiario, estadoToma, textoFrequencia, textoDuracao,
} from '../js/modules/farmacia/plano.js';

test('horas calculadas a partir da primeira toma', () => {
  assert.deepEqual(calcularHoras({ modo: 'vezes', vezesDia: 3, primeiraHora: '08:00' }), ['00:00', '08:00', '16:00']);
  assert.deepEqual(calcularHoras({ modo: 'vezes', vezesDia: 2, primeiraHora: '09:30' }), ['09:30', '21:30']);
  assert.deepEqual(calcularHoras({ modo: 'intervalo', intervaloHoras: 6, primeiraHora: '07:00' }), ['01:00', '07:00', '13:00', '19:00']);
  assert.deepEqual(calcularHoras({ modo: 'vezes', vezesDia: 1, primeiraHora: '22:00' }), ['22:00']);
});

test('duração e fim do plano', () => {
  assert.equal(fimPlano({ inicio: '2026-11-03', dias: 7 }), '2026-11-09');
  assert.equal(fimPlano({ inicio: '2026-11-03', dias: null }), null);
  assert.equal(textoDuracao({ inicio: '2026-11-03', dias: 7 }), '7 dias, até 09/11');
});

test('o primeiro dia começa na primeira toma e o que falta passa para o dia a seguir ao fim', () => {
  const p = { id: 'p1', medNome: 'Amoxicilina', quem: 'u1', dose: 1, modo: 'vezes', vezesDia: 3, primeiraHora: '16:00', horas: ['00:00', '08:00', '16:00'], inicio: '2026-11-03', dias: 2, feitas: [] };
  const dias = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => tomasDoDia([p], d).map((t) => t.hora));
  assert.deepEqual(dias, [['16:00'], ['00:00', '08:00', '16:00'], ['00:00', '08:00'], []]);
  assert.equal(dias.flat().length, 6); // 2 dias × 3 tomas
  assert.equal(ultimoDiaTomas(p), '2026-11-05');
  assert.equal(progresso(p, '2026-11-05').terminou, false);
  assert.equal(progresso(p, '2026-11-06').terminou, true);
});

test('os dois tomam: uma toma por pessoa, marcadas em separado', () => {
  const p = { id: 'p2', quem: 'ambos', dose: 1, horas: ['08:00'], primeiraHora: '08:00', inicio: '2026-11-03', dias: 5 };
  const t = tomasDoDia([{ ...p, feitas: [] }], '2026-11-04', ['a', 'b']);
  assert.equal(t.length, 2);
  assert.notEqual(t[0].chave, t[1].chave);
  const feita = tomasDoDia([{ ...p, feitas: [t[0].chave] }], '2026-11-04', ['a', 'b']);
  assert.deepEqual(feita.map((x) => x.feita), [true, false]);
  assert.equal(progresso({ ...p, feitas: [t[0].chave] }, '2026-11-04', ['a', 'b']).total, 10);
  assert.equal(consumoDiario([p], '2026-11-04', ['a', 'b']), 2);
});

test('estado e texto das tomas', () => {
  const toma = { dia: '2026-11-03', hora: '08:00', feita: false };
  assert.equal(estadoToma(toma, new Date(2026, 10, 3, 7, 0)), 'mais-tarde');
  assert.equal(estadoToma(toma, new Date(2026, 10, 3, 8, 10)), 'agora');
  assert.equal(estadoToma(toma, new Date(2026, 10, 3, 9, 0)), 'atrasada');
  assert.equal(textoFrequencia({ modo: 'intervalo', intervaloHoras: 12, horas: ['20:00', '08:00'] }), 'De 12 em 12 horas (08:00 · 20:00)');
});
