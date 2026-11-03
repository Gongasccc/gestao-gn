// Lista de compras: lista semanal (por supermercado e por corredor) e lista rápida, partilhadas pelo casal.
// Semanal: cada artigo tem um supermercado e uma secção. A lista agrupa por supermercado e, dentro
// de cada um, pela ordem dos corredores (personalizável por loja), para passar em cada corredor uma vez.
// A app lembra-se da loja e da secção escolhidas para cada artigo (config/lista_compras.memoria).
import { html, byId, render, emptyState } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { money } from '../../core/format.js';
import { createScope, session, on } from '../../core/state.js';
import { toast, promptDialog, confirmDialog, openModal, closeModal, modalTemplate } from '../../core/ui.js';
import { tabsTpl, positionIndicator } from '../../components/tabs.js';
import { checklistTpl, subscribeChecklist } from '../../components/checklist.js';
import { actionSheet } from '../../components/action-sheet.js';
import { addDoc, updateDoc, deleteDoc, setDoc, onSnapshot } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { listaFaturas } from '../faturas/index.js';
import { compararPrecos } from '../faturas/stats.js';
import { corresponde } from '../faturas/produtos.js';
import {
  SECCOES, LOJAS_PADRAO, agruparLista, chaveArtigo, chaveLoja, ordemDaLoja, nomeSeccao, emojiSeccao, listaLojas, marcaLoja,
} from './seccoes.js';
import { LOGOS_SVG, LOGOS_SITE, faviconUrl } from './logos.js';

const scope = createScope();
export const PAG_LISTA = 'menu-lista-compras';
const COL = 'semanais';
const PREF_LOJA = 'ninho.lista.loja';

let itens = [];
let config = { memoria: {}, ordens: {}, lojas: [] };
let lojaAtual = lerPref();
let precos = null; // cache de compararPrecos(faturas)
let primeira = true;
let lojaOrdem = ''; // loja cuja ordem dos corredores está a ser editada
let ordemEdicao = [];

function lerPref() {
  try { return localStorage.getItem(PREF_LOJA) || ''; } catch { return ''; }
}
function guardarPref(v) {
  try { localStorage.setItem(PREF_LOJA, v); } catch { /* sem storage */ }
}

const cfgDoc = () => sharedDoc('config', 'lista_compras');
const guardarCfg = (dados) => setDoc(cfgDoc(), dados, { merge: true }).catch((e) => console.warn('[lista] config', e));

function todasLojas() {
  const dasFaturas = listaFaturas().map((f) => f.loja);
  const usadas = itens.map((i) => i.loja);
  return listaLojas(LOJAS_PADRAO, config.lojas || [], dasFaturas, usadas);
}

/** Preços pagos (das faturas) para um artigo: [{ loja, preco }] do mais barato para o mais caro. */
function precosDe(texto) {
  if (!precos) precos = compararPrecos(listaFaturas());
  const q = chaveArtigo(texto);
  if (!q) return null;
  return precos.find((p) => corresponde(p.nome, q)) || null;
}

function categoriaFaturas(texto) {
  return precosDe(texto)?.categoria || '';
}

// ---------- Desenho ----------

/** Selo da loja (sigla nas cores da marca). */
function seloTpl(loja, tam = 44) {
  const m = marcaLoja(loja);
  const estilo = `--marca:${m.cor};--marca2:${m.cor2};--marca-texto:${m.texto};--tam:${tam}px`;
  const sigla = html`<b class="lista-selo__sigla">${m.sigla}</b>`;
  if (LOGOS_SVG[m.id]) {
    return html`<span class="lista-selo lista-selo--logo" style="${estilo}" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="${LOGOS_SVG[m.id]}"/></svg></span>`;
  }
  if (LOGOS_SITE[m.id]) {
    return html`<span class="lista-selo lista-selo--logo" style="${estilo}" aria-hidden="true">
      <img src="${faviconUrl(LOGOS_SITE[m.id])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('sem-logo')">${sigla}</span>`;
  }
  return html`<span class="lista-selo" style="${estilo}" aria-hidden="true">${m.sigla}</span>`;
}

function lojasTpl() {
  const lojas = todasLojas();
  const sel = chaveLoja(lojaAtual);
  return html`
    <p class="lista-lojas__titulo">${lojaAtual ? html`Os artigos novos vão para o <strong>${lojaAtual}</strong>` : 'Escolhe o supermercado e os artigos novos ficam nele'}</p>
    <div class="lista-lojas" role="radiogroup" aria-label="Supermercado dos novos artigos">
      ${lojas.map((l) => {
        const ativo = lojaAtual && chaveLoja(l) === sel;
        return html`<button class="lista-loja-btn pressable ${ativo ? 'is-active' : ''}" data-action="lista:loja-atual" data-loja="${l}" role="radio" aria-checked="${ativo ? 'true' : 'false'}">
          ${seloTpl(l)}<span>${l}</span>${ativo ? html`<i class="lista-loja-btn__ok">${icon('check', 12)}</i>` : ''}
        </button>`;
      })}
      <button class="lista-loja-btn pressable" data-action="lista:nova-loja"><span class="lista-selo lista-selo--novo" style="--tam:44px">${icon('plus', 18)}</span><span>Outro</span></button>
      <button class="lista-loja-btn pressable ${!lojaAtual ? 'is-active' : ''}" data-action="lista:loja-atual" data-loja="" role="radio" aria-checked="${!lojaAtual ? 'true' : 'false'}"><span class="lista-selo lista-selo--auto" style="--tam:44px">${icon('sparkles', 18)}</span><span>Automático</span></button>
    </div>`;
}

function atualizarEntrada() {
  const input = byId('lista-input');
  if (input) input.placeholder = lojaAtual ? `Adicionar ao ${lojaAtual}…` : 'Adicionar artigo…';
  render('lista-input-selo', lojaAtual ? seloTpl(lojaAtual, 34) : html`<span class="lista-selo lista-selo--auto" style="--tam:34px">${icon('cart', 16)}</span>`);
}

function artigoTpl(i) {
  return html`
    <div class="list-item glass-soft ${i.feita ? 'is-done' : ''}" data-id="${i.id}">
      <button class="check pressable" data-action="lista:toggle" data-id="${i.id}" data-done="${i.feita ? '1' : ''}" aria-label="Marcar">${icon('check', 14)}</button>
      <span class="list-item__text" data-action="lista:toggle" data-id="${i.id}" data-done="${i.feita ? '1' : ''}">${i.texto}</span>
      ${i.feita && i.loja ? html`<small class="lista-item__loja">${i.loja}</small>` : ''}
      <button class="icon-btn icon-btn--subtle" data-action="lista:opcoes" data-id="${i.id}" aria-label="Supermercado e secção">${icon('more', 16)}</button>
    </div>`;
}

function grupoTpl(g, feitosLoja) {
  const total = g.total + feitosLoja;
  const pct = total ? Math.round((feitosLoja / total) * 100) : 0;
  if (!g.chave) {
    return html`
      <section class="card glass lista-loja lista-loja--sem">
        <div class="lista-loja__topo">
          <h3 class="card__title">${icon('cart', 18)} Sem supermercado <span class="chip chip--muted">${g.total}</span></h3>
          ${lojaAtual ? html`<button class="btn btn--small pressable" data-action="lista:atribuir-todos">Pôr no ${lojaAtual}</button>` : ''}
        </div>
        <p class="fat-meta">Toca em ${icon('more', 14)} para escolher o supermercado de cada artigo.</p>
        ${seccoesTpl(g)}
      </section>`;
  }
  const m = marcaLoja(g.loja);
  return html`
    <section class="card glass lista-loja" style="--marca:${m.cor};--marca2:${m.cor2};--marca-texto:${m.texto}">
      <header class="lista-loja__banner">
        <button class="lista-loja__id pressable" data-action="lista:loja-atual" data-loja="${g.loja}" aria-label="Adicionar artigos ao ${g.loja}">
          ${seloTpl(g.loja, 46)}
          <span class="lista-loja__nome"><strong>${g.loja}</strong><small>${g.total} ${g.total === 1 ? 'artigo' : 'artigos'} · ${g.seccoes.length} ${g.seccoes.length === 1 ? 'corredor' : 'corredores'}</small></span>
        </button>
        <button class="lista-loja__btn pressable" data-action="lista:ordem" data-loja="${g.loja}" aria-label="Ordem dos corredores">${icon('repeat', 14)} Corredores</button>
        <div class="lista-loja__progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" title="${feitosLoja} de ${total} no carrinho"><span style="width:${pct}%"></span></div>
      </header>
      ${seccoesTpl(g)}
    </section>`;
}

function seccoesTpl(g) {
  return g.seccoes.map((s, n) => html`
    <h4 class="lista-seccao"><span class="lista-seccao__n">${n + 1}</span><span class="lista-seccao__emoji" aria-hidden="true">${emojiSeccao(s.id)}</span>${s.nome}</h4>
    <div class="list">${s.itens.map(artigoTpl)}</div>`);
}

function desenhar() {
  const alvo = byId('lista-semanal');
  if (!alvo) return;
  render('lista-lojas-wrap', lojasTpl());
  atualizarEntrada();
  const { grupos, feitos } = agruparLista(itens, { memoria: config.memoria || {}, ordens: config.ordens || {}, categoria: categoriaFaturas });
  const feitosPorLoja = new Map();
  for (const f of feitos) {
    const k = f.loja ? chaveLoja(f.loja) : '';
    feitosPorLoja.set(k, (feitosPorLoja.get(k) || 0) + 1);
  }
  const pendentes = grupos.reduce((n, g) => n + g.total, 0);
  const resumo = byId('lista-resumo');
  if (resumo) {
    const lojas = grupos.filter((g) => g.chave).length;
    resumo.textContent = pendentes
      ? `${pendentes} ${pendentes === 1 ? 'artigo' : 'artigos'} por comprar${lojas ? ` em ${lojas} ${lojas === 1 ? 'supermercado' : 'supermercados'}` : ''}`
      : '';
  }
  render(alvo, itens.length ? html`
    ${grupos.map((g) => grupoTpl(g, feitosPorLoja.get(g.chave) || 0))}
    ${!pendentes ? html`<div class="card glass">${emptyState('Está tudo no carrinho! 🎉')}</div>` : ''}
    ${feitos.length ? html`
      <section class="card glass lista-loja lista-loja--feitos">
        <div class="lista-loja__topo">
          <h3 class="card__title">${icon('check', 18)} No carrinho <span class="chip chip--muted">${feitos.length}</span></h3>
          <button class="btn btn--small pressable" data-action="lista:limpar">Limpar</button>
        </div>
        <div class="list">${feitos.map(artigoTpl)}</div>
      </section>` : ''}
  ` : html`<div class="card glass">${emptyState('Lista vazia. Escolhe o supermercado e adiciona o primeiro artigo!')}</div>`, { stagger: primeira });
  primeira = false;
}

// ---------- Ordem dos corredores ----------

function desenharOrdem() {
  render('lista-ordem-corpo', html`
    <p class="fat-meta">Põe as secções pela ordem em que passas no ${lojaOrdem}. A lista segue esta ordem.</p>
    <div class="list">
      ${ordemEdicao.map((id, n) => html`
        <div class="list-item glass-soft lista-ordem__item">
          <span class="lista-ordem__n">${n + 1}</span>
          <span class="list-item__text">${nomeSeccao(id)}</span>
          <button class="icon-btn icon-btn--subtle" data-action="lista:mover" data-i="${n}" data-d="-1" aria-label="Subir" ${n === 0 ? 'disabled' : ''}>${icon('chevronUp', 16)}</button>
          <button class="icon-btn icon-btn--subtle" data-action="lista:mover" data-i="${n}" data-d="1" aria-label="Descer" ${n === ordemEdicao.length - 1 ? 'disabled' : ''}>${icon('chevronDown', 16)}</button>
        </div>`)}
    </div>
    <div class="btn-row">
      <button class="btn pressable" data-action="lista:ordem-repor">Repor</button>
      <button class="btn btn--primary pressable" data-action="lista:ordem-guardar">Guardar</button>
    </div>`);
}

// ---------- Ações ----------

function lembrar(texto, dados) {
  const k = chaveArtigo(texto);
  if (!k) return;
  config.memoria = { ...(config.memoria || {}), [k]: { ...(config.memoria?.[k] || {}), ...dados } };
  guardarCfg({ memoria: { [k]: dados } });
}

async function escolherLoja(item) {
  const p = precosDe(item.texto);
  const preco = (loja) => p?.lojas.find((l) => chaveLoja(l.loja) === chaveLoja(loja));
  const lojas = todasLojas().sort((a, b) => (preco(a)?.preco ?? Infinity) - (preco(b)?.preco ?? Infinity));
  const atual = chaveLoja(item.loja || '');
  const escolha = await actionSheet([
    ...lojas.map((l, n) => {
      const v = preco(l);
      return { id: l, label: v ? `${l} · ${money(v.preco)}${n === 0 && p.lojas.length > 1 ? ' (mais barato)' : ''}` : l, active: item.loja && chaveLoja(l) === atual };
    }),
    { id: '__outro', label: 'Outro supermercado…', icon: 'plus' },
    { id: '__nenhum', label: 'Sem supermercado', active: !item.loja },
  ], { title: p ? `${item.texto} · preços que pagaram` : item.texto });
  if (!escolha) return;
  let loja = escolha;
  if (escolha === '__nenhum') loja = '';
  if (escolha === '__outro') {
    loja = (await promptDialog('Nome do supermercado', { placeholder: 'Ex.: Mercadona' }))?.trim();
    if (!loja) return;
    adicionarLojaPersonalizada(loja);
  }
  await updateDoc(sharedDoc(COL, item.id), { loja });
  lembrar(item.texto, { loja });
}

async function escolherSeccao(item, atual) {
  const escolha = await actionSheet(SECCOES.map((s) => ({ id: s.id, label: s.nome, active: s.id === atual })), { title: item.texto });
  if (!escolha) return;
  await updateDoc(sharedDoc(COL, item.id), { seccao: escolha });
  lembrar(item.texto, { seccao: escolha });
}

function adicionarLojaPersonalizada(loja) {
  const lojas = listaLojas(config.lojas || [], [loja]);
  if (lojas.length === (config.lojas || []).length) return;
  config.lojas = lojas;
  guardarCfg({ lojas });
}

const actions = {
  'lista:add': async () => {
    const input = byId('lista-input');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    const dados = { texto, feita: false, timestamp: Date.now(), createdBy: session.uid };
    if (lojaAtual) dados.loja = lojaAtual;
    await addDoc(sharedCol(COL), dados);
    if (lojaAtual) lembrar(texto, { loja: lojaAtual });
  },
  'lista:loja-atual': ({ data }) => {
    lojaAtual = data.loja || '';
    guardarPref(lojaAtual);
    render('lista-lojas-wrap', lojasTpl());
    atualizarEntrada();
    if (data.loja) toast(`A adicionar ao ${data.loja}`);
    byId('lista-input')?.focus();
  },
  'lista:nova-loja': async () => {
    const loja = (await promptDialog('Nome do supermercado', { placeholder: 'Ex.: Mercadona' }))?.trim();
    if (!loja) return;
    adicionarLojaPersonalizada(loja);
    lojaAtual = loja;
    guardarPref(loja);
    render('lista-lojas-wrap', lojasTpl());
    atualizarEntrada();
  },
  'lista:atribuir-todos': async () => {
    if (!lojaAtual) return;
    const { grupos } = agruparLista(itens.filter((i) => !i.feita), { memoria: config.memoria || {} });
    const sem = grupos.find((g) => !g.chave);
    const alvo = sem ? sem.seccoes.flatMap((x) => x.itens) : [];
    if (!alvo.length) return;
    await Promise.all(alvo.map((i) => updateDoc(sharedDoc(COL, i.id), { loja: lojaAtual })));
    alvo.forEach((i) => lembrar(i.texto, { loja: lojaAtual }));
    toast(`${alvo.length} ${alvo.length === 1 ? 'artigo passou' : 'artigos passaram'} para o ${lojaAtual}`);
  },
  'lista:toggle': async ({ el, data }) => {
    el.closest('.list-item')?.classList.toggle('is-done', !data.done);
    await updateDoc(sharedDoc(COL, data.id), { feita: !data.done });
  },
  'lista:opcoes': async ({ data }) => {
    const item = itens.find((i) => i.id === data.id);
    if (!item) return;
    const { grupos, feitos } = agruparLista([item], { memoria: config.memoria || {}, categoria: categoriaFaturas });
    const efetivo = grupos[0]?.seccoes[0]?.itens[0] || feitos[0] || item;
    const escolha = await actionSheet([
      { id: 'loja', label: `Supermercado: ${efetivo.loja || 'nenhum'}`, icon: 'cart' },
      { id: 'seccao', label: `Secção: ${nomeSeccao(efetivo.seccao)}`, icon: 'grid' },
      { id: 'apagar', label: 'Apagar', danger: true },
    ], { title: item.texto });
    if (escolha === 'loja') await escolherLoja({ ...item, loja: efetivo.loja });
    if (escolha === 'seccao') await escolherSeccao(item, efetivo.seccao);
    if (escolha === 'apagar') {
      document.querySelector(`#lista-semanal .list-item[data-id="${item.id}"]`)?.classList.add('is-removing');
      setTimeout(() => deleteDoc(sharedDoc(COL, item.id)), 220);
    }
  },
  'lista:limpar': async () => {
    const feitos = itens.filter((i) => i.feita);
    if (!feitos.length) return;
    const ok = await confirmDialog(`Tirar ${feitos.length} ${feitos.length === 1 ? 'artigo comprado' : 'artigos comprados'} da lista?`, { confirmLabel: 'Limpar' });
    if (!ok) return;
    await Promise.all(feitos.map((i) => deleteDoc(sharedDoc(COL, i.id))));
    toast('Lista limpa');
  },
  'lista:ordem': ({ data }) => {
    lojaOrdem = data.loja;
    ordemEdicao = ordemDaLoja(config.ordens?.[chaveLoja(lojaOrdem)]);
    byId('modal-lista-ordem-title').textContent = `Corredores · ${lojaOrdem}`;
    desenharOrdem();
    openModal('modal-lista-ordem');
  },
  'lista:mover': ({ data }) => {
    const i = Number(data.i);
    const j = i + Number(data.d);
    if (j < 0 || j >= ordemEdicao.length) return;
    [ordemEdicao[i], ordemEdicao[j]] = [ordemEdicao[j], ordemEdicao[i]];
    desenharOrdem();
  },
  'lista:ordem-repor': () => {
    ordemEdicao = ordemDaLoja([]);
    desenharOrdem();
  },
  'lista:ordem-guardar': async () => {
    const k = chaveLoja(lojaOrdem);
    config.ordens = { ...(config.ordens || {}), [k]: [...ordemEdicao] };
    desenhar();
    await closeModal('modal-lista-ordem');
    await guardarCfg({ ordens: { [k]: [...ordemEdicao] } });
    toast('Ordem dos corredores guardada');
  },
};

export default {
  id: 'shopping',
  pages: [
    {
      id: PAG_LISTA,
      width: 'narrow',
      title: 'Lista de compras',
      root: true,
      template: () => html`
        ${tabsTpl('lista', [{ id: 'semanal', label: 'Semanal' }, { id: 'rapida', label: 'Rápida' }])}
        <div data-tab-panel="lista:semanal">
          <div class="card glass lista-topo">
            <div class="input-row lista-entrada">
              <span id="lista-input-selo"></span>
              <input type="text" id="lista-input" class="input" placeholder="Adicionar artigo…" data-enter="lista:add" autocomplete="off">
              <button class="btn btn--primary btn--icon pressable" data-action="lista:add" aria-label="Adicionar">${icon('plus', 20)}</button>
            </div>
            <div id="lista-lojas-wrap"></div>
          </div>
          <p class="fat-meta lista-resumo" id="lista-resumo"></p>
          <div id="lista-semanal"></div>
        </div>
        <div data-tab-panel="lista:rapida" hidden>
          <div class="card glass">${checklistTpl('rapidas', 'Item urgente…')}</div>
        </div>`,
      onEnter: () => requestAnimationFrame(() => positionIndicator(document.querySelector('[data-tabs="lista"]'))),
    },
  ],
  modals: () => html`${modalTemplate('modal-lista-ordem', 'Corredores', html`<div id="lista-ordem-corpo"></div>`)}`,
  actions,
  start() {
    primeira = true;
    precos = null;
    scope.add(onSnapshot(sharedCol(COL), (snap) => { itens = snapToList(snap); desenhar(); }));
    scope.add(onSnapshot(cfgDoc(), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      config = { memoria: d.memoria || {}, ordens: d.ordens || {}, lojas: d.lojas || [] };
      desenhar();
    }, () => {}));
    scope.add(on('faturas:update', () => { precos = null; desenhar(); }));
    subscribeChecklist(scope, 'rapidas');
  },
  stop() { scope.clear(); },
};
