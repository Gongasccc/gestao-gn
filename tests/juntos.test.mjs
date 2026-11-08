import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resultado, votar, proximaData, diasAte, idadeQueFaz, proximosEventos, textoFaltam,
  vezDe, concluirRotina, estadoRotina, ranking, estadoDespensa, juntarFatura, pontuar,
} from '../js/modules/juntos/logica.js';

test('votação: tocar escolhe, tocar outra vez tira, e conta percentagens', () => {
  let v = { opcoes: ['Pizza', 'Sushi'], votos: {} };
  v.votos = votar(v, 'a', 0);
  v.votos = votar(v, 'b', 1);
  v.votos = votar(v, 'c', 1);
  const r = resultado(v);
  assert.deepEqual(r.map((x) => x.votos), [1, 2]);
  assert.equal(r[1].pct, 67);
  assert.equal(r[1].vence, true);
  v.votos = votar(v, 'c', 1);
  assert.equal(v.votos.c, undefined);
});

test('votação com várias escolhas guarda uma lista', () => {
  const v = { opcoes: ['A', 'B', 'C'], multipla: true, votos: {} };
  v.votos = votar(v, 'a', 2);
  v.votos = votar(v, 'a', 0);
  assert.deepEqual(v.votos.a, [0, 2]);
  assert.deepEqual(resultado(v).map((x) => x.votos), [1, 0, 1]);
});

test('aniversários repetem todos os anos e 29/02 passa a 28', () => {
  const hoje = new Date(2026, 10, 8);
  assert.equal(proximaData({ data: '1990-12-25', anual: true }, hoje), '2026-12-25');
  assert.equal(proximaData({ data: '1990-03-01', anual: true }, hoje), '2027-03-01');
  assert.equal(proximaData({ data: '2000-02-29', anual: true }, hoje), '2027-02-28');
  assert.equal(proximaData({ data: '2026-11-01' }, hoje), null);
  assert.equal(idadeQueFaz({ data: '1990-12-25', anual: true, tipo: 'aniversario' }, hoje), 36);
  assert.equal(diasAte('2026-11-09', hoje), 1);
  assert.equal(textoFaltam(0), 'Hoje');
});

test('próximos eventos vêm por ordem e sem os que passaram', () => {
  const hoje = new Date(2026, 10, 8);
  const r = proximosEventos([
    { titulo: 'Jantar', data: '2026-11-20' },
    { titulo: 'Passado', data: '2026-01-01' },
    { titulo: 'Mãe', data: '1960-11-10', anual: true },
  ], hoje);
  assert.deepEqual(r.map((e) => e.titulo), ['Mãe', 'Jantar']);
});

test('rotina passa para a pessoa seguinte e dá pontos a quem fez', () => {
  const rotina = { pessoas: [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bruno' }, { id: 'c', nome: 'Carla' }], vez: 2, frequencia: 'semanal', valor: 2 };
  assert.equal(vezDe(rotina).nome, 'Carla');
  const r = concluirRotina(rotina, 'c', new Date(2026, 10, 8));
  assert.equal(r.vez, 0);
  assert.equal(r.proxima, '2026-11-15');
  assert.equal(r.pontos.c, 2);
  // Troca de turno: a Ana fez em vez da Carla, a seguir é o Bruno.
  assert.equal(concluirRotina(rotina, 'a').vez, 1);
  assert.equal(estadoRotina({ proxima: '2026-11-07' }, new Date(2026, 10, 8)), 'atrasada');
  const rk = ranking([{ ...rotina, pontos: { a: 1, c: 4 } }, { pessoas: [{ id: 'a', nome: 'Ana' }], pontos: { a: 5 } }]);
  assert.deepEqual(rk.map((x) => [x.nome, x.pontos]), [['Ana', 6], ['Carla', 4], ['Bruno', 0]]);
});

test('despensa: estados e juntar produtos de uma fatura', () => {
  assert.equal(estadoDespensa({ quantidade: 0 }), 'acabou');
  assert.equal(estadoDespensa({ quantidade: 1, minimo: 2 }), 'pouco');
  assert.equal(estadoDespensa({ quantidade: 3, minimo: 2 }), 'ok');
  const { atualizar, novos } = juntarFatura(
    [{ id: 'x', nome: 'Leite Mimosa', quantidade: 1 }],
    [{ produto: 'leite mimosa', quantidade: 6 }, { produto: 'Arroz', quantidade: 1 }, { produto: 'Arroz' }],
  );
  assert.deepEqual(atualizar, [{ id: 'x', quantidade: 7 }]);
  assert.deepEqual(novos, [{ nome: 'Arroz', quantidade: 2 }]);
});

test('pesquisa exige todas as palavras e ignora acentos', () => {
  assert.ok(pontuar('Arroz de pato', 'pato arroz') > 0);
  assert.equal(pontuar('Arroz de pato', 'frango'), 0);
  assert.ok(pontuar('Paracetamol', 'paracetamol') > pontuar('Ben-u-ron paracetamol', 'paracetamol'));
  assert.ok(pontuar('Água Luso', 'agua') > 0);
});
