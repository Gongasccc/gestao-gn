// Lista de compras: lista semanal (por supermercado e por corredor) e lista rápida, partilhadas pelo casal.
// Semanal: cada artigo tem um supermercado e uma secção. A lista agrupa por supermercado e, dentro
// de cada um, pela ordem dos corredores (personalizável por loja), para passar em cada corredor uma vez.
// A app lembra-se da loja e da secção escolhidas para cada artigo (config/lista_compras.memoria).
// Cada artigo e cada supermercado mostram quanto deve custar (preços das faturas e promoções dos folhetos).
import { html, byId, render, emptyState } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { money, todayISO, isoToShort } from '../../core/format.js';
import { compressImage, readAsDataURL } from '../../core/images.js';
import { createScope, session, on } from '../../core/state.js';
import { toast, promptDialog, confirmDialog, openModal, closeModal, modalTemplate } from '../../core/ui.js';
import { tabsTpl, selectTab, positionIndicator } from '../../components/tabs.js';
import { navigate } from '../../core/router.js';
import { checklistTpl, subscribeChecklist } from '../../components/checklist.js';
import { actionSheet } from '../../components/action-sheet.js';
import { addDoc, updateDoc, deleteDoc, setDoc, onSnapshot } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { registarAtividade } from '../../services/atividade.js';
import { listaFaturas } from '../faturas/index.js';
import { compararPrecos } from '../faturas/stats.js';
import { corresponde } from '../faturas/produtos.js';
import {
  SECCOES, LOJAS_PADRAO, agruparLista, chaveArtigo, chaveLoja, ordemDaLoja, nomeSeccao, emojiSeccao, listaLojas, marcaLoja,
} from './seccoes.js';
import { categoria, nomeSub, rotulo } from '../../data/categorias.js';
import { seloTpl, folhetosTpl } from './selo.js';
import {
  indicePrecos, estimarLoja, estimarArtigo, melhorNoutraLoja, promoAtiva, promoAoPeso, promosDoArtigo, semanaIso,
  proximasCompras, quandoCompras, DIAS,
} from './precos.js';

const scope = createScope();
export const PAG_LISTA = 'menu-lista-compras';
const COL = 'semanais';
const PREF_LOJA = 'ninho.lista.loja';
const COL_PROMOS = 'promocoes';
const MAX_PAGINAS = 8;

let itens = [];
let config = { memoria: {}, ordens: {}, lojas: [] };
let lojaAtual = lerPref();
let precos = null; // cache de compararPrecos(faturas)
let indice = null; // cache de indicePrecos(faturas)
let promos = [];
let aLerFolheto = '';
let progresso = null; // { titulo, texto, pct, fim: '' | 'ok' | 'erro' } — barra flutuante em baixo
let timerProg = null;
let timerFim = null;
let pesquisaFeita = false;
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

/** Dia da semana fixo das compras (0 = domingo) ou null. Serve para todas as semanas. */
const diaCompras = () => (Number.isInteger(config.diaCompras) ? config.diaCompras : null);
/** Data das próximas compras: as promoções contam se forem válidas nesse dia. Sem dia fixo, hoje. */
const dataCompras = () => proximasCompras(diaCompras()) || todayISO();

function ctxPrecos() {
  if (!indice) indice = indicePrecos(listaFaturas());
  return { indice, promos, hoje: dataCompras() };
}

function diaTpl() {
  const d = diaCompras();
  return html`<button class="lista-dia pressable" data-action="lista:dia">
    ${icon('calendar', 16)}
    ${d == null ? html`<span>Escolher o dia das compras</span>`
      : html`<span>Compras ${d === 0 || d === 6 ? 'ao' : 'à'} <strong>${DIAS[d]}</strong> · ${quandoCompras(d)}</span>`}
    ${icon('chevronDown', 14)}
  </button>`;
}

const dataCurta = (iso) => (iso ? isoToShort(iso, false) : '');
function validadeTxt(p) {
  if (p.inicio && p.fim) return `${dataCurta(p.inicio)} a ${dataCurta(p.fim)}`;
  if (p.fim) return `até ${dataCurta(p.fim)}`;
  if (p.inicio) return `desde ${dataCurta(p.inicio)}`;
  return '';
}

function categoriaFaturas(texto) {
  return precosDe(texto)?.categoria || '';
}

// ---------- Desenho ----------

function lojasTpl() {
  const lojas = todasLojas();
  const sel = chaveLoja(lojaAtual);
  return html`
    <p class="lista-lojas__titulo">${lojaAtual ? html`Os artigos novos vão para o <strong>${lojaAtual}</strong>` : 'Escolhe o supermercado e os artigos novos ficam nele'}</p>
    <div class="lista-lojas" role="radiogroup" aria-label="Supermercado dos novos artigos">
      ${lojas.map((l) => {
        const ativo = lojaAtual && chaveLoja(l) === sel;
        return html`<button class="lista-loja-btn lista-loja-btn--so-logo pressable ${ativo ? 'is-active' : ''}" data-action="lista:loja-atual" data-loja="${l}" title="${l}" aria-label="${l}" role="radio" aria-checked="${ativo ? 'true' : 'false'}">
          ${seloTpl(l)}${ativo ? html`<i class="lista-loja-btn__ok">${icon('check', 12)}</i>` : ''}
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

function precoTpl(i, est) {
  if (i.feita) return '';
  const chip = !est ? ''
    : est.fonte === 'promo'
      ? html`<small class="lista-preco lista-preco--promo" title="Promoção ${validadeTxt(est.promo)}">🏷 ${money(est.preco)}</small>`
      : est.fonte === 'outras'
        ? html`<small class="lista-preco lista-preco--aprox" title="Estimativa: preço pago no ${est.ref.join(', ')}${est.porPeso ? ` (${money(est.porPeso.valor)}/${est.porPeso.unidade})` : ''}">≈ ${money(est.preco)}</small>`
        : html`<small class="lista-preco" title="Último preço pago no ${est.ref[0]}${est.porPeso ? ` (${money(est.porPeso.valor)}/${est.porPeso.unidade})` : ''}">${money(est.preco)}</small>`;
  return chip;
}

/** "Em promoção no Lidl a 1,79 € até 8 nov" por baixo do nome, quando outra loja está mais barata. */
function dicaTpl(i, est, ctx) {
  if (i.feita) return '';
  const p = melhorNoutraLoja(i.texto, i.loja, est, ctx);
  return p ? html`<small class="lista-preco__dica">🏷 No ${p.loja} a ${money(p.preco)}${promoAoPeso(p) ? '/kg' : ''}${p.fim ? ` até ${dataCurta(p.fim)}` : ''}</small>` : '';
}

function artigoTpl(i, est, ctx) {
  return html`
    <div class="list-item glass-soft ${i.feita ? 'is-done' : ''}" data-id="${i.id}">
      <button class="check pressable" data-action="lista:toggle" data-id="${i.id}" data-done="${i.feita ? '1' : ''}" aria-label="${i.feita ? 'Desmarcar' : 'Já tenho'}">${icon('check', 14)}</button>
      <span class="list-item__text" data-action="lista:toggle" data-id="${i.id}" data-done="${i.feita ? '1' : ''}">${i.texto}${i.sub && !i.feita ? html`<small class="lista-item__sub">${nomeSub(i.sub)}</small>` : ''}${dicaTpl(i, est, ctx)}</span>
      ${i.feita ? html`<small class="lista-item__loja">já tenho</small>` : precoTpl(i, est)}
      <button class="icon-btn icon-btn--subtle" data-action="lista:opcoes" data-id="${i.id}" aria-label="Supermercado e secção">${icon('more', 16)}</button>
    </div>`;
}

/** "≈ 23,40 €" e o que a estimativa inclui. */
function estimativaTpl(e) {
  if (!e.comPreco) return '';
  const notas = [
    e.aproximados ? `${e.aproximados} com preço de outra loja` : '',
    e.emPromo ? `${e.emPromo} em promoção` : '',
    e.semPreco ? `${e.semPreco} sem preço` : '',
  ].filter(Boolean).join(' · ');
  return html`<span class="lista-estimativa" title="${notas || 'Preços das últimas compras'}"><b>≈ ${money(e.total)}</b>${notas ? html`<small>${notas}</small>` : ''}</span>`;
}

function grupoTpl(g, ctx) {
  const pendentesG = g.seccoes.flatMap((s) => s.itens).filter((i) => !i.feita);
  const est = estimarLoja(pendentesG, g.loja, ctx);
  g.estimativa = est;
  const feitosLoja = g.comprados;
  const total = g.total + feitosLoja;
  const pct = total ? Math.round((feitosLoja / total) * 100) : 0;
  if (!g.chave) {
    return html`
      <section class="card glass lista-loja lista-loja--sem">
        <div class="lista-loja__topo">
          <h3 class="card__title">${icon('cart', 18)} Sem supermercado <span class="chip chip--muted">${g.total}</span></h3>
          ${lojaAtual ? html`<button class="btn btn--small pressable" data-action="lista:atribuir-todos">Pôr no ${lojaAtual}</button>` : ''}
        </div>
        <p class="fat-meta">Toca em ${icon('more', 14)} para escolher o supermercado de cada artigo.${est.comPreco ? html` Estimativa com o preço médio das lojas: ${estimativaTpl(est)}` : ''}</p>
        ${seccoesTpl(g, est, ctx)}
      </section>`;
  }
  const m = marcaLoja(g.loja);
  return html`
    <section class="card glass lista-loja" style="--marca:${m.cor};--marca2:${m.cor2};--marca-texto:${m.texto}">
      <header class="lista-loja__banner">
        <button class="lista-loja__id pressable" data-action="lista:loja-atual" data-loja="${g.loja}" aria-label="Adicionar artigos ao ${g.loja}">
          ${seloTpl(g.loja, 46)}
          <span class="lista-loja__nome"><strong>${g.loja}</strong><small>${g.total ? `${g.total} por comprar` : 'Tudo tratado ✓'}${feitosLoja ? ` · ${feitosLoja} já tens` : ''} · ${g.seccoes.length} ${g.seccoes.length === 1 ? 'corredor' : 'corredores'}</small>${estimativaTpl(est)}</span>
        </button>
        <button class="lista-loja__btn pressable" data-action="lista:ordem" data-loja="${g.loja}" aria-label="Ordem dos corredores">${icon('repeat', 14)} Corredores</button>
        <div class="lista-loja__progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" title="${feitosLoja} de ${total} já tratados"><span style="width:${pct}%"></span></div>
      </header>
      ${seccoesTpl(g, est, ctx)}
    </section>`;
}

function seccoesTpl(g, est, ctx) {
  return g.seccoes.map((s, n) => html`
    <h4 class="lista-seccao"><span class="lista-seccao__n">${n + 1}</span><span class="lista-seccao__emoji" aria-hidden="true">${emojiSeccao(s.id)}</span>${s.nome}</h4>
    <div class="list">${s.itens.map((i) => artigoTpl(i, est.porItem.get(i.id), ctx))}</div>`);
}

function desenhar() {
  const alvo = byId('lista-semanal');
  if (!alvo) return;
  render('lista-lojas-wrap', lojasTpl());
  render('lista-dia-wrap', diaTpl());
  atualizarEntrada();
  const { grupos, feitos } = agruparLista(itens, { memoria: config.memoria || {}, ordens: config.ordens || {}, categoria: categoriaFaturas });
  const pendentes = grupos.reduce((n, g) => n + g.total, 0);
  const ctx = ctxPrecos();
  const corpo = grupos.map((g) => grupoTpl(g, ctx));
  const resumo = byId('lista-resumo');
  if (resumo) {
    const lojas = grupos.filter((g) => g.chave).length;
    const total = grupos.reduce((s, g) => s + (g.estimativa?.total || 0), 0);
    const semPreco = grupos.reduce((s, g) => s + (g.estimativa?.semPreco || 0), 0);
    render(resumo, pendentes ? html`${pendentes} ${pendentes === 1 ? 'artigo' : 'artigos'} por comprar${lojas ? ` em ${lojas} ${lojas === 1 ? 'supermercado' : 'supermercados'}` : ''}${total ? html` · <strong>≈ ${money(total)}</strong>${semPreco ? ` (${semPreco} sem preço)` : ''}` : ''}` : '');
  }
  render(alvo, itens.length ? html`
    ${corpo}
    ${feitos.length ? html`
      <div class="lista-semana">
        <span>${!pendentes ? 'Já tens tudo desta semana! 🎉' : `${feitos.length} ${feitos.length === 1 ? 'artigo marcado' : 'artigos marcados'} como já tenho.`}</span>
        <button class="btn btn--small pressable" data-action="lista:nova-semana">${icon('repeat', 14)} Nova semana</button>
      </div>` : ''}
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

// ---------- Promoções dos folhetos ----------

const textosLista = () => itens.filter((i) => !i.feita).map((i) => i.texto);

function promoTpl(p, naLista, foraDoDia = false) {
  return html`
    <div class="list-item glass-soft lista-promo ${naLista ? 'is-lista' : ''}">
      <span class="list-item__text">
        ${p.produto}
        <small class="lista-promo__meta">${[p.desconto, p.condicao].filter(Boolean).join(' · ')}${naLista ? html` <b class="lista-promo__tag">na tua lista</b>` : ''}${foraDoDia ? html` <b class="lista-promo__tag lista-promo__tag--fora">não vale no dia das compras</b>` : ''}</small>
      </span>
      <span class="lista-promo__preco">${p.precoAntes ? html`<s>${money(p.precoAntes)}</s>` : ''}<b>${money(p.preco)}${promoAoPeso(p) ? html`<small>/kg</small>` : ''}</b></span>
      <button class="icon-btn icon-btn--subtle" data-action="lista:promo-apagar" data-id="${p.id}" aria-label="Apagar promoção">${icon('close', 14)}</button>
    </div>`;
}

function desenharPromos() {
  const alvo = byId('lista-promos');
  if (!alvo) return;
  const hoje = todayISO();
  const compras = dataCompras();
  const lista = textosLista();
  const validas = promos.filter((p) => !p.fim || p.fim >= hoje);
  const estado = aLerFolheto && progresso && !progresso.fim ? html`
    <div class="card glass lista-promos__estado">
      <div class="lista-promos__estado-topo"><span>${progresso.titulo}</span><b>${progresso.pct}%</b></div>
      <div class="fat-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progresso.pct}"><span style="width:${progresso.pct}%"></span></div>
      ${progresso.texto ? html`<small class="fat-meta">${progresso.texto}</small>` : ''}
    </div>` : '';
  if (!validas.length) {
    render(alvo, html`${estado}<div class="card glass">${emptyState('Ainda não há promoções. Fotografa as páginas do folheto (ou escolhe o PDF) e a IA tira os produtos, os preços e as datas.')}</div>`);
    return;
  }
  const porLoja = new Map();
  for (const p of validas) {
    const k = chaveLoja(p.loja);
    if (!porLoja.has(k)) porLoja.set(k, { loja: p.loja, itens: [] });
    porLoja.get(k).itens.push(p);
  }
  const naLista = (p) => lista.some((t) => promosDoArtigo(t, [p], compras).length);
  render(alvo, html`${estado}${[...porLoja.values()].map((g) => {
    const m = marcaLoja(g.loja);
    const ordenadas = g.itens.map((p) => ({ p, l: naLista(p) })).sort((a, b) => b.l - a.l || a.p.produto.localeCompare(b.p.produto));
    const validade = [...new Set(g.itens.map(validadeTxt).filter(Boolean))];
    const futuras = g.itens.filter((p) => !promoAtiva(p, hoje)).length;
    const pesquisa = g.itens.some((p) => p.origem === 'pesquisa');
    return html`
      <section class="card glass lista-loja" style="--marca:${m.cor};--marca2:${m.cor2};--marca-texto:${m.texto}">
        <header class="lista-loja__banner">
          <span class="lista-loja__id">${seloTpl(g.loja, 46)}
            <span class="lista-loja__nome"><strong>${g.loja}</strong><small>${g.itens.length} ${g.itens.length === 1 ? 'promoção' : 'promoções'}${validade.length === 1 ? ` · ${validade[0]}` : ''}${futuras ? ` · ${futuras} ainda não começaram` : ''}</small></span>
          </span>
          <button class="lista-loja__btn pressable" data-action="lista:promos-apagar-loja" data-loja="${g.loja}">${icon('trash', 14)} Apagar</button>
        </header>
        ${pesquisa ? html`<p class="fat-meta lista-promos__nota">Algumas vieram de uma pesquisa na web: confirma no folheto antes de contar com elas.</p>` : ''}
        <div class="list">${ordenadas.map(({ p, l }) => promoTpl(p, l, diaCompras() != null && !promoAtiva(p, compras)))}</div>
      </section>`;
  })}`);
}

async function guardarPromos(novas, origem, { substituir = () => false } = {}) {
  const antigas = promos.filter(substituir);
  await Promise.all(antigas.map((p) => deleteDoc(sharedDoc(COL_PROMOS, p.id))));
  const lote = Date.now();
  await Promise.all(novas.map((p) => addDoc(sharedCol(COL_PROMOS), { ...p, origem, lote, criado: lote, createdBy: session.uid })));
}

// ---------- Barra flutuante com a percentagem (como na digitalização das faturas) ----------

function desenharBarra() {
  let el = byId('lista-fundo');
  if (!progresso) { el?.classList.remove('is-visivel'); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'lista-fundo';
    el.type = 'button';
    el.className = 'fat-fundo glass glass--strong pressable';
    el.dataset.action = 'lista:fundo';
    document.body.appendChild(el);
  }
  const { titulo, texto, pct, fim } = progresso;
  el.classList.toggle('is-pronto', fim === 'ok');
  el.classList.toggle('is-erro', fim === 'erro');
  render(el, !fim
    ? html`<span class="fat-fundo__anel" style="--p:${pct}"><b>${pct}%</b></span>
      <span class="fat-fundo__txt"><strong>${titulo}</strong><small>${texto || 'A ler…'}</small></span>`
    : html`<span class="fat-fundo__icone">${icon(fim === 'ok' ? 'check' : 'alert', 18)}</span>
      <span class="fat-fundo__txt"><strong>${titulo}</strong><small>${texto}</small></span>`);
  requestAnimationFrame(() => el.classList.add('is-visivel'));
}

/** Atualiza a barra (a percentagem só sobe). */
function progredir(titulo, texto = '', pct = null) {
  clearTimeout(timerFim);
  const atual = progresso && !progresso.fim ? progresso.pct : 0;
  progresso = { titulo, texto, pct: pct == null ? atual : Math.max(atual, Math.min(99, Math.round(pct))), fim: '' };
  desenharBarra();
  desenharPromos();
}

/** A IA não diz quanto falta: a percentagem avança sozinha de `de` até quase `ate`, cada vez mais devagar. */
function progressoEstimado(titulo, texto, { de, ate, segundos }) {
  clearInterval(timerProg);
  const inicio = Date.now();
  progredir(titulo, texto, de);
  timerProg = setInterval(() => {
    const t = (Date.now() - inicio) / 1000;
    progredir(titulo, texto, de + (ate - de) * (1 - Math.exp(-t / (segundos / 2.5))));
  }, 400);
}

function terminarBarra(fim, titulo, texto) {
  clearInterval(timerProg);
  progresso = { titulo, texto, pct: 100, fim };
  desenharBarra();
  desenharPromos();
  clearTimeout(timerFim);
  timerFim = setTimeout(() => { progresso = null; desenharBarra(); }, fim === 'ok' ? 5000 : 9000);
}

async function lerFolhetoDe(files) {
  if (aLerFolheto || !files.length) return;
  const escolhidos = files.slice(0, MAX_PAGINAS);
  if (files.length > MAX_PAGINAS) toast(`Só leio ${MAX_PAGINAS} páginas de cada vez.`, 'info');
  aLerFolheto = 'folheto';
  const titulo = 'A ler o folheto…';
  progredir(titulo, `A preparar ${escolhidos.length === 1 ? 'o ficheiro' : `${escolhidos.length} páginas`}`, 2);
  try {
    const ficheiros = [];
    for (const [n, f] of escolhidos.entries()) {
      progredir(titulo, escolhidos.length > 1 ? `A preparar a página ${n + 1} de ${escolhidos.length}` : 'A preparar o ficheiro', 2 + (n / escolhidos.length) * 13);
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        if (f.size > 15 * 1024 * 1024) throw new Error('O PDF é demasiado grande (máx. 15 MB).');
        ficheiros.push({ base64: (await readAsDataURL(f)).split(',')[1], mime: 'application/pdf' });
      } else {
        ficheiros.push({ base64: (await compressImage(f, { maxSize: 2000, quality: 0.85 })).split(',')[1], mime: 'image/jpeg' });
      }
    }
    progressoEstimado(titulo, 'A IA está a tirar os produtos, os preços e as datas', { de: 15, ate: 95, segundos: 20 + 8 * escolhidos.length });
    const { lerFolheto } = await import('./folhetos.js');
    const r = await lerFolheto(ficheiros, { hoje: todayISO(), lojaSugerida: lojaAtual });
    if (!r.promocoes.length) throw new Error('Não encontrei promoções. Tenta fotos mais nítidas, uma página de cada vez.');
    // Ler o mesmo folheto outra vez substitui o anterior (mesma loja e mesmas datas).
    const k = chaveLoja(r.loja);
    clearInterval(timerProg);
    progredir(titulo, 'A guardar as promoções', 97);
    await guardarPromos(r.promocoes, 'folheto', {
      substituir: (p) => chaveLoja(p.loja) === k && p.origem !== 'pesquisa' && (p.inicio || '') === (r.inicio || '') && (p.fim || '') === (r.fim || ''),
    });
    const quando = validadeTxt(r);
    aLerFolheto = '';
    terminarBarra('ok', `${r.promocoes.length} promoções do ${r.loja}`, quando ? `Válidas ${quando} · toca para ver` : 'Toca para ver');
  } catch (e) {
    aLerFolheto = '';
    terminarBarra('erro', 'Não consegui ler o folheto', e.message || 'Tenta outra vez.');
  }
}

/** Pesquisa na web as promoções da semana para os supermercados e artigos da lista. */
async function pesquisarSemana({ silencioso = false } = {}) {
  if (aLerFolheto) return;
  const pend = itens.filter((i) => !i.feita);
  const lojas = listaLojas(pend.map((i) => i.loja || config.memoria?.[chaveArtigo(i.texto)]?.loja));
  if (!pend.length || !lojas.length) {
    if (!silencioso) toast('Põe artigos na lista, com o supermercado, para eu procurar as promoções deles.', 'info');
    return;
  }
  aLerFolheto = 'pesquisa';
  const titulo = 'A procurar promoções…';
  if (!silencioso) progressoEstimado(titulo, `Na web, no ${lojas.join(', ')}`, { de: 5, ate: 95, segundos: 25 });
  try {
    const { pesquisarPromos } = await import('./folhetos.js');
    const { promocoes } = await pesquisarPromos(lojas, pend.map((i) => i.texto), { hoje: todayISO() });
    const ks = new Set(lojas.map(chaveLoja));
    const novas = promocoes.filter((p) => ks.has(chaveLoja(p.loja)));
    await guardarPromos(novas, 'pesquisa', { substituir: (p) => p.origem === 'pesquisa' && ks.has(chaveLoja(p.loja)) });
    aLerFolheto = '';
    if (novas.length) terminarBarra('ok', `${novas.length} ${novas.length === 1 ? 'promoção' : 'promoções'} desta semana`, 'Toca para ver');
    else if (!silencioso) terminarBarra('erro', 'Sem promoções fiáveis na web', 'Fotografa o folheto para ter a certeza.');
    else desenharPromos();
  } catch (e) {
    aLerFolheto = '';
    if (!silencioso) terminarBarra('erro', 'A pesquisa falhou', e.message || 'Tenta outra vez.');
    else { console.warn('[lista] pesquisa de promoções', e); desenharPromos(); }
  }
}

/** Uma vez por semana (para o casal), ao abrir a lista, procura sozinha as promoções dos artigos. */
function pesquisaSemanal() {
  if (pesquisaFeita || !config.carregada || !itens.length) return;
  if (!byId('lista-promos')) return;
  const semana = semanaIso();
  if (config.promosSemana === semana) return;
  if (!itens.some((i) => !i.feita && (i.loja || config.memoria?.[chaveArtigo(i.texto)]?.loja))) return;
  pesquisaFeita = true;
  config.promosSemana = semana;
  guardarCfg({ promosSemana: semana });
  pesquisarSemana({ silencioso: true });
}

/** Apaga as promoções que acabaram há mais de duas semanas. */
function limparAntigas() {
  const limite = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  promos.filter((p) => p.fim && p.fim < limite).forEach((p) => deleteDoc(sharedDoc(COL_PROMOS, p.id)).catch(() => {}));
}

// ---------- Ações ----------

function lembrar(texto, dados) {
  const k = chaveArtigo(texto);
  if (!k) return;
  config.memoria = { ...(config.memoria || {}), [k]: { ...(config.memoria?.[k] || {}), ...dados } };
  guardarCfg({ memoria: { [k]: dados } });
}

async function escolherLoja(item) {
  const ctx = ctxPrecos();
  const est = new Map(todasLojas().map((l) => [l, estimarArtigo(item.texto, l, ctx)]));
  // Primeiro as lojas com preço real (pago ou promoção), da mais barata; as estimativas e as sem preço no fim.
  const peso = (e) => (!e ? Infinity : (e.fonte === 'outras' ? 1e6 : 0) + e.preco);
  const lojas = [...est.keys()].sort((a, b) => peso(est.get(a)) - peso(est.get(b)));
  const reais = lojas.filter((l) => est.get(l) && est.get(l).fonte !== 'outras');
  const atual = chaveLoja(item.loja || '');
  const escolha = await actionSheet([
    ...lojas.map((l) => {
      const v = est.get(l);
      let label = l;
      if (v?.fonte === 'promo') label = `${l} · 🏷 ${money(v.preco)} em promoção`;
      else if (v?.fonte === 'loja') label = `${l} · ${money(v.preco)}`;
      else if (v) label = `${l} · ≈ ${money(v.preco)} (estimativa)`;
      if (reais.length > 1 && l === reais[0]) label += ' · mais barato';
      return { id: l, label, active: item.loja && chaveLoja(l) === atual };
    }),
    { id: '__outro', label: 'Outro supermercado…', icon: 'plus' },
    { id: '__nenhum', label: 'Sem supermercado', active: !item.loja },
  ], { title: reais.length ? `${item.texto} · preços que pagaram` : item.texto });
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

// Categoria e depois a subcategoria do SuperSave (a prateleira dentro do corredor).
async function escolherSeccao(item, atual, subAtual) {
  const escolha = await actionSheet(SECCOES.map((s) => ({ id: s.id, label: `${s.emoji} ${s.nome}`, active: s.id === atual })), { title: item.texto });
  if (!escolha) return;
  const subs = categoria(escolha).subs;
  let sub = '';
  if (subs.length > 1) {
    sub = await actionSheet([
      ...subs.map((s) => ({ id: s.id, label: s.nome, active: s.id === subAtual })),
      { id: '__auto', label: 'Deixar a app escolher' },
    ], { title: `${categoria(escolha).nome} · subcategoria` }) || '';
    if (sub === '__auto') sub = '';
  }
  await updateDoc(sharedDoc(COL, item.id), { seccao: escolha, sub });
  lembrar(item.texto, { seccao: escolha, sub });
}

function adicionarLojaPersonalizada(loja) {
  const lojas = listaLojas(config.lojas || [], [loja]);
  if (lojas.length === (config.lojas || []).length) return;
  config.lojas = lojas;
  guardarCfg({ lojas });
}

const actions = {
  'lista:folheto': ({ ev }) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    lerFolhetoDe(files);
  },
  'lista:promos-pesquisar': () => pesquisarSemana(),
  'lista:dia': async () => {
    const atual = diaCompras();
    const escolha = await actionSheet([
      ...[1, 2, 3, 4, 5, 6, 0].map((d) => ({ id: String(d), label: DIAS[d][0].toUpperCase() + DIAS[d].slice(1), active: atual === d })),
      { id: 'nenhum', label: 'Sem dia fixo', active: atual == null },
    ], { title: 'Em que dia fazem as compras?' });
    if (!escolha) return;
    const dia = escolha === 'nenhum' ? null : Number(escolha);
    config.diaCompras = dia;
    desenhar();
    desenharPromos();
    await guardarCfg({ diaCompras: dia });
    toast(dia == null ? 'Sem dia fixo para as compras' : `Compras ${dia === 0 || dia === 6 ? 'ao' : 'à'} ${DIAS[dia]}, todas as semanas`);
  },
  'lista:fundo': () => {
    if (progresso?.fim) { clearTimeout(timerFim); progresso = null; desenharBarra(); }
    navigate(PAG_LISTA);
    requestAnimationFrame(() => selectTab('lista', 'promos'));
  },
  'lista:promo-apagar': ({ data }) => deleteDoc(sharedDoc(COL_PROMOS, data.id)),
  'lista:promos-apagar-loja': async ({ data }) => {
    const k = chaveLoja(data.loja);
    const alvo = promos.filter((p) => chaveLoja(p.loja) === k);
    const ok = await confirmDialog(`Apagar as ${alvo.length} promoções do ${data.loja}?`, { title: 'Apagar promoções', confirmLabel: 'Apagar' });
    if (ok) await Promise.all(alvo.map((p) => deleteDoc(sharedDoc(COL_PROMOS, p.id))));
  },
  'lista:add': async () => {
    const input = byId('lista-input');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    const dados = { texto, feita: false, timestamp: Date.now(), createdBy: session.uid };
    if (lojaAtual) dados.loja = lojaAtual;
    await addDoc(sharedCol(COL), dados);
    registarAtividade(`juntou ${texto} à lista`, { icon: 'cart', page: PAG_LISTA });
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
    const texto = itens.find((i) => i.id === data.id)?.texto;
    if (!data.done && texto) registarAtividade(`riscou ${texto} da lista`, { icon: 'cart', page: PAG_LISTA });
  },
  'lista:opcoes': async ({ data }) => {
    const item = itens.find((i) => i.id === data.id);
    if (!item) return;
    const { grupos, feitos } = agruparLista([item], { memoria: config.memoria || {}, categoria: categoriaFaturas });
    const efetivo = grupos[0]?.seccoes[0]?.itens[0] || feitos[0] || item;
    const escolha = await actionSheet([
      { id: 'loja', label: `Supermercado: ${efetivo.loja || 'nenhum'}`, icon: 'cart' },
      { id: 'seccao', label: `Categoria: ${rotulo(efetivo.seccao, efetivo.sub)}`, icon: 'grid' },
      { id: 'apagar', label: 'Apagar', danger: true },
    ], { title: item.texto });
    if (escolha === 'loja') await escolherLoja({ ...item, loja: efetivo.loja });
    if (escolha === 'seccao') await escolherSeccao(item, efetivo.seccao, efetivo.sub);
    if (escolha === 'apagar') {
      document.querySelector(`#lista-semanal .list-item[data-id="${item.id}"]`)?.classList.add('is-removing');
      setTimeout(() => deleteDoc(sharedDoc(COL, item.id)), 220);
    }
  },
  'lista:nova-semana': async () => {
    const feitos = itens.filter((i) => i.feita);
    if (!feitos.length) return;
    const ok = await confirmDialog('Desmarcar todos os artigos para começar a lista de uma nova semana? Nenhum artigo é apagado.', { title: 'Nova semana', confirmLabel: 'Desmarcar tudo' });
    if (!ok) return;
    await Promise.all(feitos.map((i) => updateDoc(sharedDoc(COL, i.id), { feita: false })));
    toast('Lista pronta para a nova semana');
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
        ${tabsTpl('lista', [{ id: 'semanal', label: 'Semanal' }, { id: 'promos', label: 'Promoções' }, { id: 'rapida', label: 'Rápida' }])}
        <div data-tab-panel="lista:semanal">
          <div class="card glass lista-topo">
            <div class="input-row lista-entrada">
              <span id="lista-input-selo"></span>
              <input type="text" id="lista-input" class="input" placeholder="Adicionar artigo…" data-enter="lista:add" autocomplete="off">
              <button class="btn btn--primary btn--icon pressable" data-action="lista:add" aria-label="Adicionar">${icon('plus', 20)}</button>
            </div>
            <div id="lista-dia-wrap"></div>
            <div id="lista-lojas-wrap"></div>
          </div>
          <p class="fat-meta lista-resumo" id="lista-resumo"></p>
          <div id="lista-semanal"></div>
        </div>
        <div data-tab-panel="lista:promos" hidden>
          <div class="card glass lista-promos__topo">
            <h3 class="card__title">${icon('sparkles', 18)} Promoções dos folhetos</h3>
            <p class="fat-meta">Fotografa as páginas do folheto da semana (ou escolhe o PDF). A IA tira os produtos, os preços e as datas, e a lista passa a contar com os preços das promoções. Uma vez por semana a app também procura sozinha, na web, promoções dos artigos da tua lista.</p>
            <div class="lista-promos__acoes">
              <label class="btn btn--primary pressable">${icon('camera', 16)} Fotografar
                <input type="file" accept="image/*" capture="environment" hidden data-change="lista:folheto"></label>
              <label class="btn pressable">${icon('image', 16)} Fotos/PDF
                <input type="file" accept="image/*,application/pdf,.pdf" multiple hidden data-change="lista:folheto"></label>
              <button class="btn pressable" data-action="lista:promos-pesquisar">${icon('search', 16)} Na web</button>
            </div>
          </div>
          ${folhetosTpl({ titulo: 'Abrir os folhetos' })}
          <div id="lista-promos"></div>
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
    indice = null;
    pesquisaFeita = false;
    let limpo = false;
    scope.add(onSnapshot(sharedCol(COL), (snap) => { itens = snapToList(snap); desenhar(); desenharPromos(); pesquisaSemanal(); }));
    scope.add(onSnapshot(cfgDoc(), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      config = {
        memoria: d.memoria || {}, ordens: d.ordens || {}, lojas: d.lojas || [], promosSemana: d.promosSemana || '',
        diaCompras: Number.isInteger(d.diaCompras) ? d.diaCompras : null, carregada: true,
      };
      desenharPromos();
      desenhar();
      pesquisaSemanal();
    }, () => {}));
    scope.add(onSnapshot(sharedCol(COL_PROMOS), (snap) => {
      promos = snapToList(snap);
      if (!limpo) { limpo = true; limparAntigas(); }
      desenhar();
      desenharPromos();
    }, () => {}));
    scope.add(on('faturas:update', () => { precos = null; indice = null; desenhar(); }));
    subscribeChecklist(scope, 'rapidas');
  },
  stop() { scope.clear(); },
};
