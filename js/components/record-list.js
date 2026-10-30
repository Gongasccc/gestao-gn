// Lista genérica de registos com formulário de criar/editar num modal.
// Usada pelos módulos simples (datas, metas, desejos, casa, contas fixas…) para não repetir código.
import { html, byId, render, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { registerActions } from '../core/events.js';
import { session, emit } from '../core/state.js';
import { modalTemplate, openModal, closeModal, confirmDialog, toast, withLoading } from '../core/ui.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot } from '../services/firebase.js';
import { snapToList, storageScope } from '../services/paths.js';
import { uploadDataUrl, removeFile } from '../services/storage.js';
import { photoPickerTpl, setPhoto, getPhoto } from './photo-picker.js';

const lists = new Map();

/**
 * Campos: { name, label, type, options, placeholder, required, default, hint }
 * type: text | textarea | number | money | date | time | select | member | photo | url | tel | checkbox
 */
export function createRecordList(cfg) {
  const state = { items: [], editing: null, filter: null };
  const ids = {
    list: `rl-${cfg.key}-list`,
    modal: `rl-${cfg.key}-modal`,
    form: `rl-${cfg.key}-form`,
    del: `rl-${cfg.key}-delete`,
    title: `rl-${cfg.key}-modal-title`, // gerado pelo modalTemplate (`${modal}-title`)
  };
  const fieldId = (name) => `rl-${cfg.key}-f-${name}`;

  function memberOptions(withBoth = true) {
    const opts = session.members.map((m) => ({ value: m.uid, label: m.uid === session.uid ? `${m.name.split(' ')[0]} (eu)` : m.name.split(' ')[0] }));
    return withBoth && session.members.length > 1 ? [{ value: '', label: 'Ambos' }, ...opts] : opts;
  }

  function fieldTpl(f, value) {
    const id = fieldId(f.name);
    const v = value ?? (typeof f.default === 'function' ? f.default() : f.default) ?? '';
    const label = html`<label class="field__label" for="${id}">${f.label}</label>`;
    switch (f.type) {
      case 'textarea':
        return html`<div class="field">${label}<textarea id="${id}" class="input textarea" placeholder="${f.placeholder || ''}">${v}</textarea></div>`;
      case 'select':
      case 'member': {
        const opts = f.type === 'member' ? memberOptions(f.both !== false) : (typeof f.options === 'function' ? f.options() : f.options);
        return html`<div class="field">${label}<select id="${id}" class="input">${opts.map((o) => html`<option value="${o.value}" ${String(o.value) === String(v) ? 'selected' : ''}>${o.label}</option>`)}</select></div>`;
      }
      case 'photo':
        return html`<div class="field">${photoPickerTpl(id, f.label, { maxSize: f.maxSize || 1400 })}</div>`;
      case 'checkbox':
        return html`<div class="setting-row"><span>${f.label}</span><label class="switch"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><span class="switch__track"></span></label></div>`;
      default: {
        const type = { money: 'number', number: 'number', date: 'date', time: 'time', url: 'url', tel: 'tel' }[f.type] || 'text';
        const extra = f.type === 'money' ? html`step="0.01" inputmode="decimal"` : '';
        return html`<div class="field">${label}<input type="${type}" id="${id}" class="input" value="${v}" placeholder="${f.placeholder || ''}" ${extra}>${f.hint ? html`<span class="field__hint">${f.hint}</span>` : ''}</div>`;
      }
    }
  }

  function readForm() {
    const out = {};
    for (const f of cfg.fields) {
      const el = byId(fieldId(f.name));
      if (f.type === 'photo') out[f.name] = getPhoto(fieldId(f.name));
      else if (f.type === 'checkbox') out[f.name] = !!el?.checked;
      else if (f.type === 'number' || f.type === 'money') out[f.name] = el?.value === '' ? null : Number(el.value);
      else out[f.name] = (el?.value ?? '').trim();
    }
    return out;
  }

  function draw() {
    let items = cfg.filter ? state.items.filter((i) => cfg.filter(i, state.filter)) : [...state.items];
    if (cfg.sort) items.sort(cfg.sort);
    const tpl = (rec) => html`
      <div class="record glass-soft pressable ${cfg.itemClass ? cfg.itemClass(rec) : ''}" data-action="rl:edit" data-list="${cfg.key}" data-id="${rec.id}">
        ${cfg.item(rec)}
      </div>`;
    let content;
    if (!items.length) content = emptyState(cfg.empty || 'Ainda não há nada aqui.', icon(cfg.emptyIcon || 'plus', 28));
    else if (cfg.group) {
      const groups = new Map();
      items.forEach((i) => { const g = cfg.group(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
      content = [...groups].map(([g, arr]) => html`<h4 class="section-title">${g}</h4>${arr.map(tpl)}`);
    } else content = items.map(tpl);
    render(ids.list, content, { stagger: !state.drawn });
    state.drawn = true;
  }

  function openForm(rec = null, prefill = {}) {
    state.editing = rec;
    byId(ids.title).textContent = rec ? (cfg.editTitle || 'Editar') : (cfg.addTitle || 'Adicionar');
    render(ids.form, cfg.fields.map((f) => fieldTpl(f, rec ? rec[f.name] : prefill[f.name])));
    cfg.fields.filter((f) => f.type === 'photo').forEach((f) => setPhoto(fieldId(f.name), rec?.[f.name] || ''));
    byId(ids.del).hidden = !rec;
    openModal(ids.modal);
  }

  async function save(btn) {
    const data = readForm();
    const missing = cfg.fields.find((f) => f.required && (data[f.name] === '' || data[f.name] == null));
    if (missing) return toast(`Preenche "${missing.label}".`, 'error');
    await withLoading(btn, async () => {
      for (const f of cfg.fields.filter((x) => x.type === 'photo')) {
        if (data[f.name]?.startsWith('data:')) {
          const up = await uploadDataUrl(storageScope(), cfg.key, data[f.name]);
          data[f.name] = up.url;
          data[`${f.name}Path`] = up.path;
        }
      }
      const payload = cfg.beforeSave ? cfg.beforeSave(data, state.editing) : data;
      if (state.editing) await updateDoc(cfg.docRef(state.editing.id), payload);
      else await addDoc(cfg.col(), { ...payload, createdBy: session.uid, timestamp: Date.now() });
    });
    closeModal(ids.modal);
    toast(state.editing ? 'Alterações guardadas' : (cfg.addedToast || 'Adicionado'));
  }

  async function remove() {
    const rec = state.editing;
    if (!rec) return;
    const ok = await confirmDialog('Esta ação não pode ser desfeita.', { title: 'Apagar?', confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    await deleteDoc(cfg.docRef(rec.id));
    cfg.fields.filter((f) => f.type === 'photo').forEach((f) => rec[`${f.name}Path`] && removeFile(rec[`${f.name}Path`]).catch(() => {}));
    closeModal(ids.modal);
  }

  const list = {
    cfg,
    state,
    draw,
    openForm,
    save,
    remove,
    items: () => state.items,
    setFilter(v) { state.filter = v; draw(); },
    template: () => html`<div class="list" id="${ids.list}"></div>`,
    addButton: (label = cfg.addLabel || 'Adicionar') => html`
      <button class="btn btn--primary btn--block pressable" data-action="rl:new" data-list="${cfg.key}">${icon('plus', 18)} ${label}</button>`,
    modals: () => html`
      ${modalTemplate(ids.modal, cfg.addTitle || 'Adicionar', html`
        <div id="${ids.form}"></div>
        <div class="btn-row">
          <button class="btn btn--danger-soft" id="${ids.del}" data-action="rl:delete" data-list="${cfg.key}" hidden>${icon('trash', 16)}</button>
          <button class="btn" data-action="modal:close" data-modal="${ids.modal}">Cancelar</button>
          <button class="btn btn--primary" data-action="rl:save" data-list="${cfg.key}">Guardar</button>
        </div>`)}`,
    subscribe(scope) {
      state.items = [];
      state.drawn = false;
      scope.add(onSnapshot(cfg.col(), (s) => {
        state.items = snapToList(s);
        draw();
        cfg.onChange?.(state.items);
        emit('records:update', cfg.key);
      }));
    },
  };
  lists.set(cfg.key, list);
  return list;
}

registerActions({
  'rl:new': ({ data }) => lists.get(data.list)?.openForm(null, data.prefill ? JSON.parse(data.prefill) : {}),
  'rl:edit': ({ data, ev }) => {
    if (ev.target.closest('[data-action]:not([data-action="rl:edit"])')) return;
    const l = lists.get(data.list);
    const rec = l?.state.items.find((i) => i.id === data.id);
    if (rec) l.openForm(rec);
  },
  'rl:save': ({ data, el }) => lists.get(data.list)?.save(el),
  'rl:delete': ({ data }) => lists.get(data.list)?.remove(),
});
