// Leitura de faturas nas Finanças (combustível, luz…) e texto sem dados pessoais para a IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFaturaDespesa, lerCombustivel, textoFaturaParaIa, juntarRespostaIa } from '../js/modules/fatura-despesa/ler.js';

const GALP = `PETROGAL S.A.
GALP BRAGA NORTE
Rua do Posto 1, 4700-000 Braga
NIF: 500697370
FATURA SIMPLIFICADA FS 012/34567
Data: 28/10/2026 Hora: 18:42
GASOLEO ADITIVADO
35,21 L x 1,689 EUR/L 59,47
Matricula: AA-12-BB  Km: 123.456
TOTAL 59,47
Cliente: Goncalo Cordeiro NIF 123456789
MULTIBANCO 59,47`;

test('talão de combustível: tipo, litros, preço por litro, km e matrícula', () => {
  const c = lerCombustivel(GALP);
  assert.deepEqual(c, { tipo: 'Gasóleo aditivado', litros: 35.21, precoLitro: 1.689, km: 123456, matricula: 'AA-12-BB' });
  const f = lerFaturaDespesa(GALP);
  assert.equal(f.emitente, 'Galp');
  assert.equal(f.descricao, 'Combustível Galp');
  assert.equal(f.categoria, 'transportes');
  assert.equal(f.valor, 59.47);
  assert.equal(f.data, '2026-10-28');
});

test('o QR da AT ganha no total e na data; litros calculados se faltarem', () => {
  const texto = 'REPSOL\nGASOLINA 95\nPreço: 1,799\nTOTAL 40,00';
  const f = lerFaturaDespesa(texto, { total: 45, data: '2026-10-30', nif: '503254170', loja: '' });
  assert.equal(f.valor, 45);
  assert.equal(f.data, '2026-10-30');
  assert.equal(f.combustivel.tipo, 'Gasolina 95');
  assert.equal(f.combustivel.litros, 25.01);
});

test('fatura da luz: categoria contas', () => {
  const f = lerFaturaDespesa('EDP Comercial\nFatura n.º FT 2026/123\nTotal a pagar 48,30 €\nData de emissão 05-10-2026');
  assert.equal(f.emitente, 'EDP');
  assert.equal(f.categoria, 'contas');
  assert.equal(f.valor, 48.3);
  assert.equal(f.combustivel, null);
});

test('a IA não recebe o bloco do cliente, NIF, matrícula nem nomes do casal', () => {
  const r = textoFaturaParaIa(GALP, { nomes: ['Gonçalo Cordeiro'] });
  assert.doesNotMatch(r.texto, /Goncalo|Cordeiro|123456789|500697370|AA-12-BB|4700-000/);
  assert.match(r.texto, /GASOLEO ADITIVADO/);
  assert.ok(r.removidos.includes('nome') && r.removidos.includes('matricula'));
});

test('a resposta da IA só preenche o que falta', () => {
  const local = { descricao: '', emitente: '', valor: 30, data: '2026-10-01', categoria: 'outros', combustivel: null };
  const r = juntarRespostaIa(local, { emitente: 'Prio', descricao: 'Combustível Prio', categoria: 'transportes', total: 99, combustivel: { tipo: 'Gasóleo', litros: 18.5 } }, { temQr: true });
  assert.equal(r.valor, 30);
  assert.equal(r.descricao, 'Combustível Prio');
  assert.equal(r.categoria, 'transportes');
  assert.equal(r.combustivel.litros, 18.5);
  assert.equal(r.combustivel.precoLitro, 1.622);
});
