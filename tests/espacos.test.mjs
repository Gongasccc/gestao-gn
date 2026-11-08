import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  espacoPara, paginaDe, chaveDe, gruposDoPerfil, modoColaborativo, tipoGrupo, ligacoesAtivas,
} from '../js/services/espacos.js';
import { balances, settlement } from '../js/core/money.js';

const grupo = { uid: 'eu', householdId: 'H1', household: { members: ['eu', 'ana'], ligacoes: {} }, profile: {} };

test('sem partilhas, tudo vai para o grupo ativo ou para o espaço pessoal', () => {
  assert.deepEqual(espacoPara(['semanais'], grupo), ['households', 'H1']);
  assert.deepEqual(espacoPara(['config', 'orcamento'], grupo), ['households', 'H1']);
  assert.deepEqual(espacoPara(['tarefas'], { uid: 'eu', householdId: null, profile: {} }), ['users', 'eu']);
});

test('uma página partilhada leva todas as suas coleções para a partilha', () => {
  const ctx = { ...grupo, household: { ...grupo.household, ligacoes: { 'menu-lista-compras': { sid: 'S1', code: 'ABC123' } } } };
  assert.deepEqual(espacoPara(['semanais'], ctx), ['partilhas', 'S1']);
  assert.deepEqual(espacoPara(['rapidas', 'x'], ctx), ['partilhas', 'S1']);
  assert.deepEqual(espacoPara(['config', 'lista_compras'], ctx), ['partilhas', 'S1']);
  // O resto continua no grupo.
  assert.deepEqual(espacoPara(['config', 'orcamento'], ctx), ['households', 'H1']);
  assert.deepEqual(espacoPara(['receitas'], ctx), ['households', 'H1']);
});

test('sem grupo, as ligações vêm do perfil', () => {
  const ctx = { uid: 'eu', householdId: null, profile: { ligacoes: { 'menu-receitas': { sid: 'S2' } } } };
  assert.deepEqual(espacoPara(['livros_receitas', 'b1', 'itens'], ctx), ['partilhas', 'S2']);
  assert.deepEqual(ligacoesAtivas(ctx), ctx.profile.ligacoes);
});

test('chaves e páginas', () => {
  assert.equal(chaveDe(['config', 'produtos']), 'config/produtos');
  assert.equal(chaveDe(['despesas', 'id']), 'despesas');
  assert.equal(paginaDe(['faturas']), 'menu-supermercados');
  assert.equal(paginaDe(['config', 'limpeza']), null);
  assert.equal(paginaDe(['eventos']), null);
});

test('o casal antigo passa a ser a lista de grupos sem perder nada', () => {
  assert.deepEqual(gruposDoPerfil({ householdId: 'H1' }), ['H1']);
  assert.deepEqual(gruposDoPerfil({ householdId: 'H2', householdIds: ['H1'] }), ['H2', 'H1']);
  assert.deepEqual(gruposDoPerfil({ householdId: null, householdIds: ['H1', 'H1', null] }), ['H1']);
  assert.deepEqual(gruposDoPerfil({}), []);
  assert.equal(tipoGrupo({}).id, 'casal');
  assert.equal(tipoGrupo({ tipo: 'amigos' }).label, 'Amigos');
});

test('modo colaborativo', () => {
  assert.equal(modoColaborativo('menu-tarefas', grupo).tipo, 'grupo');
  assert.equal(modoColaborativo('menu-tarefas', { ...grupo, household: { members: ['eu'] } }), null);
  const ctx = { uid: 'eu', householdId: null, profile: { ligacoes: { 'menu-tarefas': { sid: 'S', nome: 'Tarefas' } } } };
  assert.deepEqual(modoColaborativo('menu-tarefas', ctx), { tipo: 'partilha', nome: 'Tarefas' });
  assert.equal(modoColaborativo('menu-financas', ctx), null);
});

test('acertos de contas com três pessoas', () => {
  const m = ['a', 'b', 'c'];
  const despesas = [{ valor: 90, pagoPor: 'a' }];
  let bal = balances(despesas, m);
  assert.deepEqual(bal, { a: 60, b: -30, c: -30 });
  const s1 = settlement(bal);
  assert.equal(s1.to, 'a');
  despesas.push({ valor: s1.valor, pagoPor: s1.from, para: s1.to, divisao: 'outro', tipo: 'acerto' });
  bal = balances(despesas, m);
  const s2 = settlement(bal);
  despesas.push({ valor: s2.valor, pagoPor: s2.from, para: s2.to, divisao: 'outro', tipo: 'acerto' });
  assert.deepEqual(balances(despesas, m), { a: 0, b: 0, c: 0 });
  assert.equal(settlement(balances(despesas, m)), null);
});

test('despesas do grupo: dividir só entre quem participou', async () => {
  const { transfers } = await import('../js/core/money.js');
  const m = ['a', 'b', 'c', 'd'];
  const desp = [
    { valor: 800, pagoPor: 'a' }, // renda, todos
    { valor: 60, pagoPor: 'b', entre: ['b', 'c'] }, // jantar só dos dois
    { valor: 30, pagoPor: 'c', divisao: 'outro', entre: ['c', 'd'] }, // adiantou à d
  ];
  const bal = balances(desp, m);
  assert.deepEqual(bal, { a: 600, b: -170, c: -200, d: -230 });
  const t = transfers(bal);
  assert.equal(t.reduce((s, x) => s + x.valor, 0), 600);
  assert.ok(t.every((x) => x.to === 'a'));
  // Depois de pagar tudo, ficam quites.
  t.forEach((x) => desp.push({ valor: x.valor, pagoPor: x.from, para: x.to, divisao: 'outro', tipo: 'acerto' }));
  assert.deepEqual(transfers(balances(desp, m)), []);
  // entre com alguém que já saiu do grupo é ignorado.
  assert.deepEqual(balances([{ valor: 10, pagoPor: 'a', entre: ['a', 'zz'] }], ['a', 'b']), { a: 0, b: 0 });
});
