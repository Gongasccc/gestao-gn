// Escolher um local (casa, início da viagem, destino, spot) com pesquisa no OpenStreetMap.
import { html, render, byId } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { modalTemplate, openModal, closeModal, toast, withLoading } from '../../core/ui.js';
import { searchPlaces, reversePlace, currentPosition, flag, spotCategory } from './geo.js';

const picker = { resolve: null, near: null, results: [], extra: null };

export function placePickerModalTpl() {
  return modalTemplate('modal-place', 'Escolher local', html`
    <p class="muted small" id="place-pick-hint"></p>
    <div class="input-row">
      <input type="search" id="place-pick-q" class="input" placeholder="Procurar…" data-enter="place:search" autocomplete="off">
      <button class="icon-btn glass-chip pressable" data-action="place:search" aria-label="Procurar">${icon('search', 18)}</button>
      <button class="icon-btn glass-chip pressable" data-action="place:here" aria-label="Usar a minha localização">${icon('pin', 18)}</button>
    </div>
    <div class="place-results" id="place-pick-results"></div>
    <div id="place-pick-extra"></div>`);
}

/**
 * Abre o seletor e devolve o local escolhido (ou null se fechar).
 * opts: { title, hint, placeholder, near: {lat,lng}, extra: html extra (ex.: noites) }
 */
export function pickPlace({ title = 'Escolher local', hint = '', placeholder = 'Procurar cidade, sítio…', near = null, extra = '' } = {}) {
  if (picker.resolve) picker.resolve(null);
  picker.near = near;
  picker.results = [];
  byId('modal-place-title').textContent = title;
  byId('place-pick-hint').textContent = hint;
  const q = byId('place-pick-q');
  q.value = '';
  q.placeholder = placeholder;
  render('place-pick-results', '');
  render('place-pick-extra', extra);
  openModal('modal-place');
  return new Promise((resolve) => { picker.resolve = resolve; });
}

function finish(place) {
  const r = picker.resolve;
  picker.resolve = null;
  closeModal('modal-place');
  r?.(place);
}

export const placePickerActions = {
  'place:search': async ({ el }) => {
    const q = byId('place-pick-q').value.trim();
    if (q.length < 2) return toast('Escreve o nome de um sítio.', 'info');
    try {
      picker.results = await withLoading(el.tagName === 'BUTTON' ? el : null, () => searchPlaces(q, { near: picker.near }));
    } catch {
      return toast('Não foi possível procurar agora. Tenta de novo.', 'error');
    }
    render('place-pick-results', picker.results.length
      ? picker.results.map((p, i) => html`
          <button class="place-result pressable" data-action="place:pick" data-i="${i}">
            <span>${flag(p.paisCode) || icon('pin', 14)}</span>
            <span class="place-result__text"><strong>${p.nome}</strong><span class="muted small">${[spotCategory(p.tipo), p.cidade, p.pais].filter(Boolean).join(' · ')}</span></span>
          </button>`)
      : html`<p class="muted small">Nenhum resultado para “${q}”.</p>`, { stagger: true });
  },
  'place:pick': ({ data }) => {
    const p = picker.results[Number(data.i)];
    if (p) finish(p);
  },
  'place:here': async ({ el }) => {
    try {
      const pos = await withLoading(el, () => currentPosition());
      let p;
      try { p = await reversePlace(pos.lat, pos.lng); } catch { p = { nome: 'Localização atual', ...pos }; }
      finish(p);
    } catch {
      toast('Não foi possível obter a tua localização.', 'error');
    }
  },
};

/** Fecha o seletor sem escolher (ex.: ao sair da página). */
export function cancelPick() {
  if (picker.resolve) finish(null);
}
