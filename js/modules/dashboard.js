// Início: relógio, meteorologia, frase do dia e tarefas de hoje.
import { html, setText, byId, render } from '../core/dom.js';
import { icon, iconSvg } from '../core/icons.js';
import { createScope, session, on } from '../core/state.js';
import { longDate, timeHM, money, todayISO, daysBetween } from '../core/format.js';
import { daysUntil, countdownLabel, parseISODate } from '../core/dates.js';
import { checklistTpl, subscribeChecklist } from '../components/checklist.js';
import { upcomingDates } from './dates.js';
import { upcomingEvents } from './calendar.js';
import finances, { pendingBills } from './finances.js';
import { homeAlerts } from './home.js';
import { garageAlerts } from './garage.js';
import { onThisDay } from './memories.js';
import { tripState } from './trips/store.js';

const scope = createScope();
let clockTimer = null;

const QUOTES = [
  { t: 'Entregue o seu caminho ao Senhor, confie nele, e o mais ele fará.', a: 'Salmos 37:5' },
  { t: 'Tudo posso naquele que me fortalece.', a: 'Filipenses 4:13' },
  { t: 'O amor é paciente, o amor é bondoso.', a: '1 Coríntios 13:4' },
  { t: 'Acima de tudo, porém, revistam-se do amor, que é o elo perfeito.', a: 'Colossenses 3:14' },
  { t: 'Melhor é serem dois do que um.', a: 'Eclesiastes 4:9' },
];

// Códigos WMO da Open-Meteo -> descrição + ícone
function weatherInfo(code) {
  if (code === 0) return { desc: 'Céu limpo', icon: 'sun' };
  if (code <= 3) return { desc: 'Pouco nublado', icon: 'cloud' };
  if (code <= 48) return { desc: 'Nevoeiro', icon: 'cloud' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { desc: 'Chuva', icon: 'cloudRain' };
  if (code <= 77 || code === 85 || code === 86) return { desc: 'Neve', icon: 'cloudSnow' };
  if (code >= 95) return { desc: 'Trovoada', icon: 'cloudLightning' };
  return { desc: 'Variável', icon: 'cloud' };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Boa noite';
  if (h < 13) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

function tickClock() {
  const now = new Date();
  setText('dash-date', longDate(now));
  const [hh, mm] = timeHM(now).split(':');
  const el = byId('dash-time');
  if (el) el.innerHTML = `${hh}<span class="blink">:</span>${mm}`;
  setText('dash-greeting', `${greeting()}${session.name ? `, ${session.name.split(' ')[0]}` : ''}`);
}

const FALLBACK = { lat: 38.5244, lon: -8.8882, name: 'Setúbal' };

async function fetchWeather(lat, lon, name) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const { current_weather: cw } = await res.json();
    const info = weatherInfo(cw.weathercode);
    setText('meteo-temp', `${Math.round(cw.temperature)}°`);
    setText('meteo-desc', info.desc);
    setText('meteo-city', name);
    render('meteo-icon', iconSvg(info.icon, 28));
    byId('meteo-card')?.classList.remove('is-loading');
  } catch {
    setText('meteo-desc', 'Sem dados');
  }
}

function loadWeather() {
  byId('meteo-card')?.classList.add('is-loading');
  setText('meteo-desc', 'A localizar…');
  if (!navigator.geolocation) return fetchWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name);
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    let name = 'Local';
    try {
      const geo = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=pt`)).json();
      name = geo.city || geo.locality || name;
    } catch { /* usa "Local" */ }
    fetchWeather(coords.latitude, coords.longitude, name);
  }, () => fetchWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name), { timeout: 8000, maximumAge: 600000 });
}

/** Junta os avisos de todos os módulos numa lista ordenada por data. */
function collectUpcoming() {
  const items = [
    ...upcomingEvents(7),
    ...upcomingDates(30),
    ...homeAlerts(),
    ...garageAlerts(),
  ];
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
  const memories = onThisDay();
  render('dash-upcoming', items.length || memories.length
    ? html`
      ${memories.map((m) => html`
        <button class="upcoming upcoming--memory pressable" data-action="nav:go" data-page="menu-memorias">
          <span class="upcoming__icon">${icon('heart', 16)}</span>
          <span class="upcoming__title">Neste dia, há ${new Date().getFullYear() - Number(m.data.slice(0, 4))} ano(s): ${m.titulo}</span>
        </button>`)}
      ${items.map((i) => html`
        <button class="upcoming pressable ${i.days < 0 ? 'is-late' : i.days === 0 ? 'is-today' : ''}" data-action="nav:go" data-page="${i.page}">
          <span class="upcoming__icon">${icon(i.icon, 16)}</span>
          <span class="upcoming__title">${i.title}</span>
          <span class="upcoming__when">${i.days < 0 ? 'Atrasado' : countdownLabel(i.days)}</span>
        </button>`)}`
    : html`<p class="muted small">Nada para os próximos dias. Aproveitem! ✨</p>`);
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
      <button class="card glass glass--interactive couple-banner pressable" data-action="nav:go" data-page="menu-casal">
        <span class="couple-banner__icon">${icon('heart', 22)}</span>
        <span><strong>Liga a tua conta à do teu parceiro(a)</strong><br><span class="muted small">Partilhem tarefas, compras, finanças e calendário.</span></span>
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

function dailyQuote() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

export default {
  id: 'dashboard',
  pages: [{
    id: 'menu-principal',
    title: 'Início',
    root: true,
    onEnter: () => { drawCouple(); drawUpcoming(); },
    template: () => {
      const q = dailyQuote();
      return html`
        <p class="greeting" id="dash-greeting"></p>
        <div id="dash-couple"></div>
        <div class="widget-grid">
          <div class="card glass glass--interactive widget-clock">
            <span class="eyebrow" id="dash-date"></span>
            <span class="clock" id="dash-time">00:00</span>
          </div>
          <button class="card glass glass--interactive widget-weather is-loading pressable" id="meteo-card" data-action="dashboard:weather">
            <span class="weather-row"><span class="weather-icon" id="meteo-icon">${icon('sun', 28)}</span><span class="weather-temp" id="meteo-temp">--°</span></span>
            <span class="weather-desc" id="meteo-desc">A localizar…</span>
            <span class="eyebrow weather-city">${icon('pin', 11)} <span id="meteo-city">GPS</span></span>
          </button>
        </div>
        <div class="card glass">
          <h3 class="card__title">${icon('calendar', 20)} Próximos dias</h3>
          <div class="list" id="dash-upcoming"></div>
        </div>
        <div class="card glass widget-quote">
          <span class="quote-mark">${icon('quote', 22)}</span>
          <p class="quote-text">“${q.t}”</p>
          <span class="eyebrow">${q.a}</span>
        </div>
        <div class="card glass">
          <h3 class="card__title">${icon('clipboard', 20)} A fazer hoje</h3>
          ${checklistTpl('tarefas', 'Nova tarefa…')}
        </div>`;
    },
  }],
  actions: {
    'dashboard:weather': () => loadWeather(),
  },
  start() {
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
    scope.add(() => clearInterval(clockTimer));
    subscribeChecklist(scope, 'tarefas');
    loadWeather();
    drawCouple();
    scope.add(on('records:update', scheduleUpcoming));
    scope.add(on('household:update', drawCouple));
    scope.add(() => clearTimeout(upcomingTimer));
  },
  stop() {
    scope.clear();
  },
};
