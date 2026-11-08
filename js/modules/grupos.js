// Grupos: família, amigos, casal ou casa partilhada. Posso estar em vários e escolher o ativo,
// convidar pessoas com um código e partilhar só algumas páginas com quem não está no grupo.
// Mostra também o indicador de "modo colaborativo" na barra de cima.
import { html, byId, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { session, emit, on, createScope } from '../core/state.js';
import { toast, confirmDialog, withLoading, promptDialog } from '../core/ui.js';
import { currentPage, navigate } from '../core/router.js';
import { isoToShort } from '../core/format.js';
import { daysUntil, parseISODate, nextYearly } from '../core/dates.js';
import { updateDoc } from '../services/firebase.js';
import { householdDoc } from '../services/paths.js';
import {
  createHousehold, joinHousehold, newInviteCode, renameHousehold, leaveHousehold, loadHousehold,
  switchHousehold, setTipoHousehold, removeMember, loadGrupos,
} from '../services/household.js';
import {
  partilharPagina, entrarPartilha, sairPartilha, novoCodigoPartilha, membrosPartilha, ligacaoDe,
} from '../services/partilhas.js';
import {
  TIPOS_GRUPO, tipoGrupo, PAGINAS_PARTILHAVEIS, paginaPartilhavel, modoColaborativo,
} from '../services/espacos.js';
import { avatar } from '../components/avatar.js';
import { actionSheet } from '../components/action-sheet.js';

const scope = createScope();
let tipoNovo = 'familia';
let mostrarCriar = false;

const primeiroNome = (n) => String(n || '').split(' ')[0];
const ativo = () => byId('menu-casal')?.classList.contains('is-active');

async function recarregar() {
  try { await loadHousehold(session.profile); } catch { /* sem rede: mantém o grupo atual */ }
  emit('household:changed');
  desenhar();
  desenharChip();
}

async function partilharTexto(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch { return; }
  }
  try { await navigator.clipboard?.writeText(text); toast('Copiado'); } catch { toast(text, 'success', 6000); }
}

// ---------- Criar / entrar ----------

function criarTpl({ primeiro }) {
  return html`
    <div class="card glass grupo-criar">
      <h3 class="card__title">${icon('plus', 18)} ${primeiro ? 'Criar o vosso grupo' : 'Criar outro grupo'}</h3>
      <div class="tipo-chips" role="radiogroup" aria-label="Tipo de grupo">
        ${TIPOS_GRUPO.map((t) => html`
          <button class="tipo-chip pressable ${t.id === tipoNovo ? 'is-active' : ''}" role="radio" aria-checked="${t.id === tipoNovo}"
            data-action="grupo:tipo-novo" data-tipo="${t.id}">${icon(t.icon, 16)}<span>${t.label}</span></button>`)}
      </div>
      <div class="field"><label class="field__label" for="grupo-nome">Nome</label>
        <input id="grupo-nome" class="input" placeholder="ex: Família Cordeiro" data-enter="grupo:criar"></div>
      <button class="btn btn--primary btn--block pressable" data-action="grupo:criar">Criar e obter código de convite</button>
    </div>
    <div class="card glass">
      <h3 class="card__title">${icon('userPlus', 18)} Tenho um código</h3>
      <p class="muted small">Serve para um grupo ou para uma página partilhada.</p>
      <div class="input-row">
        <input id="grupo-codigo" class="input input--code" placeholder="ABC123" maxlength="8" autocapitalize="characters" data-enter="grupo:entrar">
        <button class="btn btn--primary pressable" data-action="grupo:entrar">Entrar</button>
      </div>
    </div>`;
}

function semGrupoTpl() {
  return html`
    <div class="card glass couple-hero couple-hero--empty">
      <span class="couple-hero__icon">${icon('users', 34)}</span>
      <h2 class="couple-hero__title">Organizem-se juntos</h2>
      <p class="muted">Cria um grupo para a família, os amigos, o casal ou a casa partilhada. As tarefas, listas, receitas, finanças e o resto passam a ser de todos, em tempo real. Podes estar em vários grupos e escolher qual estás a ver.</p>
    </div>`;
}

// ---------- Grupo ativo ----------

function juntosTpl(h) {
  if (!h.desde) {
    return html`<button class="btn btn--glass btn--block pressable" data-action="grupo:desde">${icon('calendar', 16)} Desde quando estão juntos?</button>`;
  }
  const days = -daysUntil(parseISODate(h.desde));
  const next = nextYearly(h.desde);
  return html`
    <div class="stat-grid stat-grid--3">
      <div class="stat glass-soft"><span class="stat__num">${days.toLocaleString('pt-PT')}</span><span class="stat__label">dias juntos</span></div>
      <div class="stat glass-soft"><span class="stat__num">${Math.floor(days / 365.25)}</span><span class="stat__label">anos</span></div>
      <div class="stat glass-soft pressable" data-action="grupo:desde"><span class="stat__num">${daysUntil(next.date)}</span><span class="stat__label">dias até aos ${next.years} anos</span></div>
    </div>
    <p class="muted small center">Juntos desde ${isoToShort(h.desde)}</p>`;
}

function grupoTpl(h) {
  const tipo = tipoGrupo(h);
  const souDono = h.ownerUid === session.uid;
  const visiveis = session.members.slice(0, 5);
  const extra = session.members.length - visiveis.length;
  const colab = session.members.length > 1;
  return html`
    <div class="card glass couple-hero">
      <div class="couple-hero__avatars">
        ${visiveis.map((m) => avatar(m.name, m.avatar, 'lg'))}
        ${extra > 0 ? html`<span class="avatar avatar--lg avatar--ghost">+${extra}</span>` : ''}
        ${!colab ? html`<span class="avatar avatar--lg avatar--ghost">?</span>` : ''}
        <span class="couple-hero__heart">${icon(tipo.icon, 18)}</span>
      </div>
      <h2 class="couple-hero__title pressable" data-action="grupo:renomear">${h.name || 'O nosso grupo'} ${icon('edit', 14)}</h2>
      <button class="tipo-chip tipo-chip--small is-active pressable" data-action="grupo:mudar-tipo">${icon(tipo.icon, 14)}<span>${tipo.label}</span>${icon('chevronDown', 14)}</button>
      ${colab ? html`<span class="collab-pill">${icon('users', 14)} Modo colaborativo · ${session.members.length} pessoas</span>` : ''}
    </div>

    <div class="card glass">
      <h3 class="card__title">${icon('users', 18)} Membros</h3>
      <div class="grupo-membros">
        ${session.members.map((m) => html`
          <div class="grupo-membro">
            ${avatar(m.name, m.avatar, 'sm')}
            <span class="grupo-membro__nome">${m.uid === session.uid ? `${primeiroNome(m.name)} (eu)` : m.name}</span>
            ${m.uid === h.ownerUid ? html`<span class="tag">dono</span>` : ''}
            ${souDono && m.uid !== session.uid ? html`<button class="icon-btn icon-btn--subtle" data-action="grupo:remover" data-uid="${m.uid}" aria-label="Tirar do grupo">${icon('close', 16)}</button>` : ''}
          </div>`)}
      </div>
    </div>

    <div class="card glass invite-card">
      <h3 class="card__title">${icon('userPlus', 18)} Convidar pessoas</h3>
      <p class="muted small">Quem quiser entrar cria conta, abre "Grupos" e escreve este código. O mesmo código serve para várias pessoas.</p>
      <div class="invite-code" id="grupo-convite">${h.inviteCode || '------'}</div>
      <div class="btn-row">
        <button class="btn btn--glass pressable" data-action="grupo:novo-codigo">${icon('bolt', 16)} Novo código</button>
        <button class="btn btn--primary pressable" data-action="grupo:partilhar-codigo">${icon('share', 16)} Enviar</button>
      </div>
    </div>
    ${tipo.id === 'casal' ? html`<div class="card glass">${juntosTpl(h)}</div>` : ''}`;
}

// ---------- Os meus grupos ----------

function listaGruposTpl() {
  const grupos = session.grupos?.length ? session.grupos
    : (session.household ? [{ id: session.householdId, name: session.household.name, tipo: session.household.tipo, n: session.members.length }] : []);
  return html`
    <div class="card glass">
      <h3 class="card__title">${icon('grid', 18)} Os meus grupos</h3>
      <div class="grupo-lista">
        ${grupos.map((g) => html`
          <button class="grupo-item pressable ${g.id === session.householdId ? 'is-active' : ''}" data-action="grupo:mudar" data-id="${g.id}">
            <span class="grupo-item__icon">${icon(tipoGrupo(g).icon, 18)}</span>
            <span class="grupo-item__text"><strong>${g.name}</strong><span class="muted small">${tipoGrupo(g).label} · ${g.n} ${g.n === 1 ? 'pessoa' : 'pessoas'}</span></span>
            ${g.id === session.householdId ? icon('check', 18) : ''}
          </button>`)}
        <button class="grupo-item pressable ${!session.householdId ? 'is-active' : ''}" data-action="grupo:mudar" data-id="">
          <span class="grupo-item__icon">${icon('user', 18)}</span>
          <span class="grupo-item__text"><strong>Só eu</strong><span class="muted small">Espaço pessoal</span></span>
          ${!session.householdId ? icon('check', 18) : ''}
        </button>
      </div>
      ${session.householdId ? html`<button class="btn btn--glass btn--block pressable" data-action="grupo:mostrar-criar">${icon('plus', 16)} Criar ou entrar noutro grupo</button>` : ''}
    </div>`;
}

// ---------- Páginas partilhadas ----------

function partilhasTpl() {
  return html`
    <div class="card glass">
      <h3 class="card__title">${icon('share', 18)} Partilhar só algumas páginas</h3>
      <p class="muted small">Partilha uma página com quem não está ${session.householdId ? 'neste grupo' : 'contigo'} (ex.: a lista de compras com a avó). Quem entrar vê e edita só essa página.</p>
      <div class="grupo-lista">
        ${PAGINAS_PARTILHAVEIS.map((p) => {
          const lig = ligacaoDe(p.page);
          return html`
            <div class="partilha-item ${lig ? 'is-shared' : ''}">
              <span class="grupo-item__icon">${icon(p.icon, 18)}</span>
              <span class="grupo-item__text"><strong>${p.label}</strong>
                <span class="muted small">${lig ? html`Partilhada · código <b class="accent">${lig.code}</b>` : 'Só no teu espaço'}</span></span>
              ${lig
                ? html`<button class="btn btn--small btn--glass pressable" data-action="partilha:opcoes" data-page="${p.page}">Gerir</button>`
                : html`<button class="btn btn--small btn--primary pressable" data-action="partilha:criar" data-page="${p.page}">Partilhar</button>`}
            </div>`;
        })}
      </div>
    </div>`;
}

function desenhar() {
  if (!byId('grupos-body')) return;
  const h = session.household;
  const partes = h
    ? [grupoTpl(h), listaGruposTpl(), mostrarCriar ? criarTpl({ primeiro: false }) : '', partilhasTpl(),
      html`<button class="btn btn--danger-soft btn--block pressable" data-action="grupo:sair">${icon('logout', 16)} Sair deste grupo</button>`]
    : [semGrupoTpl(), session.householdIds?.length ? listaGruposTpl() : '', criarTpl({ primeiro: !session.householdIds?.length }), partilhasTpl()];
  render('grupos-body', html`${partes}`, { stagger: true });
}

// ---------- Indicador na barra de cima + seletor de grupos ----------

function desenharChip() {
  const btn = byId('topbar-grupo');
  if (!btn) return;
  const page = currentPage();
  const colab = session.uid ? modoColaborativo(page, session) : null;
  const n = colab?.tipo === 'grupo' ? session.members.length : 0;
  btn.classList.toggle('is-collab', !!colab);
  btn.classList.toggle('is-shared', colab?.tipo === 'partilha');
  btn.hidden = !session.uid;
  const titulo = colab?.tipo === 'partilha'
    ? `Página partilhada: ${colab.nome}`
    : colab ? `Modo colaborativo: ${session.household?.name || 'grupo'} (${n} pessoas)`
      : session.household ? `Grupo: ${session.household.name}` : 'Só eu';
  btn.setAttribute('aria-label', titulo);
  btn.title = titulo;
  btn.innerHTML = String(html`
    <span class="collab-chip__icon">${icon(colab?.tipo === 'partilha' ? 'share' : session.household ? tipoGrupo(session.household).icon : 'user', 17)}</span>
    ${n > 1 ? html`<span class="collab-chip__n">${n}</span>` : ''}
    ${colab ? html`<span class="collab-chip__dot" aria-hidden="true"></span>` : ''}`);
}

function montarChip() {
  if (byId('topbar-grupo')) return;
  const lado = document.querySelector('.topbar__side--right');
  if (!lado) return;
  const btn = document.createElement('button');
  btn.id = 'topbar-grupo';
  btn.className = 'collab-chip pressable';
  btn.dataset.action = 'grupo:seletor';
  btn.hidden = true;
  lado.prepend(btn);
}

async function seletor() {
  const page = currentPage();
  const partilhavel = paginaPartilhavel(page);
  const lig = partilhavel ? ligacaoDe(page) : null;
  const itens = [
    ...(session.grupos || []).map((g) => ({ id: `g:${g.id}`, label: `${g.name} · ${g.n} ${g.n === 1 ? 'pessoa' : 'pessoas'}`, icon: tipoGrupo(g).icon, active: g.id === session.householdId })),
    { id: 'g:', label: 'Só eu (pessoal)', icon: 'user', active: !session.householdId },
  ];
  if (partilhavel) {
    itens.push(lig
      ? { id: 'p:gerir', label: `${partilhavel.label}: partilhada (${lig.code})`, icon: 'share' }
      : { id: 'p:criar', label: `Partilhar "${partilhavel.label}"…`, icon: 'share' });
  }
  itens.push({ id: 'gerir', label: 'Gerir grupos e partilhas', icon: 'settings' });
  const titulo = lig ? `Esta página está partilhada (${lig.nome})` : session.household ? `Estás em: ${session.household.name}` : 'Estás no teu espaço pessoal';
  const escolha = await actionSheet(itens, { title: titulo });
  if (!escolha) return;
  if (escolha === 'gerir') return navigate('menu-casal');
  if (escolha === 'p:criar') return criarPartilha(page);
  if (escolha === 'p:gerir') return opcoesPartilha(page);
  if (escolha.startsWith('g:')) return mudar(escolha.slice(2) || null);
}

async function mudar(hid) {
  if ((hid || null) === (session.householdId || null)) return;
  try {
    await switchHousehold(hid);
  } catch {
    return toast('Sem ligação: não foi possível mudar de grupo.', 'error');
  }
  emit('household:changed');
  toast(hid ? `Agora estás em ${session.household?.name || 'grupo'}` : 'Agora estás no teu espaço pessoal');
  desenhar();
  desenharChip();
}

async function criarPartilha(page, el) {
  const p = paginaPartilhavel(page);
  const ok = await confirmDialog(`Crias um código para outra pessoa ver e editar "${p.label}" contigo${session.householdId ? ' e com o grupo' : ''}. Os dados atuais desta página vão junto.`, { title: `Partilhar ${p.label}?`, confirmLabel: 'Partilhar' });
  if (!ok) return;
  let code;
  try {
    code = await withLoading(el || null, () => partilharPagina(page));
  } catch (err) {
    return toast(err.message || 'Não foi possível partilhar.', 'error');
  }
  emit('household:changed');
  desenhar();
  desenharChip();
  await partilharTexto(`Partilhei "${p.label}" contigo no Nós. Toca no link ou, em "Grupos", usa o código ${code}:\n${linkConvite(code)}`);
}

async function opcoesPartilha(page) {
  const p = paginaPartilhavel(page);
  const lig = ligacaoDe(page);
  if (!lig) return;
  let membros = [];
  try { membros = await membrosPartilha(lig.sid); } catch { /* sem rede */ }
  const quem = membros.map((m) => (m.uid === session.uid ? 'eu' : primeiroNome(m.name))).join(', ');
  const escolha = await actionSheet([
    { id: 'enviar', label: `Enviar código ${lig.code}`, icon: 'share' },
    { id: 'novo', label: 'Novo código', icon: 'bolt' },
    { id: 'sair', label: 'Deixar de partilhar aqui', icon: 'logout', danger: true },
  ], { title: `${p.label}${quem ? ` · ${quem}` : ''}` });
  if (escolha === 'enviar') return partilharTexto(`Partilhei "${p.label}" contigo no Nós. Toca no link ou, em "Grupos", usa o código ${lig.code}:\n${linkConvite(lig.code)}`);
  if (escolha === 'novo') {
    await novoCodigoPartilha(page);
    toast('Novo código criado');
  } else if (escolha === 'sair') {
    const ok = await confirmDialog(`"${p.label}" volta a ser só ${session.householdId ? 'do grupo' : 'tua'}. Fica uma cópia do que está na partilha, para nada se perder; os outros continuam a ver a partilha.`, { title: 'Deixar de partilhar?', confirmLabel: 'Deixar', danger: true });
    if (!ok) return;
    await sairPartilha(page);
    emit('household:changed');
    toast('A página voltou ao teu espaço');
  } else return;
  desenhar();
  desenharChip();
}


/** Entra num grupo ou numa página partilhada (o código diz qual é). */
async function entrarComCodigo(code, btn = null) {
  try {
    await withLoading(btn, () => joinHousehold(code));
    toast('Bem-vindo(a) ao grupo!');
    mostrarCriar = false;
    return await recarregar();
  } catch (err) {
    if (!/página partilhada/.test(err.message || '')) return toast(err.message || 'Não foi possível entrar.', 'error', 3500);
  }
  try {
    const page = await withLoading(btn, () => entrarPartilha(code));
    toast(`Agora vês "${paginaPartilhavel(page)?.label || 'a página'}" partilhada`);
    emit('household:changed');
    desenhar();
    desenharChip();
  } catch (err) {
    toast(err.message || 'Não foi possível entrar.', 'error', 3500);
  }
}

/** Link de convite: abre a app já com o código (…/?convite=ABC123). */
const linkConvite = (code) => `${location.origin}${location.pathname}?convite=${encodeURIComponent(code)}`;

let conviteLido = false;
function conviteDoLink() {
  if (conviteLido) return;
  conviteLido = true;
  const url = new URL(location.href);
  const code = (url.searchParams.get('convite') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return;
  url.searchParams.delete('convite');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  setTimeout(async () => {
    navigate('menu-casal');
    const ok = await confirmDialog(`Recebeste um convite com o código ${code}. Queres entrar?`, { title: 'Convite', confirmLabel: 'Entrar' });
    if (ok) await entrarComCodigo(code);
  }, 600);
}

export default {
  id: 'grupos',
  pages: [{
    id: 'menu-casal',
    width: 'medium',
    title: 'Grupos',
    template: () => html`<div id="grupos-body"></div>`,
    onEnter: () => { loadGrupos().catch(() => {}); desenhar(); },
  }],
  actions: {
    'grupo:seletor': seletor,
    'grupo:tipo-novo': ({ el }) => {
      tipoNovo = el.dataset.tipo;
      document.querySelectorAll('.grupo-criar .tipo-chip').forEach((b) => {
        const on = b.dataset.tipo === tipoNovo;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      });
    },
    'grupo:mostrar-criar': () => { mostrarCriar = !mostrarCriar; desenhar(); },
    'grupo:criar': async ({ el }) => {
      const nome = byId('grupo-nome')?.value.trim() || `O nosso grupo (${tipoGrupo({ tipo: tipoNovo }).label})`;
      try {
        await withLoading(el.tagName === 'BUTTON' ? el : null, () => createHousehold(nome, tipoNovo));
      } catch {
        return toast('Não foi possível criar o grupo. Tens internet?', 'error');
      }
      mostrarCriar = false;
      toast('Grupo criado! Envia o código a quem quiseres convidar.');
      await recarregar();
    },
    'grupo:entrar': ({ el }) => entrarComCodigo(byId('grupo-codigo')?.value, el.tagName === 'BUTTON' ? el : null),
    'grupo:mudar': ({ el }) => mudar(el.dataset.id || null),
    'grupo:novo-codigo': async () => {
      const code = await newInviteCode();
      session.household.inviteCode = code;
      desenhar();
    },
    'grupo:partilhar-codigo': () => partilharTexto(`Junta-te ao grupo "${session.household?.name}" no Nós! Toca no link ou, em "Grupos", usa o código ${session.household?.inviteCode}:\n${linkConvite(session.household?.inviteCode)}`),
    'grupo:renomear': async () => {
      const name = await promptDialog('Nome do grupo', { value: session.household?.name || '' });
      if (!name?.trim()) return;
      await renameHousehold(name.trim());
      session.household.name = name.trim();
      loadGrupos().catch(() => {});
      desenhar();
      desenharChip();
    },
    'grupo:mudar-tipo': async () => {
      const atual = tipoGrupo(session.household).id;
      const tipo = await actionSheet(TIPOS_GRUPO.map((t) => ({ id: t.id, label: t.label, icon: t.icon, active: t.id === atual })), { title: 'Tipo de grupo' });
      if (!tipo || tipo === atual) return;
      await setTipoHousehold(tipo);
      session.household.tipo = tipo;
      loadGrupos().catch(() => {});
      emit('household:update', session.household);
      desenhar();
      desenharChip();
    },
    'grupo:remover': async ({ el }) => {
      const m = session.members.find((x) => x.uid === el.dataset.uid);
      const ok = await confirmDialog(`${m?.name || 'Esta pessoa'} deixa de ver os dados do grupo. Os dados ficam.`, { title: 'Tirar do grupo?', confirmLabel: 'Tirar', danger: true });
      if (!ok) return;
      await removeMember(el.dataset.uid);
      await recarregar();
    },
    'grupo:desde': async () => {
      const v = await promptDialog('Desde quando estão juntos?', { type: 'date', value: session.household?.desde || '' });
      if (!v) return;
      await updateDoc(householdDoc(), { desde: v.trim() });
      session.household.desde = v.trim();
      desenhar();
    },
    'grupo:sair': async () => {
      const ok = await confirmDialog('Deixas de ver os dados deste grupo. Os dados ficam guardados para quem lá continua.', { title: `Sair de ${session.household?.name || 'grupo'}?`, confirmLabel: 'Sair', danger: true });
      if (!ok) return;
      await leaveHousehold();
      await recarregar();
    },
    'partilha:criar': ({ el }) => criarPartilha(el.dataset.page, el),
    'partilha:opcoes': ({ el }) => opcoesPartilha(el.dataset.page),
  },
  start() {
    montarChip();
    desenharChip();
    conviteDoLink();
    scope.add(on('household:update', (h) => {
      // Mantém o resumo do grupo ativo (nome, tipo, nº de pessoas) igual ao documento.
      const g = session.grupos?.find((x) => x.id === h?.id);
      if (g) Object.assign(g, { name: h.name || g.name, tipo: h.tipo || 'casal', n: h.members?.length || g.n });
      if (ativo()) desenhar();
      desenharChip();
    }));
    scope.add(on('grupos:update', () => { if (ativo()) desenhar(); }));
    scope.add(on('route:change', desenharChip));
  },
  stop() {
    scope.clear();
    const btn = byId('topbar-grupo');
    if (btn) btn.hidden = true;
  },
};
