import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIAS, SUPERSAVE, classificar, subcategoriaDe, rotulo, subPorNome, idAtual, listaParaIa,
} from '../js/data/categorias.js';
import { CATEGORIAS as CAT_FATURAS } from '../js/modules/faturas/stats.js';
import { SECCOES, ordemDaLoja, agruparLista } from '../js/modules/shopping/seccoes.js';
import { categoriaPorNome } from '../js/modules/faturas/texto.js';

test('as 15 categorias do SuperSave com o número de subcategorias do site', () => {
  const contagem = Object.fromEntries(SUPERSAVE.map((c) => [c.nome, c.subs.length]));
  assert.deepEqual(contagem, {
    Frescos: 7, 'Laticínios e Ovos': 8, Congelados: 12, Mercearia: 11, 'Bebidas e Garrafeira': 7, 'Bio e Saudável': 6,
    Limpeza: 12, 'Beleza e Higiene': 12, Bebé: 10, Animais: 3, 'Casa, Bricolage e Jardim': 12, 'Brinquedos e Jogos': 12,
    Papelaria: 9, 'Desporto, Roupa e Viagem': 7, Livros: 0,
  });
});

test('lista de compras e faturas usam as mesmas categorias', () => {
  assert.deepEqual(Object.keys(CAT_FATURAS).sort(), CATEGORIAS.map((c) => c.id).sort());
  assert.deepEqual(SECCOES.map((s) => s.id).sort(), CATEGORIAS.map((c) => c.id).sort());
});

test('classifica categoria e subcategoria pelo nome', () => {
  assert.deepEqual(classificar('2 pacotes de leite'), { cat: 'laticinios', sub: 'laticinios:leite' });
  assert.deepEqual(classificar('Sardinhas em lata'), { cat: 'mercearia', sub: 'mercearia:conservas' });
  assert.equal(classificar('Fita cola').cat, 'casa');
  assert.equal(classificar('Lápis de cor').sub, 'papelaria:pintura-e-desenho');
  assert.equal(classificar('xpto').cat, '');
  assert.equal(subcategoriaDe('Iogurte grego natural', 'laticinios'), 'laticinios:iogurtes');
  assert.equal(subcategoriaDe('Pão de forma', 'padaria'), 'padaria:padaria-e-pastelaria');
});

test('rótulos, nomes da IA e ids antigos', () => {
  assert.equal(rotulo('mercearia', 'mercearia:arroz-e-massa'), 'Mercearia › Arroz e massa');
  assert.equal(rotulo('mercearia', 'limpeza:loica'), 'Mercearia');
  assert.equal(subPorNome('bebidas', 'Águas'), 'bebidas:aguas');
  assert.equal(subPorNome('bebidas', 'Inexistente'), '');
  assert.equal(idAtual('pequeno'), 'mercearia');
  assert.ok(listaParaIa().includes('limpeza (Limpeza): Detergente para roupa'));
});

test('dados antigos com a secção "pequeno" passam para a mercearia', () => {
  const o = ordemDaLoja(['congelados', 'pequeno', 'mercearia']);
  assert.deepEqual(o.slice(0, 2), ['congelados', 'mercearia']);
  const { grupos } = agruparLista([{ id: 1, texto: 'granola', seccao: 'pequeno', timestamp: 1 }]);
  assert.equal(grupos[0].seccoes[0].id, 'mercearia');
  assert.equal(grupos[0].seccoes[0].itens[0].sub, 'mercearia:pequeno-almoco-e-cereais');
});

test('faturas: nomes sem palavra de talão vão para as novas categorias', () => {
  assert.equal(categoriaPorNome('CADERNO A4 PAUTADO'), 'papelaria');
  assert.equal(categoriaPorNome('IOGURTE GREGO'), 'laticinios');
});
