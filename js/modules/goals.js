// Metas e poupanças do casal, com contribuições de cada um.
import { html } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, memberName } from '../core/state.js';
import { toast, promptDialog } from '../core/ui.js';
import { money, isoToShort, todayISO } from '../core/format.js';
import { daysUntil, parseISODate } from '../core/dates.js';
import { updateDoc, arrayUnion } from '../services/firebase.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createRecordList } from '../components/record-list.js';

const scope = createScope();

const saved = (g) => (g.contribuicoes || []).reduce((a, c) => a + (Number(c.valor) || 0), 0);

function perMember(g) {
  const out = {};
  (g.contribuicoes || []).forEach((c) => { out[c.uid] = (out[c.uid] || 0) + (Number(c.valor) || 0); });
  return Object.entries(out);
}

const goals = createRecordList({
  key: 'metas',
  col: () => sharedCol('metas'),
  docRef: (id) => sharedDoc('metas', id),
  addTitle: 'Nova meta',
  editTitle: 'Editar meta',
  addedToast: 'Meta criada',
  empty: 'Criem uma meta: viagem de sonho, fundo de emergência, carro novo…',
  emptyIcon: 'target',
  fields: [
    { name: 'nome', label: 'Meta', placeholder: 'ex: Viagem ao Japão', required: true },
    { name: 'alvo', label: 'Valor a juntar (€)', type: 'money', required: true },
    { name: 'prazo', label: 'Até quando', type: 'date' },
    { name: 'foto', label: 'Imagem (opcional)', type: 'photo' },
  ],
  sort: (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
  item: (g) => {
    const s = saved(g);
    const pct = g.alvo ? Math.min(100, (s / g.alvo) * 100) : 0;
    const left = g.prazo ? daysUntil(parseISODate(g.prazo)) : null;
    const monthly = left > 0 && g.alvo > s ? (g.alvo - s) / Math.max(1, left / 30.4) : 0;
    return html`
      ${g.foto ? html`<img class="record__thumb" src="${g.foto}" alt="" loading="lazy">` : html`<span class="record__icon">${icon('target', 18)}</span>`}
      <span class="record__main">
        <span class="record__title">${g.nome}</span>
        <span class="record__meta">${money(s)} de ${money(g.alvo)}${g.prazo ? ` · até ${isoToShort(g.prazo)}` : ''}</span>
        <span class="progress ${pct >= 100 ? 'progress--done' : ''}"><span style="width:${pct.toFixed(1)}%"></span></span>
        <span class="record__meta">${perMember(g).map(([uid, v]) => `${memberName(uid)}: ${money(v)}`).join(' · ')}${monthly ? ` · faltam ~${money(monthly)}/mês` : ''}</span>
      </span>
      <button class="btn btn--small btn--primary pressable" data-action="goals:add" data-id="${g.id}">${pct >= 100 ? icon('check', 14) : icon('plus', 14)}</button>`;
  },
});

export default {
  id: 'goals',
  pages: [{
    id: 'menu-metas',
    title: 'Metas e poupanças',
    root: true,
    template: () => html`${goals.addButton('Nova meta')}${goals.template()}`,
  }],
  modals: () => goals.modals(),
  actions: {
    'goals:add': async ({ data }) => {
      const g = goals.items().find((x) => x.id === data.id);
      if (!g) return;
      const v = await promptDialog(`Quanto juntaste para "${g.nome}"?`, { title: 'Nova contribuição', type: 'number', placeholder: '€', confirmLabel: 'Adicionar' });
      const valor = Number(String(v || '').replace(',', '.'));
      if (!valor) return;
      await updateDoc(sharedDoc('metas', g.id), { contribuicoes: arrayUnion({ uid: session.uid, valor, data: todayISO(), ts: Date.now() }) });
      const total = saved(g) + valor;
      toast(total >= g.alvo ? `Meta "${g.nome}" atingida! 🎉` : `+${money(valor)} para "${g.nome}"`);
    },
  },
  start() { goals.subscribe(scope); },
  stop() { scope.clear(); },
};
