// Início: grelha modular (bento) com o casal, as tarefas de hoje, a casa & refeições e lembretes rápidos.
import { html, render, byId } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, on } from '../core/state.js';
import { money, todayISO, daysBetween } from '../core/format.js';
import { daysUntil, countdownLabel, parseISODate } from '../core/dates.js';
import { avatar } from '../components/avatar.js';
import { tasksTpl, pendingTasks } from '../components/tasks.js';
import { onSnapshot, getDoc } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../services/paths.js';
import finances, { pendingBills } from './finances.js';
import { garageAlerts } from './garage.js';
import { farmaciaAlertas } from './farmacia/index.js';
import { tripState } from './trips/store.js';

const scope = createScope();
let jantar = null;
let compras = [];
const fotosReceitas = new Map();

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Boa noite';
  if (h < 13) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

const hojeLongo = () => {
  const t = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// ---------- Cartão do casal ----------

function resumoDia() {
  const n = pendingTasks();
  const partes = [n ? `${n} tarefa${n === 1 ? '' : 's'} por fazer` : 'Nenhuma tarefa por fazer'];
  partes.push(jantar ? `jantar: ${jantar.texto}` : 'o jantar ainda não está planeado');
  return `${partes.join(' e ')}.`;
}

function drawCouple() {
  const primeiro = session.name ? session.name.split(' ')[0] : '';
  const eu = { name: session.name, avatar: session.avatar };
  const outro = session.members.find((m) => m.uid !== session.uid);
  const h = session.household;
  const dias = h?.desde ? -daysUntil(parseISODate(h.desde)) : null;

  render('dash-couple', html`
    <div class="dash-hero__text">
      <span class="dash-hero__date">${hojeLongo()}</span>
      <h2 class="dash-hero__title">${greeting()}${primeiro ? `, ${primeiro}` : ''}</h2>
      <p class="dash-hero__sub" id="dash-resumo">${resumoDia()}</p>
    </div>
    <div class="dash-pair">
      <div class="dash-pair__avatars">
        ${avatar(eu.name, eu.avatar, 'lg')}
        <span class="dash-pair__link ${outro ? 'is-linked' : ''}">${icon(outro ? 'heart' : 'plus', 14)}</span>
        ${outro ? avatar(outro.name, outro.avatar, 'lg') : html`<span class="avatar avatar--lg dash-pair__empty">${icon('userPlus', 20)}</span>`}
      </div>
      ${outro
        ? html`<button class="dash-pair__status pressable" data-action="nav:go" data-page="menu-casal">${dias != null && dias >= 0 ? `${dias.toLocaleString('pt-PT')} dias juntos` : 'Ligados como casal'}</button>`
        : html`<button class="btn btn--small btn--primary pressable" data-action="nav:go" data-page="menu-casal">Convidar parceiro(a)</button>`}
    </div>`);
}

const drawResumo = () => { const el = byId('dash-resumo'); if (el) el.textContent = resumoDia(); };

// ---------- Lembretes rápidos (Farmácia, Garagem, contas e viagens) ----------

function collectReminders() {
  const items = [];
  farmaciaAlertas().forEach((a) => items.push({ ...a, peso: a.ordem === 0 ? -1 : 0 }));
  garageAlerts().forEach((g) => {
    const [tipo, carro] = g.title.split(' · ');
    items.push({ fonte: 'Garagem', icon: g.icon === 'car' ? (/seguro/i.test(tipo) ? 'shield' : 'car') : g.icon, tom: 'amber', titulo: carro ? `${tipo} do ${carro}` : g.title, quando: g.days < 0 ? 'Em atraso' : countdownLabel(g.days), peso: g.days, page: g.page });
  });
  const today = new Date();
  pendingBills(finances.bills.items()).forEach((b) => {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const due = new Date(today.getFullYear(), today.getMonth(), Math.min(Number(b.dia) || 1, last));
    const days = daysUntil(due);
    if (days <= 5) items.push({ fonte: 'Finanças', icon: 'bolt', tom: 'sky', titulo: `Pagar ${b.nome}${b.valor ? ` (${money(b.valor)})` : ''}`, quando: days < 0 ? 'Em atraso' : countdownLabel(days), peso: days, page: 'menu-financas' });
  });
  const next = tripState.trips.filter((t) => t.dataInicio && t.dataInicio >= todayISO()).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0];
  if (next) {
    const days = daysBetween(todayISO(), next.dataInicio);
    if (days <= 30) items.push({ fonte: 'Viagens', icon: 'map', tom: 'sky', titulo: next.nome || next.destino || 'Próxima viagem', quando: countdownLabel(days), peso: days, page: 'menu-viagens' });
  }
  return items.sort((a, b) => a.peso - b.peso).slice(0, 5);
}

function drawReminders() {
  const items = collectReminders();
  render('dash-reminders', items.length
    ? items.map((i) => html`
      <button class="reminder pressable" data-action="nav:go" data-page="${i.page}">
        <span class="reminder__icon reminder__icon--${i.tom}">${icon(i.icon, 16)}</span>
        <span class="reminder__body"><small>${i.fonte}</small><strong>${i.titulo}</strong></span>
        <span class="reminder__when">${i.quando}</span>
      </button>`)
    : html`<div class="dash-empty">${icon('check', 20)}<span>Sem avisos. Está tudo em dia.</span></div>`);
  remindOncePerDay(items);
}

let remindersTimer = null;
const scheduleReminders = () => { clearTimeout(remindersTimer); remindersTimer = setTimeout(drawReminders, 150); };

/** Notificação local (uma vez por dia) com o que precisa de atenção hoje. */
function remindOncePerDay(items) {
  if (!session.profile?.allowNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  const due = items.filter((i) => i.peso <= 1);
  if (!due.length) return;
  const key = `gn-reminder-${session.uid}-${todayISO()}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { return; }
  const body = due.map((i) => `• ${i.titulo} (${i.quando.toLowerCase()})`).join('\n');
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification('Nós', { body, icon: 'assets/brand/nos-192.png', tag: 'daily' }))
    .catch(() => { try { new Notification('Nós', { body }); } catch { /* sem suporte */ } });
}

// ---------- Casa & Refeições ----------

async function fotoReceita(id) {
  if (!id) return '';
  if (fotosReceitas.has(id)) return fotosReceitas.get(id);
  try {
    const s = await getDoc(sharedDoc('receitas', id));
    const foto = s.exists() ? s.data().foto || '' : '';
    fotosReceitas.set(id, foto);
    return foto;
  } catch { return ''; }
}

async function drawHome() {
  const porComprar = compras.filter((i) => !i.feita).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const foto = await fotoReceita(jantar?.receita?.id);
  render('dash-home', html`
    <button class="dinner pressable" data-action="nav:go" data-page="menu-refeicoes">
      <span class="dinner__img">${foto ? html`<img src="${foto}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon('restaurant', 26)}</span>
      <span class="dinner__body">
        <small>Jantar de hoje</small>
        <strong>${jantar ? jantar.texto : 'Ainda por decidir'}</strong>
        <span>${jantar?.receita ? 'Do Livro de Receitas' : jantar ? 'Plano de refeições' : 'Toca para planear'}</span>
      </span>
      ${icon('chevronRight', 16)}
    </button>
    <div class="dash-sub">
      <span>Supermercado · Lista Semanal</span>
      <span>${porComprar.length ? `${porComprar.length} por comprar` : ''}</span>
    </div>
    ${porComprar.length ? html`
      <ul class="shop-preview">
        ${porComprar.slice(0, 3).map((i) => html`<li><span class="shop-preview__dot"></span>${i.texto}</li>`)}
      </ul>
      <button class="btn btn--small btn--glass dash-more pressable" data-action="nav:go" data-page="menu-lista-compras">
        Abrir lista${porComprar.length > 3 ? ` (+${porComprar.length - 3} artigos)` : ''}</button>`
      : html`<div class="dash-empty">${icon('cart', 20)}<span>A lista de compras está vazia.</span></div>`}`);
  drawResumo();
}

// ---------- Página ----------

const cardHead = (ic, title, page, more) => html`
  <div class="dash-card__head">
    <span class="dash-card__icon">${icon(ic, 16)}</span>
    <h3>${title}</h3>
    ${page ? html`<button class="dash-card__more" data-action="nav:go" data-page="${page}">${more}</button>` : ''}
  </div>`;

export default {
  id: 'dashboard',
  pages: [{
    id: 'menu-principal',
    title: 'Início',
    root: true,
    wide: true,
    onEnter: () => { drawCouple(); drawReminders(); drawHome(); },
    template: () => html`
      <div class="bento">
        <section class="card glass dash-hero bento__hero" id="dash-couple"></section>
        <section class="card glass dash-card bento__reminders">
          ${cardHead('bell', 'Lembretes rápidos')}
          <div class="reminders" id="dash-reminders"></div>
        </section>
        <section class="card glass dash-card bento__tasks">
          ${cardHead('check', 'Tarefas de hoje', 'menu-tarefas', 'Ver todas')}
          ${tasksTpl({ limit: 6, id: 'dash-tasks' })}
        </section>
        <section class="card glass dash-card bento__home">
          ${cardHead('restaurant', 'Casa & Refeições', 'menu-refeicoes', 'Plano')}
          <div class="dash-home" id="dash-home"></div>
        </section>
      </div>`,
  }],
  start() {
    drawCouple();
    const hoje = todayISO();
    scope.add(onSnapshot(sharedDoc('refeicoes', `${hoje}_jantar`), (s) => {
      jantar = s.exists() ? s.data() : null;
      drawHome();
    }, () => { jantar = null; drawHome(); }));
    scope.add(onSnapshot(sharedCol('semanais'), (s) => { compras = snapToList(s); drawHome(); }));
    scope.add(onSnapshot(sharedCol('tarefas'), () => setTimeout(drawResumo, 0)));
    scope.add(on('records:update', scheduleReminders));
    scope.add(on('household:update', drawCouple));
    scope.add(on('avatar:refresh', drawCouple));
    scope.add(() => clearTimeout(remindersTimer));
    scheduleReminders();
  },
  stop() {
    scope.clear();
    jantar = null;
    compras = [];
  },
};
