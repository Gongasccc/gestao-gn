// Zona para escolher/fotografar uma imagem com pré-visualização. O valor fica em memória até ser guardado.
import { html, byId } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { registerActions } from '../core/events.js';
import { compressImage, takeFile } from '../core/images.js';
import { emit } from '../core/state.js';

const values = new Map();

export function photoPickerTpl(id, label, { tall = false, maxSize = 1200 } = {}) {
  return html`
    <label class="photo-picker glass-soft pressable ${tall ? 'photo-picker--tall' : ''}" id="${id}">
      <span class="photo-picker__placeholder">${icon('camera', 26)}<span>${label}</span></span>
      <img class="photo-picker__img" alt="" hidden>
      <input type="file" accept="image/*" hidden data-change="photo:pick" data-picker="${id}" data-max="${maxSize}">
    </label>`;
}

export function setPhoto(id, src) {
  values.set(id, src || '');
  const el = byId(id);
  if (!el) return;
  const img = el.querySelector('.photo-picker__img');
  img.hidden = !src;
  if (src) img.src = src; else img.removeAttribute('src');
  el.classList.toggle('has-photo', !!src);
}

export const getPhoto = (id) => values.get(id) || '';
export const clearPhoto = (id) => setPhoto(id, '');

registerActions({
  'photo:pick': async ({ data, ev }) => {
    const file = takeFile(ev);
    if (!file) return;
    const src = await compressImage(file, { maxSize: Number(data.max) || 1200 });
    setPhoto(data.picker, src);
    emit(`photo:${data.picker}`, src);
  },
});
