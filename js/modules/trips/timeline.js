// Planeamento da viagem: linha temporal de atividades agrupadas por dia.
import { html, render, byId, emptyState } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { modalTemplate, openModal, closeModal, confirmDialog, toast, showImage, withLoading } from '../../core/ui.js';
import { isoToShort, daysBetween } from '../../core/format.js';
import { addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { tripCol, tripSubDoc } from '../../services/paths.js';
import { photoPickerTpl, getPhoto, setPhoto, clearPhoto } from '../../components/photo-picker.js';
import { tripState, currentTrip } from './store.js';

export function timelineTabTpl() {
  return html`
    <button class="btn btn--primary btn--small pressable" data-action="timeline:new">${icon('plus', 14)} Adicionar passo</button>
    <div class="timeline" id="timeline-list"></div>`;
}

export function drawTimeline() {
  const events = [...tripState.timeline].sort((a, b) => `${a.data || ''} ${a.hora || ''}`.localeCompare(`${b.data || ''} ${b.hora || ''}`));
  if (!events.length) {
    render('timeline-list', emptyState('Ainda não há atividades planeadas.', icon('calendar', 28)));
    return;
  }
  const start = currentTrip()?.dataInicio;
  let lastDay = null;
  const parts = [];
  events.forEach((ev) => {
    const day = ev.data || '';
    if (day !== lastDay) {
      const n = start && day ? daysBetween(start, day) + 1 : null;
      parts.push(html`<div class="timeline__day">${n && n > 0 ? html`<span class="chip chip--accent">Dia ${n}</span>` : ''} ${day ? isoToShort(day) : 'Sem data'}</div>`);
      lastDay = day;
    }
    parts.push(html`
      <div class="timeline__item glass-soft">
        <span class="timeline__dot"></span>
        <div class="timeline__head">
          <span class="timeline__time">${ev.hora || '—'}</span>
          <span class="timeline__actions">
            <button class="icon-btn icon-btn--subtle" data-action="timeline:edit" data-id="${ev.id}" aria-label="Editar">${icon('edit', 15)}</button>
            <button class="icon-btn icon-btn--subtle" data-action="timeline:delete" data-id="${ev.id}" aria-label="Apagar">${icon('trash', 15)}</button>
          </span>
        </div>
        <div class="timeline__title">${ev.titulo}</div>
        ${ev.notas ? html`<div class="timeline__notes">${ev.notas}</div>` : ''}
        ${ev.foto ? html`<img class="timeline__img pressable" src="${ev.foto}" alt="" data-action="timeline:photo" data-id="${ev.id}" loading="lazy">` : ''}
      </div>`);
  });
  render('timeline-list', parts, { stagger: true });
}

export function timelineModalTpl() {
  return modalTemplate('modal-event', 'Novo passo', html`
    <input type="hidden" id="event-id">
    <div class="field-row">
      <input type="date" id="event-date" class="input">
      <input type="time" id="event-time" class="input">
    </div>
    <input type="text" id="event-title" class="input" placeholder="Título / local (ex: Museu do Louvre)">
    <textarea id="event-notes" class="input textarea" placeholder="Descrição / observações…"></textarea>
    ${photoPickerTpl('event-photo', 'Adicionar foto')}
    <div class="btn-row">
      <button class="btn" data-action="modal:close" data-modal="modal-event">Cancelar</button>
      <button class="btn btn--primary" data-action="timeline:save">Guardar</button>
    </div>`);
}

function fillForm(ev = {}) {
  byId('event-id').value = ev.id || '';
  byId('event-date').value = ev.data || currentTrip()?.dataInicio || '';
  byId('event-time').value = ev.hora || '';
  byId('event-title').value = ev.titulo || '';
  byId('event-notes').value = ev.notas || '';
  setPhoto('event-photo', ev.foto || '');
  byId('modal-event-title').textContent = ev.id ? 'Editar passo' : 'Novo passo';
}

export const timelineActions = {
  'timeline:new': () => { fillForm(); openModal('modal-event'); },
  'timeline:edit': ({ data }) => {
    fillForm(tripState.timeline.find((e) => e.id === data.id));
    openModal('modal-event');
  },
  'timeline:photo': ({ data }) => showImage(tripState.timeline.find((e) => e.id === data.id)?.foto),
  'timeline:save': async ({ el }) => {
    const titulo = byId('event-title').value.trim();
    if (!titulo) return toast('Indica um título ou local.', 'error');
    const id = byId('event-id').value;
    const payload = {
      data: byId('event-date').value,
      hora: byId('event-time').value,
      titulo,
      notas: byId('event-notes').value.trim(),
      foto: getPhoto('event-photo'),
      timestamp: Date.now(),
    };
    const tripId = tripState.currentTripId;
    await withLoading(el, () => (id ? updateDoc(tripSubDoc(tripId, 'timeline', id), payload) : addDoc(tripCol(tripId, 'timeline'), payload)));
    clearPhoto('event-photo');
    closeModal('modal-event');
    toast(id ? 'Passo atualizado' : 'Passo adicionado');
  },
  'timeline:delete': async ({ data }) => {
    if (await confirmDialog('Esta atividade será removida do planeamento.', { title: 'Apagar atividade?', confirmLabel: 'Apagar', danger: true })) {
      await deleteDoc(tripSubDoc(tripState.currentTripId, 'timeline', data.id));
    }
  },
};
