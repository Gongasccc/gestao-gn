// Planos de tratamento da Farmácia: quem toma, quanto, a que horas (calculadas automaticamente) e durante
// quanto tempo. As tomas de hoje aparecem nas Tarefas (Início e página Tarefas) e nos Lembretes rápidos;
// marcar uma toma desconta a dose no inventário. Dados em sharedCol('tratamentos').
import { onSnapshot, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { notifyUser } from '../../services/notifications.js';
import { navigate, back } from '../../core/router.js';
import { html, raw, byId, render } from '../../core/dom.js';
import { toast, confirmDialog, withLoading } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { registerActions } from '../../core/events.js';
import { session, memberName, partnerUid, on, emit } from '../../core/state.js';
import {
  iso, calcularHoras, ordenarHoras, tomasDoDia, progresso, consumoDiario, estadoToma, momentoToma,
  textoFrequencia, textoDuracao, fimPlano, ultimoDiaTomas, tomasPorDia, pessoasDoPlano,
} from './plano.js';

const COL = 'tratamentos';
export const PAGINA_TRATAMENTO = 'page-farmacia-tratamento';

let planos = [];
let ctx = { medicamentos: () => [], aoMudar: null };
let form = null; // rascunho do formulário

const hoje = () => iso(new Date());
const membros = () => (session.members.length > 1 ? session.members.map((m) => m.uid) : [session.uid]);
const medDe = (id) => ctx.medicamentos().find((m) => m.id === id);
const unidadeCurta = (u, n) => { const t = u || 'unidades'; return Number(n) === 1 ? t.replace(/s$/, '') : t; };
const textoDose = (p) => `${String(Number(p.dose) || 1).replace('.', ',')} ${unidadeCurta(p.unidade, p.dose)}`;

function nomePessoa(pessoa, plano) {
  if (pessoa === 'outro') return plano?.quemNome || 'Outra pessoa';
  if (pessoa === 'ambos') return 'Os dois';
  if (pessoa === session.uid && session.members.length < 2) return 'Eu';
  return memberName(pessoa) || 'Parceiro(a)';
}
const nomeQuem = (p) => (p.quem === 'ambos' ? 'Os dois' : nomePessoa(p.quem, p));

export const planosDoMed = (medId) => planos.filter((p) => p.medId === medId);
const ativo = (p) => !progresso(p, hoje(), membros()).terminou;

// ---------- Ligação ao Firestore ----------

export function iniciarTratamentos(scope, opcoes) {
  ctx = { ...ctx, ...opcoes };
  scope.add(onSnapshot(sharedCol(COL), (snap) => {
    planos = snapToList(snap);
    desenharTudo();
    avisarTomas();
    emit('records:update', 'tratamentos');
  }));
  let ultimoEstado = '';
  const relogio = setInterval(() => {
    // A cada minuto: atualiza os estados (agora/atrasada) e avisa quem tem de tomar.
    const estado = tomasDoDia(planos, hoje(), membros()).map((t) => `${t.chave}:${estadoToma(t)}`).join('|');
    if (estado !== ultimoEstado) { ultimoEstado = estado; desenharMedicacao(); emit('records:update', 'tratamentos'); }
    avisarTomas();
  }, 60_000);
  scope.add(() => clearInterval(relogio));
  scope.add(on('route:change', desenharMedicacao));
  scope.add(on('household:update', desenharMedicacao));
}

export function pararTratamentos() {
  planos = [];
  form = null;
}

function desenharTudo() {
  desenharMedicacao();
  ctx.aoMudar?.();
}

// ---------- Tomas ----------

function tomasDeHoje() { return tomasDoDia(planos, hoje(), membros()); }

// Avisa no momento da toma. Cada pessoa é avisada pelo seu próprio dispositivo (quem criou avisa pelas "outras pessoas").
async function avisarTomas() {
  const agora = new Date();
  for (const t of tomasDeHoje()) {
    if (t.feita || (t.plano.avisadas || []).includes(t.chave)) continue;
    const dif = (agora - momentoToma(t)) / 60_000;
    if (dif < 0 || dif > 30) continue;
    const minha = t.pessoa === session.uid || ((t.pessoa === 'outro' || t.pessoa === 'ambos') && t.plano.criadoPor === session.uid);
    if (!minha) continue;
    t.plano.avisadas = [...(t.plano.avisadas || []), t.chave];
    const para = t.pessoa === 'outro' ? ` (${nomePessoa('outro', t.plano)})` : '';
    try {
      await updateDoc(sharedDoc(COL, t.plano.id), { avisadas: arrayUnion(t.chave) });
      await notifyUser(session.uid, `💊 São ${t.hora}: hora de tomar ${t.plano.medNome}${para}, ${textoDose(t.plano)}.`);
      notificacaoLocal(`Hora de tomar ${t.plano.medNome}`, `${t.hora} · ${textoDose(t.plano)}${para}`, t.chave);
    } catch (e) { console.warn('[tratamentos] aviso falhou', e); }
  }
}

function notificacaoLocal(titulo, body, tag) {
  if (!session.profile?.allowNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(titulo, { body, icon: 'assets/brand/ninho-192.png', tag }))
    .catch(() => { try { new Notification(titulo, { body }); } catch { /* sem suporte */ } });
}

async function marcarToma(planoId, chave) {
  const plano = planos.find((p) => p.id === planoId);
  if (!plano) return;
  const feita = !(plano.feitas || []).includes(chave);
  plano.feitas = feita ? [...(plano.feitas || []), chave] : (plano.feitas || []).filter((k) => k !== chave);
  desenharMedicacao();
  await updateDoc(sharedDoc(COL, planoId), { feitas: feita ? arrayUnion(chave) : arrayRemove(chave) });
  // Desconta (ou devolve) a dose no inventário.
  const med = medDe(plano.medId);
  if (med && med.quantidade != null && med.quantidade !== '') {
    const dose = Number(plano.dose) || 1;
    const quantidade = Math.max(0, Math.round(((Number(med.quantidade) || 0) + (feita ? -dose : dose)) * 100) / 100);
    med.quantidade = quantidade;
    updateDoc(sharedDoc('farmacia', med.id), { quantidade }).catch(() => {});
  }
  if (feita) {
    const { feitas, total } = progresso(plano, hoje(), membros());
    if (total && feitas >= total) toast(`${plano.medNome}: tratamento concluído 🎉`);
  }
}

const tomaTpl = (t, agora) => {
  const estado = estadoToma(t, agora);
  const quem = session.members.length > 1 || t.pessoa === 'outro' ? nomePessoa(t.pessoa, t.plano) : '';
  return html`
    <li class="task med-toma med-toma--${estado} ${t.feita ? 'is-done' : ''}">
      <button class="task__check pressable" data-action="trat:toma" data-plano="${t.plano.id}" data-chave="${t.chave}" aria-label="${t.feita ? 'Desmarcar toma' : 'Marcar toma como feita'}">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>
      </button>
      <span class="med-toma__hora">${t.hora}</span>
      <span class="task__text med-toma__texto" data-action="trat:toma" data-plano="${t.plano.id}" data-chave="${t.chave}">
        <span>${t.plano.medNome}</span>
        <small>${[textoDose(t.plano), quem].filter(Boolean).join(' · ')}</small>
      </span>
      ${estado === 'atrasada' ? html`<span class="task__prio task__prio--alta">Atrasada</span>` : estado === 'agora' ? html`<span class="med-toma__agora">Agora</span>` : ''}
    </li>`;
};

/** Desenha "Medicação de hoje" em todos os blocos [data-meds-today] (Início e Tarefas). */
export function desenharMedicacao() {
  const caixas = document.querySelectorAll('[data-meds-today]');
  if (!caixas.length) return;
  const tomas = tomasDeHoje();
  const agora = new Date();
  caixas.forEach((box) => {
    if (!tomas.length) { render(box, ''); return; }
    const limit = Number(box.dataset.limit) || 0;
    const porFazer = tomas.filter((t) => !t.feita);
    const feitas = tomas.length - porFazer.length;
    const visiveis = limit ? porFazer.slice(0, limit) : tomas;
    render(box, html`
      <div class="meds-today__head">
        <span>${icon('pill', 14)} Medicação de hoje</span>
        <span>${feitas} de ${tomas.length} tomas</span>
      </div>
      ${visiveis.length
        ? html`<ul class="task-list">${visiveis.map((t) => tomaTpl(t, agora))}</ul>`
        : html`<p class="meds-today__ok">${icon('check', 14)} Já tomaram tudo o que havia para hoje.</p>`}
      ${limit && porFazer.length > limit ? html`<button class="link meds-today__mais" data-action="nav:go" data-page="menu-tarefas">+${porFazer.length - limit} tomas hoje</button>` : ''}`);
  });
}

/** Avisos para os Lembretes rápidos do Início: tomas para agora ou atrasadas. */
export function tratamentosAlertas() {
  const agora = new Date();
  // Uma linha por plano e pessoa: a toma em falta mais recente.
  const porPlano = new Map();
  tomasDeHoje()
    .filter((t) => ['agora', 'atrasada'].includes(estadoToma(t, agora)))
    .forEach((t) => porPlano.set(`${t.plano.id}:${t.pessoa}`, t));
  return [...porPlano.values()]
    .map((t) => ({
      fonte: 'Farmácia', icon: 'pill', tom: 'rose', page: 'menu-tarefas', ordem: 0,
      titulo: `Tomar ${t.plano.medNome}${session.members.length > 1 || t.pessoa === 'outro' ? ` (${nomePessoa(t.pessoa, t.plano)})` : ''}`,
      quando: estadoToma(t, agora) === 'atrasada' ? `Atrasada · ${t.hora}` : t.hora,
    }));
}

// ---------- Bloco no detalhe do medicamento ----------

function cartaoPlano(p) {
  const prog = progresso(p, hoje(), membros());
  const pct = prog.total ? Math.round((prog.feitas / prog.total) * 100) : 0;
  const proximas = tomasDeHoje().filter((t) => t.plano.id === p.id && !t.feita).map((t) => t.hora)
    .filter((h, i, a) => a.indexOf(h) === i);
  return html`
    <div class="trat-plano ${prog.terminou ? 'is-terminado' : ''}">
      <div class="trat-plano__topo">
        <strong>${nomeQuem(p)} · ${textoDose(p)}</strong>
        ${prog.terminou ? html`<span class="chip">Concluído</span>` : prog.dias ? html`<span class="chip farm-chip">Dia ${Math.max(1, Math.min(prog.diaAtual, prog.dias))} de ${prog.dias}</span>` : html`<span class="chip farm-chip">Contínuo</span>`}
      </div>
      <span class="trat-plano__linha">${icon('clock', 13)} ${textoFrequencia(p)}</span>
      <span class="trat-plano__linha">${icon('calendar', 13)} ${textoDuracao(p)}</span>
      ${p.notas ? html`<span class="trat-plano__linha">${icon('edit', 13)} ${p.notas}</span>` : ''}
      ${prog.total ? html`
        <div class="task-progress"><span class="task-progress__bar"><i style="width:${pct}%"></i></span><span>${prog.feitas} de ${prog.total} tomas</span></div>` : ''}
      ${!prog.terminou && proximas.length ? html`<span class="trat-plano__prox">Hoje ainda falta: ${proximas.join(' · ')}</span>` : ''}
      <div class="trat-plano__acoes">
        <button class="btn btn--small" data-action="trat:editar" data-id="${p.id}">${icon('edit', 14)} Editar</button>
        ${prog.terminou
          ? html`<button class="btn btn--small farm-apagar" data-action="trat:apagar" data-id="${p.id}">${icon('trash', 14)} Apagar</button>`
          : html`<button class="btn btn--small" data-action="trat:terminar" data-id="${p.id}">Terminar</button>`}
      </div>
    </div>`;
}

export function blocoTratamentos(m) {
  const lista = planosDoMed(m.id).sort((a, b) => Number(ativo(b)) - Number(ativo(a)) || String(b.inicio).localeCompare(String(a.inicio)));
  return html`
    <section class="farm-bloco trat glass"><h3>${icon('clock', 18)} Tratamento</h3>
      ${lista.length ? lista.map(cartaoPlano) : html`<p class="farm-dica">Se for para tomar durante algum tempo, planeia o tratamento: a app calcula as horas e as tomas aparecem nas Tarefas.</p>`}
      <button class="btn ${lista.some(ativo) ? '' : 'btn--primary'}" data-action="trat:novo" data-med="${m.id}">${icon('plus', 16)} Planear tratamento</button>
    </section>`;
}

// ---------- Formulário ----------

function novoForm(med, plano) {
  if (plano) return { ...plano, horas: ordenarHoras(plano.horas || calcularHoras(plano)), horasManuais: true };
  const f = {
    id: null, medId: med.id, medNome: med.nome, unidade: med.unidade || 'unidades',
    quem: session.uid, quemNome: '', dose: 1, modo: 'vezes', vezesDia: 3, intervaloHoras: 8, primeiraHora: '08:00',
    inicio: hoje(), dias: 7, notas: '', horasManuais: false,
  };
  f.horas = calcularHoras(f);
  return f;
}

function opcoesQuem() {
  const op = [{ id: session.uid, label: 'Eu' }];
  const p = partnerUid();
  if (p) op.push({ id: p, label: memberName(p) || 'Parceiro(a)' }, { id: 'ambos', label: 'Os dois' });
  op.push({ id: 'outro', label: 'Outra pessoa' });
  return op;
}

function resumoForm() {
  const f = form;
  const med = medDe(f.medId);
  const porDia = f.horas.length * pessoasDoPlano(f, membros()).length;
  const pessoas = pessoasDoPlano(f, membros()).length;
  const partes = [`${porDia} toma${porDia === 1 ? '' : 's'} por dia${pessoas > 1 ? ` (${f.horas.length} cada um)` : ''}`];
  const fim = fimPlano(f);
  if (fim) {
    const total = porDia * Number(f.dias);
    const precisa = total * (Number(f.dose) || 1);
    const ultimo = ultimoDiaTomas(f);
    partes.push(`${total} no total, a última a ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}`);
    const qtd = Number(med?.quantidade);
    if (med && Number.isFinite(qtd) && med.quantidade !== null && med.quantidade !== '') {
      const aviso = qtd < precisa
        ? html`<span class="trat-resumo__falta">${icon('alert', 13)} Precisam de ${precisa} ${unidadeCurta(f.unidade, precisa)} e só têm ${qtd}. Comprem mais uma caixa.</span>`
        : html`<span>${icon('check', 13)} Precisam de ${precisa} ${unidadeCurta(f.unidade, precisa)}: chega o que têm em casa (${qtd}).</span>`;
      return html`<p>${partes.join(' · ')}.</p>${aviso}`;
    }
  }
  return html`<p>${partes.join(' · ')}.</p>`;
}

function horasTpl() {
  return html`
    <div class="trat-horas">
      ${form.horas.map((h, i) => html`
        <span class="trat-hora">
          <input class="input" type="time" value="${h}" data-change="trat:hora" data-i="${i}" aria-label="Toma ${i + 1}">
          ${form.horas.length > 1 ? html`<button class="icon-btn icon-btn--subtle" data-action="trat:tirarHora" data-i="${i}" aria-label="Tirar esta hora">${icon('close', 14)}</button>` : ''}
        </span>`)}
      <button class="btn btn--small" data-action="trat:juntarHora">${icon('plus', 14)} Hora</button>
    </div>
    <p class="farm-dica">${form.horasManuais
      ? html`Horas acertadas à mão. <button class="link" data-action="trat:recalcular">Calcular de novo</button>`
      : 'Calculadas automaticamente a partir da primeira toma. Podes acertá-las.'}</p>`;
}

function atualizarParcial() {
  render('trat-horas-box', horasTpl());
  render('trat-resumo', resumoForm());
}

function renderForm() {
  const alvo = byId('trat-form');
  if (!alvo || !form) return;
  const f = form;
  const med = medDe(f.medId);
  const seg = (campo, valor, txt) => html`<button type="button" class="farm-tab ${f[campo] === valor ? 'is-active' : ''}" data-action="trat:escolher" data-campo="${campo}" data-v="${valor}">${txt}</button>`;
  render(alvo, html`
    <div class="trat-med glass">
      ${med?.foto ? html`<img class="farm-foto farm-foto--mini" src="${med.foto}" alt="">` : html`<div class="farm-foto farm-foto--mini farm-foto--vazia">${icon('pill', 16)}</div>`}
      <div><strong>${f.medNome}</strong><small>${[med?.dosagem, med?.forma].filter(Boolean).join(' · ')}</small></div>
    </div>

    <section class="farm-bloco glass"><h3>${icon('users', 18)} Quem toma</h3>
      <div class="task-chips">
        ${opcoesQuem().map((o) => html`<button type="button" class="task-chip ${f.quem === o.id ? 'is-on' : ''}" data-action="trat:escolher" data-campo="quem" data-v="${o.id}">${o.label}</button>`)}
      </div>
      ${f.quem === 'outro' ? html`<input class="input" id="trat-quem-nome" placeholder="Nome (ex.: Avó, Bebé)" value="${f.quemNome || ''}" data-input="trat:campo" data-campo="quemNome">` : ''}
      ${f.quem === 'ambos' ? html`<p class="farm-dica">Cada um marca a sua toma em separado.</p>` : ''}
    </section>

    <section class="farm-bloco glass"><h3>${icon('pill', 18)} Quantidade por toma</h3>
      <div class="farm-linha trat-dose">
        <input class="input" type="number" inputmode="decimal" min="0.25" step="0.25" value="${f.dose}" data-input="trat:campo" data-campo="dose" aria-label="Quantidade por toma">
        <span>${unidadeCurta(f.unidade, f.dose)}</span>
      </div>
    </section>

    <section class="farm-bloco glass"><h3>${icon('clock', 18)} Horas</h3>
      <div class="farm-tabs">${seg('modo', 'vezes', 'Vezes por dia')}${seg('modo', 'intervalo', 'De X em X horas')}</div>
      <div class="farm-campos2">
        ${f.modo === 'vezes'
          ? html`<div class="farm-campo"><label for="trat-vezes">Vezes por dia</label>
              <input class="input" id="trat-vezes" type="number" inputmode="numeric" min="1" max="12" value="${f.vezesDia}" data-input="trat:campo" data-campo="vezesDia"></div>`
          : html`<div class="farm-campo"><label for="trat-intervalo">De quantas em quantas horas</label>
              <input class="input" id="trat-intervalo" type="number" inputmode="numeric" min="1" max="24" value="${f.intervaloHoras}" data-input="trat:campo" data-campo="intervaloHoras"></div>`}
        <div class="farm-campo"><label for="trat-primeira">Primeira toma</label>
          <input class="input" id="trat-primeira" type="time" value="${f.primeiraHora}" data-change="trat:campo" data-campo="primeiraHora"></div>
      </div>
      <div id="trat-horas-box"></div>
    </section>

    <section class="farm-bloco glass"><h3>${icon('calendar', 18)} Duração</h3>
      <div class="farm-campos2">
        <div class="farm-campo"><label for="trat-inicio">Começa a</label>
          <input class="input" id="trat-inicio" type="date" value="${f.inicio}" data-change="trat:campo" data-campo="inicio"></div>
        <div class="farm-campo"><label for="trat-dias">Durante (dias)</label>
          <input class="input" id="trat-dias" type="number" inputmode="numeric" min="1" value="${f.dias ?? ''}" ${raw(f.dias ? '' : 'disabled')} placeholder="—" data-input="trat:campo" data-campo="dias"></div>
      </div>
      <label class="trat-continuo"><input type="checkbox" ${raw(f.dias ? '' : 'checked')} data-change="trat:continuo"> Contínuo (sem data de fim)</label>
    </section>

    <section class="farm-bloco glass"><h3>${icon('edit', 18)} Notas</h3>
      <input class="input" placeholder="Ex.: depois das refeições, com água" value="${f.notas || ''}" data-input="trat:campo" data-campo="notas">
    </section>

    <div class="trat-resumo glass" id="trat-resumo"></div>
    <button class="btn btn--primary farm-guardar" data-action="trat:guardar">${f.id ? 'Guardar alterações' : 'Começar tratamento'}</button>
    ${f.id ? html`<button class="btn farm-apagar" data-action="trat:apagar" data-id="${f.id}">${icon('trash', 18)} Apagar tratamento</button>` : ''}`);
  atualizarParcial();
}

// Atualiza a toma diária do medicamento (para "Dá para X dias") com base nos tratamentos ativos.
function sincronizarTomaDiaria(medId, lista) {
  const med = medDe(medId);
  if (!med) return;
  const consumo = consumoDiario(lista.filter((p) => p.medId === medId), hoje(), membros());
  const tomaDiaria = consumo > 0 ? Math.round(consumo * 100) / 100 : null;
  if ((med.tomaDiaria ?? null) !== tomaDiaria) updateDoc(sharedDoc('farmacia', medId), { tomaDiaria, avisadoStock: null }).catch(() => {});
}

const RECALCULA = new Set(['modo', 'vezesDia', 'intervaloHoras', 'primeiraHora']);

registerActions({
  'trat:toma': ({ data }) => marcarToma(data.plano, data.chave),
  'trat:novo': ({ data }) => {
    const med = medDe(data.med);
    if (!med) return;
    form = novoForm(med);
    navigate(PAGINA_TRATAMENTO);
  },
  'trat:editar': ({ data }) => {
    const p = planos.find((x) => x.id === data.id);
    if (!p) return;
    form = novoForm(medDe(p.medId) || { id: p.medId, nome: p.medNome }, p);
    navigate(PAGINA_TRATAMENTO);
  },
  'trat:escolher': ({ data }) => {
    if (!form) return;
    form[data.campo] = data.v;
    if (RECALCULA.has(data.campo) && !form.horasManuais) form.horas = calcularHoras(form);
    renderForm();
    if (data.campo === 'quem' && data.v === 'outro') setTimeout(() => byId('trat-quem-nome')?.focus(), 50);
  },
  'trat:campo': ({ data, value }) => {
    if (!form) return;
    const numerico = ['dose', 'vezesDia', 'intervaloHoras', 'dias'].includes(data.campo);
    form[data.campo] = numerico ? (value === '' ? '' : Number(String(value).replace(',', '.'))) : value;
    if (RECALCULA.has(data.campo)) {
      // Mudar a frequência volta a calcular as horas (é o que se espera); a primeira toma também.
      form.horasManuais = false;
      if (data.campo !== 'primeiraHora' || form.primeiraHora) form.horas = calcularHoras(form);
    }
    atualizarParcial();
  },
  'trat:hora': ({ data, value }) => {
    if (!form || !value) return;
    form.horas[Number(data.i)] = value;
    form.horas = ordenarHoras(form.horas);
    form.horasManuais = true;
    atualizarParcial();
  },
  'trat:tirarHora': ({ data }) => {
    form.horas.splice(Number(data.i), 1);
    form.horasManuais = true;
    atualizarParcial();
  },
  'trat:juntarHora': () => {
    const ultima = form.horas[form.horas.length - 1] || '08:00';
    const [h, m] = ultima.split(':').map(Number);
    form.horas = ordenarHoras([...form.horas, `${String((h + 2) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`]);
    form.horasManuais = true;
    atualizarParcial();
  },
  'trat:recalcular': () => { form.horasManuais = false; form.horas = calcularHoras(form); atualizarParcial(); },
  'trat:continuo': ({ el }) => {
    form.dias = el.checked ? null : 7;
    renderForm();
  },
  'trat:guardar': async ({ el }) => {
    const f = form;
    if (!f) return;
    if (f.quem === 'outro' && !String(f.quemNome || '').trim()) { toast('Escreve quem toma o medicamento.', 'error'); byId('trat-quem-nome')?.focus(); return; }
    if (!(Number(f.dose) > 0)) { toast('Indica a quantidade por toma.', 'error'); return; }
    if (!f.horas.length) { toast('Indica pelo menos uma hora.', 'error'); return; }
    if (f.dias !== null && !(Number(f.dias) >= 1)) { toast('Indica durante quantos dias.', 'error'); return; }
    if (!f.inicio) { toast('Indica quando começa.', 'error'); return; }
    const horas = ordenarHoras(f.horas);
    const dados = {
      medId: f.medId, medNome: f.medNome, unidade: f.unidade,
      quem: f.quem, quemNome: f.quem === 'outro' ? f.quemNome.trim() : '',
      dose: Number(f.dose), modo: f.modo, vezesDia: Number(f.vezesDia) || horas.length, intervaloHoras: Number(f.intervaloHoras) || 8,
      // A primeira toma do primeiro dia: a hora escolhida (ou a primeira das horas acertadas à mão).
      primeiraHora: horas.includes(f.primeiraHora) ? f.primeiraHora : horas[0],
      horas, inicio: f.inicio, dias: f.dias === null ? null : Number(f.dias), notas: String(f.notas || '').trim(),
      terminado: false, atualizadoEm: Date.now(),
    };
    if (f.id) {
      await withLoading(el, () => updateDoc(sharedDoc(COL, f.id), dados));
      toast('Tratamento atualizado');
    } else {
      await withLoading(el, () => addDoc(sharedCol(COL), { ...dados, feitas: [], avisadas: [], criadoPor: session.uid, criadoEm: Date.now() }));
      toast(`Tratamento planeado: ${tomasPorDia(dados)}x por dia. As tomas aparecem nas Tarefas.`);
      const outro = partnerUid();
      if (outro && (f.quem === outro || f.quem === 'ambos')) {
        notifyUser(outro, `💊 ${session.name.split(' ')[0]} planeou um tratamento para ti: ${f.medNome}, ${textoFrequencia(dados).toLowerCase()}.`).catch(() => {});
      }
    }
    sincronizarTomaDiaria(f.medId, [...planos.filter((p) => p.id !== f.id), { ...dados, id: f.id || 'novo' }]);
    form = null;
    back();
  },
  'trat:terminar': async ({ data }) => {
    const p = planos.find((x) => x.id === data.id);
    if (!p) return;
    const ok = await confirmDialog(`As tomas de ${p.medNome} deixam de aparecer nas Tarefas.`, { title: 'Terminar tratamento?', confirmLabel: 'Terminar' });
    if (!ok) return;
    await updateDoc(sharedDoc(COL, p.id), { terminado: true, terminadoEm: Date.now() });
    sincronizarTomaDiaria(p.medId, planos.filter((x) => x.id !== p.id));
    toast('Tratamento terminado');
  },
  'trat:apagar': async ({ data }) => {
    const p = planos.find((x) => x.id === data.id);
    if (!p) return;
    const ok = await confirmDialog(`O tratamento de ${p.medNome} e o registo das tomas vão ser apagados.`, { title: 'Apagar tratamento?', confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    const naPagina = byId(PAGINA_TRATAMENTO)?.classList.contains('is-active');
    await deleteDoc(sharedDoc(COL, p.id));
    sincronizarTomaDiaria(p.medId, planos.filter((x) => x.id !== p.id));
    if (naPagina) { form = null; back(); }
  },
});

export const paginaTratamento = {
  id: PAGINA_TRATAMENTO,
  title: () => (form?.id ? 'Editar tratamento' : 'Planear tratamento'),
  template: () => html`<div class="farm trat-form" id="trat-form"></div>`,
  onEnter: renderForm,
};
