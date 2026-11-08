// Rotinas: tarefas que se repetem e rodam entre pessoas (ex.: "Limpar a casa de banho", todas as semanas,
// Ana → Bruno → Carla). Quem faz ganha pontos e há um ranking. As pessoas podem ser do grupo ou escritas à mão
// (ex.: filhos sem conta). Dados em sharedCol('rotinas'). Aparece na página Tarefas, separador Rotinas.
import { html, byId, render, emptyState } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session, memberName } from '../../core/state.js';
import { toast, openModal, closeModal, modalTemplate, confirmDialog, withLoading, promptDialog } from '../../core/ui.js';
import { registerActions } from '../../core/events.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { registarAtividade } from '../../services/atividade.js';
import { notifyUser } from '../../services/notifications.js';
import { isoToShort } from '../../core/format.js';
import {
  FREQUENCIAS, vezDe, concluirRotina, estadoRotina, ranking, diasAte, isoDia,
} from './logica.js';

const COL = 'rotinas';
let rotinas = [];
let form = null;
let animou = false;

const membrosComoPessoas = () => session.members.length
  ? session.members.map((m) => ({ id: m.uid, nome: memberName(m.uid, { short: false }) || m.name || 'Eu' }))
  : [{ id: session.uid, nome: session.name || 'Eu' }];
const nomeCurto = (p) => (p?.id === session.uid ? 'Tu' : String(p?.nome || '').split(' ')[0]);

function textoQuando(r) {
  const est = estadoRotina(r);
  if (!r.proxima || est === 'hoje') return { est, txt: 'Hoje' };
  const n = diasAte(r.proxima);
  if (n < 0) return { est, txt: n === -1 ? 'Atrasada 1 dia' : `Atrasada ${-n} dias` };
  if (n === 1) return { est, txt: 'Amanhã' };
  return { est, txt: n < 7 ? `Daqui a ${n} dias` : isoToShort(r.proxima, false) };
}

function rotinaTpl(r) {
  const vez = vezDe(r);
  const { est, txt } = textoQuando(r);
  const freq = FREQUENCIAS.find((f) => f.value === r.frequencia)?.label || '';
  return html`
    <div class="record glass-soft rot" data-id="${r.id}">
      <div class="rot__body pressable" data-action="rot:editar" data-id="${r.id}">
        <span class="rot__title">${r.nome}</span>
        <span class="rot__meta"><span class="rot__estado rot__estado--${est}">${txt}</span> · ${freq} · ${r.valor || 1} ${Number(r.valor) === 1 || !r.valor ? 'ponto' : 'pontos'}</span>
        <span class="rot__wheel">${(r.pessoas || []).map((p) => html`<span class="rot__pessoa ${p.id === vez?.id ? 'is-vez' : ''}">${nomeCurto(p)}</span>`)}</span>
      </div>
      <button class="btn btn--small btn--primary rot__feito pressable" data-action="rot:feito" data-id="${r.id}">${icon('check', 14)} ${vez?.id === session.uid ? 'Fiz' : 'Feito'}</button>
    </div>`;
}

function rankingTpl() {
  const rk = ranking(rotinas);
  if (!rk.length || !rk.some((p) => p.pontos)) return '';
  const max = Math.max(1, ...rk.map((p) => p.pontos));
  return html`
    <h4 class="section-title">Ranking</h4>
    <ol class="ranking glass">
      ${rk.map((p, i) => html`
        <li class="ranking__row">
          <span class="ranking__pos">${i === 0 ? '🏆' : i + 1}</span>
          <span>${p.id === session.uid ? 'Tu' : p.nome}</span>
          <span class="ranking__pts">${p.pontos}</span>
          <span class="ranking__bar"><i style="--pct:${Math.round((p.pontos / max) * 100)}%"></i></span>
        </li>`)}
    </ol>`;
}

export function desenharRotinas() {
  if (!byId('rotinas-lista')) return;
  const ord = { atrasada: 0, hoje: 1, 'em-breve': 2, ok: 3 };
  const lista = [...rotinas].sort((a, b) => ord[estadoRotina(a)] - ord[estadoRotina(b)] || String(a.proxima || '').localeCompare(String(b.proxima || '')));
  render('rotinas-lista', lista.length
    ? lista.map(rotinaTpl)
    : emptyState('Sem rotinas. Cria uma para as tarefas que se repetem (lixo, casa de banho, aspirar) e a vez passa sozinha para a pessoa seguinte.', icon('repeat', 28)), { stagger: lista.length > 0 && !animou });
  if (lista.length) animou = true;
  render('rotinas-ranking', rankingTpl());
}

export const rotinasTpl = () => html`
  <button class="btn btn--primary btn--block pressable" data-action="rot:nova">${icon('plus', 18)} Nova rotina</button>
  <div class="list" id="rotinas-lista" style="margin-top:12px"></div>
  <div id="rotinas-ranking"></div>`;

export const rotinasModal = () => modalTemplate('rot-modal', 'Rotina', html`
  <div id="rot-form"></div>
  <div class="btn-row">
    <button class="btn btn--danger-soft" id="rot-apagar" data-action="rot:apagar" hidden>${icon('trash', 16)}</button>
    <button class="btn" data-action="modal:close" data-modal="rot-modal">Cancelar</button>
    <button class="btn btn--primary" data-action="rot:guardar">Guardar</button>
  </div>`);

export function subscribeRotinas(scope) {
  scope.add(onSnapshot(sharedCol(COL), (s) => { rotinas = snapToList(s); desenharRotinas(); }));
}

/** Rotinas de hoje/atrasadas em que é a minha vez (para outros ecrãs). */
export const minhasRotinasHoje = () => rotinas.filter((r) => vezDe(r)?.id === session.uid && ['hoje', 'atrasada'].includes(estadoRotina(r)));

function desenharForm() {
  const candidatos = [...membrosComoPessoas(), ...form.extra];
  render('rot-form', html`
    <div class="field">
      <label class="field__label" for="rot-nome">Tarefa</label>
      <input class="input" id="rot-nome" value="${form.nome}" placeholder="Ex.: Pôr o lixo lá fora" data-input="rot:campo" data-campo="nome" maxlength="80">
    </div>
    <div class="field-row" style="margin-top:10px">
      <div class="field"><label class="field__label" for="rot-freq">Repete</label>
        <select class="input" id="rot-freq" data-change="rot:campo" data-campo="frequencia">
          ${FREQUENCIAS.map((f) => html`<option value="${f.value}" ${f.value === form.frequencia ? 'selected' : ''}>${f.label}</option>`)}
        </select></div>
      <div class="field"><label class="field__label" for="rot-valor">Pontos</label>
        <select class="input" id="rot-valor" data-change="rot:campo" data-campo="valor">
          ${[1, 2, 3, 5].map((n) => html`<option value="${n}" ${n === Number(form.valor) ? 'selected' : ''}>${n}</option>`)}
        </select></div>
    </div>
    <div class="field" style="margin-top:10px">
      <label class="field__label" for="rot-prox">Próxima vez</label>
      <input class="input" type="date" id="rot-prox" value="${form.proxima}" data-change="rot:campo" data-campo="proxima">
    </div>
    <p class="field__label poll-form__label">Quem entra na roda (toca pela ordem)</p>
    <div class="evt__gifts">
      ${candidatos.map((p) => {
        const i = form.pessoas.findIndex((x) => x.id === p.id);
        return html`<button class="gift-chip pressable ${i >= 0 ? 'is-mine' : ''}" data-action="rot:pessoa" data-id="${p.id}">${i >= 0 ? html`<strong>${i + 1}</strong>` : icon('plus', 12)} ${nomeCurto(p) === 'Tu' ? 'Eu' : p.nome}</button>`;
      })}
      <button class="gift-chip pressable" data-action="rot:pessoa-nova">${icon('userPlus', 12)} Outra pessoa</button>
    </div>
    ${form.pessoas.length ? html`<p class="setting-hint" style="margin-top:8px">Começa por ${form.pessoas[0].nome.split(' ')[0]}${form.pessoas.length > 1 ? `, depois ${form.pessoas.slice(1).map((p) => p.nome.split(' ')[0]).join(', ')}` : ''}.</p>` : ''}`);
}

function abrir(r = null) {
  form = r
    ? { id: r.id, nome: r.nome, frequencia: r.frequencia || 'semanal', valor: r.valor || 1, proxima: r.proxima || isoDia(new Date()),
      pessoas: [...(r.pessoas || [])], extra: (r.pessoas || []).filter((p) => !session.members.some((m) => m.uid === p.id) && p.id !== session.uid) }
    : { id: null, nome: '', frequencia: 'semanal', valor: 1, proxima: isoDia(new Date()), pessoas: membrosComoPessoas(), extra: [] };
  byId('rot-modal-title').textContent = r ? 'Editar rotina' : 'Nova rotina';
  byId('rot-apagar').hidden = !r;
  desenharForm();
  openModal('rot-modal');
}

registerActions({
  'rot:nova': () => abrir(),
  'rot:editar': ({ data }) => abrir(rotinas.find((r) => r.id === data.id)),
  'rot:campo': ({ data, value }) => { form[data.campo] = value; },
  'rot:pessoa': ({ data }) => {
    form.nome = byId('rot-nome')?.value ?? form.nome;
    const i = form.pessoas.findIndex((p) => p.id === data.id);
    if (i >= 0) form.pessoas.splice(i, 1);
    else form.pessoas.push([...membrosComoPessoas(), ...form.extra].find((p) => p.id === data.id));
    desenharForm();
  },
  'rot:pessoa-nova': async () => {
    form.nome = byId('rot-nome')?.value ?? form.nome;
    const nome = (await promptDialog('Nome da pessoa', { placeholder: 'Ex.: Tomás', confirmLabel: 'Juntar' }))?.trim();
    if (!nome) return;
    const p = { id: `nome:${nome.toLocaleLowerCase('pt')}`, nome };
    if (!form.extra.some((x) => x.id === p.id)) form.extra.push(p);
    if (!form.pessoas.some((x) => x.id === p.id)) form.pessoas.push(p);
    desenharForm();
  },
  'rot:guardar': async ({ el }) => {
    const nome = (byId('rot-nome')?.value || '').trim();
    if (!nome) return toast('Escreve a tarefa.', 'error');
    if (!form.pessoas.length) return toast('Escolhe pelo menos uma pessoa.', 'error');
    const dados = { nome, frequencia: form.frequencia, valor: Number(form.valor) || 1, proxima: form.proxima, pessoas: form.pessoas };
    await withLoading(el, async () => {
      if (form.id) await updateDoc(sharedDoc(COL, form.id), dados);
      else {
        await addDoc(sharedCol(COL), { ...dados, vez: 0, pontos: {}, historico: [], criadoPor: session.uid, criadaEm: Date.now() });
        registarAtividade(`criou a rotina "${nome}"`, { icon: 'repeat', page: 'menu-tarefas' });
      }
    });
    closeModal('rot-modal');
    toast(form.id ? 'Rotina guardada' : 'Rotina criada');
  },
  'rot:apagar': async () => {
    if (!form?.id) return;
    if (!await confirmDialog('A rotina e os pontos dela desaparecem.', { title: 'Apagar rotina?', confirmLabel: 'Apagar', danger: true })) return;
    await deleteDoc(sharedDoc(COL, form.id));
    closeModal('rot-modal');
  },
  'rot:feito': async ({ el, data }) => {
    const r = rotinas.find((x) => x.id === data.id);
    if (!r) return;
    const vez = vezDe(r);
    // Quem fez: a pessoa da vez, a não ser que eu esteja na roda e não seja a minha vez (troca de turno).
    let quem = vez?.id;
    const euNaRoda = (r.pessoas || []).some((p) => p.id === session.uid);
    if (euNaRoda && vez?.id !== session.uid && session.members.some((m) => m.uid === vez?.id)) {
      const fuiEu = await confirmDialog(`Era a vez de ${nomeCurto(vez)}. Quem fez?`, { title: r.nome, confirmLabel: 'Fui eu' });
      if (fuiEu) quem = session.uid;
    }
    const alt = concluirRotina(r, quem);
    el.closest('.rot')?.classList.add('is-spinning');
    Object.assign(r, alt);
    setTimeout(desenharRotinas, 260);
    await updateDoc(sharedDoc(COL, r.id), alt);
    const quemNome = (r.pessoas || []).find((p) => p.id === quem);
    const seguinte = vezDe({ ...r, ...alt });
    registarAtividade(`${quem === session.uid ? 'fez' : `marcou que ${nomeCurto(quemNome)} fez`} "${r.nome}" (+${r.valor || 1})`, { icon: 'repeat', page: 'menu-tarefas' });
    toast(`+${r.valor || 1} ${quem === session.uid ? 'para ti' : `para ${nomeCurto(quemNome)}`}. A seguir: ${nomeCurto(seguinte)}`);
    if (seguinte && seguinte.id !== session.uid && session.members.some((m) => m.uid === seguinte.id)) {
      notifyUser(seguinte.id, `🔁 ${r.nome}: agora é a tua vez (${isoToShort(alt.proxima, false)}).`).catch(() => {});
    }
  },
});
