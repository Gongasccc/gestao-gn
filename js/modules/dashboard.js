// Início: relógio, meteorologia, frase do dia e tarefas de hoje.
import { html, setText, byId, render } from '../core/dom.js';
import { icon, iconSvg } from '../core/icons.js';
import { createScope, session } from '../core/state.js';
import { longDate, timeHM } from '../core/format.js';
import { checklistTpl, subscribeChecklist } from '../components/checklist.js';

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
    template: () => {
      const q = dailyQuote();
      return html`
        <p class="greeting" id="dash-greeting"></p>
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
  },
  stop() {
    scope.clear();
  },
};
