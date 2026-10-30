// Início: saudação, próximos avisos e tarefas de hoje.
import { html, setText, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, on } from '../core/state.js';
import { money, todayISO, daysBetween } from '../core/format.js';
import { daysUntil, countdownLabel, parseISODate } from '../core/dates.js';
import { checklistTpl, subscribeChecklist } from '../components/checklist.js';
import finances, { pendingBills } from './finances.js';
import { garageAlerts } from './garage.js';
import { tripState } from './trips/store.js';

const scope = createScope();

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Boa noite';
  if (h < 13) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

const drawGreeting = () => setText('dash-greeting', `${greeting()}${session.name ? `, ${session.name.split(' ')[0]}` : ''}`);

/** Junta os avisos de todos os módulos numa lista ordenada por data. */
function collectUpcoming() {
  const items = [...garageAlerts()];
  const today = new Date();
  pendingBills(finances.bills.items()).forEach((b) => {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const due = new Date(today.getFullYear(), today.getMonth(), Math.min(Number(b.dia) || 1, last));
    const days = daysUntil(due);
    if (days <= 5) items.push({ date: due, days, title: `Pagar ${b.nome}${b.valor ? ` (${money(b.valor)})` : ''}`, icon: 'bolt', page: 'menu-financas' });
  });
  const next = tripState.trips.filter((t) => t.dataInicio && t.dataInicio >= todayISO()).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0];
  if (next) {
    const days = daysBetween(todayISO(), next.dataInicio);
    if (days <= 60) items.push({ date: parseISODate(next.dataInicio), days, title: `Viagem: ${next.nome || next.destino || 'próxima viagem'}`, icon: 'map', page: 'menu-viagens' });
  }
  return items.sort((a, b) => a.days - b.days).slice(0, 8);
}

function drawUpcoming() {
  const items = collectUpcoming();
  const card = document.getElementById('dash-upcoming-card');
  if (card) card.hidden = !items.length;
  render('dash-upcoming', html`
      ${items.map((i) => html`
        <button class="upcoming pressable ${i.days < 0 ? 'is-late' : i.days === 0 ? 'is-today' : ''}" data-action="nav:go" data-page="${i.page}">
          <span class="upcoming__icon">${icon(i.icon, 16)}</span>
          <span class="upcoming__title">${i.title}</span>
          <span class="upcoming__when">${i.days < 0 ? 'Atrasado' : countdownLabel(i.days)}</span>
        </button>`)}`);
  remindOncePerDay(items);
}

let upcomingTimer = null;
const scheduleUpcoming = () => { clearTimeout(upcomingTimer); upcomingTimer = setTimeout(drawUpcoming, 150); };

/** Notificação local (uma vez por dia) com o que vence hoje ou amanhã. */
function remindOncePerDay(items) {
  if (!session.profile?.allowNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  const due = items.filter((i) => i.days <= 1);
  if (!due.length) return;
  const key = `gn-reminder-${session.uid}-${todayISO()}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { return; }
  const body = due.map((i) => `• ${i.title} (${i.days < 0 ? 'atrasado' : countdownLabel(i.days).toLowerCase()})`).join('\n');
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification('Gestão G&N', { body, icon: 'assets/brand/logopreto_fundobranco.png', tag: 'daily' }))
    .catch(() => { try { new Notification('Gestão G&N', { body }); } catch { /* sem suporte */ } });
}

function drawCouple() {
  const h = session.household;
  if (!h) {
    render('dash-couple', html`
      <button class="card glass couple-banner pressable" data-action="nav:go" data-page="menu-casal">
        <span class="couple-banner__icon">${icon('heart', 22)}</span>
        <span><strong>Liga a tua conta à do teu parceiro(a)</strong><br><span class="muted small">Partilhem tarefas, compras e finanças.</span></span>
        ${icon('chevronRight', 18)}
      </button>`);
    return;
  }
  const days = h.desde ? -daysUntil(parseISODate(h.desde)) : null;
  render('dash-couple', days != null ? html`
    <button class="couple-strip pressable" data-action="nav:go" data-page="menu-casal">
      ${icon('heart', 14)} <span>${days.toLocaleString('pt-PT')} dias juntos</span>
    </button>` : '');
}

export default {
  id: 'dashboard',
  pages: [{
    id: 'menu-principal',
    title: 'Início',
    root: true,
    onEnter: () => { drawGreeting(); drawCouple(); drawUpcoming(); },
    template: () => html`
      <p class="greeting" id="dash-greeting"></p>
      <div id="dash-couple"></div>
      <div class="card glass">
        <h3 class="card__title">A fazer</h3>
        ${checklistTpl('tarefas', 'Nova tarefa…')}
      </div>
      <div class="card glass" id="dash-upcoming-card" hidden>
        <h3 class="card__title">Próximos dias</h3>
        <div class="list" id="dash-upcoming"></div>
      </div>`,
  }],
  start() {
    drawGreeting();
    subscribeChecklist(scope, 'tarefas');
    drawCouple();
    scope.add(on('records:update', scheduleUpcoming));
    scope.add(on('household:update', drawCouple));
    scope.add(() => clearTimeout(upcomingTimer));
  },
  stop() {
    scope.clear();
  },
};
