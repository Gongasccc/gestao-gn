import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarExtrato, marcarDuplicados, chaveComerciante, categoriaPorPalavras, lerExtrato } from '../js/modules/extrato/ler.js';

const resposta = {
  eExtrato: true,
  banco: 'CGD',
  periodo: { inicio: '2026-10-01', fim: '2026-10-31' },
  movimentos: [
    { data: '2026-10-05', descricao: 'COMPRA CONTINENTE BRAGA', comerciante: 'Continente', valor: '45,30', tipo: 'debito', categoria: 'supermercado' },
    { data: '03/10', descricao: 'PAG NETFLIX.COM', comerciante: 'Netflix', valor: -13.99, tipo: 'debito', categoria: 'xpto' },
    { data: '2026-10-25', descricao: 'TRF SALARIO', comerciante: 'Salário', valor: '1.234,56', tipo: 'credito', categoria: 'outros' },
    { data: '2026-10-10', descricao: 'GALP BRAGA', comerciante: 'Galp', valor: 60, tipo: 'debito', categoria: 'transportes' },
    { data: '', descricao: 'SALDO', valor: 0 },
  ],
};

test('normaliza datas, valores, tipos e ordena por data', () => {
  const e = normalizarExtrato(resposta);
  assert.equal(e.movimentos.length, 4);
  assert.deepEqual(e.movimentos.map((m) => m.data), ['2026-10-03', '2026-10-05', '2026-10-10', '2026-10-25']);
  assert.equal(e.movimentos[0].valor, 13.99);
  assert.equal(e.movimentos[3].valor, 1234.56);
  assert.equal(e.movimentos[3].tipo, 'credito');
});

test('categoria inválida cai nas palavras-chave e as aprendidas têm prioridade', () => {
  const e = normalizarExtrato(resposta, { aprendidas: { galp: 'contas' } });
  assert.equal(e.movimentos.find((m) => m.comerciante === 'Netflix').categoria, 'lazer');
  assert.equal(e.movimentos.find((m) => m.comerciante === 'Galp').categoria, 'contas');
});

test('não é extrato', () => {
  assert.equal(normalizarExtrato({ eExtrato: false }), null);
});

test('chaveComerciante limpa ruído', () => {
  assert.equal(chaveComerciante('COMPRA CONTACTLESS Pingo Doce 1234'), 'pingo doce');
  assert.equal(categoriaPorPalavras('FARMACIA CENTRAL'), 'saude');
});

test('marcarDuplicados usa data e valor, uma vez por despesa existente', () => {
  const movs = normalizarExtrato({ movimentos: [
    { data: '2026-10-05', descricao: 'A', valor: 10, tipo: 'debito' },
    { data: '2026-10-05', descricao: 'B', valor: 10, tipo: 'debito' },
  ] }).movimentos;
  const r = marcarDuplicados(movs, [{ data: '2026-10-05', valor: '10.00' }]);
  assert.deepEqual(r.map((m) => m.duplicado), [true, false]);
});

test('lerExtrato envia o PDF e falha sem movimentos', async () => {
  let partes;
  const e = await lerExtrato({ base64: 'x', mime: 'application/pdf' }, { pedir: async (p) => { partes = p; return resposta; } });
  assert.equal(partes[1].mime, 'application/pdf');
  assert.equal(e.banco, 'CGD');
  await assert.rejects(lerExtrato({}, { pedir: async () => ({ movimentos: [] }) }), /movimentos/);
});
