// Viagens partilhadas: lista, criação, detalhe (resumo / planeamento / despesas) e edição.
import { html, render, byId, emptyState, setText, countUp } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { createScope, session, on } from '../../core/state.js';
import { navigate, back, currentPage, refreshHeader } from '../../core/router.js';
import { toast, confirmDialog, withLoading, showImage } from '../../core/ui.js';
import { compressImage, takeFile } from '../../core/images.js';
import { dateRange, daysBetween, todayISO, money, plural } from '../../core/format.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot, query, where } from '../../services/firebase.js';
import { tripsCol, tripDoc, tripCol, snapToList } from '../../services/paths.js';
import { notifyUser } from '../../services/notifications.js';
import { avatar } from '../../components/avatar.js';
import { tabsTpl, selectTab, positionIndicator } from '../../components/tabs.js';
import { photoPickerTpl, getPhoto, clearPhoto } from '../../components/photo-picker.js';
import { tripState, currentTrip, members, categoryFor, isSettlement, FALLBACK_COVER } from './store.js';
import { paidBy } from './balances.js';
import { drawDailyLine, drawCategoryDonut } from './charts.js';
import { timelineTabTpl, drawTimeline, timelineModalTpl, timelineActions } from './timeline.js';
import { expensesTabTpl, drawExpenses, expensesModalsTpl, expensesActions } from './expenses.js';

const scope = createScope();
const detailScope = createScope();

function countdownLabel(trip) {
  const today = todayISO();
  if (!trip.dataInicio) return '';
  if (trip.dataInicio > today) {
    const n = daysBetween(today, trip.dataInicio);
    return n === 1 ? 'Amanhã' : `Faltam ${n} dias`;
  }
  if (!trip.dataFim || trip.dataFim >= today) return 'A decorrer';
  return '';
}

function avatarsStack(list, max = 4) {
  return html`<span class="avatar-stack">${list.slice(0, max).map((m) => avatar(m.nome, m.avatarUrl, 'xs'))}${list.length > max ? html`<span class="avatar avatar--xs avatar--more">+${list.length - max}</span>` : ''}</span>`;
}

function drawTripsList() {
  const trips = [...tripState.trips].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  countUp('stat-trips', trips.length);
  const today = todayISO();
  const next = trips.filter((t) => t.dataInicio && t.dataInicio >= today).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0];
  setText('stat-next-trip', next ? next.nome : '—');

  render('trips-list', trips.length
    ? trips.map((t) => {
      const badge = countdownLabel(t);
      return html`
        <article class="media-card glass pressable" data-action="trips:open" data-id="${t.id}">
          <img class="media-card__img" src="${t.capa || FALLBACK_COVER}" alt="" loading="lazy">
          ${badge ? html`<span class="media-card__badge glass-chip">${badge}</span>` : ''}
          <div class="media-card__overlay">
            <div>
              <h3 class="media-card__title">${t.nome || 'Sem título'}</h3>
              <span class="media-card__sub">${icon('pin', 12)} ${t.paisCode || '—'} · ${dateRange(t.dataInicio, t.dataFim)}</span>
            </div>
            ${(t.membros_info?.length || 0) > 1 ? avatarsStack(t.membros_info) : ''}
          </div>
        </article>`;
    })
    : emptyState('Ainda não há viagens. Que tal planear a próxima aventura?', icon('map', 32)),
  { stagger: true });
}

function drawHero() {
  const t = currentTrip();
  if (!t) return;
  const img = byId('trip-hero-img');
  if (img && img.getAttribute('src') !== (t.capa || FALLBACK_COVER)) img.src = t.capa || FALLBACK_COVER;
  setText('trip-hero-title', t.nome);
  render('trip-hero-meta', html`
    <span class="glass-chip">${icon('calendar', 12)} ${dateRange(t.dataInicio, t.dataFim)}</span>
    <span class="glass-chip">${icon('pin', 12)} ${t.paisCode || '—'}</span>
    ${avatarsStack(members())}`);
  const notes = byId('trip-notes');
  if (notes && document.activeElement !== notes) notes.value = t.notasGerais || '';
}

function drawSummary() {
  const t = currentTrip();
  if (!t) return;
  const real = tripState.expenses.filter((e) => !isSettlement(e));
  const total = real.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const days = t.dataInicio && t.dataFim ? daysBetween(t.dataInicio, t.dataFim) + 1 : null;

  setText('sum-days', days ? plural(days, 'dia', 'dias') : '—');
  setText('sum-places', plural(tripState.timeline.length, 'sítio', 'sítios'));
  countUp('sum-total', total, { format: money });
  setText('sum-per-day', days ? money(total / days) : '—');

  const paid = paidBy(real, members());
  render('sum-paid', members().map((m) => html`
    <div class="kv"><span class="kv__k">${avatar(m.nome, m.avatarUrl, 'xs')} ${m.nome}</span><span class="kv__v">${money(paid[m.uid] || 0)}</span></div>`));
}

function drawCharts() {
  const real = tripState.expenses.filter((e) => !isSettlement(e));
  const line = byId('chart-daily');
  const donut = byId('chart-categories');
  if (line?.offsetParent) drawDailyLine(line, real);
  if (donut?.offsetParent) drawCategoryDonut(donut, real, categoryFor);
}

function drawEdit() {
  const t = currentTrip();
  if (!t) return;
  byId('edit-trip-name').value = t.nome || '';
  byId('edit-trip-dest').value = t.paisCode || '';
  byId('edit-trip-start').value = t.dataInicio || '';
  byId('edit-trip-end').value = t.dataFim || '';
  const owner = t.dono;
  render('edit-trip-members', members().map((m) => {
    const canRemove = m.uid !== owner && (session.uid === owner || m.uid === session.uid);
    return html`
      <div class="user-row glass-soft">
        ${avatar(m.nome, m.avatarUrl, 'md')}
        <span class="user-row__name">${m.nome} ${m.uid === owner ? html`<span class="chip chip--accent">Criador</span>` : ''}</span>
        ${canRemove ? html`<button class="icon-btn icon-btn--subtle" data-action="trips:remove-member" data-uid="${m.uid}" aria-label="Remover">${icon('trash', 16)}</button>` : ''}
      </div>`;
  }));
  const available = tripState.friends.filter((f) => !(t.membros_uids || []).includes(f.uid));
  render('edit-trip-invite', available.length
    ? html`<select id="invite-friend" class="input">${available.map((f) => html`<option value="${f.uid}">${f.name}</option>`)}</select>
           <button class="btn btn--primary pressable" data-action="trips:invite">${icon('userPlus', 16)} Convidar</button>`
    : html`<p class="muted small">Todos os teus amigos já estão nesta viagem.</p>`);
}

function refreshDetail() {
  drawHero();
  drawSummary();
  drawTimeline();
  drawExpenses();
  drawCharts();
}

function resetNewTripForm() {
  ['new-trip-name', 'new-trip-dest', 'new-trip-start', 'new-trip-end'].forEach((id) => { byId(id).value = ''; });
  clearPhoto('new-trip-cover');
}

export default {
  id: 'trips',
  pages: [
    {
      id: 'menu-viagens',
      title: 'Viagens',
      root: true,
      template: () => html`
        <div class="stat-grid">
          <div class="stat glass"><span class="stat__num" id="stat-trips">0</span><span class="stat__label">Viagens</span></div>
          <div class="stat glass"><span class="stat__num stat__num--text" id="stat-next-trip">—</span><span class="stat__label">Próxima aventura</span></div>
        </div>
        <button class="btn btn--primary btn--block pressable" data-action="nav:go" data-page="menu-nova-viagem">${icon('plus', 18)} Nova viagem</button>
        <div class="card-stack" id="trips-list"></div>`,
    },
    {
      id: 'menu-nova-viagem',
      title: 'Nova Viagem',
      template: () => html`
        ${photoPickerTpl('new-trip-cover', 'Capa da viagem', { tall: true, maxSize: 1400 })}
        <div class="field"><label class="field__label" for="new-trip-name">Título</label><input type="text" id="new-trip-name" class="input" placeholder="ex: Férias de verão"></div>
        <div class="field"><label class="field__label" for="new-trip-dest">Destino</label><input type="text" id="new-trip-dest" class="input" placeholder="ex: Paris, França"></div>
        <div class="field-row">
          <div class="field"><label class="field__label" for="new-trip-start">Início</label><input type="date" id="new-trip-start" class="input"></div>
          <div class="field"><label class="field__label" for="new-trip-end">Fim</label><input type="date" id="new-trip-end" class="input"></div>
        </div>
        <button class="btn btn--primary btn--block pressable" data-action="trips:create">Guardar viagem</button>`,
    },
    {
      id: 'page-viagem-detalhe',
      title: () => currentTrip()?.nome || 'Viagem',
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="nav:go" data-page="page-detalhes-viagem-edit" aria-label="Definições da viagem">${icon('settings', 18)}</button>`,
      template: () => html`
        <div class="hero glass" data-action="trips:cover">
          <img id="trip-hero-img" class="hero__img" alt="">
          <div class="hero__overlay">
            <h2 class="hero__title" id="trip-hero-title"></h2>
            <div class="hero__meta" id="trip-hero-meta"></div>
          </div>
        </div>
        ${tabsTpl('trip', [{ id: 'resumo', label: 'Resumo' }, { id: 'planeador', label: 'Planeamento' }, { id: 'despesas', label: 'Despesas' }])}
        <section data-tab-panel="trip:resumo">
          <div class="stat-grid stat-grid--3">
            <div class="stat glass"><span class="stat__num" id="sum-days">—</span><span class="stat__label">Duração</span></div>
            <div class="stat glass"><span class="stat__num" id="sum-places">0</span><span class="stat__label">Planeado</span></div>
            <div class="stat glass"><span class="stat__num" id="sum-per-day">—</span><span class="stat__label">Por dia</span></div>
          </div>
          <div class="card glass">
            <div class="total-line"><span class="eyebrow">Total gasto</span><span class="total-line__value" id="sum-total">0,00 €</span></div>
            <div id="sum-paid"></div>
          </div>
          <div class="card glass">
            <h3 class="card__title">${icon('edit', 16)} Notas da viagem</h3>
            <textarea id="trip-notes" class="input textarea" placeholder="Detalhes importantes, reservas, códigos…" data-change="trips:notes"></textarea>
          </div>
          <div class="card glass chart-card"><h3 class="card__title">Gastos diários</h3><canvas id="chart-daily"></canvas></div>
          <div class="card glass chart-card"><h3 class="card__title">Por categoria</h3><canvas id="chart-categories"></canvas></div>
        </section>
        <section data-tab-panel="trip:planeador" hidden>${timelineTabTpl()}</section>
        <section data-tab-panel="trip:despesas" hidden>${expensesTabTpl()}</section>`,
      onEnter: () => {
        refreshDetail();
        requestAnimationFrame(() => positionIndicator(document.querySelector('[data-tabs="trip"]')));
      },
    },
    {
      id: 'page-detalhes-viagem-edit',
      title: 'Detalhes da Viagem',
      template: () => html`
        <label class="btn btn--glass btn--block pressable">${icon('camera', 16)} Alterar capa
          <input type="file" accept="image/*" hidden data-change="trips:change-cover">
        </label>
        <div class="field"><label class="field__label" for="edit-trip-name">Título</label><input type="text" id="edit-trip-name" class="input"></div>
        <div class="field"><label class="field__label" for="edit-trip-dest">Destino</label><input type="text" id="edit-trip-dest" class="input"></div>
        <div class="field-row">
          <div class="field"><label class="field__label" for="edit-trip-start">Início</label><input type="date" id="edit-trip-start" class="input"></div>
          <div class="field"><label class="field__label" for="edit-trip-end">Fim</label><input type="date" id="edit-trip-end" class="input"></div>
        </div>
        <h3 class="section-title">Pessoas nesta viagem</h3>
        <div class="list" id="edit-trip-members"></div>
        <h3 class="section-title">Convidar amigo</h3>
        <div class="input-row" id="edit-trip-invite"></div>
        <button class="btn btn--primary btn--block pressable" data-action="trips:save-edit">Guardar alterações</button>
        <button class="btn btn--danger-soft btn--block pressable" data-action="trips:delete">${icon('trash', 16)} Apagar viagem</button>`,
      onEnter: drawEdit,
    },
  ],
  modals: () => html`${timelineModalTpl()}${expensesModalsTpl()}`,
  actions: {
    ...timelineActions,
    ...expensesActions,
    'trips:create': async ({ el }) => {
      const nome = byId('new-trip-name').value.trim();
      const destino = byId('new-trip-dest').value.trim();
      const dataInicio = byId('new-trip-start').value;
      const dataFim = byId('new-trip-end').value;
      if (!nome || !destino) return toast('Preenche o título e o destino.', 'error');
      if (dataInicio && dataFim && dataFim < dataInicio) return toast('A data de fim é anterior ao início.', 'error');
      await withLoading(el, () => addDoc(tripsCol(), {
        nome,
        paisCode: destino,
        dataInicio,
        dataFim,
        capa: getPhoto('new-trip-cover'),
        timestamp: Date.now(),
        membros_uids: [session.uid],
        membros_info: [{ uid: session.uid, nome: session.name || 'Eu', avatarUrl: session.avatar || '' }],
        dono: session.uid,
      }));
      resetNewTripForm();
      toast('Viagem criada');
      navigate('menu-viagens');
    },
    'trips:open': ({ data }) => {
      tripState.currentTripId = data.id;
      tripState.expenses = [];
      tripState.timeline = [];
      detailScope.clear();
      detailScope.add(onSnapshot(tripCol(data.id, 'despesas'), (s) => {
        tripState.expenses = snapToList(s);
        drawExpenses();
        drawSummary();
        drawCharts();
      }));
      detailScope.add(onSnapshot(tripCol(data.id, 'timeline'), (s) => {
        tripState.timeline = snapToList(s);
        drawTimeline();
        drawSummary();
      }));
      selectTab('trip', 'resumo');
      navigate('page-viagem-detalhe');
    },
    'trips:cover': () => showImage(currentTrip()?.capa || FALLBACK_COVER),
    'trips:notes': async ({ value }) => {
      await updateDoc(tripDoc(tripState.currentTripId), { notasGerais: value });
      toast('Notas guardadas');
    },
    'trips:change-cover': async ({ ev }) => {
      const file = takeFile(ev);
      if (!file) return;
      const capa = await compressImage(file, { maxSize: 1400 });
      await updateDoc(tripDoc(tripState.currentTripId), { capa });
      toast('Capa atualizada');
    },
    'trips:save-edit': async ({ el }) => {
      const nome = byId('edit-trip-name').value.trim();
      if (!nome) return toast('Indica um título válido.', 'error');
      const dataInicio = byId('edit-trip-start').value;
      const dataFim = byId('edit-trip-end').value;
      if (dataInicio && dataFim && dataFim < dataInicio) return toast('A data de fim é anterior ao início.', 'error');
      await withLoading(el, () => updateDoc(tripDoc(tripState.currentTripId), {
        nome, paisCode: byId('edit-trip-dest').value.trim(), dataInicio, dataFim,
      }));
      toast('Viagem atualizada');
      back();
    },
    'trips:invite': async () => {
      const t = currentTrip();
      const uid = byId('invite-friend')?.value;
      const friend = tripState.friends.find((f) => f.uid === uid);
      if (!t || !friend) return;
      await updateDoc(tripDoc(t.id), {
        membros_uids: [...t.membros_uids, uid],
        membros_info: [...t.membros_info, { uid, nome: friend.name, avatarUrl: friend.avatarUrl || '' }],
      });
      await notifyUser(uid, `${session.name} adicionou-te à viagem "${t.nome}".`);
      toast(`${friend.name} foi adicionado à viagem`);
    },
    'trips:remove-member': async ({ data }) => {
      const t = currentTrip();
      if (!t) return;
      const self = data.uid === session.uid;
      const ok = await confirmDialog(self ? 'Deixas de ter acesso a esta viagem.' : 'Esta pessoa deixa de ter acesso à viagem.', { title: self ? 'Sair da viagem?' : 'Remover pessoa?', confirmLabel: 'Remover', danger: true });
      if (!ok) return;
      await updateDoc(tripDoc(t.id), {
        membros_uids: t.membros_uids.filter((u) => u !== data.uid),
        membros_info: t.membros_info.filter((m) => m.uid !== data.uid),
      });
      if (self) navigate('menu-viagens');
    },
    'trips:delete': async () => {
      const ok = await confirmDialog('A viagem, o planeamento e as despesas deixam de estar disponíveis para todos os membros.', { title: 'Apagar viagem?', confirmLabel: 'Apagar', danger: true });
      if (!ok) return;
      const id = tripState.currentTripId;
      detailScope.clear();
      navigate('menu-viagens');
      await deleteDoc(tripDoc(id));
    },
  },
  start() {
    scope.add(on('friends:changed', (list) => {
      tripState.friends = list;
      if (currentPage() === 'page-detalhes-viagem-edit') drawEdit();
    }));
    scope.add(on('tabs:trip', (tab) => { if (tab === 'resumo') requestAnimationFrame(drawCharts); }));
    const q = query(tripsCol(), where('membros_uids', 'array-contains', session.uid));
    scope.add(onSnapshot(q, (s) => {
      tripState.trips = snapToList(s);
      drawTripsList();
      if (tripState.currentTripId) {
        if (!currentTrip()) {
          // A viagem foi apagada ou deixei de ser membro.
          detailScope.clear();
          tripState.currentTripId = null;
          if (['page-viagem-detalhe', 'page-detalhes-viagem-edit'].includes(currentPage())) navigate('menu-viagens');
          return;
        }
        drawHero();
        drawSummary();
        refreshHeader();
        if (currentPage() === 'page-detalhes-viagem-edit') drawEdit();
      }
    }, (err) => {
      console.error('[trips]', err);
      toast('Erro ao obter viagens.', 'error');
    }));
  },
  stop() {
    scope.clear();
    detailScope.clear();
    Object.assign(tripState, { trips: [], currentTripId: null, expenses: [], timeline: [], friends: [] });
  },
};
