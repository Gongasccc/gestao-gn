// Contas da viagem: quem pagou, como se divide, saldos de cada um e acertos.
import { html, render, byId, emptyState, show, setText } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { modalTemplate, openModal, closeModal, confirmDialog, promptDialog, toast, withLoading } from '../../core/ui.js';
import { money, isoToShort, pad2, todayISO } from '../../core/format.js';
import { addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { tripCol, tripSubDoc } from '../../services/paths.js';
import { avatar } from '../../components/avatar.js';
import { tripState, currentTrip, members, memberIds, memberName, categoryFor, expenseCategory, isSettlement, CATEGORIES } from './store.js';
import { shareOf, netBalances, simplifyDebts, costOf, paidBy } from './balances.js';
import { BASE, CURRENCIES, fetchRate, toEur, formatIn } from './currency.js';

const SPLIT_MODES = [
  { id: 'iguais', label: 'Igual' },
  { id: 'exatos', label: 'Valores' },
  { id: 'percentagem', label: '%' },
  { id: 'partes', label: 'Partes' },
];

const isGroup = () => members().length > 1;
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v))}`;

function dayOf(e) {
  if (e.data) return e.data;
  const d = new Date(e.timestamp || Date.now());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const sortExpenses = (list) => [...list].sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || (b.timestamp || 0) - (a.timestamp || 0));

// ---------- Templates ----------

export function expensesTabTpl() {
  return html`
    <div class="contas">
      <aside class="contas__side">
        <div class="card glass balance-hero" id="balance-hero"></div>
        <div class="card glass" id="settle-card"></div>
        <div class="card glass" id="balances-card"></div>
      </aside>
      <div class="contas__main">
        <div class="toolbar">
          <button class="btn btn--primary pressable contas__add" data-action="expenses:new">${icon('plus', 16)} Despesa</button>
          <button class="btn btn--glass pressable" data-action="expenses:share" aria-label="Partilhar resumo">${icon('share', 16)} Partilhar</button>
        </div>
        <div id="expenses-list"></div>
      </div>
    </div>`;
}

export function expensesModalsTpl() {
  return modalTemplate('modal-expense', 'Nova despesa', html`
    <input type="hidden" id="expense-id">
    <div class="amount-card glass-soft">
      <div class="amount-card__row">
        <span class="amount-card__icon" id="expense-icon">${icon('coin', 20)}</span>
        <input type="text" id="expense-desc" class="input input--bare" placeholder="Descrição (ex: Jantar)" data-input="expenses:desc">
      </div>
      <div class="amount-card__row">
        <select id="expense-currency" class="input input--small amount-card__currency" data-change="expenses:currency" aria-label="Moeda">
          ${CURRENCIES.map((c) => html`<option value="${c}">${c}</option>`)}
        </select>
        <input type="number" id="expense-value" class="input input--bare input--amount" placeholder="0,00" inputmode="decimal" step="0.01" min="0" data-input="expenses:recalc">
      </div>
      <div class="amount-card__rate" id="expense-rate-row" hidden>
        <span>1 <span id="expense-rate-code"></span> =</span>
        <input type="number" id="expense-rate" class="input input--small" step="0.0001" min="0" inputmode="decimal" data-input="expenses:recalc">
        <span>€</span>
        <span class="amount-card__eur" id="expense-eur"></span>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label class="field__label" for="expense-date">Dia</label><input type="date" id="expense-date" class="input" data-change="expenses:date"></div>
      <div class="field"><label class="field__label" for="expense-cat">Categoria</label>
        <select id="expense-cat" class="input" data-change="expenses:cat">
          ${CATEGORIES.map((c) => html`<option value="${c.nome}">${c.nome}</option>`)}
        </select></div>
    </div>
    <div id="expense-split-fields">
      <div class="field"><label class="field__label" for="expense-payer">Pago por</label><select id="expense-payer" class="input"></select></div>
      <span class="field__label">Dividido</span>
      <div class="seg-mini" id="expense-split-mode">
        ${SPLIT_MODES.map((m) => html`<button type="button" class="seg-mini__btn" data-action="expenses:split-mode" data-mode="${m.id}">${m.label}</button>`)}
      </div>
      <div class="split-list" id="expense-participants"></div>
      <div class="split-hint" id="split-hint"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn--danger-soft" id="expense-delete" data-action="expenses:delete-current" hidden>${icon('trash', 16)}</button>
      <button class="btn" data-action="modal:close" data-modal="modal-expense">Cancelar</button>
      <button class="btn btn--primary" data-action="expenses:save">Guardar</button>
    </div>`);
}

// ---------- Saldos ----------

function drawBalances() {
  const ids = memberIds();
  const me = session.uid;
  const all = tripState.expenses;
  const real = all.filter((e) => !isSettlement(e));
  const total = real.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const cost = costOf(all, ids, isSettlement);
  const paid = paidBy(real, members());
  const net = netBalances(all, ids);
  const mine = net[me] || 0;

  render('balance-hero', isGroup() ? html`
    <span class="eyebrow">O teu saldo</span>
    <span class="balance-hero__value ${mine > 0.009 ? 'is-in' : mine < -0.009 ? 'is-out' : ''}">${signed(mine)}</span>
    <span class="muted small">${mine > 0.009 ? 'Tens a receber' : mine < -0.009 ? 'Tens a pagar' : 'Estás em dia'}</span>
    <div class="balance-hero__grid">
      <div><span class="eyebrow">Total do grupo</span><strong>${money(total)}</strong></div>
      <div><span class="eyebrow">O teu custo</span><strong>${money(cost[me] || 0)}</strong></div>
      <div><span class="eyebrow">Pagaste</span><strong>${money(paid[me] || 0)}</strong></div>
    </div>` : html`
    <span class="eyebrow">Total gasto</span>
    <span class="balance-hero__value">${money(total)}</span>
    <span class="muted small">Convida alguém nas definições da viagem para dividir contas.</span>`);

  show('settle-card', isGroup());
  show('balances-card', isGroup());
  if (!isGroup()) return;

  const transfers = simplifyDebts(net);
  render('settle-card', html`
    <h3 class="card__title">${icon('bolt', 16)} Acertar contas</h3>
    ${transfers.length ? html`
      <p class="muted small">O caminho mais curto para ficarem todos a zero.</p>
      <div class="transfers">${transfers.map((t) => {
        const from = members().find((m) => m.uid === t.from);
        const to = members().find((m) => m.uid === t.to);
        const involved = t.from === me || t.to === me;
        return html`
          <div class="transfer ${involved ? 'transfer--me' : ''}">
            ${avatar(from?.nome, from?.avatarUrl, 'sm')}
            <span class="transfer__arrow">${icon('chevronRight', 14)}</span>
            ${avatar(to?.nome, to?.avatarUrl, 'sm')}
            <span class="transfer__text">${t.from === me ? 'Pagas' : html`<strong>${from?.nome || 'Alguém'}</strong> paga`} ${t.to === me ? 'a ti' : html`a <strong>${to?.nome || 'alguém'}</strong>`}</span>
            <span class="transfer__value">${money(t.valor)}</span>
            <button class="btn btn--small btn--glass pressable" data-action="expenses:settle" data-from="${t.from}" data-to="${t.to}" data-valor="${t.valor.toFixed(2)}">Pago</button>
          </div>`;
      })}</div>` : html`<div class="chip chip--muted chip--block">${icon('check', 12)} Está tudo acertado</div>`}`);

  const max = Math.max(0.01, ...Object.values(net).map(Math.abs));
  render('balances-card', html`
    <h3 class="card__title">${icon('users', 16)} Saldos</h3>
    <div class="balances">${members().map((m) => {
      const v = net[m.uid] || 0;
      const pct = Math.round((Math.abs(v) / max) * 50);
      return html`
        <div class="bal-row">
          <span class="bal-row__who">${avatar(m.nome, m.avatarUrl, 'xs')} ${m.uid === me ? 'Tu' : m.nome}${m.convidado ? html` <span class="muted small">(sem conta)</span>` : ''}</span>
          <span class="bal-row__bar"><span class="${v >= 0 ? 'is-pos' : 'is-neg'}" style="width:${pct}%"></span></span>
          <span class="bal-row__value ${v > 0.009 ? 'is-in' : v < -0.009 ? 'is-out' : 'muted'}">${signed(v)}</span>
          <span class="bal-row__sub muted">pagou ${money(paid[m.uid] || 0)} · custo ${money(cost[m.uid] || 0)}</span>
        </div>`;
    })}</div>`);
}

// ---------- Lista ----------

export function drawExpenses() {
  drawBalances();
  const ids = memberIds();
  const me = session.uid;
  const list = sortExpenses(tripState.expenses);

  if (!list.length) {
    render('expenses-list', emptyState('Sem despesas. Regista a primeira e a app faz as contas por vocês.', icon('wallet', 28)));
    return;
  }

  const parts = [];
  let lastDay = null;
  list.forEach((e) => {
    const day = dayOf(e);
    if (day !== lastDay) {
      const dayTotal = list.filter((x) => dayOf(x) === day && !isSettlement(x)).reduce((s, x) => s + (Number(x.valor) || 0), 0);
      parts.push(html`<div class="date-sep"><span>${isoToShort(day)}</span>${dayTotal ? html`<span>${money(dayTotal)}</span>` : ''}</div>`);
      lastDay = day;
    }

    if (isSettlement(e)) {
      if (!e.valor) return;
      const to = (e.divididoPor || []).find((u) => u !== e.pagadorUid);
      parts.push(html`
        <div class="expense expense--settle">
          <span class="expense__icon">${icon('bolt', 18)}</span>
          <span class="expense__info"><span class="expense__title">${e.pagadorUid === me ? 'Pagaste' : `${memberName(e.pagadorUid)} pagou`} a ${to === me ? 'ti' : memberName(to)}</span>
          <span class="expense__sub">Acerto de contas</span></span>
          <span class="expense__right"><span class="expense__value">${money(e.valor)}</span></span>
          <button class="icon-btn icon-btn--subtle" data-action="expenses:delete" data-id="${e.id}" aria-label="Apagar">${icon('trash', 14)}</button>
        </div>`);
      return;
    }

    let right;
    if (!isGroup()) {
      right = html`<span class="expense__value">${money(e.valor)}</span>`;
    } else {
      const share = shareOf(e, me, ids);
      if (e.pagadorUid === me) {
        const lent = e.valor - share;
        right = lent > 0.009
          ? html`<span class="expense__tag is-in">emprestaste</span><span class="expense__value is-in">${money(lent)}</span>`
          : html`<span class="expense__tag">só tua</span><span class="expense__value muted">${money(e.valor)}</span>`;
      } else if (share > 0.009) {
        right = html`<span class="expense__tag is-out">deves</span><span class="expense__value is-out">${money(share)}</span>`;
      } else {
        right = html`<span class="expense__tag">não entras</span><span class="expense__value muted">${money(0)}</span>`;
      }
    }
    const foreign = e.moeda && e.moeda !== BASE ? ` · ${formatIn(e.valorOriginal, e.moeda)}` : '';
    const payer = e.pagadorUid === me ? 'Pagaste' : `${memberName(e.pagadorUid) || e.pagadorNome} pagou`;
    parts.push(html`
      <button class="expense pressable" data-action="expenses:edit" data-id="${e.id}">
        <span class="expense__icon">${icon(expenseCategory(e).icon, 18)}</span>
        <span class="expense__info">
          <span class="expense__title">${e.desc}</span>
          <span class="expense__sub">${isGroup() ? `${payer} ${money(e.valor)}` : expenseCategory(e).nome}${foreign}</span>
        </span>
        <span class="expense__right">${right}</span>
      </button>`);
  });
  render('expenses-list', parts, { stagger: true });
}

// ---------- Formulário ----------

const form = { mode: 'iguais', catTouched: false, prefill: null };

const currencyCode = () => byId('expense-currency').value;
const amount = () => parseFloat(byId('expense-value').value) || 0;
const rate = () => (currencyCode() === BASE ? 1 : parseFloat(byId('expense-rate').value) || 0);

function drawSplitRows() {
  const mode = form.mode;
  const pre = form.prefill || {};
  document.querySelectorAll('#expense-split-mode .seg-mini__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
  const suffix = mode === 'exatos' ? currencyCode() : mode === 'percentagem' ? '%' : '×';
  render('expense-participants', members().map((m) => {
    let value = '';
    if (pre.modoDivisao === mode) {
      if (mode === 'exatos') value = pre.quotasOriginais?.[m.uid] ?? pre.quotasExatas?.[m.uid] ?? '';
      if (mode === 'percentagem') value = pre.percentagens?.[m.uid] ?? '';
      if (mode === 'partes') value = pre.partes?.[m.uid] ?? '';
    } else if (mode === 'partes') value = 1;
    const checked = pre.modoDivisao === 'iguais' && pre.divididoPor?.length ? pre.divididoPor.includes(m.uid) : true;
    return html`
      <label class="split-row">
        ${mode === 'iguais' ? html`<input type="checkbox" class="split-check" value="${m.uid}" ${checked ? 'checked' : ''} data-change="expenses:recalc">` : ''}
        ${avatar(m.nome, m.avatarUrl, 'sm')}
        <span class="split-row__name">${m.uid === session.uid ? 'Tu' : m.nome}</span>
        ${mode === 'iguais'
          ? html`<span class="split-row__share muted" data-share="${m.uid}"></span>`
          : html`<span class="split-row__input"><input type="number" class="input input--small split-val" data-uid="${m.uid}" value="${value}" placeholder="0" step="${mode === 'partes' ? '1' : '0.01'}" min="0" inputmode="decimal" data-input="expenses:recalc"><span class="muted small">${suffix}</span></span>`}
      </label>`;
  }));
  updateHint();
}

function readSplit() {
  const vals = {};
  document.querySelectorAll('.split-val').forEach((i) => { const v = parseFloat(i.value) || 0; if (v > 0) vals[i.dataset.uid] = v; });
  const checked = [...document.querySelectorAll('.split-check:checked')].map((c) => c.value);
  return { vals, checked, sum: Object.values(vals).reduce((a, b) => a + b, 0) };
}

function updateHint() {
  const code = currencyCode();
  const total = amount();
  const r = rate();
  if (code !== BASE) setText('expense-eur', r && total ? `≈ ${money(toEur(total, r))}` : '');
  const { vals, checked, sum } = readSplit();
  let hint = '';
  let ok = true;
  if (form.mode === 'iguais') {
    const each = checked.length ? total / checked.length : 0;
    document.querySelectorAll('[data-share]').forEach((s) => { s.textContent = checked.includes(s.dataset.share) && total ? formatIn(each, code) : ''; });
    hint = checked.length ? `${checked.length} ${checked.length === 1 ? 'pessoa' : 'pessoas'}` : 'Escolhe pelo menos uma pessoa';
    ok = checked.length > 0;
  } else if (form.mode === 'exatos') {
    const left = Math.round((total - sum) * 100) / 100;
    ok = Math.abs(left) < 0.01;
    hint = ok ? 'Bate certo com o total' : left > 0 ? `Faltam ${formatIn(left, code)}` : `Passaste ${formatIn(-left, code)}`;
  } else if (form.mode === 'percentagem') {
    const left = Math.round((100 - sum) * 100) / 100;
    ok = Math.abs(left) < 0.01;
    hint = ok ? '100% atribuído' : left > 0 ? `Faltam ${left}%` : `Passaste ${-left}%`;
  } else {
    ok = sum > 0;
    hint = ok ? Object.entries(vals).map(([u, n]) => `${u === session.uid ? 'Tu' : memberName(u)} ${formatIn((total * n) / sum, code)}`).join(' · ') : 'Dá pelo menos uma parte a alguém';
  }
  const el = byId('split-hint');
  if (el) { el.textContent = hint; el.classList.toggle('is-bad', !ok); }
}

async function refreshRate({ force = false } = {}) {
  const code = currencyCode();
  show('expense-rate-row', code !== BASE);
  setText('expense-rate-code', code);
  if (code === BASE) return updateHint();
  const input = byId('expense-rate');
  if (input.value && !force) return updateHint();
  try {
    const r = await fetchRate(code, byId('expense-date').value);
    input.value = String(Math.round(r * 10000) / 10000);
  } catch {
    if (!input.value) toast('Sem ligação para obter a taxa de câmbio. Escreve-a à mão.', 'info', 3200);
  }
  updateHint();
}

function fillExpenseForm(e = null) {
  const trip = currentTrip();
  const today = todayISO();
  const defaultDay = trip?.dataInicio && today < trip.dataInicio ? trip.dataInicio : trip?.dataFim && today > trip.dataFim ? trip.dataFim : today;
  byId('expense-id').value = e?.id || '';
  byId('expense-desc').value = e?.desc || '';
  byId('expense-currency').value = e?.moeda || trip?.moeda || BASE;
  byId('expense-value').value = e ? (e.valorOriginal ?? e.valor) : '';
  byId('expense-rate').value = e?.taxa && e.moeda !== BASE ? e.taxa : '';
  byId('expense-date').value = e ? dayOf(e) : defaultDay;
  const cat = e ? expenseCategory(e).nome : 'Geral';
  byId('expense-cat').value = cat;
  render('expense-icon', icon(e ? expenseCategory(e).icon : 'coin', 20));
  form.catTouched = !!e;
  form.mode = e?.modoDivisao || 'iguais';
  form.prefill = e;
  render('expense-payer', members().map((m) => html`<option value="${m.uid}" ${(e?.pagadorUid || session.uid) === m.uid ? 'selected' : ''}>${m.uid === session.uid ? 'Mim' : m.nome}</option>`));
  show('expense-split-fields', isGroup());
  show('expense-delete', !!e);
  byId('modal-expense-title').textContent = e ? 'Editar despesa' : 'Nova despesa';
  drawSplitRows();
  refreshRate();
}

function buildSplit(valorEur, r) {
  const ids = memberIds();
  if (!isGroup()) return { modoDivisao: 'iguais', divididoPor: ids };
  const { vals, checked, sum } = readSplit();
  const total = amount();
  switch (form.mode) {
    case 'exatos': {
      if (Math.abs(sum - total) > 0.01) throw new Error(`Os valores somam ${formatIn(sum, currencyCode())}, mas a despesa é ${formatIn(total, currencyCode())}.`);
      const quotasExatas = {};
      Object.entries(vals).forEach(([u, v]) => { quotasExatas[u] = toEur(v, r); });
      // Acerta os cêntimos da conversão no primeiro participante, para a soma bater com o total.
      const diff = Math.round((valorEur - Object.values(quotasExatas).reduce((a, b) => a + b, 0)) * 100) / 100;
      const first = Object.keys(quotasExatas)[0];
      if (first && diff) quotasExatas[first] = Math.round((quotasExatas[first] + diff) * 100) / 100;
      return { modoDivisao: 'exatos', divididoPor: Object.keys(vals), quotasExatas, quotasOriginais: vals };
    }
    case 'percentagem':
      if (Math.abs(sum - 100) > 0.01) throw new Error(`As percentagens somam ${sum}%, têm de dar 100%.`);
      return { modoDivisao: 'percentagem', divididoPor: Object.keys(vals), percentagens: vals };
    case 'partes':
      if (sum <= 0) throw new Error('Dá pelo menos uma parte a alguém.');
      return { modoDivisao: 'partes', divididoPor: Object.keys(vals), partes: vals };
    default:
      if (!checked.length) throw new Error('Escolhe pelo menos uma pessoa.');
      return { modoDivisao: 'iguais', divididoPor: checked };
  }
}

async function addSettlement(from, to, valor) {
  await addDoc(tripCol(tripState.currentTripId, 'despesas'), {
    desc: `Acerto: ${memberName(from)} → ${memberName(to)}`,
    tipo: 'liquidacao',
    valor,
    pagadorUid: from,
    pagadorNome: memberName(from),
    divididoPor: [to],
    modoDivisao: 'exatos',
    quotasExatas: { [to]: valor },
    categoria: 'Liquidação',
    data: todayISO(),
    timestamp: Date.now(),
  });
}

function shareText() {
  const trip = currentTrip();
  const ids = memberIds();
  const all = tripState.expenses;
  const real = all.filter((e) => !isSettlement(e));
  const total = real.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const cost = costOf(all, ids, isSettlement);
  const lines = [`${trip?.nome || 'Viagem'}: contas`, `Total: ${money(total)}`, ''];
  members().forEach((m) => lines.push(`${m.nome}: custo ${money(cost[m.uid] || 0)}`));
  const transfers = simplifyDebts(netBalances(all, ids));
  lines.push('');
  if (transfers.length) {
    lines.push('Para acertar:');
    transfers.forEach((t) => lines.push(`• ${memberName(t.from)} paga ${money(t.valor)} a ${memberName(t.to)}`));
  } else lines.push('Está tudo acertado.');
  return lines.join('\n');
}

export const expensesActions = {
  'expenses:new': () => { fillExpenseForm(); openModal('modal-expense'); },
  'expenses:edit': ({ data }) => {
    const e = tripState.expenses.find((x) => x.id === data.id);
    if (!e) return;
    fillExpenseForm(e);
    openModal('modal-expense');
  },
  'expenses:desc': ({ value }) => {
    if (form.catTouched) return;
    const c = categoryFor(value);
    byId('expense-cat').value = c.nome;
    render('expense-icon', icon(c.icon, 20));
  },
  'expenses:cat': ({ value }) => {
    form.catTouched = true;
    render('expense-icon', icon(CATEGORIES.find((c) => c.nome === value)?.icon || 'coin', 20));
  },
  'expenses:currency': () => { drawSplitRows(); refreshRate({ force: true }); },
  'expenses:date': () => { if (currencyCode() !== BASE) refreshRate({ force: true }); },
  'expenses:recalc': () => updateHint(),
  'expenses:split-mode': ({ data }) => { form.mode = data.mode; drawSplitRows(); },
  'expenses:save': async ({ el }) => {
    const desc = byId('expense-desc').value.trim();
    const original = amount();
    if (!desc || original <= 0) return toast('Preenche a descrição e um valor válido.', 'error');
    const moeda = currencyCode();
    const r = rate();
    if (!r) return toast('Indica a taxa de câmbio.', 'error');
    const valor = toEur(original, r);
    let split;
    try { split = buildSplit(valor, r); } catch (err) { return toast(err.message, 'error', 3800); }
    const pagadorUid = isGroup() ? byId('expense-payer').value : session.uid;
    const payload = {
      desc,
      valor,
      moeda,
      valorOriginal: original,
      taxa: r,
      pagadorUid,
      pagadorNome: memberName(pagadorUid),
      quotasExatas: {},
      quotasOriginais: {},
      percentagens: {},
      partes: {},
      ...split,
      categoria: byId('expense-cat').value,
      data: byId('expense-date').value || todayISO(),
    };
    const id = byId('expense-id').value;
    const tripId = tripState.currentTripId;
    await withLoading(el, () => (id
      ? updateDoc(tripSubDoc(tripId, 'despesas', id), payload)
      : addDoc(tripCol(tripId, 'despesas'), { ...payload, timestamp: Date.now(), criadoPor: session.uid })));
    closeModal('modal-expense');
    toast(id ? 'Despesa atualizada' : 'Despesa adicionada');
  },
  'expenses:delete-current': async () => {
    const id = byId('expense-id').value;
    if (!id) return;
    if (await confirmDialog('A despesa é removida e os saldos recalculados.', { title: 'Apagar despesa?', confirmLabel: 'Apagar', danger: true })) {
      await closeModal('modal-expense');
      await deleteDoc(tripSubDoc(tripState.currentTripId, 'despesas', id));
    }
  },
  'expenses:delete': async ({ data }) => {
    if (await confirmDialog('O acerto é removido e os saldos recalculados.', { title: 'Apagar acerto?', confirmLabel: 'Apagar', danger: true })) {
      await deleteDoc(tripSubDoc(tripState.currentTripId, 'despesas', data.id));
    }
  },
  'expenses:settle': async ({ data }) => {
    const { from, to } = data;
    const suggested = parseFloat(data.valor);
    const who = from === session.uid ? 'Pagaste' : `${memberName(from)} pagou`;
    const v = await promptDialog(`${who} a ${to === session.uid ? 'ti' : memberName(to)}. Confirma o valor:`, {
      title: 'Registar pagamento', value: suggested.toFixed(2), type: 'number', confirmLabel: 'Registar',
    });
    if (v === null) return;
    const valor = Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100) / 100;
    if (valor <= 0) return toast('Valor inválido.', 'error');
    await addSettlement(from, to, valor);
    toast('Pagamento registado');
  },
  'expenses:share': async () => {
    const text = shareText();
    try {
      if (navigator.share) await navigator.share({ title: currentTrip()?.nome || 'Contas da viagem', text });
      else { await navigator.clipboard.writeText(text); toast('Resumo copiado'); }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(text); toast('Resumo copiado'); } catch { toast('Não foi possível partilhar.', 'error'); }
      }
    }
  },
};
