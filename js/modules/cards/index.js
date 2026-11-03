// Cartões: cartões de cliente (Continente, Pingo Doce, ginásio…) com capa, número e um link
// (ex.: o folheto da semana) que abre dentro da app.
import { html, byId, render } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { createScope, session } from '../../core/state.js';
import { navigate, back, currentPage } from '../../core/router.js';
import { toast, openModal, closeModal, modalTemplate, confirmDialog, showImage, withLoading } from '../../core/ui.js';
import { readAsDataURL, takeFile, dataUrlBytes } from '../../core/images.js';
import { addDoc, updateDoc, deleteDoc, onSnapshot, getDoc, setDoc } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { prepararCapa } from './fundo.js';
import {
  normalizarLink, folhetoPadrao, normalizarDias, proximoFolheto, listaDias, DIAS_CURTOS,
} from './util.js';

const COL = 'cartoes';
export const PAG_CARTOES = 'menu-cartoes';
const PAG_CARTAO = 'page-cartao';
const PAG_LINK = 'page-cartao-link';
const MAX_BYTES = 850 * 1024;

const scope = createScope();
let cartoes = [];
let carregado = false;
let atualId = null;
let editarId = null;
let capaOriginal = ''; // foto escolhida, antes de retirar o fundo
let capaFinal = '';
let semFundo = true;
let linkAberto = '';
let diasEdicao = []; // dias do folheto no formulário

// Lojas antigas (página "Lojas & Cartões") para trazer cartões já guardados.
const LOJAS_ANTIGAS = [
  { id: 'continente', nome: 'Continente', link: 'https://folhetos.continente.pt/' },
  { id: 'pingodoce', nome: 'Pingo Doce', link: 'https://www.pingodoce.pt/folhetos/' },
  { id: 'lidl', nome: 'Lidl', link: 'https://www.lidl.pt/folhetos' },
  { id: 'auchan', nome: 'Auchan', link: 'https://www.auchan.pt/pt/folhetos/' },
  { id: 'intermarche', nome: 'Intermarché', link: 'https://www.intermarche.pt/folhetos/' },
];

const CORES = ['#059669', '#2563EB', '#DC2626', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#475569'];
const corDe = (nome) => CORES[[...String(nome || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length];
const atual = () => cartoes.find((c) => c.id === atualId);

/** Link do folheto: o do cartão ou, se não tiver, o da cadeia (Continente, Pingo Doce, Lidl…). */
const linkFolheto = (c) => c.link || folhetoPadrao(c.nome)?.link || '';
const diasFolheto = (c) => normalizarDias(c.folhetoDias);

const dominio = (link) => { try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Botão "Folheto" na frente do cartão, com o próximo dia em que o folheto muda. */
function botaoFolhetoTpl(c) {
  if (!linkFolheto(c)) return '';
  const prox = proximoFolheto(diasFolheto(c));
  return html`<span class="cartao__folheto pressable" role="button" tabindex="0" data-action="cartoes:folheto" data-id="${c.id}"
    aria-label="Abrir o folheto${prox ? ` (${prox.toLowerCase()})` : ''}">${icon('external', 12)} Folheto</span>`;
}

function capaTpl(c, { grande = false } = {}) {
  // A capa mostra-se sempre inteira (sem cortes), com cantos de cartão, dentro de uma moldura com a proporção de um cartão.
  return c.imagem
    ? html`<span class="cartao cartao--foto ${grande ? 'cartao--grande' : ''}"><span class="cartao__capa"><img src="${c.imagem}" alt="${c.nome}" loading="lazy">${botaoFolhetoTpl(c)}</span></span>`
    : html`<span class="cartao cartao--cor ${grande ? 'cartao--grande' : ''}" style="--cartao-cor:${corDe(c.nome)}">
        <strong>${c.nome}</strong>${c.numero ? html`<small>${c.numero}</small>` : ''}${botaoFolhetoTpl(c)}
      </span>`;
}

function desenharLista() {
  const alvo = byId('cartoes-lista');
  if (!alvo) return;
  if (!carregado) { render(alvo, html`<div class="fat-carregar"><span class="spinner"></span></div>`); return; }
  render(alvo, cartoes.length
    ? html`<div class="cartoes-grid stagger-on-enter">
        ${cartoes.map((c) => html`
          <div class="cartoes-item pressable" role="button" tabindex="0" data-action="cartoes:abrir" data-id="${c.id}" aria-label="${c.nome}">
            ${capaTpl(c)}
            <span class="cartoes-item__nome">${c.nome}</span>
            ${proximoFolheto(diasFolheto(c)) ? html`<small class="cartoes-item__folheto">${proximoFolheto(diasFolheto(c))}</small>` : ''}
          </div>`)}
      </div>`
    : html`<div class="card glass sup-vazio">
        <span class="sup-vazio__icone">${icon('card', 26)}</span>
        <p>Guarda aqui os cartões de cliente. Tira uma foto ao cartão e a app retira o fundo.</p>
        <button class="btn btn--primary pressable" data-action="cartoes:novo">${icon('plus', 16)} Adicionar cartão</button>
      </div>`);
}

function desenharDetalhe() {
  const c = atual();
  const alvo = byId('cartao-detalhe');
  if (!alvo) return;
  if (!c) { render(alvo, html`<p class="muted">Este cartão já não existe.</p>`); return; }
  render(alvo, html`
    <div class="cartao-hero pressable" role="button" tabindex="0" data-action="cartoes:ver-capa">${capaTpl(c, { grande: true })}</div>
    ${diasFolheto(c).length ? html`<p class="cartao-folheto-dias">${icon('repeat', 14)} <strong>${proximoFolheto(diasFolheto(c))}</strong>${diasFolheto(c).length > 1 ? ` · sai ${listaDias(diasFolheto(c))}` : ''}</p>` : ''}
    ${c.numero ? html`
      <div class="card glass cartao-numero">
        <span class="eyebrow">Número do cartão</span>
        <strong>${c.numero}</strong>
        <button class="btn btn--small btn--glass pressable" data-action="cartoes:copiar">${icon('copy', 14)} Copiar</button>
      </div>` : ''}
    ${linkFolheto(c) ? html`
      <button class="btn btn--primary btn--large btn--block pressable" data-action="cartoes:link">
        ${icon('external', 18)} ${c.linkNome || 'Abrir folheto'}
      </button>
      <p class="muted small cartao-dominio">${dominio(linkFolheto(c))}</p>` : ''}
    ${c.notas ? html`<div class="card glass"><span class="eyebrow">Notas</span><p class="cartao-notas">${c.notas}</p></div>` : ''}
    <div class="btn-row">
      <button class="btn btn--danger-soft pressable" data-action="cartoes:apagar">${icon('trash', 16)} Remover</button>
      <button class="btn btn--glass pressable" data-action="cartoes:editar">${icon('edit', 16)} Editar</button>
    </div>`);
}

function desenharPreviewCapa(estado = '') {
  const alvo = byId('cartao-capa-preview');
  if (!alvo) return;
  render(alvo, capaFinal
    ? html`<img src="${capaFinal}" alt="Capa do cartão">`
    : html`<span class="photo-picker__placeholder">${icon('camera', 26)}<span>Fotografar ou escolher a capa</span></span>`);
  alvo.classList.toggle('has-photo', !!capaFinal);
  const info = byId('cartao-capa-estado');
  if (info) info.textContent = estado;
  const linha = byId('cartao-fundo-linha');
  if (linha) linha.hidden = !capaOriginal;
  const remover = byId('cartao-capa-remover');
  if (remover) remover.hidden = !capaFinal;
}

async function processarCapa() {
  if (!capaOriginal) { capaFinal = ''; desenharPreviewCapa(); return; }
  desenharPreviewCapa(semFundo ? 'A retirar o fundo…' : '');
  try {
    let r = await prepararCapa(capaOriginal, { semFundo });
    if (dataUrlBytes(r.url) > MAX_BYTES) r = await prepararCapa(capaOriginal, { semFundo, max: 480 });
    capaFinal = r.url;
    const msg = !semFundo ? 'Capa com o fundo original.'
      : r.semFundo ? 'Fundo retirado. Se não ficou bem, desliga "Retirar fundo".'
        : 'Não encontrei um fundo liso para retirar; fica a foto como está.';
    desenharPreviewCapa(msg);
    byId('cartao-f-semfundo').dataset.ok = r.semFundo ? '1' : '';
  } catch (e) {
    console.error('[cartoes] capa', e);
    capaFinal = '';
    desenharPreviewCapa('Não foi possível ler a imagem.');
  }
}

function abrirFormulario(c = null) {
  editarId = c?.id || null;
  capaOriginal = '';
  capaFinal = c?.imagem || '';
  semFundo = true;
  byId('modal-cartao-title').textContent = c ? 'Editar cartão' : 'Novo cartão';
  byId('cartao-f-nome').value = c?.nome || '';
  byId('cartao-f-numero').value = c?.numero || '';
  byId('cartao-f-link').value = c?.link || '';
  byId('cartao-f-linknome').value = c?.linkNome || '';
  byId('cartao-f-notas').value = c?.notas || '';
  diasEdicao = normalizarDias(c?.folhetoDias);
  byId('cartao-f-link').placeholder = 'ex: https://folhetos.continente.pt';
  desenharDias();
  sugerirFolheto();
  byId('cartao-f-semfundo').checked = true;
  desenharPreviewCapa();
  openModal('modal-cartao');
  setTimeout(() => byId('cartao-f-nome')?.focus(), 250);
}

function desenharDias() {
  render('cartao-f-dias', [1, 2, 3, 4, 5, 6, 0].map((d) => html`
    <button type="button" class="cartao-dia pressable ${diasEdicao.includes(d) ? 'is-active' : ''}" data-action="cartoes:dia" data-d="${d}"
      aria-pressed="${diasEdicao.includes(d) ? 'true' : 'false'}">${DIAS_CURTOS[d]}</button>`));
}

/** Ao escrever o nome de uma cadeia conhecida, sugere o link e os dias do folheto (se ainda estiverem vazios). */
function sugerirFolheto() {
  const sug = folhetoPadrao(byId('cartao-f-nome').value);
  if (!sug) return;
  const link = byId('cartao-f-link');
  if (!link.value.trim()) link.placeholder = sug.link;
  if (!diasEdicao.length && sug.dias.length) { diasEdicao = normalizarDias(sug.dias); desenharDias(); }
}

function formularioTpl() {
  const campo = (id, label, input, dica = '') => html`<div class="field"><label class="field__label" for="${id}">${label}</label>${input}${dica ? html`<span class="field__hint">${dica}</span>` : ''}</div>`;
  return modalTemplate('modal-cartao', 'Novo cartão', html`
    <div class="photo-picker cartao-capa pressable" id="cartao-capa-preview" data-action="cartoes:escolher-capa" role="button" tabindex="0">
      <span class="photo-picker__placeholder">${icon('camera', 26)}<span>Fotografar ou escolher a capa</span></span>
    </div>
    <input type="file" accept="image/*" id="cartao-f-ficheiro" hidden data-change="cartoes:capa">
    <div class="btn-row cartao-capa-acoes">
      <button class="btn btn--glass pressable" data-action="cartoes:escolher-capa">${icon('image', 16)} Escolher capa</button>
      <button class="btn btn--danger-soft pressable" id="cartao-capa-remover" data-action="cartoes:sem-capa" hidden>${icon('trash', 16)} Tirar capa</button>
    </div>
    <div class="setting-row" id="cartao-fundo-linha" hidden>
      <span>Retirar fundo</span>
      <label class="switch"><input type="checkbox" id="cartao-f-semfundo" checked data-change="cartoes:fundo"><span class="switch__track"></span></label>
    </div>
    <p class="muted small" id="cartao-capa-estado"></p>
    ${campo('cartao-f-nome', 'Nome', html`<input class="input" id="cartao-f-nome" placeholder="ex: Continente, Pingo Doce, Ginásio" autocomplete="off" data-change="cartoes:nome">`)}
    ${campo('cartao-f-numero', 'Número do cartão (opcional)', html`<input class="input" id="cartao-f-numero" inputmode="numeric" autocomplete="off">`)}
    ${campo('cartao-f-link', 'Link (opcional)', html`<input class="input" type="url" id="cartao-f-link" placeholder="ex: https://folhetos.continente.pt" autocomplete="off">`,
      'O folheto da loja. Abre dentro da app. No Continente, Pingo Doce, Lidl, Auchan e Intermarché, se ficar vazio, usa a página dos folhetos.')}
    <div class="field">
      <span class="field__label">Dias em que sai o folheto novo</span>
      <div class="cartao-dias" id="cartao-f-dias"></div>
      <span class="field__hint">Aparece no cartão "Novo folheto à terça", por exemplo.</span>
    </div>
    ${campo('cartao-f-linknome', 'Nome do botão', html`<input class="input" id="cartao-f-linknome" placeholder="Abrir folheto" autocomplete="off">`)}
    ${campo('cartao-f-notas', 'Notas', html`<textarea class="input textarea" id="cartao-f-notas" placeholder="ex: pontos, PIN da app…"></textarea>`)}
    <div class="btn-row">
      <button class="btn" data-action="modal:close" data-modal="modal-cartao">Cancelar</button>
      <button class="btn btn--primary pressable" data-action="cartoes:guardar">Guardar</button>
    </div>`);
}

function abrirLink(link) {
  linkAberto = link;
  navigate(PAG_LINK);
}

function desenharLink() {
  const frame = byId('cartao-frame');
  if (!frame) return;
  if (frame.dataset.src !== linkAberto) {
    frame.dataset.src = linkAberto;
    frame.src = linkAberto || 'about:blank';
  }
  const d = byId('cartao-link-dominio');
  if (d) d.textContent = dominio(linkAberto);
}

// Traz os cartões guardados na antiga página "Lojas & Cartões" (uma só vez).
async function migrarLojasAntigas() {
  try {
    const flag = await getDoc(sharedDoc('config', 'cartoes'));
    if (flag.exists() && flag.data().migrado) return;
    for (const loja of LOJAS_ANTIGAS) {
      const snap = await getDoc(sharedDoc('supermercados', loja.id));
      const d = snap.exists() ? snap.data() : null;
      if (!d || (!d.cartao_img && !d.notas)) continue;
      await addDoc(sharedCol(COL), {
        nome: loja.nome, numero: '', imagem: d.cartao_img || '', semFundo: false, link: loja.link, linkNome: 'Abrir folheto',
        notas: d.notas || '', createdBy: session.uid, timestamp: Date.now(),
      });
    }
    await setDoc(sharedDoc('config', 'cartoes'), { migrado: true }, { merge: true });
  } catch (e) { console.warn('[cartoes] migração', e); }
}

export default {
  id: 'cards',
  pages: [
    {
      id: PAG_CARTOES,
      width: 'medium',
      title: 'Cartões',
      root: true,
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="cartoes:novo" aria-label="Adicionar cartão">${icon('plus', 20)}</button>`,
      template: () => html`<div id="cartoes-lista"></div>`,
      onEnter: desenharLista,
    },
    {
      id: PAG_CARTAO,
      width: 'narrow',
      title: () => atual()?.nome || 'Cartão',
      template: () => html`<div class="cartao-pagina" id="cartao-detalhe"></div>`,
      onEnter: desenharDetalhe,
    },
    {
      id: PAG_LINK,
      width: 'wide',
      title: () => atual()?.linkNome || atual()?.nome || 'Folheto',
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="cartoes:link-fora" aria-label="Abrir no navegador">${icon('external', 20)}</button>`,
      template: () => html`
        <div class="cartao-web">
          <div class="cartao-web__barra glass-soft">
            <span class="muted small" id="cartao-link-dominio"></span>
            <button class="btn btn--small btn--glass pressable" data-action="cartoes:link-recarregar">${icon('repeat', 14)} Atualizar</button>
          </div>
          <iframe id="cartao-frame" class="cartao-web__frame" title="Link do cartão" referrerpolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
          <p class="muted small cartao-web__dica">Se a página ficar em branco, o site não deixa ser aberto dentro de outras apps. Usa ${icon('external', 12)} para abrir no navegador.</p>
        </div>`,
      onEnter: desenharLink,
    },
  ],
  modals: formularioTpl,
  actions: {
    'cartoes:novo': () => abrirFormulario(),
    'cartoes:abrir': ({ data }) => { atualId = data.id; navigate(PAG_CARTAO); },
    'cartoes:editar': () => { const c = atual(); if (c) abrirFormulario(c); },
    'cartoes:ver-capa': () => { const c = atual(); if (c?.imagem) showImage(c.imagem); },
    'cartoes:escolher-capa': () => byId('cartao-f-ficheiro')?.click(),
    'cartoes:capa': async ({ ev }) => {
      const file = takeFile(ev);
      if (!file) return;
      capaOriginal = await readAsDataURL(file);
      semFundo = byId('cartao-f-semfundo').checked;
      await processarCapa();
    },
    'cartoes:fundo': async () => {
      semFundo = byId('cartao-f-semfundo').checked;
      await processarCapa();
    },
    'cartoes:sem-capa': () => { capaOriginal = ''; capaFinal = ''; desenharPreviewCapa(); },
    'cartoes:guardar': async ({ el }) => {
      const nome = byId('cartao-f-nome').value.trim();
      if (!nome) { toast('Dá um nome ao cartão', 'error'); byId('cartao-f-nome').focus(); return; }
      const textoLink = byId('cartao-f-link').value.trim();
      const link = normalizarLink(textoLink);
      if (textoLink && !link) { toast('O link não parece válido', 'error'); return; }
      const dados = {
        nome,
        numero: byId('cartao-f-numero').value.trim(),
        link,
        linkNome: byId('cartao-f-linknome').value.trim(),
        notas: byId('cartao-f-notas').value.trim(),
        folhetoDias: normalizarDias(diasEdicao),
        imagem: capaFinal,
        semFundo: !!(capaOriginal ? semFundo && byId('cartao-f-semfundo').dataset.ok : cartoes.find((c) => c.id === editarId)?.semFundo),
      };
      await withLoading(el, async () => {
        if (editarId) await updateDoc(sharedDoc(COL, editarId), dados);
        else await addDoc(sharedCol(COL), { ...dados, createdBy: session.uid, timestamp: Date.now() });
      });
      closeModal('modal-cartao');
      toast(editarId ? 'Cartão atualizado' : 'Cartão adicionado');
    },
    'cartoes:apagar': async () => {
      const c = atual();
      if (!c) return;
      const ok = await confirmDialog(`Remover o cartão "${c.nome}"?`, { title: 'Remover cartão', confirmLabel: 'Remover', danger: true });
      if (!ok) return;
      await deleteDoc(sharedDoc(COL, c.id));
      toast('Cartão removido');
      back();
    },
    'cartoes:copiar': async () => {
      const c = atual();
      if (!c?.numero) return;
      try { await navigator.clipboard.writeText(c.numero); toast('Número copiado'); } catch { toast('Não foi possível copiar', 'error'); }
    },
    'cartoes:link': () => { const c = atual(); if (c && linkFolheto(c)) abrirLink(linkFolheto(c)); },
    'cartoes:folheto': ({ ev, data }) => {
      ev.stopPropagation();
      const c = cartoes.find((x) => x.id === data.id);
      if (!c) return;
      atualId = c.id;
      abrirLink(linkFolheto(c));
    },
    'cartoes:dia': ({ data }) => {
      const d = Number(data.d);
      diasEdicao = diasEdicao.includes(d) ? diasEdicao.filter((x) => x !== d) : normalizarDias([...diasEdicao, d]);
      desenharDias();
    },
    'cartoes:nome': () => sugerirFolheto(),
    'cartoes:link-fora': () => { if (linkAberto) window.open(linkAberto, '_blank', 'noopener'); },
    'cartoes:link-recarregar': () => {
      const frame = byId('cartao-frame');
      if (frame && linkAberto) { frame.src = 'about:blank'; setTimeout(() => { frame.src = linkAberto; }, 50); }
    },
  },
  start() {
    carregado = false;
    cartoes = [];
    scope.add(onSnapshot(sharedCol(COL), (snap) => {
      cartoes = snapToList(snap).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
      carregado = true;
      desenharLista();
      if (currentPage() === PAG_CARTAO) desenharDetalhe();
    }, (err) => console.error('[cartoes]', err)));
    migrarLojasAntigas();
  },
  stop() {
    scope.clear();
    cartoes = [];
    const frame = byId('cartao-frame');
    if (frame) { frame.src = 'about:blank'; delete frame.dataset.src; }
  },
};
