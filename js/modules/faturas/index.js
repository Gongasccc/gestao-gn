// Gastos do supermercado: digitalizar faturas (foto, galeria ou PDF), lê-las com IA
// e mostrar quanto se gasta por mês, onde cada produto é mais barato e quanto se poupa.
// As páginas são montadas dentro do módulo Supermercados (ver ../supermarkets.js).
import { onSnapshot, addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { navigate, back, currentPage } from '../../core/router.js';
import { html, byId, render } from '../../core/dom.js';
import { money } from '../../core/format.js';
import { toast, confirmDialog, openModal, closeModal, modalTemplate, showImage } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { session, createScope } from '../../core/state.js';
import { compressImage, readAsDataURL, takeFile } from '../../core/images.js';
import { lerFatura } from './ai.js';
import {
  CATEGORIAS, nomeMes, deslocarMes, mesAtual, daMes, resumoMes, evolucaoMensal,
  porLoja, porCategoria, compararPrecos, maisComprados, duplicada, arred,
} from './stats.js';

const COLECAO = 'faturas';
export const PAG_GASTOS = 'page-gastos';
export const PAG_SCAN = 'page-fatura-scan';
const PAG_FATURA = 'page-fatura';
const PAG_PRECOS = 'page-precos';
const MAX_PDF = 15 * 1024 * 1024;

const scope = createScope();
let faturas = [];
let carregado = false;
let mes = mesAtual();
let atual = null; // fatura aberta (guardada ou rascunho por guardar)
let rascunho = false;
let itemEditar = -1;
let pesquisa = '';
let aLer = false;

const euro = (v) => money(v);
const dataCurta = (iso) => {
  if (!iso) return 'Sem data';
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${nomeMes(`${a}-${m}`, true)} ${a}`;
};
const pct = (v, max) => (max > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0);

// ---------- Resumo para a página principal dos Supermercados ----------

export function resumoTpl() {
  return html`
    <button class="fat-hero card glass-soft pressable" data-action="faturas:gastos">
      <span class="fat-hero__label">${icon('chart', 16)} Gastos em ${nomeMes(mesAtual()).split(' ')[0]}</span>
      <strong class="fat-hero__valor" id="fat-hero-valor">${euro(0)}</strong>
      <span class="fat-hero__sub" id="fat-hero-sub">Digitaliza faturas para acompanhar os gastos</span>
    </button>
    <button class="btn btn--primary btn--large btn--block pressable fat-scan-btn" data-action="faturas:scan">
      ${icon('camera', 18)} Digitalizar fatura
    </button>`;
}

function desenharResumo() {
  const r = resumoMes(faturas, mesAtual());
  const valor = byId('fat-hero-valor');
  if (valor) valor.textContent = euro(r.total);
  const sub = byId('fat-hero-sub');
  if (sub) {
    sub.textContent = faturas.length
      ? [`${r.compras} ${r.compras === 1 ? 'compra' : 'compras'}`, r.poupanca ? `poupaste ${euro(r.poupanca)}` : '']
        .filter(Boolean).join(' · ')
      : 'Digitaliza faturas para acompanhar os gastos';
  }
}

// ---------- Página: Gastos ----------

const funcionalidades = [
  { icon: 'trendUp', titulo: 'Acompanha os teus gastos', texto: 'Vê quanto gastas por mês e a tua evolução ao longo do tempo' },
  { icon: 'compare', titulo: 'Compara preços', texto: 'Descobre onde cada produto é mais barato' },
  { icon: 'piggy', titulo: 'Vê quanto poupas', texto: 'Identifica descontos e promoções aplicados automaticamente' },
];

function vazioTpl() {
  return html`
    <div class="fat-vazio stagger-on-enter">
      <div class="fat-vazio__grafico" aria-hidden="true">${[40, 65, 30, 80].map((h) => html`<span style="height:${h}%"></span>`)}</div>
      <p class="fat-vazio__titulo">Digitaliza a tua primeira fatura para desbloquear</p>
      ${funcionalidades.map((f) => html`
        <div class="fat-func card glass-soft">
          <span class="fat-func__icone">${icon(f.icon, 20)}</span>
          <div><strong>${f.titulo}</strong><p>${f.texto}</p></div>
        </div>`)}
      <button class="btn btn--primary btn--large btn--block pressable" data-action="faturas:scan">${icon('camera', 18)} Digitalizar fatura</button>
      <p class="fat-privado">${icon('shield', 14)} As faturas ficam só no vosso espaço</p>
    </div>`;
}

function graficoTpl(evolucao) {
  const max = Math.max(...evolucao.map((m) => m.total));
  return html`
    <div class="fat-grafico" role="list">
      ${evolucao.map((m) => html`
        <button class="fat-barra ${m.ym === mes ? 'is-ativa' : ''}" role="listitem" data-action="faturas:mes" data-ym="${m.ym}"
          aria-label="${nomeMes(m.ym)}: ${euro(m.total)}">
          <span class="fat-barra__valor">${m.total ? Math.round(m.total) : ''}</span>
          <span class="fat-barra__col"><span style="height:${pct(m.total, max)}%"></span></span>
          <span class="fat-barra__mes">${nomeMes(m.ym, true)}</span>
        </button>`)}
    </div>`;
}

// O gráfico termina no mês atual, ou mais cedo se o mês escolhido já não couber nos últimos 6.
const fimGrafico = () => (deslocarMes(mes, 5) < mesAtual() ? deslocarMes(mes, 2) : mesAtual());

const linhaBarra = (nome, valor, max, extra = '') => html`
  <div class="fat-linha">
    <div class="fat-linha__topo"><span>${nome}</span><strong>${euro(valor)}</strong></div>
    <div class="fat-linha__barra"><span style="width:${pct(valor, max)}%"></span></div>
    ${extra ? html`<small>${extra}</small>` : ''}
  </div>`;

const itemFaturaLista = (f) => html`
  <button class="fat-item card glass-soft pressable" data-action="faturas:abrir" data-id="${f.id}">
    <span class="fat-item__icone">${icon('receipt', 18)}</span>
    <span class="fat-item__info"><strong>${f.loja}</strong><small>${dataCurta(f.data)} · ${(f.itens || []).length} produtos</small></span>
    <span class="fat-item__valor"><strong>${euro(f.total)}</strong>${f.poupanca ? html`<small class="fat-verde">−${euro(f.poupanca)}</small>` : ''}</span>
  </button>`;

function desenharGastos() {
  const alvo = byId('fat-gastos');
  if (!alvo) return;
  if (!carregado) { render(alvo, html`<div class="fat-carregar"><span class="spinner"></span></div>`); return; }
  if (!faturas.length) { render(alvo, vazioTpl()); return; }

  const r = resumoMes(faturas, mes);
  const doMes = daMes(faturas, mes).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const lojas = porLoja(doMes);
  const cats = porCategoria(doMes);
  const top = maisComprados(doMes);
  const variacao = r.variacao == null ? '' : html`
    <span class="fat-variacao ${r.variacao > 0 ? 'is-subiu' : 'is-desceu'}">
      ${icon(r.variacao > 0 ? 'trendUp' : 'trendDown', 14)} ${Math.abs(r.variacao)}% vs ${nomeMes(deslocarMes(mes, -1), true)}
    </span>`;

  render(alvo, html`
    <div class="fat-mes">
      <button class="icon-btn" data-action="faturas:mes" data-delta="-1" aria-label="Mês anterior">${icon('chevronLeft', 20)}</button>
      <strong>${nomeMes(mes)}</strong>
      <button class="icon-btn" data-action="faturas:mes" data-delta="1" aria-label="Mês seguinte" ${mes >= mesAtual() ? 'disabled' : ''}>${icon('chevronRight', 20)}</button>
    </div>
    <section class="card glass-soft fat-total">
      <span class="fat-total__label">Total gasto</span>
      <strong class="fat-total__valor">${euro(r.total)}</strong>
      ${variacao}
      <div class="fat-kpis">
        <div><strong>${r.compras}</strong><span>compras</span></div>
        <div><strong>${euro(r.media)}</strong><span>média</span></div>
        <div><strong class="fat-verde">${euro(r.poupanca)}</strong><span>poupado</span></div>
      </div>
    </section>
    <section class="card glass-soft">
      <h3 class="card__title">${icon('chart', 18)} Evolução</h3>
      ${graficoTpl(evolucaoMensal(faturas, fimGrafico(), 6))}
    </section>
    <button class="row-link card glass-soft pressable" data-action="faturas:precos">
      <span>${icon('compare', 20)} Comparar preços</span>${icon('chevronRight', 18)}
    </button>
    ${lojas.length ? html`
      <section class="card glass-soft">
        <h3 class="card__title">${icon('cart', 18)} Por loja</h3>
        ${lojas.map((l) => linhaBarra(l.loja, l.total, lojas[0].total, `${l.compras} ${l.compras === 1 ? 'compra' : 'compras'}`))}
      </section>` : ''}
    ${cats.length ? html`
      <section class="card glass-soft">
        <h3 class="card__title">${icon('bag', 18)} Por categoria</h3>
        ${cats.map((c) => linhaBarra(c.nome, c.total, cats[0].total))}
      </section>` : ''}
    ${top.length ? html`
      <section class="card glass-soft">
        <h3 class="card__title">${icon('repeat', 18)} Mais comprados</h3>
        ${top.map((p) => html`<div class="fat-top"><span>${p.nome}</span><small>${p.vezes}× · ${euro(p.total)}</small></div>`)}
      </section>` : ''}
    <h3 class="section-title">Faturas de ${nomeMes(mes).split(' ')[0]}</h3>
    <div class="list">${doMes.length ? doMes.map(itemFaturaLista) : html`<p class="fat-nada">Sem faturas neste mês.</p>`}</div>
  `);
}

// ---------- Página: Digitalizar ----------

function desenharScan({ preview = '', erro = '', pdf = '' } = {}) {
  const moldura = byId('fat-moldura');
  if (!moldura) return;
  moldura.classList.toggle('is-a-ler', aLer);
  render(byId('fat-moldura-conteudo'), preview
    ? html`<img src="${preview}" alt="Fatura">`
    : pdf
      ? html`<div class="fat-moldura__vazio">${icon('file', 48)}<span>${pdf}</span></div>`
      : html`<div class="fat-moldura__vazio">${icon('receipt', 48)}<span>Aponte para o recibo</span></div>`);
  const estado = byId('fat-scan-estado');
  if (estado) {
    render(estado, aLer
      ? html`<strong>A ler a fatura…</strong><span>A identificar loja, produtos, preços e descontos</span>`
      : erro
        ? html`<strong class="fat-erro">Não foi possível ler</strong><span>${erro}</span>`
        : html`<strong>Centre o recibo na moldura</strong><span>O recibo deve estar totalmente visível</span>`);
  }
  byId('fat-scan-acoes')?.classList.toggle('is-bloqueado', aLer);
}

async function processarFicheiro(file) {
  if (!file || aLer) return;
  const ePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let ficheiro;
  let preview = '';
  try {
    if (ePdf) {
      if (file.size > MAX_PDF) throw new Error('O PDF é demasiado grande (máx. 15 MB).');
      const url = await readAsDataURL(file);
      ficheiro = { base64: url.split(',')[1], mime: 'application/pdf' };
    } else {
      // Resolução alta para a IA conseguir ler o texto pequeno dos talões.
      preview = await compressImage(file, { maxSize: 2000, quality: 0.85 });
      ficheiro = { base64: preview.split(',')[1], mime: 'image/jpeg' };
    }
  } catch (e) {
    desenharScan({ erro: e.message || 'Ficheiro inválido.' });
    return;
  }

  aLer = true;
  desenharScan({ preview, pdf: ePdf ? file.name : '' });
  try {
    const lida = await lerFatura(ficheiro);
    const imagem = preview ? await compressImage(file, { maxSize: 900, quality: 0.6 }) : '';
    atual = { ...lida, data: lida.data || new Date().toISOString().slice(0, 10), imagem, origem: ePdf ? 'pdf' : 'foto' };
    rascunho = true;
    aLer = false;
    desenharScan();
    desenharFatura();
    if (currentPage() === PAG_SCAN) navigate(PAG_FATURA, { replace: true });
  } catch (e) {
    aLer = false;
    desenharScan({ preview, erro: e.message });
  }
}

// ---------- Página: Fatura (revisão e detalhe) ----------

function desenharFatura() {
  const alvo = byId('fat-detalhe');
  if (!alvo || !atual) return;
  const f = atual;
  const somaItens = arred((f.itens || []).reduce((s, i) => s + (Number(i.total) || 0), 0));
  const diferenca = arred(f.total - somaItens);
  const dup = rascunho ? duplicada(faturas, f) : null;

  render(alvo, html`
    ${rascunho ? html`
      <div class="fat-aviso card glass-soft">
        ${icon('check', 18)}<span>Confirma os dados lidos. Toca num campo ou produto para corrigir.</span>
      </div>` : ''}
    ${dup ? html`<div class="fat-aviso fat-aviso--alerta card glass-soft">${icon('alert', 18)}<span>Já existe uma fatura igual (${f.loja}, ${dataCurta(f.data)}, ${euro(f.total)}).</span></div>` : ''}
    <section class="card glass-soft fat-cabecalho pressable" data-action="faturas:editar-cabecalho">
      <div class="fat-cabecalho__topo">
        <div>
          <strong class="fat-cabecalho__loja">${f.loja}</strong>
          <small>${[dataCurta(f.data), f.hora, f.local].filter(Boolean).join(' · ')}</small>
        </div>
        ${f.imagem ? html`<img class="fat-cabecalho__img" src="${f.imagem}" alt="Fatura" data-action="faturas:ver-imagem">` : ''}
      </div>
      <div class="fat-kpis">
        <div><strong>${euro(f.total)}</strong><span>total pago</span></div>
        <div><strong class="fat-verde">${euro(f.poupanca)}</strong><span>poupado</span></div>
        <div><strong>${(f.itens || []).length}</strong><span>produtos</span></div>
      </div>
      ${f.saldoCartao ? html`<p class="fat-cartao">${icon('wallet', 14)} Acumulaste ${euro(f.saldoCartao)} em cartão</p>` : ''}
      ${f.pagamento ? html`<p class="fat-meta">Pagamento: ${f.pagamento}</p>` : ''}
    </section>
    ${(f.descontos || []).length ? html`
      <section class="card glass-soft">
        <h3 class="card__title">${icon('piggy', 18)} Descontos e promoções</h3>
        ${f.descontos.map((d) => html`<div class="fat-top"><span>${d.descricao}</span><small class="fat-verde">−${euro(d.valor)}</small></div>`)}
      </section>` : ''}
    <section class="card glass-soft fat-produtos">
      <h3 class="card__title">${icon('bag', 18)} Produtos</h3>
      ${(f.itens || []).map((i, idx) => html`
        <button class="fat-produto pressable" data-action="faturas:editar-item" data-idx="${idx}">
          <span class="fat-produto__info">
            <strong>${i.produto || i.nome}</strong>
            <small>${i.quantidade !== 1 ? `${String(i.quantidade).replace('.', ',')} ${i.unidade} × ${euro(i.precoUnitario)} · ` : ''}${CATEGORIAS[i.categoria] || 'Outros'}</small>
          </span>
          <span class="fat-produto__preco">
            <strong>${euro(i.total)}</strong>
            ${i.desconto ? html`<small class="fat-verde">−${euro(i.desconto)}</small>` : ''}
          </span>
        </button>`)}
      ${Math.abs(diferenca) >= 0.05 ? html`<p class="fat-meta">A soma dos produtos (${euro(somaItens)}) difere do total em ${euro(diferenca)}.</p>` : ''}
    </section>
    <div class="btn-row">
      ${rascunho
        ? html`
          <button class="btn pressable" data-action="faturas:descartar">Descartar</button>
          <button class="btn btn--primary pressable" data-action="faturas:guardar">${icon('check', 16)} Guardar</button>`
        : html`<button class="btn btn--danger-soft pressable" data-action="faturas:apagar">${icon('trash', 16)} Apagar fatura</button>`}
    </div>
  `);
}

const opcoesCategoria = (sel) => Object.entries(CATEGORIAS)
  .map(([k, nome]) => html`<option value="${k}" ${k === sel ? 'selected' : ''}>${nome}</option>`);

async function persistir() {
  if (rascunho || !atual?.id) return;
  const { id, ...dados } = atual;
  await updateDoc(sharedDoc(COLECAO, id), dados);
}

// ---------- Página: Comparar preços ----------

function desenharPrecos() {
  const alvo = byId('fat-precos');
  if (!alvo) return;
  const q = pesquisa.trim().toLowerCase();
  const todos = compararPrecos(faturas);
  const lista = q ? todos.filter((p) => p.nome.toLowerCase().includes(q)) : todos;
  const variasLojas = todos.filter((p) => p.lojas.length > 1).length;
  const resumo = byId('fat-precos-resumo');
  if (resumo) {
    resumo.textContent = todos.length
      ? `${todos.length} produtos · ${variasLojas} comprados em mais de uma loja`
      : '';
  }
  render(alvo, lista.length
    ? lista.slice(0, 150).map((p) => html`
      <button class="fat-preco card glass-soft pressable" data-action="faturas:produto" data-chave="${p.chave}">
        <div class="fat-preco__topo">
          <strong>${p.nome}</strong>
          ${p.tendencia ? html`<span class="fat-variacao ${p.tendencia > 0 ? 'is-subiu' : 'is-desceu'}">${icon(p.tendencia > 0 ? 'trendUp' : 'trendDown', 12)} ${euro(Math.abs(p.tendencia))}</span>` : ''}
        </div>
        <div class="fat-preco__lojas">
          ${p.lojas.map((l, i) => html`<span class="chip ${i === 0 && p.lojas.length > 1 ? 'chip--accent' : 'chip--muted'}">${l.loja} ${euro(l.preco)}</span>`)}
        </div>
        ${p.lojas.length > 1 ? html`<small class="fat-verde">Mais barato no ${p.maisBarata.loja} · poupas ${euro(p.diferenca)}${p.unidade === 'kg' ? '/kg' : ''}</small>` : html`<small>Comprado ${p.vezes}× · último ${euro(p.ultimo.preco)}</small>`}
      </button>`)
    : html`<p class="fat-nada">${faturas.length ? 'Nenhum produto encontrado.' : 'Digitaliza faturas para comparar preços.'}</p>`);
}

function abrirProduto(chave) {
  const p = compararPrecos(faturas).find((x) => x.chave === chave);
  if (!p) return;
  render(byId('fat-produto-corpo'), html`
    <p class="fat-meta">${CATEGORIAS[p.categoria] || 'Outros'} · comprado ${p.vezes}×</p>
    <h3 class="section-title">Preço por loja</h3>
    ${p.lojas.map((l, i) => html`
      <div class="fat-top"><span>${i === 0 && p.lojas.length > 1 ? icon('star', 14) : ''} ${l.loja}</span><small>${euro(l.preco)} · ${dataCurta(l.data)}</small></div>`)}
    <h3 class="section-title">Histórico</h3>
    ${[...p.historico].reverse().map((h) => html`<div class="fat-top"><span>${dataCurta(h.data)} · ${h.loja}</span><small>${euro(h.preco)}</small></div>`)}
    <p class="fat-meta">Mín. ${euro(p.min)} · Máx. ${euro(p.max)}</p>
  `);
  byId('modal-fat-produto-title').textContent = p.nome;
  openModal('modal-fat-produto');
}

// ---------- Módulo ----------

const campo = (id, label, input) => html`<div class="field"><label class="field__label" for="${id}">${label}</label>${input}</div>`;

export default {
  pages: [
    {
      id: PAG_GASTOS,
      title: 'Gastos',
      headerAction: () => html`<button class="icon-btn glass-chip pressable" data-action="faturas:scan" aria-label="Digitalizar fatura">${icon('camera', 20)}</button>`,
      onEnter: desenharGastos,
      template: () => html`<div class="fat" id="fat-gastos"></div>`,
    },
    {
      id: PAG_SCAN,
      title: 'Digitalizar Fatura',
      onEnter: () => { if (!aLer) desenharScan(); },
      template: () => html`
        <div class="fat fat-scan">
          <div class="fat-moldura" id="fat-moldura">
            <span class="fat-canto fat-canto--tl"></span><span class="fat-canto fat-canto--tr"></span>
            <span class="fat-canto fat-canto--bl"></span><span class="fat-canto fat-canto--br"></span>
            <span class="fat-moldura__linha"></span>
            <div id="fat-moldura-conteudo"></div>
          </div>
          <div class="fat-scan__estado" id="fat-scan-estado"></div>
          <div class="fat-dicas">
            <span>${icon('sun', 18)} Boa iluminação</span>
            <span>${icon('target', 18)} Manter firme</span>
            <span>${icon('search', 18)} Texto legível</span>
          </div>
          <div class="fat-scan__acoes" id="fat-scan-acoes">
            <label class="btn btn--primary btn--large btn--block pressable">${icon('camera', 18)} Tirar foto
              <input type="file" accept="image/*" capture="environment" hidden data-change="faturas:ficheiro">
            </label>
            <div class="fat-ou"><span>ou</span></div>
            <label class="btn btn--large btn--block pressable">${icon('image', 18)} Escolher da galeria
              <input type="file" accept="image/*" hidden data-change="faturas:ficheiro">
            </label>
            <label class="btn btn--large btn--block pressable">${icon('file', 18)} Importar PDF
              <input type="file" accept="application/pdf,.pdf" hidden data-change="faturas:ficheiro">
            </label>
          </div>
        </div>`,
    },
    {
      id: PAG_FATURA,
      title: () => (rascunho ? 'Confirmar fatura' : 'Fatura'),
      onEnter: desenharFatura,
      template: () => html`<div class="fat" id="fat-detalhe"></div>`,
    },
    {
      id: PAG_PRECOS,
      title: 'Comparar preços',
      onEnter: desenharPrecos,
      template: () => html`
        <div class="fat">
          <input class="input" type="search" placeholder="Procurar produto…" data-input="faturas:pesquisa" aria-label="Procurar produto">
          <p class="fat-meta" id="fat-precos-resumo"></p>
          <div class="list" id="fat-precos"></div>
        </div>`,
    },
  ],
  modals: () => html`
    ${modalTemplate('modal-fat-cabecalho', 'Editar fatura', html`
      ${campo('fat-ed-loja', 'Loja', html`<input class="input" id="fat-ed-loja">`)}
      <div class="field-row">
        ${campo('fat-ed-data', 'Data', html`<input class="input" type="date" id="fat-ed-data">`)}
        ${campo('fat-ed-hora', 'Hora', html`<input class="input" type="time" id="fat-ed-hora">`)}
      </div>
      <div class="field-row">
        ${campo('fat-ed-total', 'Total pago (€)', html`<input class="input" type="number" step="0.01" inputmode="decimal" id="fat-ed-total">`)}
        ${campo('fat-ed-poupanca', 'Poupado (€)', html`<input class="input" type="number" step="0.01" inputmode="decimal" id="fat-ed-poupanca">`)}
      </div>
      <div class="btn-row"><button class="btn btn--primary pressable" data-action="faturas:guardar-cabecalho">Guardar</button></div>
    `)}
    ${modalTemplate('modal-fat-item', 'Editar produto', html`
      ${campo('fat-it-produto', 'Produto', html`<input class="input" id="fat-it-produto">`)}
      <div class="field-row">
        ${campo('fat-it-qtd', 'Quantidade', html`<input class="input" type="number" step="0.001" inputmode="decimal" id="fat-it-qtd">`)}
        ${campo('fat-it-total', 'Total (€)', html`<input class="input" type="number" step="0.01" inputmode="decimal" id="fat-it-total">`)}
      </div>
      ${campo('fat-it-cat', 'Categoria', html`<select class="input" id="fat-it-cat">${opcoesCategoria('outros')}</select>`)}
      <div class="btn-row">
        <button class="btn btn--danger-soft pressable" data-action="faturas:remover-item">${icon('trash', 16)} Remover</button>
        <button class="btn btn--primary pressable" data-action="faturas:guardar-item">Guardar</button>
      </div>
    `)}
    ${modalTemplate('modal-fat-produto', 'Produto', html`<div id="fat-produto-corpo"></div>`)}
  `,
  actions: {
    'faturas:gastos': () => navigate(PAG_GASTOS),
    'faturas:precos': () => navigate(PAG_PRECOS),
    'faturas:scan': () => navigate(PAG_SCAN),
    'faturas:ficheiro': ({ ev }) => processarFicheiro(takeFile(ev)),
    'faturas:mes': ({ data }) => {
      if (data.ym) mes = data.ym;
      else mes = deslocarMes(mes, Number(data.delta) || 0);
      if (mes > mesAtual()) mes = mesAtual();
      desenharGastos();
    },
    'faturas:abrir': ({ data }) => {
      const f = faturas.find((x) => x.id === data.id);
      if (!f) return;
      atual = structuredClone(f);
      rascunho = false;
      navigate(PAG_FATURA);
    },
    'faturas:ver-imagem': ({ ev }) => { ev.stopPropagation(); showImage(atual?.imagem); },
    'faturas:guardar': async ({ el }) => {
      if (!atual) return;
      el.disabled = true;
      try {
        const { id, ...dados } = atual;
        await addDoc(sharedCol(COLECAO), { ...dados, criadoPor: session.uid, criadoEm: Date.now() });
        mes = (atual.data || '').slice(0, 7) || mesAtual();
        rascunho = false;
        atual = null;
        toast('Fatura guardada');
        navigate(PAG_GASTOS, { replace: true });
      } catch (e) {
        el.disabled = false;
        toast(/exceeds|too large|1048576/i.test(e?.message || '') ? 'Fatura demasiado grande para guardar.' : 'Não foi possível guardar.', 'error');
      }
    },
    'faturas:descartar': () => { atual = null; rascunho = false; back(); },
    'faturas:apagar': async () => {
      if (!atual?.id) return;
      if (!(await confirmDialog('Apagar esta fatura? Os gastos e preços deixam de a contar.', { confirmLabel: 'Apagar', danger: true }))) return;
      await deleteDoc(sharedDoc(COLECAO, atual.id));
      atual = null;
      toast('Fatura apagada');
      back();
    },
    'faturas:editar-cabecalho': ({ ev }) => {
      if (!atual || ev.target.closest('[data-action="faturas:ver-imagem"]')) return;
      byId('fat-ed-loja').value = atual.loja || '';
      byId('fat-ed-data').value = atual.data || '';
      byId('fat-ed-hora').value = atual.hora || '';
      byId('fat-ed-total').value = atual.total ?? '';
      byId('fat-ed-poupanca').value = atual.poupanca ?? '';
      openModal('modal-fat-cabecalho');
    },
    'faturas:guardar-cabecalho': async () => {
      Object.assign(atual, {
        loja: byId('fat-ed-loja').value.trim() || 'Supermercado',
        data: byId('fat-ed-data').value,
        hora: byId('fat-ed-hora').value,
        total: arred(byId('fat-ed-total').value),
        poupanca: arred(byId('fat-ed-poupanca').value),
      });
      await closeModal('modal-fat-cabecalho');
      desenharFatura();
      await persistir();
    },
    'faturas:editar-item': ({ data }) => {
      itemEditar = Number(data.idx);
      const i = atual?.itens?.[itemEditar];
      if (!i) return;
      byId('fat-it-produto').value = i.produto || i.nome;
      byId('fat-it-qtd').value = i.quantidade;
      byId('fat-it-total').value = i.total;
      byId('fat-it-cat').value = CATEGORIAS[i.categoria] ? i.categoria : 'outros';
      openModal('modal-fat-item');
    },
    'faturas:guardar-item': async () => {
      const i = atual?.itens?.[itemEditar];
      if (!i) return;
      const quantidade = Number(byId('fat-it-qtd').value) || 1;
      const total = arred(byId('fat-it-total').value);
      Object.assign(i, {
        produto: byId('fat-it-produto').value.trim() || i.nome,
        quantidade,
        total,
        precoUnitario: arred(total / quantidade),
        categoria: byId('fat-it-cat').value,
      });
      await closeModal('modal-fat-item');
      desenharFatura();
      await persistir();
    },
    'faturas:remover-item': async () => {
      if (!atual?.itens?.[itemEditar]) return;
      atual.itens.splice(itemEditar, 1);
      await closeModal('modal-fat-item');
      desenharFatura();
      await persistir();
    },
    'faturas:pesquisa': ({ value }) => { pesquisa = value || ''; desenharPrecos(); },
    'faturas:produto': ({ data }) => abrirProduto(data.chave),
  },
  start() {
    carregado = false;
    faturas = [];
    scope.add(onSnapshot(sharedCol(COLECAO), (snap) => {
      faturas = snapToList(snap);
      carregado = true;
      if (atual?.id && !rascunho) {
        const f = faturas.find((x) => x.id === atual.id);
        if (f) atual = structuredClone(f);
      }
      desenharResumo();
      const pag = currentPage();
      if (pag === PAG_GASTOS) desenharGastos();
      if (pag === PAG_PRECOS) desenharPrecos();
    }, (err) => console.error('[faturas]', err)));
  },
  stop() {
    scope.clear();
    faturas = [];
    atual = null;
    rascunho = false;
  },
};
