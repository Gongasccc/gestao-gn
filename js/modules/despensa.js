// Despensa: o que há em casa e quanto. Cada produto tem quantidade e mínimo; quando chega ao mínimo
// (ou acaba) passa sozinho para a Lista de compras. As faturas do supermercado podem encher a despensa
// com um toque. Dados em sharedCol('despensa'); a lista de compras é sharedCol('semanais').
import { html, byId, render, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, on } from '../core/state.js';
import { toast, withLoading } from '../core/ui.js';
import { createRecordList } from '../components/record-list.js';
import { actionSheet } from '../components/action-sheet.js';
import { addDoc, updateDoc, setDoc, onSnapshot } from '../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../services/paths.js';
import { registarAtividade } from '../services/atividade.js';
import { listaFaturas } from './faturas/index.js';
import { estadoDespensa, juntarFatura, chaveProduto } from './juntos/logica.js';

export const PAG_DESPENSA = 'menu-despensa';
const COL = 'despensa';
const LISTA = 'semanais';
const scope = createScope();

const LOCAIS = [
  { value: 'despensa', label: 'Despensa' },
  { value: 'frigorifico', label: 'Frigorífico' },
  { value: 'congelador', label: 'Congelador' },
  { value: 'limpeza', label: 'Limpeza' },
  { value: 'higiene', label: 'Higiene' },
  { value: 'outro', label: 'Outro' },
];
const nomeLocal = (v) => LOCAIS.find((l) => l.value === v)?.label || 'Despensa';

let listaCompras = [];
let cfg = { autoLista: true };

const produtos = createRecordList({
  key: 'despensa',
  col: () => sharedCol(COL),
  docRef: (id) => sharedDoc(COL, id),
  addTitle: 'Novo produto',
  editTitle: 'Editar produto',
  addedToast: 'Produto guardado',
  fields: [
    { name: 'nome', label: 'Produto', placeholder: 'Ex.: Azeite', required: true },
    { name: 'quantidade', label: 'Quantos há', type: 'number', default: 1 },
    { name: 'minimo', label: 'Avisar quando houver (ou menos)', type: 'number', default: 1, hint: 'Ao chegar a este número vai para a lista de compras.' },
    { name: 'local', label: 'Onde está', type: 'select', options: LOCAIS },
  ],
  item: () => '',
  onChange: () => desenhar(),
});

const naLista = (nome) => listaCompras.some((i) => !i.feita && chaveProduto(i.texto) === chaveProduto(nome));

async function porNaLista(item, { avisar = true } = {}) {
  if (naLista(item.nome)) { if (avisar) toast(`${item.nome} já está na lista`); return false; }
  await addDoc(sharedCol(LISTA), { texto: item.nome, feita: false, timestamp: Date.now(), createdBy: session.uid, origem: 'despensa' });
  if (avisar) toast(`${item.nome} foi para a lista de compras`);
  return true;
}

function itemTpl(p) {
  const est = estadoDespensa(p);
  const q = Number(p.quantidade) || 0;
  const info = est === 'acabou' ? 'Acabou' : est === 'pouco' ? 'A acabar' : nomeLocal(p.local);
  return html`
    <div class="record glass-soft desp-item desp-item--${est}" data-id="${p.id}">
      <span class="desp-item__nome pressable" data-action="rl:edit" data-list="despensa" data-id="${p.id}">
        <strong>${p.nome}</strong>
        <small>${info}${naLista(p.nome) ? ' · na lista' : ''}</small>
      </span>
      ${est !== 'ok' && !naLista(p.nome) ? html`<button class="icon-btn icon-btn--subtle" data-action="desp:lista" data-id="${p.id}" aria-label="Pôr na lista">${icon('cart', 16)}</button>` : ''}
      <span class="desp-step">
        <button data-action="desp:menos" data-id="${p.id}" aria-label="Menos um">−</button>
        <span id="desp-q-${p.id}">${q}</span>
        <button data-action="desp:mais" data-id="${p.id}" aria-label="Mais um">+</button>
      </span>
    </div>`;
}

function desenhar() {
  if (!byId('desp-lista')) return;
  const itens = produtos.items();
  const ordem = { acabou: 0, pouco: 1, ok: 2 };
  const faltam = itens.filter((p) => estadoDespensa(p) !== 'ok').sort((a, b) => ordem[estadoDespensa(a)] - ordem[estadoDespensa(b)] || a.nome.localeCompare(b.nome, 'pt'));
  const resto = itens.filter((p) => estadoDespensa(p) === 'ok');
  const porLocal = new Map();
  resto.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).forEach((p) => {
    const k = nomeLocal(p.local);
    if (!porLocal.has(k)) porLocal.set(k, []);
    porLocal.get(k).push(p);
  });
  render('desp-lista', !itens.length
    ? emptyState('A despensa está vazia. Junta o que tens em casa ou importa a última fatura do supermercado.', icon('bag', 28))
    : html`
      ${faltam.length ? html`<h4 class="section-title">A acabar (${faltam.length})</h4>${faltam.map(itemTpl)}` : ''}
      ${[...porLocal].map(([local, arr]) => html`<h4 class="section-title">${local}</h4>${arr.map(itemTpl)}`)}`);
  const btn = byId('desp-faltam');
  if (btn) btn.hidden = !faltam.some((p) => !naLista(p.nome));
}

async function mudarQuantidade(id, delta) {
  const p = produtos.items().find((x) => x.id === id);
  if (!p) return;
  const antes = estadoDespensa(p);
  const quantidade = Math.max(0, (Number(p.quantidade) || 0) + delta);
  p.quantidade = quantidade;
  const el = byId(`desp-q-${id}`);
  if (el) { el.textContent = quantidade; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  await updateDoc(sharedDoc(COL, id), { quantidade });
  const depois = estadoDespensa(p);
  if (delta < 0 && antes === 'ok' && depois !== 'ok') {
    if (cfg.autoLista && await porNaLista(p, { avisar: false })) {
      toast(`${p.nome} está a acabar: foi para a lista de compras`);
      registarAtividade(`viu que ${p.nome} está a acabar e pôs na lista`, { icon: 'bag', page: PAG_DESPENSA });
    }
  }
  desenhar();
}

const template = () => html`
  <div class="desp-acoes">
    <button class="btn btn--glass pressable" data-action="desp:fatura">${icon('receipt', 16)} Importar fatura</button>
    <button class="btn btn--glass pressable" id="desp-faltam" data-action="desp:faltam" hidden>${icon('cart', 16)} Faltas para a lista</button>
  </div>
  <div class="input-row">
    <input class="input" id="desp-input" placeholder="Juntar produto…" data-enter="desp:add" autocomplete="off">
    <button class="btn btn--primary btn--icon pressable" data-action="desp:add" aria-label="Adicionar">${icon('plus', 20)}</button>
  </div>
  <div class="list" id="desp-lista" style="margin-top:6px"></div>
  <div class="card glass" style="margin-top:18px">
    <div class="setting-row"><span>${icon('cart', 16)} Pôr na lista quando estiver a acabar</span>
      <label class="switch"><input type="checkbox" id="desp-auto" checked data-change="desp:auto"><span class="switch__track"></span></label></div>
  </div>`;

export default {
  id: 'despensa',
  pages: [{ id: PAG_DESPENSA, title: 'Despensa', root: true, template, onEnter: desenhar }],
  modals: () => produtos.modals(),
  start() {
    produtos.subscribe(scope);
    scope.add(onSnapshot(sharedCol(LISTA), (s) => { listaCompras = snapToList(s); desenhar(); }));
    scope.add(onSnapshot(sharedDoc('config', 'despensa'), (d) => {
      cfg = { autoLista: true, ...(d.data() || {}) };
      const el = byId('desp-auto');
      if (el) el.checked = cfg.autoLista !== false;
    }, () => {}));
    scope.add(on('household:update', desenhar));
  },
  stop() { scope.clear(); },
  actions: {
    'desp:add': async () => {
      const input = byId('desp-input');
      const nome = input.value.trim();
      if (!nome) return input.focus();
      input.value = '';
      const existe = produtos.items().find((p) => chaveProduto(p.nome) === chaveProduto(nome));
      if (existe) return mudarQuantidade(existe.id, 1);
      await addDoc(sharedCol(COL), { nome, quantidade: 1, minimo: 1, local: 'despensa', createdBy: session.uid, timestamp: Date.now() });
    },
    'desp:mais': ({ data }) => mudarQuantidade(data.id, 1),
    'desp:menos': ({ data }) => mudarQuantidade(data.id, -1),
    'desp:lista': async ({ data }) => {
      const p = produtos.items().find((x) => x.id === data.id);
      if (p && await porNaLista(p)) desenhar();
    },
    'desp:faltam': async ({ el }) => {
      const faltam = produtos.items().filter((p) => estadoDespensa(p) !== 'ok' && !naLista(p.nome));
      await withLoading(el, () => Promise.all(faltam.map((p) => porNaLista(p, { avisar: false }))));
      toast(`${faltam.length} ${faltam.length === 1 ? 'produto foi' : 'produtos foram'} para a lista`);
      registarAtividade(`pôs ${faltam.length} ${faltam.length === 1 ? 'produto' : 'produtos'} da despensa na lista`, { icon: 'cart', page: 'menu-lista-compras' });
    },
    'desp:auto': async ({ el }) => {
      cfg.autoLista = el.checked;
      await setDoc(sharedDoc('config', 'despensa'), { autoLista: el.checked }, { merge: true });
    },
    'desp:fatura': async () => {
      const faturas = [...listaFaturas()].filter((f) => (f.itens || []).length)
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 6);
      if (!faturas.length) return toast('Ainda não há faturas lidas. Digitaliza uma em Supermercados.', 'error');
      const id = await actionSheet(faturas.map((f) => ({
        id: f.id, label: `${f.loja || 'Fatura'} · ${String(f.data || '').split('-').reverse().slice(0, 2).join('/')} · ${(f.itens || []).length} produtos`,
      })), { title: 'Que compras guardaste em casa?' });
      const f = faturas.find((x) => x.id === id);
      if (!f) return;
      const { atualizar, novos } = juntarFatura(produtos.items(), f.itens);
      await Promise.all([
        ...atualizar.map((a) => updateDoc(sharedDoc(COL, a.id), { quantidade: a.quantidade })),
        ...novos.map((n) => addDoc(sharedCol(COL), { nome: n.nome, quantidade: n.quantidade, minimo: 1, local: 'despensa', createdBy: session.uid, timestamp: Date.now(), origem: 'fatura' })),
      ]);
      toast(`Despensa atualizada: ${novos.length} novos, ${atualizar.length} repostos`);
      registarAtividade(`guardou as compras do ${f.loja || 'supermercado'} na despensa`, { icon: 'bag', page: PAG_DESPENSA });
    },
  },
};
