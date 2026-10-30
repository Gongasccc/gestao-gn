// O nosso casal: criar o espaço partilhado, convidar o parceiro(a) com um código e ver o resumo da relação.
import { html, byId, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { session, emit, on, createScope } from '../core/state.js';
import { toast, confirmDialog, withLoading, promptDialog } from '../core/ui.js';
import { isoToShort } from '../core/format.js';
import { daysUntil, parseISODate, nextYearly } from '../core/dates.js';
import { updateDoc } from '../services/firebase.js';
import { householdDoc } from '../services/paths.js';
import {
  createHousehold, joinHousehold, newInviteCode, renameHousehold, leaveHousehold, loadHousehold,
} from '../services/household.js';
import { avatar } from '../components/avatar.js';

const scope = createScope();

async function reload() {
  await loadHousehold(session.profile);
  emit('household:changed');
  draw();
}

function setupTpl() {
  return html`
    <div class="card glass couple-hero couple-hero--empty">
      <span class="couple-hero__icon">${icon('heart', 34)}</span>
      <h2 class="couple-hero__title">Juntem as vossas contas</h2>
      <p class="muted">Com um casal criado, as tarefas, listas de compras, receitas, documentos, garagem, finanças e calendário passam a ser partilhados pelos dois em tempo real.</p>
    </div>
    <div class="card glass">
      <h3 class="card__title">${icon('plus', 18)} Criar o nosso casal</h3>
      <div class="field"><label class="field__label" for="couple-name">Nome</label>
        <input id="couple-name" class="input" placeholder="ex: G&amp;N" value="G&N"></div>
      <button class="btn btn--primary btn--block pressable" data-action="couple:create">Criar e obter código de convite</button>
    </div>
    <div class="card glass">
      <h3 class="card__title">${icon('userPlus', 18)} Já tenho um código</h3>
      <div class="input-row">
        <input id="couple-code" class="input input--code" placeholder="ABC123" maxlength="8" autocapitalize="characters" data-enter="couple:join">
        <button class="btn btn--primary pressable" data-action="couple:join">Entrar</button>
      </div>
    </div>`;
}

function togetherTpl(h) {
  if (!h.desde) {
    return html`<button class="btn btn--glass btn--block pressable" data-action="couple:since">${icon('calendar', 16)} Desde quando estão juntos?</button>`;
  }
  const days = -daysUntil(parseISODate(h.desde));
  const next = nextYearly(h.desde);
  const toNext = daysUntil(next.date);
  return html`
    <div class="stat-grid stat-grid--3">
      <div class="stat glass-soft"><span class="stat__num">${days.toLocaleString('pt-PT')}</span><span class="stat__label">dias juntos</span></div>
      <div class="stat glass-soft"><span class="stat__num">${Math.floor(days / 365.25)}</span><span class="stat__label">anos</span></div>
      <div class="stat glass-soft pressable" data-action="couple:since"><span class="stat__num">${toNext}</span><span class="stat__label">dias até aos ${next.years} anos</span></div>
    </div>
    <p class="muted small center">Juntos desde ${isoToShort(h.desde)}</p>`;
}

function householdTpl(h) {
  const alone = session.members.length < 2;
  return html`
    <div class="card glass couple-hero">
      <div class="couple-hero__avatars">
        ${session.members.map((m) => avatar(m.name, m.avatar, 'lg'))}
        ${alone ? html`<span class="avatar avatar--lg avatar--ghost">?</span>` : ''}
        <span class="couple-hero__heart">${icon('heart', 18)}</span>
      </div>
      <h2 class="couple-hero__title pressable" data-action="couple:rename">${h.name || 'O nosso casal'} ${icon('edit', 14)}</h2>
      <p class="muted">${session.members.map((m) => m.name.split(' ')[0]).join(' & ')}</p>
    </div>
    ${alone ? html`
      <div class="card glass invite-card">
        <h3 class="card__title">${icon('userPlus', 18)} Convidar o teu parceiro(a)</h3>
        <p class="muted small">No telemóvel dele(a): criar conta, abrir "O nosso casal" e escrever este código.</p>
        <div class="invite-code" id="couple-invite">${h.inviteCode || '------'}</div>
        <div class="btn-row">
          <button class="btn btn--glass pressable" data-action="couple:new-code">${icon('bolt', 16)} Novo código</button>
          <button class="btn btn--primary pressable" data-action="couple:share">${icon('external', 16)} Partilhar</button>
        </div>
      </div>` : ''}
    <div class="card glass">${togetherTpl(h)}</div>
    <button class="btn btn--danger-soft btn--block pressable" data-action="couple:leave">${icon('logout', 16)} Sair do casal</button>`;
}

function draw() {
  render('couple-body', session.household ? householdTpl(session.household) : setupTpl(), { stagger: true });
}

export default {
  id: 'couple',
  pages: [{
    id: 'menu-casal',
    title: 'O nosso casal',
    root: true,
    template: () => html`<div id="couple-body"></div>`,
    onEnter: draw,
  }],
  actions: {
    'couple:create': async ({ el }) => {
      await withLoading(el, () => createHousehold(byId('couple-name').value.trim()));
      toast('Casal criado! Partilha o código com o teu parceiro(a).');
      await reload();
    },
    'couple:join': async ({ el }) => {
      const btn = el.tagName === 'BUTTON' ? el : null;
      try {
        await withLoading(btn, () => joinHousehold(byId('couple-code').value));
      } catch (err) {
        return toast(err.message || 'Não foi possível entrar.', 'error', 3500);
      }
      toast('Bem-vindo(a) ao casal!');
      await reload();
    },
    'couple:new-code': async () => {
      const code = await newInviteCode();
      session.household.inviteCode = code;
      draw();
    },
    'couple:share': async () => {
      const code = session.household?.inviteCode;
      const text = `Junta-te a mim na Gestão G&N! Abre "O nosso casal" e usa o código ${code}`;
      if (navigator.share) {
        try { await navigator.share({ text, url: location.href.split('#')[0] }); } catch { /* cancelado */ }
      } else {
        await navigator.clipboard?.writeText(code);
        toast('Código copiado');
      }
    },
    'couple:rename': async () => {
      const name = await promptDialog('Nome do casal', { value: session.household?.name || '' });
      if (!name?.trim()) return;
      await renameHousehold(name.trim());
      session.household.name = name.trim();
      draw();
    },
    'couple:since': async () => {
      const v = await promptDialog('Desde quando estão juntos?', { type: 'date', value: session.household?.desde || '' });
      if (!v) return;
      await updateDoc(householdDoc(), { desde: v.trim() });
      session.household.desde = v.trim();
      draw();
    },
    'couple:leave': async () => {
      const ok = await confirmDialog('Deixas de ver os dados partilhados. Os dados do casal ficam guardados para o teu parceiro(a).', { title: 'Sair do casal?', confirmLabel: 'Sair', danger: true });
      if (!ok) return;
      await leaveHousehold();
      session.profile.householdId = null;
      await reload();
    },
  },
  start() {
    scope.add(on('household:update', () => { if (byId('menu-casal')?.classList.contains('is-active')) draw(); }));
  },
  stop() { scope.clear(); },
};
