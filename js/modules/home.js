// Casa: tarefas de manutenção recorrentes (com rotação), garantias, contactos úteis e animais de estimação.
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, memberName, partnerUid, on } from '../core/state.js';
import { toast } from '../core/ui.js';
import { isoToShort, todayISO } from '../core/format.js';
import { daysUntil, parseISODate, toISODate, countdownLabel, expiryState } from '../core/dates.js';
import { updateDoc, arrayUnion } from '../services/firebase.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';
import { tabsTpl } from '../components/tabs.js';

const scope = createScope();

const chipFor = (days, warn = 7) => html`<span class="chip ${days < 0 ? 'chip--danger' : days <= warn ? 'chip--warn' : 'chip--muted'}">${countdownLabel(days)}</span>`;

/** Próxima data de uma tarefa recorrente. */
function nextDue(t) {
  if (!t.ultimaVez) return new Date();
  const d = parseISODate(t.ultimaVez);
  d.setDate(d.getDate() + (Number(t.cadaDias) || 7));
  return d;
}

const chores = createRecordList({
  key: 'manutencao',
  col: () => sharedCol('manutencao'),
  docRef: (id) => sharedDoc('manutencao', id),
  addTitle: 'Nova tarefa da casa',
  editTitle: 'Editar tarefa',
  empty: 'ex: Lixo, aspirar, regar plantas, limpar filtros do AC, mudar lençóis…',
  emptyIcon: 'repeat',
  fields: [
    { name: 'tarefa', label: 'Tarefa', required: true, placeholder: 'ex: Levar o lixo' },
    { name: 'cadaDias', label: 'Repetir a cada (dias)', type: 'number', default: 7 },
    { name: 'quem', label: 'Quem faz', type: 'select', options: () => [{ value: '', label: 'Quem calhar' }, { value: 'rodar', label: 'Alternar entre os dois' }, ...session.members.map((m) => ({ value: m.uid, label: m.name.split(' ')[0] }))] },
    { name: 'ultimaVez', label: 'Última vez que foi feita', type: 'date', default: todayISO },
  ],
  sort: (a, b) => nextDue(a) - nextDue(b),
  item: (t) => {
    const days = daysUntil(nextDue(t));
    const who = t.quem === 'rodar' ? t.proximo || session.uid : t.quem;
    const last = (t.historico || []).slice(-1)[0];
    return html`
      <span class="record__icon">${icon('repeat', 18)}</span>
      <span class="record__main">
        <span class="record__title">${t.tarefa}</span>
        <span class="record__meta">A cada ${t.cadaDias || 7} dias${who ? ` · vez de ${memberName(who)}` : ''}${last ? ` · última: ${memberName(last.uid)}, ${isoToShort(last.data, false)}` : ''}</span>
      </span>
      <span class="record__side">
        ${chipFor(days, 1)}
        <button class="btn btn--small btn--primary pressable" data-action="home:done" data-id="${t.id}">${icon('check', 14)} Feito</button>
      </span>`;
  },
});

const warranties = createRecordList({
  key: 'garantias',
  col: () => sharedCol('garantias'),
  docRef: (id) => sharedDoc('garantias', id),
  addTitle: 'Nova garantia',
  editTitle: 'Editar garantia',
  empty: 'Guarda aqui a fatura e a garantia dos eletrodomésticos e aparelhos.',
  emptyIcon: 'shield',
  fields: [
    { name: 'artigo', label: 'Artigo', required: true, placeholder: 'ex: Máquina de lavar Bosch' },
    { name: 'loja', label: 'Loja' },
    { name: 'compra', label: 'Data de compra', type: 'date', default: todayISO },
    { name: 'validade', label: 'Garantia válida até', type: 'date', hint: 'Em Portugal, bens novos têm 3 anos de garantia.' },
    { name: 'fatura', label: 'Fotografia da fatura', type: 'photo', maxSize: 2000 },
    { name: 'notas', label: 'Notas', type: 'textarea', placeholder: 'nº de série, contacto da assistência…' },
  ],
  beforeSave: (d) => {
    if (!d.validade && d.compra) { const x = parseISODate(d.compra); x.setFullYear(x.getFullYear() + 3); d.validade = toISODate(x); }
    return d;
  },
  sort: (a, b) => String(a.validade).localeCompare(String(b.validade)),
  item: (w) => {
    const st = expiryState(w.validade, 60);
    return html`
      <span class="record__icon">${icon('shield', 18)}</span>
      <span class="record__main">
        <span class="record__title">${w.artigo}</span>
        <span class="record__meta">${w.loja ? `${w.loja} · ` : ''}comprado a ${isoToShort(w.compra)}${w.fatura ? ' · com fatura' : ''}</span>
      </span>
      <span class="chip ${st === 'expired' ? 'chip--muted' : st === 'soon' ? 'chip--warn' : 'chip--accent'}">${st === 'expired' ? 'Expirada' : `Até ${isoToShort(w.validade)}`}</span>`;
  },
});

const contacts = createRecordList({
  key: 'contactos',
  col: () => sharedCol('contactos'),
  docRef: (id) => sharedDoc('contactos', id),
  addTitle: 'Novo contacto',
  editTitle: 'Editar contacto',
  empty: 'Senhorio, canalizador, eletricista, condomínio, veterinário…',
  emptyIcon: 'phone',
  fields: [
    { name: 'nome', label: 'Nome', required: true },
    { name: 'funcao', label: 'O que faz', placeholder: 'ex: Canalizador' },
    { name: 'telefone', label: 'Telefone', type: 'tel' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
  sort: (a, b) => String(a.nome).localeCompare(String(b.nome)),
  item: (c) => html`
    <span class="record__icon">${icon('user', 18)}</span>
    <span class="record__main">
      <span class="record__title">${c.nome}</span>
      <span class="record__meta">${c.funcao || ''}${c.telefone ? ` · ${c.telefone}` : ''}</span>
    </span>
    ${c.telefone ? html`<a class="btn btn--small btn--primary pressable" href="tel:${c.telefone.replace(/\s/g, '')}">${icon('phone', 14)} Ligar</a>` : ''}`,
});

const pets = createRecordList({
  key: 'animais',
  col: () => sharedCol('animais'),
  docRef: (id) => sharedDoc('animais', id),
  addTitle: 'Novo animal',
  editTitle: 'Editar',
  empty: 'Têm animais? Registem aqui vacinas e desparasitações.',
  emptyIcon: 'paw',
  fields: [
    { name: 'foto', label: 'Fotografia', type: 'photo' },
    { name: 'nome', label: 'Nome', required: true },
    { name: 'especie', label: 'Espécie / raça', placeholder: 'ex: Gato europeu' },
    { name: 'nascimento', label: 'Data de nascimento', type: 'date' },
    { name: 'vacina', label: 'Próxima vacina', type: 'date' },
    { name: 'desparasitacao', label: 'Próxima desparasitação', type: 'date' },
    { name: 'veterinario', label: 'Veterinário (nome e telefone)' },
    { name: 'notas', label: 'Notas', type: 'textarea', placeholder: 'alergias, ração, chip…' },
  ],
  item: (p) => html`
    ${p.foto ? html`<img class="record__thumb record__thumb--round" src="${p.foto}" alt="" loading="lazy">` : html`<span class="record__icon">${icon('paw', 18)}</span>`}
    <span class="record__main">
      <span class="record__title">${p.nome}</span>
      <span class="record__meta">${p.especie || ''}${p.veterinario ? ` · ${p.veterinario}` : ''}</span>
      <span class="chip-row">
        ${p.vacina ? html`<span class="chip-label">Vacina</span>${chipFor(daysUntil(parseISODate(p.vacina)), 14)}` : ''}
        ${p.desparasitacao ? html`<span class="chip-label">Desparasitação</span>${chipFor(daysUntil(parseISODate(p.desparasitacao)), 7)}` : ''}
      </span>
    </span>`,
});

/** Avisos para o Início: tarefas atrasadas e cuidados dos animais. */
export function homeAlerts() {
  const out = [];
  chores.items().forEach((t) => {
    const days = daysUntil(nextDue(t));
    if (days <= 0) out.push({ date: nextDue(t), days, title: t.tarefa, icon: 'repeat', page: 'menu-casa' });
  });
  pets.items().forEach((p) => {
    [['vacina', 'Vacina'], ['desparasitacao', 'Desparasitação']].forEach(([k, label]) => {
      if (!p[k]) return;
      const days = daysUntil(parseISODate(p[k]));
      if (days <= 14) out.push({ date: parseISODate(p[k]), days, title: `${label} · ${p.nome}`, icon: 'paw', page: 'menu-casa' });
    });
  });
  return out;
}

const LISTS = { manutencao: chores, garantias: warranties, contactos: contacts, animais: pets };

export default {
  id: 'home',
  pages: [{
    id: 'menu-casa',
    title: 'Casa',
    root: true,
    template: () => html`
      ${tabsTpl('casa', [{ id: 'manutencao', label: 'Tarefas' }, { id: 'garantias', label: 'Garantias' }, { id: 'contactos', label: 'Contactos' }, { id: 'animais', label: 'Animais' }])}
      ${Object.entries(LISTS).map(([k, l], i) => html`
        <div data-tab-panel="casa:${k}" ${i ? 'hidden' : ''}>${l.addButton()}${l.template()}</div>`)}`,
  }],
  modals: () => html`${Object.values(LISTS).map((l) => l.modals())}`,
  actions: {
    'home:done': async ({ data }) => {
      const t = chores.items().find((x) => x.id === data.id);
      if (!t) return;
      const patch = { ultimaVez: todayISO(), historico: arrayUnion({ uid: session.uid, data: todayISO() }) };
      // Na rotação, a próxima vez é de quem não fez agora.
      if (t.quem === 'rodar') patch.proximo = partnerUid() || session.uid;
      await updateDoc(sharedDoc('manutencao', t.id), patch);
      toast(`"${t.tarefa}" feita`);
    },
  },
  start() {
    Object.values(LISTS).forEach((l) => l.subscribe(scope));
    scope.add(on('household:update', () => chores.draw()));
  },
  stop() { scope.clear(); },
};
