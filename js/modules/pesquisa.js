// Pesquisa geral: procura ao mesmo tempo em receitas, lista de compras, despensa, medicamentos, despesas,
// tarefas, rotinas e eventos. Lê as coleções quando a página abre (o Firestore usa a cache do telemóvel,
// por isso funciona também sem rede) e procura enquanto se escreve.
import { html, byId, render, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { money, isoToShort } from '../core/format.js';
import { getDocs } from '../services/firebase.js';
import { sharedCol, snapToList } from '../services/paths.js';
import { pontuar } from './juntos/logica.js';

export const PAG_PESQUISA = 'menu-pesquisa';

// Cada fonte: coleção, como se chama na app, ícone, texto pesquisável, título/subtítulo e como abrir.
const FONTES = [
  { col: 'receitas', nome: 'Receitas', icon: 'book', texto: (r) => [r.titulo, r.ingredientes, r.notas].join(' '),
    titulo: (r) => r.titulo, sub: (r) => (r.tempo ? `${r.tempo}` : 'Receita'), abrir: (r) => ({ action: 'rc:open', id: r.id }) },
  { col: 'semanais', nome: 'Lista de compras', icon: 'cart', texto: (i) => i.texto,
    titulo: (i) => i.texto, sub: (i) => (i.feita ? 'Já comprado' : i.loja ? `Por comprar · ${i.loja}` : 'Por comprar'), abrir: () => ({ page: 'menu-lista-compras' }) },
  { col: 'despensa', nome: 'Despensa', icon: 'bag', texto: (p) => p.nome,
    titulo: (p) => p.nome, sub: (p) => `${Number(p.quantidade) || 0} em casa`, abrir: () => ({ page: 'menu-despensa' }) },
  { col: 'farmacia', nome: 'Farmácia', icon: 'pill', texto: (m) => [m.nome, m.substancia, m.tipo, m.notas, ...(m.sintomas || [])].join(' '),
    titulo: (m) => m.nome, sub: (m) => m.substancia || m.tipo || 'Medicamento', abrir: (m) => ({ action: 'farmacia:abrir', id: m.id }) },
  { col: 'despesas', nome: 'Despesas', icon: 'wallet', texto: (d) => [d.descricao, d.categoria, d.notas].join(' '),
    titulo: (d) => d.descricao || 'Despesa', sub: (d) => [money(d.valor), d.data ? isoToShort(d.data) : ''].filter(Boolean).join(' · '),
    abrir: () => ({ page: 'menu-financas' }), ordem: (d) => d.data || '' },
  { col: 'tarefas', nome: 'Tarefas', icon: 'check', texto: (t) => t.texto,
    titulo: (t) => t.texto, sub: (t) => (t.feita ? 'Feita' : 'Por fazer'), abrir: () => ({ page: 'menu-tarefas' }) },
  { col: 'rotinas', nome: 'Rotinas', icon: 'repeat', texto: (r) => r.nome,
    titulo: (r) => r.nome, sub: () => 'Rotina', abrir: () => ({ page: 'menu-tarefas' }) },
  { col: 'eventos_grupo', nome: 'Eventos', icon: 'gift', texto: (e) => [e.titulo, e.presentes, e.notas].join(' '),
    titulo: (e) => e.titulo, sub: (e) => (e.tipo === 'aniversario' ? 'Aniversário' : 'Evento'), abrir: () => ({ page: 'menu-juntos' }) },
];

let dados = null; // { col: [registos] }
let aCarregar = null;
let termo = '';

async function carregar() {
  if (aCarregar) return aCarregar;
  aCarregar = Promise.all(FONTES.map((f) => getDocs(sharedCol(f.col)).then(snapToList).catch(() => [])))
    .then((listas) => { dados = Object.fromEntries(FONTES.map((f, i) => [f.col, listas[i]])); })
    .finally(() => { aCarregar = null; });
  return aCarregar;
}

/** Resultados agrupados por fonte (no máximo 6 por fonte). */
function procurar(q) {
  if (!dados || q.trim().length < 2) return [];
  return FONTES.map((f) => {
    const itens = (dados[f.col] || [])
      .map((r) => ({ r, p: pontuar(f.texto(r), q) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || String(f.ordem?.(b.r) || '').localeCompare(String(f.ordem?.(a.r) || '')))
      .slice(0, 6)
      .map((x) => x.r);
    return { f, itens };
  }).filter((g) => g.itens.length);
}

function linhaTpl(f, r) {
  const a = f.abrir(r);
  const attrs = a.action
    ? html`data-action="${a.action}" data-id="${a.id}"`
    : html`data-action="nav:go" data-page="${a.page}"`;
  return html`
    <button class="pesq__row pressable" ${attrs}>
      <span class="pesq__ico">${icon(f.icon, 16)}</span>
      <span class="pesq__txt"><strong>${f.titulo(r)}</strong><small>${f.sub(r)}</small></span>
      ${icon('chevronRight', 16)}
    </button>`;
}

function desenhar() {
  if (!byId('pesq-res')) return;
  if (termo.trim().length < 2) {
    render('pesq-res', emptyState('Escreve pelo menos duas letras. Procura em receitas, lista, despensa, medicamentos, despesas, tarefas e eventos.', icon('search', 28)));
    return;
  }
  if (!dados) { render('pesq-res', html`<p class="setting-hint">A procurar…</p>`); return; }
  const grupos = procurar(termo);
  render('pesq-res', grupos.length
    ? grupos.map(({ f, itens }) => html`
      <h4 class="section-title">${f.nome}</h4>
      <div class="pesq__grupo glass">${itens.map((r) => linhaTpl(f, r))}</div>`)
    : emptyState(`Nada encontrado para "${termo.trim()}".`, icon('search', 28)));
}

const template = () => html`
  <div class="pesq">
    <label class="pesq__box">${icon('search', 18)}
      <input class="input" type="search" id="pesq-input" placeholder="Pesquisar em tudo…" autocomplete="off" data-input="pesq:termo" aria-label="Pesquisar">
    </label>
    <div class="pesq__res" id="pesq-res"></div>
  </div>`;

export default {
  id: 'pesquisa',
  pages: [{
    id: PAG_PESQUISA,
    title: 'Pesquisar',
    root: true,
    width: 'medium',
    template,
    onEnter: () => {
      dados = null;
      desenhar();
      carregar().then(desenhar);
      setTimeout(() => byId('pesq-input')?.focus(), 250);
    },
  }],
  stop() { dados = null; termo = ''; },
  actions: {
    'pesq:termo': ({ value }) => { termo = value; desenhar(); },
  },
};
