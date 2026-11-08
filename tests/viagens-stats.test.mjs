import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelStats, planWithDates, nightsSummary, tripPhase, addDaysISO } from '../js/modules/trips/stats.js';
import { country, countryByNumeric, searchCountries, worldPercent, continentOf } from '../js/modules/trips/countries.js';

const SETUBAL = { nome: 'Setúbal', pais: 'Portugal', paisCode: 'pt', lat: 38.52, lng: -8.89 };
const EVORA = { nome: 'Évora', pais: 'Portugal', paisCode: 'pt', lat: 38.57, lng: -7.91 };
const COMO = { nome: 'Como', pais: 'Itália', paisCode: 'it', lat: 45.81, lng: 9.08 };

test('países: códigos, nomes e continentes', () => {
  assert.equal(country('PT').nome, 'Portugal');
  assert.equal(countryByNumeric(620).code, 'pt');
  assert.equal(continentOf('br'), 4);
  assert.equal(continentOf('us'), 3);
  assert.equal(searchCountries('ital')[0].code, 'it');
  assert.equal(searchCountries('espanha')[0].code, 'es');
  assert.equal(worldPercent(0), 0);
  assert.equal(worldPercent(2), 1);
  assert.equal(worldPercent(39), 20);
});

test('plano: datas por noites e resumo das noites', () => {
  const trip = { dataInicio: '2026-02-20', dataFim: '2026-02-24' };
  const plan = planWithDates(trip, [{ id: 'b', ordem: 2, noites: 1 }, { id: 'a', ordem: 1, noites: 2 }]);
  assert.deepEqual(plan.map((d) => [d.id, d.inicio, d.fim]), [['a', '2026-02-20', '2026-02-22'], ['b', '2026-02-22', '2026-02-23']]);
  assert.deepEqual(nightsSummary(trip, plan), { total: 4, planeadas: 3 });
  assert.equal(addDaysISO('2026-02-28', 1), '2026-03-01');
  assert.equal(tripPhase(trip, '2026-02-21'), 'a-decorrer');
  assert.equal(tripPhase(trip, '2026-03-01'), 'passada');
  assert.equal(tripPhase(trip, '2026-01-01'), 'futura');
});

test('estatísticas: países, lugar mais longe, tempo e dias sem viajar', () => {
  const trips = [
    { id: 't1', dataInicio: '2026-02-20', dataFim: '2026-02-21' },
    { id: 't2', dataInicio: '2026-03-01', dataFim: '2026-03-03' },
    { id: 't3', dataInicio: '2026-12-01', dataFim: '2026-12-05' },
  ];
  const s = travelStats({
    trips,
    stepsByTrip: { t2: [{ id: 's1', data: '2026-03-01', lugar: COMO, fotos: ['a', 'b'] }] },
    planByTrip: { t1: [{ id: 'd1', ordem: 1, noites: 1, lugar: EVORA }], t3: [{ id: 'd2', ordem: 1, noites: 2, lugar: { ...COMO, paisCode: 'ch' } }] },
    extraCountries: ['es'],
    home: SETUBAL,
    today: '2026-11-08',
  });
  assert.deepEqual(s.countries.map((c) => c.code).sort(), ['es', 'it', 'pt']);
  assert.deepEqual([...s.continents], [0]);
  assert.equal(s.trips, 2);
  assert.equal(s.steps, 1);
  assert.equal(s.photos, 2);
  assert.equal(s.time.days, 5);
  assert.equal(s.farthest.place.nome, 'Como');
  assert.ok(s.farthest.km > 1600 && s.farthest.km < 1800, String(s.farthest.km));
  assert.ok(s.km > 3300, String(s.km));
  assert.equal(s.daysSinceTravel, 250);
  assert.equal(s.next.id, 't3');
  assert.equal(s.daysUntilNext, 23);
});

test('estatísticas: viagem a decorrer conta o tempo até agora', () => {
  const now = new Date('2026-11-08T06:00:00').getTime();
  const s = travelStats({ trips: [{ id: 'x', dataInicio: '2026-11-07', dataFim: '2026-11-10' }], today: '2026-11-08', now });
  assert.equal(s.ongoing.id, 'x');
  assert.equal(s.daysSinceTravel, 0);
  assert.deepEqual([s.time.days, s.time.hours], [1, 6]);
});
