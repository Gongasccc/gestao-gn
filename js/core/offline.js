// Aviso discreto de "sem rede": as alterações ficam guardadas no telemóvel (cache do Firestore)
// e sobem sozinhas quando a ligação voltar. Ao voltar mostra "De volta online" durante 2,5 s.
import { html } from './dom.js';

let pill = null;
let timer = null;

function mostrar(estado) {
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'offline-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    document.body.appendChild(pill);
  }
  clearTimeout(timer);
  if (estado === 'offline') {
    pill.innerHTML = String(html`<i></i>Sem rede · o que fizeres fica guardado`);
    pill.classList.remove('is-back');
    pill.classList.add('is-on');
  } else {
    pill.innerHTML = String(html`<i></i>De volta online · a sincronizar`);
    pill.classList.add('is-on', 'is-back');
    timer = setTimeout(() => pill.classList.remove('is-on'), 2500);
  }
}

export function initOffline() {
  window.addEventListener('offline', () => mostrar('offline'));
  window.addEventListener('online', () => { if (pill?.classList.contains('is-on')) mostrar('online'); });
  if (!navigator.onLine) mostrar('offline');
}
