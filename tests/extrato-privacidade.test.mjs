// Dados pessoais retirados dos extratos e das faturas antes de serem guardados ou enviados à IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identificarTitular, removerDadosPessoais, descreverRemovidos, nifValido } from '../js/modules/extrato/privacidade.js';
import { lerExtratoDeTexto, lerExtratoDeTabela, lerCsv, pedidoCategorias, promptCategorias, lerRespostaIa } from '../js/modules/extrato/ler.js';

const CABECALHO = [
  'Millennium bcp',
  'Titular: GONÇALO MIGUEL CORDEIRO',
  'Rua das Flores 123, 2.º Esq',
  '4700-123 Braga',
  'NIF: 123456789',
  'IBAN: PT50 0033 0000 4567 8901 2345 6',
];

test('identifica o titular, a morada e o NIF no cabeçalho', () => {
  const p = identificarTitular(CABECALHO);
  assert.ok(p.nomes.includes('GONÇALO MIGUEL CORDEIRO'));
  assert.ok(p.moradas.some((m) => /Rua das Flores/.test(m)));
  assert.deepEqual(p.nifs, ['123456789']);
  assert.ok(nifValido('123456789'));
});

test('remove IBAN, NIF, cartões, e-mails, telefones, matrículas e o nome do titular', () => {
  const p = identificarTitular(CABECALHO);
  const r = removerDadosPessoais('TRF P/ Goncalo Cordeiro PT50 0033 0000 4567 8901 2345 6 NIF 123456789 cartão 4321 **** **** 9876 a@b.pt 912 345 678 AA-12-BB 4700-123', p);
  assert.doesNotMatch(r.texto, /Goncalo|Cordeiro|PT50|123456789|9876|a@b|912|AA-12|4700/i);
  assert.match(r.texto, /TRF P\//);
  for (const t of ['nome', 'iban', 'nif', 'cartao', 'email', 'telefone', 'matricula', 'morada']) assert.ok(r.removidos.includes(t), t);
  assert.equal(descreverRemovidos(['nome', 'iban', 'nif']), 'nomes, IBAN e NIF');
});

test('não confunde lojas com nomes: só sequências de 2+ palavras do nome (exceto em transferências)', () => {
  const p = { nomes: ['Gonçalo Miguel Cordeiro'] };
  assert.equal(removerDadosPessoais('COMPRA SAO MIGUEL PADARIA', p).texto, 'COMPRA SAO MIGUEL PADARIA');
  assert.equal(removerDadosPessoais('MB WAY GONCALO', p, { nomesSoltos: true }).texto, 'MB WAY');
});

test('o extrato fica sem dados pessoais e diz o que foi retirado', () => {
  const linha = (y, partes) => partes.map(([str, x]) => ({ str, x, y, w: str.length * 5 }));
  const pagina = [
    ...linha(800, [['Millennium bcp', 40]]),
    ...linha(786, [['Titular: GONÇALO MIGUEL CORDEIRO', 40]]),
    ...linha(772, [['IBAN: PT50 0033 0000 4567 8901 2345 6', 40]]),
    ...linha(740, [['Data', 30], ['Descricao', 100], ['Montante', 380], ['Saldo', 460]]),
    ...linha(720, [['02/10/2026', 30], ['COMPRA 4321 **** 9876 CONTINENTE BRAGA', 100], ['-22,10', 380], ['977,90', 460]]),
    ...linha(706, [['03/10/2026', 30], ['MBWAY P/ GONCALO CORDEIRO 912345678', 100], ['-15,00', 380], ['962,90', 460]]),
  ];
  const e = lerExtratoDeTexto([pagina], { nomesConhecidos: ['Nádia Silva'] });
  assert.equal(e.movimentos.length, 2);
  const tudo = JSON.stringify(e.movimentos);
  assert.doesNotMatch(tudo, /GONCALO|CORDEIRO|9876|4321|912345678|PT50/i);
  assert.equal(e.movimentos[1].comerciante, 'MB WAY');
  assert.ok(e.privacidade.cabecalho.includes('nome') && e.privacidade.cabecalho.includes('iban'));
  assert.ok(e.privacidade.movimentos.cartao >= 1);
  // a IA só recebe a loja (a transferência fica de fora)
  const itens = pedidoCategorias(e.movimentos);
  assert.deepEqual(itens.map((i) => i.texto), ['Continente Braga']);
  assert.match(promptCategorias(itens), /0: Continente Braga$/);
});

test('CSV/Excel do banco: cabeçalho, débito/crédito ou montante com sinal', () => {
  const csv = 'Cliente: Gonçalo Cordeiro\nConta PT50 0033 0000 4567 8901 2345 6\n\nData Mov.;Data Valor;Descrição;Débito;Crédito;Saldo\n02-10-2026;02-10-2026;COMPRA 1234 LIDL BRAGA;12,40;;987,60\n05-10-2026;05-10-2026;TRF DE ORDENADO;;1.200,00;2.187,60\n06/10/2026;06/10/2026;"DD EDP COMERCIAL, SA";58,42;;2.129,18\n';
  const e = lerExtratoDeTabela(lerCsv(csv));
  assert.deepEqual(e.movimentos.map((m) => `${m.data} ${m.tipo} ${m.valor} ${m.categoria}`), [
    '2026-10-02 debito 12.4 supermercado',
    '2026-10-05 credito 1200 outros',
    '2026-10-06 debito 58.42 contas',
  ]);
  const r = lerExtratoDeTabela([['Date', 'Description', 'Amount'], ['2026-10-03', 'Netflix.com', -10.99], [46302, 'Top-up', 50]]);
  assert.deepEqual(r.movimentos.map((m) => `${m.tipo} ${m.valor}`), ['debito 10.99', 'credito 50']);
});

test('a resposta da IA dá categoria e nome limpo, e ignora nomes com números', () => {
  const itens = [{ chave: 'pd braga', texto: 'Pd Braga' }, { chave: 'x', texto: 'X' }];
  const r = lerRespostaIa({ itens: { 0: { categoria: 'supermercado', nome: 'Pingo Doce' }, 1: { categoria: 'zzz', nome: 'Loja 12345' } } }, itens);
  assert.deepEqual(r, { categorias: { 'pd braga': 'supermercado' }, nomes: { 'pd braga': 'Pingo Doce' } });
});
