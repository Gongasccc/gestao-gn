// Juntos: o que o grupo faz em conjunto. Três separadores:
//   Atividade  — o que cada pessoa fez na app (sharedCol('atividade'), escrito por services/atividade.js)
//   Votações   — perguntas rápidas com opções ("Jantar de sábado: pizza ou sushi?") (sharedCol('votacoes'))
//   Eventos    — aniversários e eventos do grupo com ideias de presente partilhadas (sharedCol('eventos_grupo'))
import { html, byId, render, emptyState } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { createScope, session, memberName, on } from '../../core/state.js';
import { toast, openModal, closeModal, modalTemplate, confirmDialog, withLoading } from '../../core/ui.js';
import { relativeTime, isoToShort } from '../../core/format.js';
import { navigate } from '../../core/router.js';
import { tabsTpl, selectTab, positionIndicator } from '../../components/tabs.js';
import { avatar } from '../../components/avatar.js';
import { createRecordList } from '../../components/record-list.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { registarAtividade, COL_ATIVIDADE } from '../../services/atividade.js';
import { notifyUser } from '../../services/notifications.js';
import {
  resultado, votar, proximosEventos, textoFaltam, idadeQueFaz,
} from './logica.js';

export const PAG_JUNTOS = 'menu-juntos';
const COL_VOT = 'votacoes';
// Não usar 'eventos': é o nome do antigo Calendário e services/limpeza.js apaga-o.
const COL_EVT = 'eventos_grupo';
const scope = createScope();

let atividade = [];
const animado = new Set(); // cada lista só anima a entrada da primeira vez
const primeira = (k) => !animado.has(k) && animado.add(k);
let votacoes = [];
let rascunho = { pergunta: '', opcoes: ['', ''], multipla: false };

const membro = (uid) => session.members.find((m) => m.uid === uid);
const primeiroNome = (uid, fallback = '') => (uid === session.uid ? 'Tu' : memberName(uid) || fallback || 'Alguém');
const outros = () => session.members.filter((m) => m.uid !== session.uid).map((m) => m.uid);

// ---------- Atividade ----------

function rotuloDia(ts) {
  const d = new Date(ts);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  const t = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function desenharAtividade() {
  if (!byId('juntos-atividade')) return;
  if (!session.householdId) {
    render('juntos-atividade', emptyState('Quando estiveres num grupo, aparece aqui o que cada pessoa vai fazendo: compras riscadas, despesas, tarefas feitas…', icon('users', 28)));
    return;
  }
  if (!atividade.length) {
    render('juntos-atividade', emptyState('Ainda não há atividade. Risca algo da lista ou regista uma despesa e aparece aqui.', icon('clock', 28)));
    return;
  }
  const grupos = new Map();
  for (const a of atividade) {
    const dia = rotuloDia(a.quando);
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia).push(a);
  }
  render('juntos-atividade', [...grupos].map(([dia, itens]) => html`
    <h4 class="section-title">${dia}</h4>
    <ol class="feed glass">
      ${itens.map((a) => {
        const m = membro(a.quem);
        return html`
          <li class="feed__item ${a.page ? 'pressable' : ''}" ${a.page ? html`data-action="nav:go" data-page="${a.page}"` : ''}>
            <span class="feed__avatar">${avatar(m?.name || a.nome || '?', m?.avatar, 'sm')}<i class="feed__icon">${icon(a.icon || 'sparkles', 11)}</i></span>
            <span class="feed__text"><strong>${m?.name?.split(' ')[0] || a.nome || 'Alguém'}</strong> ${a.texto}</span>
            <time class="feed__time">${relativeTime(a.quando)}</time>
          </li>`;
      })}
    </ol>`), { stagger: primeira('atividade') });
}

// ---------- Votações ----------

function votacaoTpl(v) {
  const res = resultado(v);
  const meus = new Set([].concat(v.votos?.[session.uid] ?? []));
  const total = Object.keys(v.votos || {}).length;
  const faltam = session.members.filter((m) => m.uid !== session.uid && !(m.uid in (v.votos || {}))).map((m) => memberName(m.uid));
  const euFalto = !(session.uid in (v.votos || {}));
  const autor = v.criadoPor === session.uid;
  return html`
    <article class="poll glass ${v.fechada ? 'is-closed' : ''}" data-id="${v.id}">
      <header class="poll__head">
        <div>
          <h3 class="poll__q">${v.pergunta}</h3>
          <p class="poll__meta">${primeiroNome(v.criadoPor)} · ${relativeTime(v.criadaEm || Date.now())}${v.multipla ? ' · várias escolhas' : ''}</p>
        </div>
        ${autor || v.fechada ? html`<button class="icon-btn icon-btn--subtle" data-action="juntos:poll-menu" data-id="${v.id}" aria-label="Opções">${icon('more', 16)}</button>` : ''}
      </header>
      <ul class="poll__opts">
        ${res.map((o) => html`
          <li>
            <button class="poll__opt pressable ${meus.has(o.indice) ? 'is-mine' : ''} ${v.fechada && o.vence ? 'is-winner' : ''}"
              data-action="juntos:votar" data-id="${v.id}" data-i="${o.indice}" ${v.fechada ? 'disabled' : ''}>
              <span class="poll__bar" style="--pct:${o.pct}%"></span>
              <span class="poll__label">${meus.has(o.indice) ? icon('check', 14) : ''}${o.texto}</span>
              <span class="poll__faces">${o.quem.slice(0, 4).map((uid) => avatar(membro(uid)?.name || '?', membro(uid)?.avatar, 'xs'))}</span>
              <span class="poll__pct">${o.pct}%</span>
            </button>
          </li>`)}
      </ul>
      <footer class="poll__foot">
        ${v.fechada
          ? html`<span class="chip chip--accent">${icon('star', 12)} Ganhou: ${res.filter((o) => o.vence).map((o) => o.texto).join(' / ') || 'ninguém votou'}</span>`
          : html`<span>${total} ${total === 1 ? 'voto' : 'votos'}${euFalto ? ' · ainda não votaste' : faltam.length ? ` · falta${faltam.length === 1 ? '' : 'm'} ${faltam.join(', ')}` : ' · já todos votaram'}</span>`}
      </footer>
    </article>`;
}

function desenharVotacoes() {
  if (!byId('juntos-votacoes')) return;
  const abertas = votacoes.filter((v) => !v.fechada).sort((a, b) => (b.criadaEm || 0) - (a.criadaEm || 0));
  const fechadas = votacoes.filter((v) => v.fechada).sort((a, b) => (b.fechadaEm || 0) - (a.fechadaEm || 0)).slice(0, 10);
  render('juntos-votacoes', !votacoes.length
    ? emptyState('Sem votações. Cria uma para decidirem juntos onde jantar, que filme ver ou para onde ir.', icon('chart', 28))
    : html`${abertas.map(votacaoTpl)}${fechadas.length ? html`<h4 class="section-title">Decididas</h4>${fechadas.map(votacaoTpl)}` : ''}`);
}

function desenharRascunho() {
  render('juntos-poll-form', html`
    <div class="field">
      <label class="field__label" for="poll-q">Pergunta</label>
      <input class="input" id="poll-q" value="${rascunho.pergunta}" placeholder="Ex.: Jantar de sábado?" data-input="juntos:poll-q" maxlength="120">
    </div>
    <p class="field__label poll-form__label">Opções</p>
    <div class="poll-form__opts">
      ${rascunho.opcoes.map((o, i) => html`
        <div class="input-row">
          <input class="input" value="${o}" placeholder="Opção ${i + 1}" data-input="juntos:poll-opt" data-i="${i}" maxlength="60">
          ${rascunho.opcoes.length > 2 ? html`<button class="icon-btn icon-btn--subtle" data-action="juntos:poll-tirar" data-i="${i}" aria-label="Tirar opção">${icon('close', 16)}</button>` : ''}
        </div>`)}
    </div>
    ${rascunho.opcoes.length < 6 ? html`<button class="link" data-action="juntos:poll-mais">${icon('plus', 14)} Mais uma opção</button>` : ''}
    <div class="setting-row"><span>Pode escolher-se mais do que uma</span>
      <label class="switch"><input type="checkbox" ${rascunho.multipla ? 'checked' : ''} data-change="juntos:poll-multi"><span class="switch__track"></span></label></div>`);
}

// ---------- Eventos ----------

const TIPOS = [
  { value: 'aniversario', label: 'Aniversário' },
  { value: 'evento', label: 'Evento' },
];

const eventos = createRecordList({
  key: 'eventos',
  col: () => sharedCol(COL_EVT),
  docRef: (id) => sharedDoc(COL_EVT, id),
  addTitle: 'Novo evento',
  editTitle: 'Editar evento',
  addedToast: 'Evento guardado',
  atividade: (d) => ({ texto: `adicionou ${d.tipo === 'aniversario' ? 'o aniversário' : 'o evento'} ${d.titulo}`, icon: 'gift', page: PAG_JUNTOS }),
  empty: 'Sem eventos. Junta aniversários da família e dos amigos, jantares e saídas.',
  emptyIcon: 'gift',
  fields: [
    { name: 'titulo', label: 'Nome', placeholder: 'Ex.: Avó Maria, Jantar de Natal', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', options: TIPOS },
    { name: 'data', label: 'Data', type: 'date', required: true, hint: 'Nos aniversários põe a data de nascimento (o ano serve para saber a idade).' },
    { name: 'anual', label: 'Repete todos os anos', type: 'checkbox', default: true },
    { name: 'presentes', label: 'Ideias de presente (uma por linha)', type: 'textarea', placeholder: 'Livro\nPerfume' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
  beforeSave: (d, antes) => {
    const presentes = String(d.presentes || '').split('\n').map((t) => t.trim()).filter(Boolean);
    // Quem já disse que comprava continua associado ao mesmo presente (pelo texto).
    const quem = {};
    const antigos = (antes?.presentes || '').split('\n').map((t) => t.trim()).filter(Boolean);
    antigos.forEach((t, i) => { const j = presentes.indexOf(t); if (j >= 0 && antes?.compra?.[i]) quem[j] = antes.compra[i]; });
    return { ...d, presentes: presentes.join('\n'), compra: quem };
  },
  // A lista é desenhada à parte (por ordem da próxima data), por isso o item aqui é só o conteúdo do cartão.
  item: (e) => eventoTpl(e),
});

function eventoTpl(e) {
  const idade = idadeQueFaz(e);
  const presentes = String(e.presentes || '').split('\n').map((t) => t.trim()).filter(Boolean);
  const [, m, d] = (e.proxima || e.data || '').split('-');
  const mes = m ? new Date(2000, Number(m) - 1, 1).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '') : '';
  return html`
    <div class="evt">
      <span class="evt__date ${e.faltam === 0 ? 'is-today' : ''}"><strong>${d || '?'}</strong><small>${mes}</small></span>
      <span class="evt__body">
        <span class="evt__title">${e.tipo === 'aniversario' ? '🎂 ' : ''}${e.titulo}</span>
        <small class="evt__meta">${e.faltam != null ? textoFaltam(e.faltam) : ''}${idade ? ` · faz ${idade} anos` : ''}${e.anual ? '' : ` · ${isoToShort(e.data)}`}</small>
        ${presentes.length ? html`<span class="evt__gifts">${presentes.map((p, i) => {
          const q = e.compra?.[i];
          return html`<button class="gift-chip pressable ${q ? 'is-taken' : ''} ${q === session.uid ? 'is-mine' : ''}" data-action="juntos:presente" data-id="${e.id}" data-i="${i}">
            ${icon(q ? 'check' : 'gift', 12)} ${p}${q ? html` <em>${primeiroNome(q)}</em>` : ''}</button>`;
        })}</span>` : ''}
      </span>
    </div>`;
}

function desenharEventos() {
  if (!byId('juntos-eventos')) return;
  const lista = proximosEventos(eventos.items());
  render('juntos-eventos', lista.length
    ? lista.map((e) => html`<div class="record glass-soft pressable" data-action="rl:edit" data-list="eventos" data-id="${e.id}">${eventoTpl(e)}</div>`)
    : emptyState('Sem eventos. Junta aniversários da família e dos amigos, jantares e saídas.', icon('gift', 28)), { stagger: lista.length > 0 && primeira('eventos') });
}

/** Próximos eventos (para outros módulos, ex.: Lembretes do Início). */
export function proximosEventosGrupo(dias = 14) {
  return proximosEventos(eventos.items()).filter((e) => e.faltam <= dias);
}

// ---------- Página ----------

const template = () => html`
  <div class="juntos">
    ${tabsTpl('juntos', [{ id: 'atividade', label: 'Atividade' }, { id: 'votacoes', label: 'Votações' }, { id: 'eventos', label: 'Eventos' }])}
    <section data-tab-panel="juntos:atividade"><div id="juntos-atividade"></div></section>
    <section data-tab-panel="juntos:votacoes" hidden>
      <button class="btn btn--primary btn--block pressable" data-action="juntos:poll-nova">${icon('plus', 18)} Nova votação</button>
      <div class="card-stack juntos__polls" id="juntos-votacoes"></div>
    </section>
    <section data-tab-panel="juntos:eventos" hidden>
      ${eventos.addButton('Novo evento')}
      <div class="list juntos__evts" id="juntos-eventos"></div>
    </section>
  </div>`;

export default {
  id: 'juntos',
  pages: [{ id: PAG_JUNTOS, title: 'Juntos', root: true, template,
    onEnter: () => {
      desenharAtividade(); desenharVotacoes(); desenharEventos();
      requestAnimationFrame(() => positionIndicator(document.querySelector('[data-tabs="juntos"]')));
    } }],
  modals: () => html`
    ${eventos.modals()}
    ${modalTemplate('juntos-poll-modal', 'Nova votação', html`
      <div id="juntos-poll-form"></div>
      <div class="btn-row">
        <button class="btn" data-action="modal:close" data-modal="juntos-poll-modal">Cancelar</button>
        <button class="btn btn--primary" data-action="juntos:poll-criar">Criar</button>
      </div>`)}`,
  start() {
    atividade = []; votacoes = [];
    if (session.householdId) {
      scope.add(onSnapshot(query(sharedCol(COL_ATIVIDADE), orderBy('quando', 'desc'), limit(80)), (s) => {
        atividade = snapToList(s);
        desenharAtividade();
      }, () => {}));
    }
    desenharAtividade();
    scope.add(onSnapshot(sharedCol(COL_VOT), (s) => { votacoes = snapToList(s); desenharVotacoes(); }));
    eventos.subscribe(scope);
    scope.add(on('records:update', (k) => { if (k === 'eventos') desenharEventos(); }));
    scope.add(on('household:update', () => { desenharAtividade(); desenharVotacoes(); }));
  },
  stop() { scope.clear(); },
  actions: {
    'juntos:poll-nova': () => {
      rascunho = { pergunta: '', opcoes: ['', ''], multipla: false };
      desenharRascunho();
      openModal('juntos-poll-modal');
    },
    'juntos:poll-q': ({ value }) => { rascunho.pergunta = value; },
    'juntos:poll-opt': ({ data, value }) => { rascunho.opcoes[Number(data.i)] = value; },
    'juntos:poll-mais': () => { rascunho.opcoes.push(''); desenharRascunho(); byId('juntos-poll-form')?.querySelectorAll('[data-input="juntos:poll-opt"]')[rascunho.opcoes.length - 1]?.focus(); },
    'juntos:poll-tirar': ({ data }) => { rascunho.opcoes.splice(Number(data.i), 1); desenharRascunho(); },
    'juntos:poll-multi': ({ el }) => { rascunho.multipla = el.checked; },
    'juntos:poll-criar': async ({ el }) => {
      const pergunta = rascunho.pergunta.trim();
      const opcoes = rascunho.opcoes.map((o) => o.trim()).filter(Boolean);
      if (!pergunta) return toast('Escreve a pergunta.', 'error');
      if (opcoes.length < 2) return toast('Junta pelo menos duas opções.', 'error');
      await withLoading(el, () => addDoc(sharedCol(COL_VOT), {
        pergunta, opcoes, multipla: rascunho.multipla, votos: {}, fechada: false, criadoPor: session.uid, criadaEm: Date.now(),
      }));
      closeModal('juntos-poll-modal');
      registarAtividade(`criou a votação "${pergunta}"`, { icon: 'chart', page: PAG_JUNTOS });
      const nome = session.name.split(' ')[0];
      outros().forEach((uid) => notifyUser(uid, `🗳️ ${nome} quer saber: ${pergunta}`).catch(() => {}));
      toast('Votação criada');
    },
    'juntos:votar': async ({ data, el }) => {
      const v = votacoes.find((x) => x.id === data.id);
      if (!v || v.fechada) return;
      const votos = votar(v, session.uid, Number(data.i));
      v.votos = votos;
      el.closest('.poll')?.classList.add('is-voting');
      desenharVotacoes();
      await updateDoc(sharedDoc(COL_VOT, v.id), { votos });
    },
    'juntos:poll-menu': async ({ data }) => {
      const v = votacoes.find((x) => x.id === data.id);
      if (!v) return;
      const { actionSheet } = await import('../../components/action-sheet.js');
      const op = await actionSheet([
        ...(v.criadoPor === session.uid ? [v.fechada ? { id: 'abrir', label: 'Voltar a abrir' } : { id: 'fechar', label: 'Fechar e ver o vencedor' }] : []),
        { id: 'apagar', label: 'Apagar', danger: true },
      ], { title: v.pergunta });
      if (op === 'fechar') {
        await updateDoc(sharedDoc(COL_VOT, v.id), { fechada: true, fechadaEm: Date.now() });
        const venc = resultado(v).filter((o) => o.vence).map((o) => o.texto).join(' / ');
        if (venc) registarAtividade(`fechou "${v.pergunta}": ganhou ${venc}`, { icon: 'star', page: PAG_JUNTOS });
      } else if (op === 'abrir') {
        await updateDoc(sharedDoc(COL_VOT, v.id), { fechada: false });
      } else if (op === 'apagar' && await confirmDialog('A votação e os votos desaparecem.', { title: 'Apagar votação?', confirmLabel: 'Apagar', danger: true })) {
        await deleteDoc(sharedDoc(COL_VOT, v.id));
      }
    },
    'juntos:presente': async ({ data }) => {
      const e = eventos.items().find((x) => x.id === data.id);
      if (!e) return;
      const i = Number(data.i);
      const atual = e.compra?.[i];
      if (atual && atual !== session.uid) return toast(`${primeiroNome(atual)} já ficou com este presente.`);
      const compra = { ...(e.compra || {}) };
      if (atual) delete compra[i]; else compra[i] = session.uid;
      e.compra = compra;
      desenharEventos();
      await updateDoc(sharedDoc(COL_EVT, e.id), { compra });
      if (!atual) {
        const presente = String(e.presentes || '').split('\n').map((t) => t.trim()).filter(Boolean)[i];
        registarAtividade(`fica com o presente "${presente}" para ${e.titulo}`, { icon: 'gift', page: PAG_JUNTOS });
      }
    },
  },
};

// Abrir diretamente num separador (ex.: atalho "Nova votação").
export function abrirJuntos(separador = 'atividade') {
  navigate(PAG_JUNTOS);
  requestAnimationFrame(() => selectTab('juntos', separador));
}
