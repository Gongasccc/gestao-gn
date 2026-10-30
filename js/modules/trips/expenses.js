// Despesas da viagem: modo "Splitwise" (divisão entre membros) ou modo simples.
import { html, render, byId, emptyState, show } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { modalTemplate, openModal, closeModal, confirmDialog, toast, withLoading } from '../../core/ui.js';
import { money, isoToShort, pad2 } from '../../core/format.js';
import { addDoc, deleteDoc } from '../../services/firebase.js';
import { tripCol, tripSubDoc } from '../../services/paths.js';
import { avatar } from '../../components/avatar.js';
import { tripState, members, memberIds, memberName, categoryFor, categoryIcon, isSettlement } from './store.js';
import { shareOf, pairwiseDebts, netWith } from './balances.js';

export function expensesTabTpl() {
  return html`
    <div class="toolbar toolbar--scroll">
      <button class="btn btn--primary btn--small pressable" data-action="expenses:new">${icon('plus', 14)} Despesa</button>
      <button class="btn btn--glass btn--small pressable" id="btn-settle" data-action="expenses:settle-open">${icon('bolt', 14)} Liquidar contas</button>
      <select id="expense-mode" class="input input--small" data-change="expenses:mode" aria-label="Modo">
        <option value="splitwise">Modo partilhado</option>
        <option value="simples">Modo simples</option>
      </select>
    </div>
    <div id="debts-summary"></div>
    <div id="expenses-list"></div>`;
}

function dayKey(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function drawExpenses() {
  const mode = tripState.expenseMode;
  const ids = memberIds();
  const me = session.uid;
  const list = [...tripState.expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Resumo de dívidas
  if (mode === 'splitwise') {
    const debts = pairwiseDebts(list, ids);
    const rows = members().filter((m) => m.uid !== me).map((m) => ({ m, net: netWith(debts, me, m.uid) })).filter((r) => Math.abs(r.net) > 0.009);
    render('debts-summary', rows.length
      ? html`<div class="debts">${rows.map(({ m, net }) => html`
          <div class="debt glass-soft ${net > 0 ? 'debt--in' : 'debt--out'}">
            ${avatar(m.nome, m.avatarUrl, 'sm')}
            <span class="debt__text">${net > 0 ? html`<strong>${m.nome}</strong> deve-te` : html`Deves a <strong>${m.nome}</strong>`}</span>
            <span class="debt__value">${money(Math.abs(net))}</span>
          </div>`)}</div>`
      : html`<div class="chip chip--muted chip--block">${icon('check', 12)} Contas em dia</div>`);
  } else {
    const total = list.filter((e) => !isSettlement(e)).reduce((s, e) => s + (Number(e.valor) || 0), 0);
    render('debts-summary', html`<div class="chip chip--accent chip--block">Total: ${money(total)}</div>`);
  }
  show('btn-settle', mode === 'splitwise');

  if (!list.length) {
    render('expenses-list', emptyState('Sem despesas registadas.', icon('wallet', 28)));
    return;
  }

  const parts = [];
  let lastDay = null;
  list.forEach((e) => {
    const day = dayKey(e.timestamp);
    if (day !== lastDay) { parts.push(html`<div class="date-sep">${isoToShort(day)}</div>`); lastDay = day; }

    if (isSettlement(e)) {
      if (!e.valor) return;
      const to = (e.divididoPor || []).find((u) => u !== e.pagadorUid);
      parts.push(html`
        <div class="expense expense--settle">
          <span class="expense__icon">${icon('bolt', 18)}</span>
          <span class="expense__info"><span class="expense__title">${e.pagadorUid === me ? 'Pagaste' : `${memberName(e.pagadorUid)} pagou`} a ${to === me ? 'ti' : memberName(to)}</span>
          <span class="expense__sub">Liquidação</span></span>
          <span class="expense__right"><span class="expense__value">${money(e.valor)}</span></span>
          <button class="icon-btn icon-btn--subtle" data-action="expenses:delete" data-id="${e.id}" aria-label="Apagar">${icon('trash', 14)}</button>
        </div>`);
      return;
    }

    let right;
    if (mode === 'simples') {
      right = html`<span class="expense__value">${money(e.valor)}</span>`;
    } else {
      const mine = shareOf(e, me, ids);
      if (e.pagadorUid === me) {
        right = html`<span class="expense__tag is-in">emprestaste</span><span class="expense__value is-in">${money(e.valor - mine)}</span>`;
      } else if (mine > 0) {
        right = html`<span class="expense__tag is-out">emprestaram-te</span><span class="expense__value is-out">${money(mine)}</span>`;
      } else {
        right = html`<span class="expense__tag">não envolvido</span><span class="expense__value muted">${money(0)}</span>`;
      }
    }
    parts.push(html`
      <div class="expense">
        <span class="expense__icon">${icon(categoryFor(e.desc).icon, 18)}</span>
        <span class="expense__info">
          <span class="expense__title">${e.desc}</span>
          <span class="expense__sub">${e.pagadorUid === me ? 'Pagaste' : `${e.pagadorNome || memberName(e.pagadorUid)} pagou`} ${money(e.valor)}</span>
        </span>
        <span class="expense__right">${right}</span>
        <button class="icon-btn icon-btn--subtle" data-action="expenses:delete" data-id="${e.id}" aria-label="Apagar">${icon('trash', 14)}</button>
      </div>`);
  });
  render('expenses-list', parts, { stagger: true });
}

export function expensesModalsTpl() {
  return html`
    ${modalTemplate('modal-expense', 'Nova despesa', html`
      <div class="amount-card glass-soft">
        <div class="amount-card__row">
          <span class="amount-card__icon" id="expense-icon">${icon('coin', 20)}</span>
          <input type="text" id="expense-desc" class="input input--bare" placeholder="Descrição (ex: Jantar)" data-input="expenses:desc">
        </div>
        <div class="amount-card__row">
          <span class="amount-card__icon">€</span>
          <input type="number" id="expense-value" class="input input--bare input--amount" placeholder="0,00" inputmode="decimal" step="0.01" min="0">
        </div>
      </div>
      <div id="expense-split-fields">
        <div class="sentence">
          <span>Pago por</span>
          <select id="expense-payer" class="input input--small"></select>
          <span>e dividido</span>
          <select id="expense-split-mode" class="input input--small" data-change="expenses:split-mode">
            <option value="iguais">em partes iguais</option>
            <option value="exatos">por valores exatos</option>
          </select>
        </div>
        <div class="split-list" id="expense-participants"></div>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="modal-expense">Cancelar</button>
        <button class="btn btn--primary" data-action="expenses:save">Guardar</button>
      </div>`)}
    ${modalTemplate('modal-settle', 'Liquidar contas', html`
      <p class="muted">Regista o pagamento que acerta as contas com uma pessoa.</p>
      <div class="list" id="settle-options"></div>
      <div class="btn-row"><button class="btn" data-action="modal:close" data-modal="modal-settle">Fechar</button></div>`)}`;
}

function fillExpenseForm() {
  byId('expense-desc').value = '';
  byId('expense-value').value = '';
  render('expense-icon', icon('coin', 20));
  byId('expense-split-mode').value = 'iguais';
  render('expense-payer', members().map((m) => html`<option value="${m.uid}" ${m.uid === session.uid ? 'selected' : ''}>${m.uid === session.uid ? 'mim' : m.nome}</option>`));
  render('expense-participants', members().map((m) => html`
    <label class="split-row">
      <input type="checkbox" class="split-check" value="${m.uid}" checked>
      ${avatar(m.nome, m.avatarUrl, 'sm')}
      <span class="split-row__name">${m.nome}</span>
      <input type="number" class="input input--small split-exact" data-uid="${m.uid}" placeholder="€" step="0.01" min="0" inputmode="decimal" hidden>
    </label>`));
  show('expense-split-fields', tripState.expenseMode === 'splitwise');
}

function drawSettleOptions() {
  const debts = pairwiseDebts(tripState.expenses, memberIds());
  const me = session.uid;
  const rows = members().filter((m) => m.uid !== me).map((m) => ({ m, net: netWith(debts, me, m.uid) }));
  render('settle-options', rows.map(({ m, net }) => html`
    <div class="user-row glass-soft">
      ${avatar(m.nome, m.avatarUrl, 'md')}
      <span class="user-row__name">${m.nome}<br><span class="muted small">${Math.abs(net) < 0.01 ? 'Sem saldo pendente' : net > 0 ? `Deve-te ${money(net)}` : `Deves ${money(-net)}`}</span></span>
      ${Math.abs(net) >= 0.01 ? html`<button class="btn btn--small btn--primary" data-action="expenses:settle" data-uid="${m.uid}" data-net="${net.toFixed(2)}">Liquidar</button>` : ''}
    </div>`));
}

export const expensesActions = {
  'expenses:new': () => { fillExpenseForm(); openModal('modal-expense'); },
  'expenses:desc': ({ value }) => render('expense-icon', categoryIcon(value)),
  'expenses:split-mode': ({ value }) => {
    document.querySelectorAll('.split-exact').forEach((i) => { i.hidden = value !== 'exatos'; });
    document.querySelectorAll('.split-check').forEach((c) => { c.hidden = value === 'exatos'; });
  },
  'expenses:mode': ({ value }) => { tripState.expenseMode = value; drawExpenses(); },
  'expenses:save': async ({ el }) => {
    const desc = byId('expense-desc').value.trim();
    const valor = parseFloat(byId('expense-value').value);
    if (!desc || !valor || valor <= 0) return toast('Preenche a descrição e um valor válido.', 'error');

    let pagadorUid = session.uid;
    let modoDivisao = 'iguais';
    let divididoPor = memberIds();
    const quotasExatas = {};

    if (tripState.expenseMode === 'splitwise') {
      pagadorUid = byId('expense-payer').value;
      modoDivisao = byId('expense-split-mode').value;
      if (modoDivisao === 'iguais') {
        divididoPor = [...document.querySelectorAll('.split-check:checked')].map((c) => c.value);
        if (!divididoPor.length) return toast('Escolhe pelo menos uma pessoa.', 'error');
      } else {
        divididoPor = [];
        document.querySelectorAll('.split-exact').forEach((i) => {
          const v = parseFloat(i.value) || 0;
          if (v > 0) { divididoPor.push(i.dataset.uid); quotasExatas[i.dataset.uid] = v; }
        });
        const sum = Object.values(quotasExatas).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - valor) > 0.01) return toast(`Os valores somam ${money(sum)}, mas a despesa é ${money(valor)}.`, 'error', 3800);
      }
    }

    await withLoading(el, () => addDoc(tripCol(tripState.currentTripId, 'despesas'), {
      desc,
      valor,
      pagadorUid,
      pagadorNome: memberName(pagadorUid),
      divididoPor,
      modoDivisao,
      quotasExatas,
      categoria: categoryFor(desc).nome,
      dataStr: `${pad2(new Date().getDate())}/${pad2(new Date().getMonth() + 1)}`,
      timestamp: Date.now(),
    }));
    closeModal('modal-expense');
    toast('Despesa adicionada');
  },
  'expenses:delete': async ({ data }) => {
    if (await confirmDialog('A despesa será removida e os saldos recalculados.', { title: 'Apagar despesa?', confirmLabel: 'Apagar', danger: true })) {
      await deleteDoc(tripSubDoc(tripState.currentTripId, 'despesas', data.id));
    }
  },
  'expenses:settle-open': () => {
    if (members().length < 2) return toast('Não há outros membros nesta viagem.', 'info');
    drawSettleOptions();
    openModal('modal-settle');
  },
  'expenses:settle': async ({ data }) => {
    const net = parseFloat(data.net);
    const other = data.uid;
    const me = session.uid;
    // Quem deve paga a quem tem a receber: a parte do credor é o valor total, o que anula a dívida.
    const payer = net > 0 ? other : me;
    const receiver = net > 0 ? me : other;
    const amount = Math.abs(net);
    await addDoc(tripCol(tripState.currentTripId, 'despesas'), {
      desc: `Liquidação com ${memberName(other)}`,
      tipo: 'liquidacao',
      valor: amount,
      pagadorUid: payer,
      pagadorNome: memberName(payer),
      divididoPor: [receiver],
      modoDivisao: 'exatos',
      quotasExatas: { [receiver]: amount },
      categoria: 'Liquidação',
      timestamp: Date.now(),
    });
    closeModal('modal-settle');
    toast(`Contas acertadas com ${memberName(other)}`);
  },
};
