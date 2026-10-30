// Finanças do casal: despesas do dia a dia, quem deve a quem, contas fixas e orçamento mensal.
import { html, render, byId, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, memberName, on } from '../core/state.js';
import { toast, openModal, closeModal, modalTemplate, confirmDialog } from '../core/ui.js';
import { money, todayISO, isoToShort, pad2 } from '../core/format.js';
import { daysUntil } from '../core/dates.js';
import { balances, settlement, totalsByCategory, sum } from '../core/money.js';
import { addDoc, updateDoc, setDoc, onSnapshot, arrayUnion, arrayRemove } from '../services/firebase.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';
import { tabsTpl } from '../components/tabs.js';

const scope = createScope();

export const CATEGORIES = [
  { value: 'casa', label: 'Casa', icon: 'home' },
  { value: 'supermercado', label: 'Supermercado', icon: 'cart' },
  { value: 'restaurante', label: 'Restaurantes', icon: 'restaurant' },
  { value: 'contas', label: 'Contas (luz, água…)', icon: 'bolt' },
  { value: 'transportes', label: 'Transportes', icon: 'fuel' },
  { value: 'saude', label: 'Saúde', icon: 'pill' },
  { value: 'lazer', label: 'Lazer', icon: 'play' },
  { value: 'compras', label: 'Compras', icon: 'bag' },
  { value: 'viagens', label: 'Viagens', icon: 'map' },
  { value: 'outros', label: 'Outros', icon: 'coin' },
];
const cat = (v) => CATEGORIES.find((c) => c.value === v) || CATEGORIES[CATEGORIES.length - 1];

let month = todayISO().slice(0, 7);
let budget = {};

const ym = () => month;
const monthLabel = (m) => capitalize(new Date(`${m}-01T12:00`).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }));
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const shiftMonth = (m, n) => { const d = new Date(`${m}-01T12:00`); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const memberUids = () => session.members.map((m) => m.uid);

const expenses = createRecordList({
  key: 'despesas',
  col: () => sharedCol('despesas'),
  docRef: (id) => sharedDoc('despesas', id),
  addTitle: 'Nova despesa',
  editTitle: 'Editar despesa',
  addedToast: 'Despesa registada',
  empty: 'Sem despesas neste mês.',
  emptyIcon: 'wallet',
  fields: [
    { name: 'descricao', label: 'Descrição', placeholder: 'ex: Jantar fora', required: true },
    { name: 'valor', label: 'Valor (€)', type: 'money', required: true },
    { name: 'categoria', label: 'Categoria', type: 'select', options: CATEGORIES },
    { name: 'pagoPor', label: 'Quem pagou', type: 'member', both: false, default: () => session.uid },
    {
      name: 'divisao',
      label: 'Como se divide',
      type: 'select',
      options: [
        { value: 'metade', label: 'A meias' },
        { value: 'pagador', label: 'Só de quem pagou (pessoal)' },
        { value: 'outro', label: 'Toda do outro (adiantei)' },
      ],
    },
    { name: 'data', label: 'Data', type: 'date', default: todayISO },
  ],
  filter: (e) => String(e.data || '').startsWith(ym()),
  sort: (a, b) => String(b.data).localeCompare(String(a.data)) || (b.timestamp || 0) - (a.timestamp || 0),
  group: (e) => isoToShort(e.data),
  item: (e) => html`
    <span class="record__icon ${e.tipo === 'acerto' ? 'record__icon--green' : ''}">${icon(e.tipo === 'acerto' ? 'check' : cat(e.categoria).icon, 18)}</span>
    <span class="record__main">
      <span class="record__title">${e.descricao}</span>
      <span class="record__meta">${memberName(e.pagoPor)} pagou${e.divisao === 'pagador' ? ' · pessoal' : e.divisao === 'outro' ? ' · adiantado' : ''}</span>
    </span>
    <span class="record__value">${money(e.valor)}</span>`,
  onChange: () => drawSummary(),
});

const bills = createRecordList({
  key: 'contas_fixas',
  col: () => sharedCol('contas_fixas'),
  docRef: (id) => sharedDoc('contas_fixas', id),
  addTitle: 'Nova conta fixa',
  editTitle: 'Editar conta fixa',
  empty: 'Adiciona a renda, luz, água, internet, streaming…',
  emptyIcon: 'bolt',
  fields: [
    { name: 'nome', label: 'Nome', placeholder: 'ex: Renda, EDP, Netflix', required: true },
    { name: 'valor', label: 'Valor aproximado (€)', type: 'money' },
    { name: 'dia', label: 'Dia de pagamento (1-31)', type: 'number', default: 1 },
    { name: 'categoria', label: 'Categoria', type: 'select', options: CATEGORIES, default: 'contas' },
    { name: 'pagoPor', label: 'Quem costuma pagar', type: 'member', both: false, default: () => session.uid },
    { name: 'debito', label: 'Débito direto', type: 'checkbox' },
  ],
  sort: (a, b) => (a.dia || 0) - (b.dia || 0),
  item: (b) => {
    const paid = (b.pagoMeses || []).includes(ym());
    const due = billDueDate(b);
    const d = daysUntil(due);
    const state = paid ? 'Paga' : d < 0 ? `Atrasada ${-d} dia(s)` : d === 0 ? 'Vence hoje' : `Vence em ${d} dia(s)`;
    return html`
      <span class="record__icon">${icon(cat(b.categoria).icon, 18)}</span>
      <span class="record__main">
        <span class="record__title">${b.nome}</span>
        <span class="record__meta">Dia ${b.dia || 1} · ${memberName(b.pagoPor)}${b.debito ? ' · débito direto' : ''}</span>
      </span>
      <span class="record__side">
        <span class="record__value">${b.valor ? money(b.valor) : ''}</span>
        <button class="chip ${paid ? 'chip--accent' : d <= 3 ? 'chip--warn' : 'chip--muted'} pressable" data-action="fin:bill-toggle" data-id="${b.id}">${paid ? icon('check', 12) : ''} ${state}</button>
      </span>`;
  },
  onChange: () => drawSummary(),
});

function billDueDate(b) {
  const [y, m] = ym().split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(Number(b.dia) || 1, last));
}

/** Contas fixas por pagar este mês (usado também no Início). */
export function pendingBills(items = bills.items()) {
  const cur = todayISO().slice(0, 7);
  return items.filter((b) => !(b.pagoMeses || []).includes(cur));
}

function drawSummary() {
  const all = expenses.items();
  const monthItems = all.filter((e) => String(e.data || '').startsWith(ym()) && e.tipo !== 'acerto');
  setText('fin-month', monthLabel(ym()));
  setText('fin-total', money(sum(monthItems)));
  setText('fin-count', `${monthItems.length} despesa(s)`);

  // Saldo do casal (todas as despesas, não só do mês).
  const s = session.members.length > 1 ? settlement(balances(all, memberUids())) : null;
  render('fin-balance', session.members.length < 2
    ? html`<p class="muted small">Cria o casal em "O nosso casal" para dividirem despesas.</p>`
    : s
      ? html`<div class="balance">
          <span><strong>${memberName(s.from)}</strong> deve <strong class="accent">${money(s.valor)}</strong> a <strong>${memberName(s.to)}</strong></span>
          <button class="btn btn--small btn--primary pressable" data-action="fin:settle">${icon('check', 14)} Acertar</button>
        </div>`
      : html`<div class="balance"><span>${icon('check', 16)} Estão quites!</span></div>`);

  const totals = totalsByCategory(all, ym());
  const rows = CATEGORIES.filter((c) => totals[c.value] || budget[c.value]).map((c) => {
    const spent = totals[c.value] || 0;
    const limit = Number(budget[c.value]) || 0;
    const pct = limit ? Math.min(100, (spent / limit) * 100) : 0;
    return html`
      <div class="budget-row">
        <div class="budget-row__head"><span>${icon(c.icon, 16)} ${c.label}</span><span>${money(spent)}${limit ? html` <span class="muted">/ ${money(limit)}</span>` : ''}</span></div>
        ${limit ? html`<div class="progress ${spent > limit ? 'progress--over' : spent > limit * 0.8 ? 'progress--warn' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>` : ''}
      </div>`;
  });
  render('fin-categories', rows.length ? rows : html`<p class="muted small">Sem gastos neste mês.</p>`);

  const pend = pendingBills(bills.items());
  setText('fin-bills-pending', pend.length ? `${pend.length} por pagar (${money(sum(pend))})` : 'Todas pagas');
}

function budgetModal() {
  return modalTemplate('fin-budget-modal', 'Orçamento mensal', html`
    <p class="muted small">Limite por categoria. Deixa em branco para não definir.</p>
    ${CATEGORIES.map((c) => html`
      <div class="field field--inline">
        <label class="field__label" for="fin-budget-${c.value}">${icon(c.icon, 16)} ${c.label}</label>
        <input type="number" step="1" inputmode="decimal" id="fin-budget-${c.value}" class="input input--small" placeholder="—">
      </div>`)}
    <div class="btn-row">
      <button class="btn" data-action="modal:close" data-modal="fin-budget-modal">Cancelar</button>
      <button class="btn btn--primary" data-action="fin:budget-save">Guardar</button>
    </div>`);
}

export default {
  id: 'finances',
  pages: [{
    id: 'menu-financas',
    title: 'Finanças',
    root: true,
    template: () => html`
      <div class="month-switch">
        <button class="icon-btn glass-chip pressable" data-action="fin:month" data-step="-1" aria-label="Mês anterior">${icon('chevronLeft', 18)}</button>
        <span id="fin-month" class="month-switch__label"></span>
        <button class="icon-btn glass-chip pressable" data-action="fin:month" data-step="1" aria-label="Mês seguinte">${icon('chevronRight', 18)}</button>
      </div>
      ${tabsTpl('fin', [{ id: 'resumo', label: 'Resumo' }, { id: 'despesas', label: 'Despesas' }, { id: 'contas', label: 'Contas fixas' }])}
      <div data-tab-panel="fin:resumo">
        <div class="card glass fin-hero">
          <span class="eyebrow">Gasto este mês</span>
          <span class="fin-hero__total" id="fin-total">0,00 €</span>
          <span class="muted small" id="fin-count"></span>
        </div>
        <div class="card glass">
          <h3 class="card__title">${icon('users', 18)} Entre nós</h3>
          <div id="fin-balance"></div>
        </div>
        <div class="card glass">
          <div class="section-head">
            <h3 class="card__title">${icon('wallet', 18)} Por categoria</h3>
            <button class="btn btn--small btn--glass pressable" data-action="fin:budget">Orçamento</button>
          </div>
          <div id="fin-categories"></div>
        </div>
        <button class="row-link glass pressable" data-action="tabs:select" data-group="fin" data-tab="contas">
          <span>${icon('bolt', 18)} Contas fixas</span><span class="muted small" id="fin-bills-pending"></span>
        </button>
        ${expenses.addButton('Registar despesa')}
      </div>
      <div data-tab-panel="fin:despesas" hidden>
        ${expenses.addButton('Registar despesa')}
        ${expenses.template()}
      </div>
      <div data-tab-panel="fin:contas" hidden>
        ${bills.addButton('Adicionar conta fixa')}
        ${bills.template()}
      </div>`,
    onEnter: () => { drawSummary(); expenses.draw(); bills.draw(); },
  }],
  modals: () => html`${expenses.modals()}${bills.modals()}${budgetModal()}`,
  actions: {
    'fin:month': ({ data }) => {
      month = shiftMonth(month, Number(data.step));
      expenses.draw();
      bills.draw();
    },
    'fin:bill-toggle': async ({ data }) => {
      const b = bills.items().find((x) => x.id === data.id);
      if (!b) return;
      const paid = (b.pagoMeses || []).includes(ym());
      await updateDoc(sharedDoc('contas_fixas', b.id), { pagoMeses: paid ? arrayRemove(ym()) : arrayUnion(ym()) });
      if (!paid && b.valor) {
        const day = billDueDate(b);
        await addDoc(sharedCol('despesas'), {
          descricao: b.nome, valor: Number(b.valor), categoria: b.categoria || 'contas', pagoPor: b.pagoPor || session.uid,
          divisao: 'metade', data: `${ym()}-${pad2(day.getDate())}`, contaFixaId: b.id, createdBy: session.uid, timestamp: Date.now(),
        });
        toast(`${b.nome} marcada como paga e registada nas despesas`);
      }
    },
    'fin:settle': async () => {
      const s = settlement(balances(expenses.items(), memberUids()));
      if (!s) return;
      const ok = await confirmDialog(`${memberName(s.from)} pagou ${money(s.valor)} a ${memberName(s.to)}?`, { title: 'Acertar contas', confirmLabel: 'Sim, acertar' });
      if (!ok) return;
      await addDoc(sharedCol('despesas'), {
        descricao: 'Acerto de contas', valor: s.valor, pagoPor: s.from, divisao: 'outro', tipo: 'acerto',
        categoria: 'outros', data: todayISO(), createdBy: session.uid, timestamp: Date.now(),
      });
      toast('Contas acertadas');
    },
    'fin:budget': () => {
      CATEGORIES.forEach((c) => { const el = byId(`fin-budget-${c.value}`); if (el) el.value = budget[c.value] || ''; });
      openModal('fin-budget-modal');
    },
    'fin:budget-save': async () => {
      const next = {};
      CATEGORIES.forEach((c) => { const v = Number(byId(`fin-budget-${c.value}`).value); if (v > 0) next[c.value] = v; });
      await setDoc(sharedDoc('config', 'orcamento'), { limites: next });
      closeModal('fin-budget-modal');
      toast('Orçamento guardado');
    },
  },
  start() {
    month = todayISO().slice(0, 7);
    expenses.subscribe(scope);
    bills.subscribe(scope);
    scope.add(onSnapshot(sharedDoc('config', 'orcamento'), (s) => { budget = s.exists() ? s.data().limites || {} : {}; drawSummary(); }));
    scope.add(on('household:update', drawSummary));
  },
  stop() { scope.clear(); },
  expenses,
  bills,
};
