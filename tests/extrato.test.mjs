// Os fixtures são o texto que o pdf.js extrai de três PDFs de teste com layouts diferentes:
// colunas Débito/Crédito/Saldo (tipo CGD), montante com sinal + saldo (tipo Millennium) e formato inglês (tipo Revolut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lerExtratoDeTexto, marcarDuplicados, nomeComerciante, chaveComerciante, categoriaPorPalavras, dataIso, categorizar,
} from '../js/modules/extrato/ler.js';

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const resumo = (e) => e.movimentos.map((m) => `${m.data} ${m.tipo} ${m.valor} ${m.categoria}`);

test('colunas Débito/Crédito/Saldo: ignora saldos e distingue entradas', () => {
  const e = lerExtratoDeTexto(fixture('extrato-colunas'));
  assert.equal(e.banco, 'Caixa Geral de Depósitos');
  assert.deepEqual(resumo(e), [
    '2026-10-03 debito 13.99 lazer',
    '2026-10-05 debito 45.3 supermercado',
    '2026-10-07 credito 1234.56 outros',
    '2026-10-10 debito 60 transportes',
    '2026-10-12 debito 40 outros',
    '2026-10-15 debito 58.42 contas',
    '2026-10-18 debito 8.75 saude',
  ]);
  assert.equal(e.movimentos[1].comerciante, 'Continente Braga');
  assert.equal(e.movimentos[4].transferencia, true); // levantamento
});

test('montante com sinal, datas sem ano e descrição em duas linhas', () => {
  const e = lerExtratoDeTexto(fixture('extrato-montante'));
  assert.equal(e.banco, 'Millennium bcp');
  assert.deepEqual(resumo(e), [
    '2026-10-01 debito 650 casa',
    '2026-10-04 debito 22.1 supermercado',
    '2026-10-06 debito 15 outros',
    '2026-10-20 credito 29.99 compras',
    '2026-10-22 debito 18.4 restaurante',
  ]);
  assert.match(e.movimentos[0].descricao, /RENDA CASA$/);
});

test('formato inglês (€10.99) e datas por extenso', () => {
  const e = lerExtratoDeTexto(fixture('extrato-revolut'));
  assert.equal(e.banco, 'Revolut');
  assert.deepEqual(resumo(e), [
    '2026-10-03 debito 10.99 lazer',
    '2026-10-05 debito 89.5 viagens',
    '2026-10-09 credito 100 outros',
  ]);
});

test('categorias aprendidas têm prioridade sobre as palavras-chave', () => {
  const [m] = categorizar([{ data: '2026-10-10', descricao: 'COMPRA 4321 GALP BRAGA', valor: 60, tipo: 'debito' }], { 'galp braga': 'contas' });
  assert.equal(m.categoria, 'contas');
});

test('nomes, chaves, datas e palavras-chave', () => {
  assert.equal(nomeComerciante('COMPRA 4321 CONTINENTE BRAGA CONTACTLESS'), 'Continente Braga');
  assert.equal(nomeComerciante('DD EDP COMERCIAL'), 'EDP Comercial');
  assert.equal(chaveComerciante('COMPRA C/LESS PINGO DOCE 1234'), 'pingo doce');
  assert.equal(categoriaPorPalavras('FARMACIA CENTRAL'), 'saude');
  assert.equal(dataIso('3/10', 2026), '2026-10-03');
  assert.equal(dataIso('31-12-25', 2026), '2025-12-31');
  assert.equal(dataIso('7 dez', 2026), '2026-12-07');
  assert.equal(dataIso('40/13', 2026), '');
});

test('marcarDuplicados usa data e valor, uma vez por despesa existente', () => {
  const movs = [
    { data: '2026-10-05', descricao: 'A', valor: 10 },
    { data: '2026-10-05', descricao: 'B', valor: 10 },
  ];
  const r = marcarDuplicados(movs, [{ data: '2026-10-05', valor: '10.00' }]);
  assert.deepEqual(r.map((m) => m.duplicado), [true, false]);
});

test('a IA só recebe nomes de lojas únicos, sem números nem transferências', async () => {
  const { pedidoCategorias, promptCategorias, lerRespostaCategorias } = await import('../js/modules/extrato/ler.js');
  const movs = lerExtratoDeTexto(fixture('extrato-colunas')).movimentos;
  movs.push({ ...movs[1] }); // Continente repetido
  const itens = pedidoCategorias(movs, { 'edp comercial': 'contas' });
  const textos = itens.map((i) => i.texto);
  assert.ok(textos.includes('Continente Braga'));
  assert.equal(textos.filter((t) => t === 'Continente Braga').length, 1);
  assert.ok(!textos.some((t) => /salario|lev|edp/i.test(t))); // transferências e aprendidas ficam de fora
  const prompt = promptCategorias(itens);
  assert.ok(!/\d{3,}|,\d{2}\b|2026/.test(prompt.split('\n').slice(-itens.length).join('\n')));
  const r = lerRespostaCategorias({ categorias: { 0: 'lazer', 1: 'xpto' } }, itens);
  assert.deepEqual(Object.keys(r), [itens[0].chave]);
});
