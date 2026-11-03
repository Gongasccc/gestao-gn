// Supermercados: como nas Finanças, um seletor de mês e três separadores
// (Resumo, Faturas, Preços). Os cartões passaram para "Cartões" e as listas para "Lista de compras".
import { html, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, on } from '../core/state.js';
import { money } from '../core/format.js';
import { tabsTpl, positionIndicator } from '../components/tabs.js';
import faturas, { listaFaturas, faturasCarregadas, PAG_GASTOS } from './faturas/index.js';
import {
  nomeMes, deslocarMes, mesAtual, daMes, resumoMes, porLoja, porCategoria, compararPrecos, maisComprados,
} from './faturas/stats.js';

const PAGE = 'menu-supermercados';
const scope = createScope();
let mes = mesAtual();

const pct = (v, max) => (max > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0);
const dataCurta = (iso) => {
  if (!iso) return 'Sem data';
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${nomeMes(`${a}-${m}`, true)}`;
};

const linhaBarra = (nome, valor, max, extra = '') => html`
  <div class="fat-linha">
    <div class="fat-linha__topo"><span>${nome}</span><strong>${money(valor)}</strong></div>
    <div class="fat-linha__barra"><span style="width:${pct(valor, max)}%"></span></div>
    ${extra ? html`<small>${extra}</small>` : ''}
  </div>`;

const vazio = (texto) => html`
  <div class="card glass sup-vazio">
    <span class="sup-vazio__icone">${icon('receipt', 26)}</span>
    <p>${texto}</p>
    <button class="btn btn--primary pressable" data-action="faturas:scan">${icon('camera', 16)} Digitalizar fatura</button>
  </div>`;

function desenharResumo(lista) {
  const doMes = daMes(lista, mes);
  const r = resumoMes(lista, mes);
  const cats = porCategoria(doMes);
  const lojas = porLoja(doMes);
  const top = maisComprados(doMes);
  const variacao = r.variacao == null ? '' : html`
    <span class="fat-variacao ${r.variacao > 0 ? 'is-subiu' : 'is-desceu'}">
      ${icon(r.variacao > 0 ? 'trendUp' : 'trendDown', 14)} ${Math.abs(r.variacao)}% vs ${nomeMes(deslocarMes(mes, -1), true)}
    </span>`;
  render('sup-resumo', html`
    <div class="card glass fin-hero">
      <span class="eyebrow">Gasto no supermercado</span>
      <span class="fin-hero__total">${money(r.total)}</span>
      ${variacao}
      <div class="fat-kpis sup-kpis">
        <div><strong>${r.compras}</strong><span>${r.compras === 1 ? 'compra' : 'compras'}</span></div>
        <div><strong>${money(r.media)}</strong><span>média</span></div>
        <div><strong class="fat-verde">${money(r.poupanca)}</strong><span>poupado</span></div>
      </div>
    </div>
    ${doMes.length ? html`
      <div class="card glass">
        <h3 class="card__title">${icon('bag', 18)} Por categoria</h3>
        ${cats.length ? cats.map((c) => linhaBarra(c.nome, c.total, cats[0].total)) : html`<p class="muted small">Sem produtos lidos.</p>`}
      </div>
      <div class="card glass">
        <h3 class="card__title">${icon('cart', 18)} Por loja</h3>
        ${lojas.map((l) => linhaBarra(l.loja, l.total, lojas[0].total, `${l.compras} ${l.compras === 1 ? 'compra' : 'compras'}`))}
      </div>
      ${top.length ? html`
        <div class="card glass">
          <h3 class="card__title">${icon('repeat', 18)} Mais comprados</h3>
          ${top.map((p) => html`<div class="fat-top"><span>${p.nome}</span><small>${p.vezes}× · ${money(p.total)}</small></div>`)}
        </div>` : ''}
      <button class="row-link glass pressable" data-action="faturas:gastos">
        <span>${icon('chart', 18)} Evolução dos gastos</span>${icon('chevronRight', 18)}
      </button>` : vazio('Sem faturas neste mês. Digitaliza uma fatura para veres os gastos por categoria e por loja.')}
  `);
}

function desenharFaturas(lista) {
  const doMes = daMes(lista, mes).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  render('sup-faturas', doMes.length
    ? doMes.map((f) => html`
      <button class="fat-item card glass-soft pressable" data-action="faturas:abrir" data-id="${f.id}">
        <span class="fat-item__icone">${icon('receipt', 18)}</span>
        <span class="fat-item__info"><strong>${f.loja}</strong><small>${dataCurta(f.data)} · ${(f.itens || []).length} produtos</small></span>
        <span class="fat-item__valor"><strong>${money(f.total)}</strong>${f.poupanca ? html`<small class="fat-verde">−${money(f.poupanca)}</small>` : ''}</span>
      </button>`)
    : html`<p class="muted small sup-nada">Sem faturas em ${nomeMes(mes)}.</p>`);
}

function desenharPrecos(lista) {
  // Produtos comprados neste mês que já foram vistos em mais de uma loja.
  const doMes = new Set(daMes(lista, mes).flatMap((f) => (f.itens || []).map((i) => String(i.produto || '').toLowerCase())));
  const produtos = compararPrecos(lista)
    .filter((p) => p.lojas.length > 1 && doMes.has(String(p.nome).toLowerCase()))
    .sort((a, b) => b.diferenca - a.diferenca)
    .slice(0, 12);
  render('sup-precos', html`
    <button class="card glass sup-comparador pressable" data-action="faturas:precos">
      <span class="sup-comparador__icone">${icon('compare', 22)}</span>
      <span><strong>Comparador de preços</strong><small>Procura um artigo e vê o preço em cada loja</small></span>
      ${icon('chevronRight', 18)}
    </button>
    <h3 class="section-title">Onde poupar (${nomeMes(mes).split(' ')[0]})</h3>
    ${produtos.length
      ? produtos.map((p) => html`
        <button class="fat-preco card glass-soft pressable" data-action="faturas:produto" data-chave="${p.chave}">
          <div class="fat-preco__topo"><strong>${p.nome}</strong></div>
          <div class="fat-preco__lojas">
            ${p.lojas.map((l, i) => html`<span class="chip ${i === 0 ? 'chip--accent' : 'chip--muted'}">${l.loja} ${money(l.preco)}</span>`)}
          </div>
          <small class="fat-verde">Mais barato no ${p.maisBarata.loja} · poupas ${money(p.diferenca)}${p.unidade === 'kg' ? '/kg' : ''}</small>
        </button>`)
      : html`<p class="muted small sup-nada">Quando comprares o mesmo produto em lojas diferentes, aparece aqui onde é mais barato.</p>`}
  `);
}

function desenhar() {
  if (!document.getElementById('sup-resumo')) return;
  const label = document.getElementById('sup-mes');
  if (label) label.textContent = nomeMes(mes);
  const seguinte = document.querySelector('[data-action="sup:mes"][data-step="1"]');
  if (seguinte) seguinte.disabled = mes >= mesAtual();
  if (!faturasCarregadas()) {
    render('sup-resumo', html`<div class="fat-carregar"><span class="spinner"></span></div>`);
    return;
  }
  const lista = listaFaturas();
  desenharResumo(lista);
  desenharFaturas(lista);
  desenharPrecos(lista);
}

export default {
  id: 'supermarkets',
  pages: [
    {
      id: PAGE,
      width: 'medium',
      title: 'Supermercados',
      root: true,
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="faturas:scan" aria-label="Digitalizar fatura">${icon('camera', 20)}</button>`,
      template: () => html`
        <div class="month-switch">
          <button class="icon-btn glass-chip pressable" data-action="sup:mes" data-step="-1" aria-label="Mês anterior">${icon('chevronLeft', 18)}</button>
          <span id="sup-mes" class="month-switch__label"></span>
          <button class="icon-btn glass-chip pressable" data-action="sup:mes" data-step="1" aria-label="Mês seguinte">${icon('chevronRight', 18)}</button>
        </div>
        ${tabsTpl('sup', [{ id: 'resumo', label: 'Resumo' }, { id: 'faturas', label: 'Faturas' }, { id: 'precos', label: 'Preços' }])}
        <div data-tab-panel="sup:resumo"><div id="sup-resumo"></div></div>
        <div data-tab-panel="sup:faturas" hidden>
          <button class="btn btn--primary btn--large btn--block pressable fat-scan-btn" data-action="faturas:scan">${icon('camera', 18)} Digitalizar fatura</button>
          <div class="list" id="sup-faturas"></div>
        </div>
        <div data-tab-panel="sup:precos" hidden><div id="sup-precos"></div></div>`,
      onEnter: () => {
        desenhar();
        requestAnimationFrame(() => positionIndicator(document.querySelector('[data-tabs="sup"]')));
      },
    },
    ...faturas.pages,
  ],
  modals: faturas.modals,
  actions: {
    ...faturas.actions,
    'sup:mes': ({ data }) => {
      const next = deslocarMes(mes, Number(data.step) || 0);
      mes = next > mesAtual() ? mesAtual() : next;
      desenhar();
    },
  },
  start() {
    mes = mesAtual();
    faturas.start();
    scope.add(on('faturas:update', desenhar));
    desenhar();
  },
  stop() {
    faturas.stop();
    scope.clear();
  },
};

export { PAG_GASTOS };
