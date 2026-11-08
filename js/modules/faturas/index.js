// Gastos do supermercado: digitalizar faturas (foto, galeria ou PDF), lê-las no próprio
// dispositivo (código QR da AT + OCR local; a IA é só uma opção) e mostrar quanto se gasta por mês, onde cada produto é mais barato e quanto se poupa.
// As páginas são montadas dentro do módulo Supermercados (ver ../supermarkets.js).
import { onSnapshot, addDoc, updateDoc, deleteDoc, setDoc } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { navigate, back, currentPage } from '../../core/router.js';
import { html, byId, render } from '../../core/dom.js';
import { money } from '../../core/format.js';
import { toast, confirmDialog, openModal, closeModal, modalTemplate, showImage } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { session, createScope, emit, on } from '../../core/state.js';
import { compressImage, readAsDataURL, takeFile } from '../../core/images.js';
import { lerFatura, normalizarFatura, decifrarNomes } from './ai.js';
import {
  aplicarDicionario, aprenderFatura, exemplosParaIa, procurarAlias, chaveTalao, chaveLoja, precoPorUnidade, corresponde,
  catalogoProdutos, harmonizarItens, nomesParaIa,
} from './produtos.js';
import { faturaDoQr, lerCamposQr, LOJAS_NIF } from './qr.js';
import { analisarTexto, juntarLeituras, reclassificarCharcutaria, categoriaPorNome } from './texto.js';
import { carregarImagem, procurarQr, textoPorOcr, lerPdf } from './local.js';
import {
  CATEGORIAS as LISTA_CATEGORIAS, categoria as categoriaDados, rotulo, subcategoriaDe, nomeSub,
} from '../../data/categorias.js';
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
let lojasNif = {}; // NIF -> nome da loja, aprendido quando o utilizador corrige
let ultimoFicheiro = null; // { ficheiro: { base64, mime }, preview, ePdf } para "Ler com IA"
let qrAtual = null; // dados do QR da fatura em revisão (ganham sempre à IA)
let dicionario = {}; // linha do talão -> nome padrão aprendido (config/produtos)
let erroIa = ''; // porque é que a IA não decifrou a fatura em revisão
let aDecifrar = false;
const CHAVE_IA = 'ninho.faturas.ia';
const iaLigada = () => { try { return localStorage.getItem(CHAVE_IA) !== '0'; } catch { return true; } };
let estadoScan = { titulo: '', texto: '', pct: 0 };
// Digitalização em segundo plano: pode-se sair do ecrã enquanto a fatura é lida.
let pendente = null; // fatura lida, à espera de ser confirmada (quando se saiu do ecrã)
let erroFundo = null; // { erro, semLeitura } quando a leitura falhou fora do ecrã
let cacheCatalogo = null; // catalogoProdutos(faturas), refeito quando as faturas mudam
const catalogo = () => (cacheCatalogo ||= catalogoProdutos(faturas));
const CAMPOS_FISCAIS = ['nif', 'nifCliente', 'atcud', 'documento', 'tipoDocumento', 'iva'];

const euro = (v) => money(v);
const dataCurta = (iso) => {
  if (!iso) return 'Sem data';
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${nomeMes(`${a}-${m}`, true)} ${a}`;
};
const pct = (v, max) => (max > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0);

/** Faturas carregadas (usado pela página Supermercados, que ouve 'faturas:update'). */
export const listaFaturas = () => faturas;
export const faturasCarregadas = () => carregado;

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

function desenharScan({ preview = '', erro = '', pdf = '', semLeitura = false } = {}) {
  desenharAvisoFundo();
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
      ? html`<strong>${estadoScan.titulo || 'A ler a fatura…'}</strong><span>${estadoScan.texto || 'No teu telemóvel, sem enviar a fatura'}</span>
        <div class="fat-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${estadoScan.pct}">
          <span style="width:${estadoScan.pct}%"></span>
        </div>
        <b class="fat-progresso__pct">${estadoScan.pct}%</b>
        <span class="fat-scan__fundo">Podes sair deste ecrã: a leitura continua e avisamos quando terminar.</span>`
      : pendente
        ? html`<strong>Fatura lida</strong><span>${pendente.loja} · ${euro(pendente.total)} · ${(pendente.itens || []).length} produtos</span>
          <div class="fat-scan__alternativas">
            <button class="btn btn--primary pressable" data-action="faturas:retomar">${icon('check', 16)} Rever e guardar</button>
          </div>`
      : erro
        ? html`<strong class="fat-erro">Não foi possível ler</strong><span>${erro}</span>
          ${semLeitura ? html`<div class="fat-scan__alternativas">
            <button class="btn pressable" data-action="faturas:manual">${icon('edit', 16)} Preencher à mão</button>
            <button class="btn pressable" data-action="faturas:ler-ia">${icon('sparkles', 16)} Ler com IA</button>
          </div>` : ''}`
        : html`<strong>Centre o recibo na moldura</strong><span>Inclui o código QR no fundo do talão</span>`);
  }
  byId('fat-scan-acoes')?.classList.toggle('is-bloqueado', aLer);
}

/** Atualiza o passo e a percentagem (pct só sobe; sem pct mantém a anterior). */
const passo = (titulo, texto = '', pct = null) => {
  const p = pct == null ? estadoScan.pct : Math.max(estadoScan.pct, Math.min(99, Math.round(pct)));
  estadoScan = { titulo, texto, pct: p };
  if (!aLer) return;
  if (currentPage() === PAG_SCAN) desenharScan(ultimoFicheiro ? { preview: ultimoFicheiro.preview, pdf: ultimoFicheiro.ePdf ? ultimoFicheiro.nome : '' } : {});
  else desenharAvisoFundo();
};

// ---------- Aviso flutuante (leitura em segundo plano) ----------

function desenharAvisoFundo() {
  let el = byId('fat-fundo');
  const pag = currentPage();
  const visivel = (aLer || pendente || erroFundo) && pag !== PAG_SCAN && pag !== PAG_FATURA;
  if (!visivel) { el?.classList.remove('is-visivel'); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'fat-fundo';
    el.type = 'button';
    el.className = 'fat-fundo glass glass--strong pressable';
    el.dataset.action = 'faturas:retomar';
    document.body.appendChild(el);
  }
  el.classList.toggle('is-pronto', !aLer && !!pendente);
  el.classList.toggle('is-erro', !aLer && !pendente && !!erroFundo);
  render(el, aLer
    ? html`<span class="fat-fundo__anel" style="--p:${estadoScan.pct}"><b>${estadoScan.pct}%</b></span>
      <span class="fat-fundo__txt"><strong>A digitalizar fatura…</strong><small>${estadoScan.titulo || 'A ler'}</small></span>`
    : pendente
      ? html`<span class="fat-fundo__icone">${icon('check', 18)}</span>
        <span class="fat-fundo__txt"><strong>Fatura lida</strong><small>${pendente.loja} · ${euro(pendente.total)} · toca para confirmar</small></span>`
      : html`<span class="fat-fundo__icone">${icon('alert', 18)}</span>
        <span class="fat-fundo__txt"><strong>Não foi possível ler a fatura</strong><small>Toca para ver</small></span>`);
  requestAnimationFrame(() => el.classList.add('is-visivel'));
}

function retomar() {
  if (aLer) { navigate(PAG_SCAN); return; }
  if (pendente) {
    atual = pendente;
    pendente = null;
    rascunho = true;
    desenharAvisoFundo();
    navigate(PAG_FATURA);
    return;
  }
  if (erroFundo) navigate(PAG_SCAN);
}

const eQrDaAt = (t) => !!lerCamposQr(t);

/** Percentagem estimada enquanto a IA lê (não há progresso real do Gemini): de `de` até quase `ate`. */
function progressoEstimado(titulo, texto, { de = 50, ate = 98, segundos = 18 } = {}) {
  const inicio = Date.now();
  const tick = () => {
    const f = 1 - Math.exp(-(Date.now() - inicio) / (segundos * 400));
    passo(titulo, texto, de + (ate - de) * Math.min(0.97, f));
  };
  tick();
  const id = setInterval(tick, 400);
  return () => clearInterval(id);
}

/** Pede à IA para decifrar a fatura (imagem + texto do OCR + nomes já aprendidos). */
async function decifrarComIa(ficheiro, lidaLocal, textoOcr) {
  const loja = lidaLocal?.loja || '';
  const parar = progressoEstimado('A decifrar os produtos com IA…', 'Com os nomes e categorias que já usas', { de: textoOcr ? 50 : 10 });
  try {
    return await lerFatura(ficheiro, { textoOcr, exemplos: exemplosParaIa(dicionario, loja), catalogo: nomesParaIa(catalogo()) });
  } finally { parar(); }
}

/** Junta a leitura da IA com a local: o QR ganha nos campos fiscais e o dicionário nos nomes. */
function juntarComIa(lida, qr) {
  const q = qr ? Object.fromEntries(Object.entries(qr).filter(([, v]) => v !== '' && v != null)) : {};
  return { ...lida, hora: lida.hora || '', ...q };
}

// Nomes já aprendidos (dicionário) e depois alinhados com os produtos já comprados (mesmo nome e categoria).
const comDicionario = (f) => ({ ...f, itens: harmonizarItens(aplicarDicionario(f.itens, dicionario, f.loja), catalogo()) });

/** Lê a fatura no dispositivo: código QR primeiro, depois o texto (OCR ou texto do PDF). */
async function lerLocalmente(file, ePdf, preview) {
  let qr = null;
  let texto = '';
  if (ePdf) {
    passo('A abrir o PDF…', 'No teu telemóvel, sem enviar a fatura', 5);
    const pdf = await lerPdf(file);
    texto = pdf.texto;
    passo('A procurar o código QR…', 'Loja, data e total oficiais da fatura', 12);
    for (const pagina of pdf.paginas) {
      const t = await procurarQr(pagina, eQrDaAt).catch(() => null);
      if (t) { qr = faturaDoQr(t, lojasNif); break; }
    }
  } else {
    const img = await carregarImagem(preview);
    passo('A procurar o código QR…', 'Loja, data e total oficiais da fatura', 5);
    const t = await procurarQr(img, eQrDaAt).catch((e) => { console.warn('[faturas] QR', e); return null; });
    if (t) qr = faturaDoQr(t, lojasNif);
    const fimOcr = iaLigada() ? 50 : 95;
    passo(qr ? 'QR lido. A ler os produtos…' : 'A ler o texto do talão…', 'No teu telemóvel · a primeira vez descarrega o leitor (~4 MB)', 12);
    texto = await textoPorOcr(img, (p) => passo(
      qr ? 'QR lido. A ler os produtos…' : 'A ler o texto do talão…',
      'No teu telemóvel, sem enviar a fatura',
      12 + (fimOcr - 12) * p,
    )).catch((e) => { console.warn('[faturas] OCR', e); return ''; });
  }
  const lidoTexto = texto ? analisarTexto(texto) : null;
  if (lidoTexto && !lidoTexto.loja && lidoTexto.nif) lidoTexto.loja = lojasNif[lidoTexto.nif] || LOJAS_NIF[lidoTexto.nif] || '';
  return { qr, texto, junto: juntarLeituras(qr, lidoTexto), temTexto: !!lidoTexto?.itens.length };
}

/** Normaliza para o formato guardado, mantendo os campos fiscais vindos do QR. */
function montarFatura(lida, extra = {}) {
  const base = normalizarFatura({ ...lida, eFatura: true }) || {};
  const fiscais = Object.fromEntries(CAMPOS_FISCAIS.filter((k) => lida[k]).map((k) => [k, lida[k]]));
  return { ...base, ...fiscais, ...extra };
}

function abrirRevisao(fatura) {
  const lida = { ...fatura, data: fatura.data || new Date().toISOString().slice(0, 10) };
  aLer = false;
  erroFundo = null;
  const pag = currentPage();
  // Saiu-se do ecrã durante a leitura: fica à espera e mostra-se o aviso, sem mudar de página.
  if (pag !== PAG_SCAN && !(pag === PAG_FATURA && rascunho)) {
    pendente = lida;
    desenharScan();
    toast('Fatura lida. Toca no aviso para a confirmar.', 'info', 4000);
    return;
  }
  atual = lida;
  rascunho = true;
  desenharScan();
  desenharFatura();
  if (currentPage() === PAG_SCAN) navigate(PAG_FATURA, { replace: true });
  else if (currentPage() !== PAG_FATURA) navigate(PAG_FATURA);
}

/** Mostra o erro no ecrã de digitalização ou, se se saiu dele, no aviso flutuante. */
function falharLeitura(opcoes) {
  aLer = false;
  if (currentPage() !== PAG_SCAN) {
    erroFundo = opcoes;
    toast('Não foi possível ler a fatura.', 'error');
  }
  desenharScan(opcoes);
}

async function processarFicheiro(file) {
  if (!file || aLer) return;
  if (pendente) { toast('Confirma primeiro a fatura que já foi lida.', 'info'); retomar(); return; }
  erroFundo = null;
  estadoScan = { titulo: '', texto: '', pct: 0 };
  const ePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let preview = '';
  try {
    if (ePdf) {
      if (file.size > MAX_PDF) throw new Error('O PDF é demasiado grande (máx. 15 MB).');
      const url = await readAsDataURL(file);
      ultimoFicheiro = { ficheiro: { base64: url.split(',')[1], mime: 'application/pdf' }, preview: '', ePdf, nome: file.name };
    } else {
      // Resolução alta para o QR e o texto pequeno dos talões serem legíveis.
      preview = await compressImage(file, { maxSize: 2400, quality: 0.9 });
      ultimoFicheiro = { ficheiro: { base64: preview.split(',')[1], mime: 'image/jpeg' }, preview, ePdf, nome: file.name };
    }
  } catch (e) {
    desenharScan({ erro: e.message || 'Ficheiro inválido.' });
    return;
  }

  aLer = true;
  qrAtual = null;
  passo('A ler a fatura…', '', 2);
  try {
    const { qr, texto, junto, temTexto } = await lerLocalmente(file, ePdf, preview);
    const imagem = preview ? await compressImage(file, { maxSize: 900, quality: 0.6 }) : '';
    if (!qr && !temTexto && !junto.total && !iaLigada()) {
      ultimoFicheiro.imagem = imagem;
      falharLeitura({
        preview,
        pdf: ePdf ? file.name : '',
        erro: 'Não encontrei o código QR nem consegui ler o texto. Tenta outra foto, com o talão inteiro e bem iluminado.',
        semLeitura: true,
      });
      return;
    }
    qrAtual = qr;
    erroIa = '';
    const leituraLocal = qr ? (temTexto ? 'qr+ocr' : 'qr') : 'ocr';
    const extra = { imagem, origem: ePdf ? 'pdf' : 'foto' };
    if (iaLigada()) {
      try {
        const lida = await decifrarComIa(ultimoFicheiro.ficheiro, junto, texto);
        abrirRevisao(comDicionario(montarFatura(juntarComIa(lida, qr), { ...extra, leitura: qr ? 'qr+ia' : 'ia' })));
        return;
      } catch (e) {
        console.warn('[faturas] IA', e);
        erroIa = e?.message || 'A IA não respondeu.';
        if (!qr && !temTexto && !junto.total) {
          ultimoFicheiro.imagem = imagem;
          falharLeitura({ preview, pdf: ePdf ? file.name : '', erro: `Não consegui ler o talão. ${erroIa}`, semLeitura: true });
          return;
        }
      }
    }
    abrirRevisao(comDicionario(montarFatura(junto, { ...extra, leitura: leituraLocal })));
  } catch (e) {
    console.error('[faturas]', e);
    falharLeitura({
      preview,
      pdf: ePdf ? file.name : '',
      erro: 'Não foi possível ler a fatura no dispositivo (sem ligação para descarregar o leitor?).',
      semLeitura: true,
    });
  }
}

/** Opcional: envia a foto/PDF ao Gemini para ler os produtos. Os dados do QR mantêm-se. */
async function lerComIa() {
  if (!ultimoFicheiro || aLer) return;
  aLer = true;
  erroFundo = null;
  estadoScan = { titulo: '', texto: '', pct: 0 };
  if (currentPage() !== PAG_SCAN) toast('A decifrar com IA…');
  try {
    const lida = await decifrarComIa(ultimoFicheiro.ficheiro, atual, '');
    const imagem = atual?.imagem || ultimoFicheiro.imagem
      || (ultimoFicheiro.preview ? await compressImage(await (await fetch(ultimoFicheiro.preview)).blob(), { maxSize: 900, quality: 0.6 }) : '');
    erroIa = '';
    abrirRevisao(comDicionario(montarFatura(juntarComIa({ ...lida, hora: lida.hora || atual?.hora || '' }, qrAtual), {
      imagem, origem: ultimoFicheiro.ePdf ? 'pdf' : 'foto', leitura: qrAtual ? 'qr+ia' : 'ia',
    })));
  } catch (e) {
    aLer = false;
    erroIa = e?.message || 'Não foi possível ler com IA.';
    if (currentPage() === PAG_SCAN) desenharScan({ preview: ultimoFicheiro.preview, erro: e.message, semLeitura: true });
    else { toast(erroIa, 'error'); desenharFatura(); }
  }
}

const LEITURAS = {
  qr: 'Lido no telemóvel pelo código QR. Os produtos não vêm no QR: adiciona-os ou usa a IA.',
  'qr+ocr': 'Loja, data e total lidos no telemóvel pelo código QR; produtos lidos do texto. Confirma-os.',
  ocr: 'Sem código QR: lido no telemóvel a partir do texto. Confirma a loja, o total e os produtos.',
  ia: 'Produtos decifrados com IA. Confirma os dados.',
  'qr+ia': 'Loja, data e total pelo código QR; produtos decifrados com IA. Confirma-os.',
};

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
        ${icon(f.leitura?.startsWith('qr') || f.leitura === 'ocr' ? 'shield' : 'check', 18)}
        <span>${LEITURAS[f.leitura] || 'Confirma os dados lidos.'} Toca num campo ou produto para corrigir.</span>
      </div>` : ''}
    ${rascunho && erroIa ? html`<div class="fat-aviso fat-aviso--alerta card glass-soft">${icon('alert', 18)}<span>A IA não decifrou esta fatura: ${erroIa} Os nomes foram expandidos no telemóvel.</span></div>` : ''}
    ${dup ? html`<div class="fat-aviso fat-aviso--alerta card glass-soft">${icon('alert', 18)}<span>Já existe uma fatura igual (${f.loja}, ${dataCurta(f.data)}, ${euro(f.total)}).</span></div>` : ''}
    <section class="card glass-soft fat-cabecalho pressable" data-action="faturas:editar-cabecalho">
      <div class="fat-cabecalho__topo">
        <div>
          <strong class="fat-cabecalho__loja">${f.loja}</strong>
          <small>${[dataCurta(f.data), f.hora, f.local].filter(Boolean).join(' · ')}</small>
          ${f.nif || f.documento ? html`<small>${[f.nif ? `NIF ${f.nif}` : '', f.documento].filter(Boolean).join(' · ')}</small>` : ''}
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
      ${f.iva ? html`<p class="fat-meta">IVA incluído: ${euro(f.iva)}${f.atcud ? ` · ATCUD ${f.atcud}` : ''}</p>` : ''}
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
            <strong>${i.produto || i.nome}${i.aprendido || i.confirmado ? html` <span class="fat-aprendido" title="Nome aprendido">${icon('check', 12)}</span>` : ''}</strong>
            <small>${i.quantidade !== 1 ? `${String(i.quantidade).replace('.', ',')} ${i.unidade} × ${euro(i.precoUnitario)} · ` : ''}${rotuloItem(i)}${porUnidadeTxt(i)}</small>
            ${i.nome && i.nome !== i.produto ? html`<small class="fat-talao">${i.nome}</small>` : ''}
          </span>
          <span class="fat-produto__preco">
            <strong>${euro(i.total)}</strong>
            ${i.desconto ? html`<small class="fat-verde">−${euro(i.desconto)}</small>` : ''}
          </span>
        </button>`)}
      ${!(f.itens || []).length
        ? html`<p class="fat-meta">Sem produtos. Adiciona-os à mão${rascunho && ultimoFicheiro ? ' ou lê-os com IA' : ''} para comparar preços.</p>`
        : Math.abs(diferenca) >= 0.05 ? html`<p class="fat-meta">A soma dos produtos (${euro(somaItens)}) difere do total em ${euro(diferenca)}.</p>` : ''}
      <div class="fat-produtos__acoes">
        <button class="btn btn--small pressable" data-action="faturas:novo-item">${icon('plus', 16)} Adicionar produto</button>
        ${rascunho && ultimoFicheiro && !String(f.leitura).includes('ia') ? html`
          <button class="btn btn--small pressable" data-action="faturas:ler-ia" title="Envia a foto ao Gemini da Google">${icon('sparkles', 16)} ${erroIa ? 'Tentar IA de novo' : 'Decifrar com IA'}</button>` : ''}
      </div>
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

function porUnidadeTxt(i) {
  const pu = precoPorUnidade(i);
  return pu ? ` · ${euro(pu.valor)}/${pu.unidade}` : '';
}

const opcoesCategoria = (sel) => LISTA_CATEGORIAS
  .map((c) => html`<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.emoji} ${c.nome}</option>`);

/** Subcategoria guardada (se ainda for dessa categoria) ou adivinhada pelo nome. */
const subDoItem = (i) => (i.sub && String(i.sub).startsWith(`${i.categoria}:`) && nomeSub(i.sub) ? i.sub : subcategoriaDe(i.produto || i.nome, i.categoria));
const rotuloItem = (i) => rotulo(CATEGORIAS[i.categoria] ? i.categoria : 'outros', subDoItem(i));

/** Opções de subcategoria da categoria escolhida no editor de produto. */
function preencherSubs(cat, sel = '') {
  const subs = categoriaDados(cat).subs;
  const campoSub = byId('fat-it-sub-campo');
  if (campoSub) campoSub.hidden = subs.length < 2;
  render('fat-it-sub', html`<option value="">Automática</option>${subs.map((s) => html`<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.nome}</option>`)}`);
}

async function persistir() {
  if (rascunho || !atual?.id) return;
  const { id, ...dados } = atual;
  await updateDoc(sharedDoc(COLECAO, id), dados);
  aprenderNomes(dados);
}

/** Guarda no dicionário do casal o nome padrão de cada linha do talão. */
function aprenderNomes(f) {
  const novas = aprenderFatura(f, dicionario);
  if (!Object.keys(novas).length) return Promise.resolve();
  dicionario = { ...dicionario, ...novas };
  return setDoc(sharedDoc('config', 'produtos'), { aliases: novas }, { merge: true })
    .catch((e) => console.warn('[faturas] produtos', e));
}

// ---------- Página: Comparar preços ----------

function desenharPrecos() {
  const alvo = byId('fat-precos');
  if (!alvo) return;
  const q = pesquisa.trim().toLowerCase();
  const todos = compararPrecos(faturas);
  const resumo = byId('fat-precos-resumo');
  const lista = q ? todos.filter((p) => corresponde(p.nome, q)) : todos;
  const variasLojas = todos.filter((p) => p.lojas.length > 1).length;
  const porDecifrar = linhasPorDecifrar().length;
  if (resumo) {
    resumo.textContent = todos.length
      ? `${todos.length} produtos · ${variasLojas} comprados em mais de uma loja`
      : '';
  }
  const unid = (p, l) => (l.porUnidade ? ` · ${euro(l.porUnidade)}/${p.porUnidade}` : '');
  render(alvo, html`
    ${porDecifrar ? html`
      <button class="fat-aviso card glass-soft pressable" data-action="faturas:decifrar-antigas" ${aDecifrar ? 'disabled' : ''}>
        ${icon('sparkles', 18)}
        <span>${aDecifrar ? 'A decifrar nomes…' : `${porDecifrar} ${porDecifrar === 1 ? 'nome de talão ainda não foi decifrado' : 'nomes de talão ainda não foram decifrados'}. Toca para os decifrar com IA e juntar os produtos iguais.`}</span>
      </button>` : ''}
    ${lista.length
    ? lista.slice(0, 150).map((p) => html`
      <button class="fat-preco card glass-soft pressable" data-action="faturas:produto" data-chave="${p.chave}">
        <div class="fat-preco__topo">
          <strong>${p.nome}</strong>
          ${p.tendencia ? html`<span class="fat-variacao ${p.tendencia > 0 ? 'is-subiu' : 'is-desceu'}">${icon(p.tendencia > 0 ? 'trendUp' : 'trendDown', 12)} ${euro(Math.abs(p.tendencia))}</span>` : ''}
        </div>
        <div class="fat-preco__lojas">
          ${p.lojas.map((l, i) => html`<span class="chip ${i === 0 && p.lojas.length > 1 ? 'chip--accent' : 'chip--muted'}">${l.loja} ${euro(l.preco)}${unid(p, l)}</span>`)}
        </div>
        ${p.lojas.length > 1 ? html`<small class="fat-verde">Mais barato no ${p.maisBarata.loja} · poupas ${euro(p.diferenca)}${p.unidade === 'kg' ? '/kg' : ''}</small>` : html`<small>Comprado ${p.vezes}× · último ${euro(p.ultimo.preco)}</small>`}
      </button>`)
    : html`<p class="fat-nada">${faturas.length ? 'Nenhum produto encontrado.' : 'Digitaliza faturas para comparar preços.'}</p>`}
  `);
}

/** Linhas de talão guardadas que ainda não estão no dicionário (nomes nunca decifrados). */
function linhasPorDecifrar() {
  const vistas = new Map();
  for (const f of faturas) {
    for (const i of f.itens || []) {
      if (!i.nome || i.confirmado || procurarAlias(dicionario, f.loja, i.nome)) continue;
      const k = `${chaveLoja(f.loja)}:${chaveTalao(i.nome)}`;
      if (!vistas.has(k)) vistas.set(k, { loja: f.loja, nome: i.nome });
    }
  }
  return [...vistas.values()];
}

/** Decifra com IA os nomes das faturas antigas, guarda-os no dicionário e atualiza as faturas. */
async function decifrarAntigas() {
  const linhas = linhasPorDecifrar();
  if (!linhas.length || aDecifrar) return;
  aDecifrar = true;
  desenharPrecos();
  try {
    const exemplos = exemplosParaIa(dicionario, '', 40);
    const novas = {};
    for (let i = 0; i < linhas.length; i += 80) {
      const lote = linhas.slice(i, i + 80);
      const r = await decifrarNomes(lote, exemplos, nomesParaIa(catalogo()));
      lote.forEach((l, j) => {
        if (!r[j]) return;
        const k = chaveTalao(l.nome);
        const v = { o: l.nome, produto: r[j].produto, categoria: r[j].categoria, sub: r[j].sub || '', n: 1, c: false, t: Date.now() };
        novas[`${chaveLoja(l.loja)}:${k}`] = v;
        if (!dicionario[`*:${k}`]) novas[`*:${k}`] = v;
      });
    }
    if (!Object.keys(novas).length) throw new Error('A IA não devolveu nomes.');
    dicionario = { ...dicionario, ...novas };
    await setDoc(sharedDoc('config', 'produtos'), { aliases: novas }, { merge: true });
    // Atualiza as faturas guardadas (só os produtos que não foram corrigidos à mão).
    let alteradas = 0;
    for (const f of faturas) {
      const itens = aplicarDicionario(f.itens, dicionario, f.loja).map((i, idx) => (f.itens[idx].confirmado ? f.itens[idx] : i));
      if (JSON.stringify(itens) !== JSON.stringify(f.itens)) {
        alteradas += 1;
        await updateDoc(sharedDoc(COLECAO, f.id), { itens });
      }
    }
    toast(`Nomes decifrados${alteradas ? ` em ${alteradas} ${alteradas === 1 ? 'fatura' : 'faturas'}` : ''}`);
  } catch (e) {
    toast(e?.message || 'Não foi possível decifrar os nomes.', 'error');
  } finally {
    aDecifrar = false;
    desenharPrecos();
  }
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

// Lembra o nome da loja de cada NIF (lojas franchisadas têm NIFs próprios).
function aprenderLoja(f) {
  const loja = String(f.loja || '').trim();
  if (!f.nif || !loja || loja === 'Supermercado' || lojasNif[f.nif] === loja || LOJAS_NIF[f.nif] === loja) return;
  lojasNif = { ...lojasNif, [f.nif]: loja };
  setDoc(sharedDoc('config', 'lojas_nif'), { lojas: { [f.nif]: loja } }, { merge: true })
    .catch((e) => console.warn('[faturas] lojas_nif', e));
}

// ---------- Módulo ----------

const campo = (id, label, input) => html`<div class="field"><label class="field__label" for="${id}">${label}</label>${input}</div>`;

// Nova categoria "charcutaria": passa para lá o fiambre, presunto, chouriço… das faturas antigas (uma vez).
function migrarCharcutaria() {
  for (const f of faturas) {
    const itens = reclassificarCharcutaria(f.itens);
    if (itens) updateDoc(sharedDoc(COLECAO, f.id), { itens }).catch((e) => console.warn('[faturas] charcutaria', e));
  }
}

function migrarAliasesCharcutaria() {
  const novas = {};
  for (const [k, a] of Object.entries(dicionario)) {
    if (!a || a.c || a.categoria === 'charcutaria' || categoriaPorNome(a.produto) !== 'charcutaria') continue;
    novas[k] = { ...a, categoria: 'charcutaria' };
  }
  if (!Object.keys(novas).length) return;
  dicionario = { ...dicionario, ...novas };
  setDoc(sharedDoc('config', 'produtos'), { aliases: novas }, { merge: true }).catch((e) => console.warn('[faturas] charcutaria', e));
}

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
      onEnter: () => {
        const u = ultimoFicheiro;
        const base = u ? { preview: u.preview, pdf: u.ePdf ? u.nome : '' } : {};
        if (erroFundo && !aLer) { const e = erroFundo; erroFundo = null; desenharScan({ ...base, ...e }); return; }
        desenharScan(aLer || pendente ? base : {});
      },
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
          <label class="fat-ia-toggle">
            <input type="checkbox" data-change="faturas:ia-toggle" ${iaLigada() ? 'checked' : ''}>
            <span>${icon('sparkles', 14)} Decifrar os produtos com IA (a foto do talão é enviada ao Gemini da Google)</span>
          </label>
          <p class="fat-privado">${icon('shield', 14)} O código QR e o texto são lidos no teu telemóvel. A app aprende os nomes com cada fatura guardada.</p>
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
          <input class="input" type="search" id="fat-precos-pesquisa" placeholder="Procurar produto…" data-input="faturas:pesquisa" aria-label="Procurar produto">
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
      ${campo('fat-it-produto', 'Nome padrão', html`<input class="input" id="fat-it-produto" placeholder="Ex.: Leite meio-gordo Mimosa 1 L">`)}
      <p class="fat-meta" id="fat-it-talao"></p>
      <div class="field-row">
        ${campo('fat-it-qtd', 'Quantidade', html`<input class="input" type="number" step="0.001" inputmode="decimal" id="fat-it-qtd">`)}
        ${campo('fat-it-total', 'Total (€)', html`<input class="input" type="number" step="0.01" inputmode="decimal" id="fat-it-total">`)}
      </div>
      ${campo('fat-it-cat', 'Categoria', html`<select class="input" id="fat-it-cat" data-change="faturas:cat-item">${opcoesCategoria('outros')}</select>`)}
      <div id="fat-it-sub-campo">${campo('fat-it-sub', 'Subcategoria', html`<select class="input" id="fat-it-sub"></select>`)}</div>
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
    'faturas:retomar': () => retomar(),
    'faturas:ficheiro': ({ ev }) => processarFicheiro(takeFile(ev)),
    'faturas:ler-ia': () => lerComIa(),
    'faturas:ia-toggle': ({ ev }) => { try { localStorage.setItem(CHAVE_IA, ev.target.checked ? '1' : '0'); } catch { /* sem armazenamento */ } },
    'faturas:manual': () => abrirRevisao({
      loja: 'Supermercado', local: '', data: '', hora: '', total: 0, poupanca: 0, saldoCartao: 0, pagamento: '',
      itens: [], descontos: [], imagem: ultimoFicheiro?.imagem || '', origem: ultimoFicheiro?.ePdf ? 'pdf' : 'foto', leitura: 'manual',
    }),
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
        aprenderLoja(dados);
        aprenderNomes(dados);
        ultimoFicheiro = null;
        qrAtual = null;
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
    'faturas:descartar': () => { erroIa = ''; atual = null; rascunho = false; pendente = null; ultimoFicheiro = null; qrAtual = null; back(); },
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
      byId('fat-it-talao').textContent = i.nome && i.nome !== i.produto ? `No talão: ${i.nome}. O nome que escreveres passa a ser usado sempre que esta linha aparecer.` : '';
      byId('fat-it-qtd').value = i.quantidade;
      byId('fat-it-total').value = i.total;
      byId('fat-it-cat').value = CATEGORIAS[i.categoria] ? i.categoria : 'outros';
      preencherSubs(byId('fat-it-cat').value, i.sub && String(i.sub).startsWith(`${i.categoria}:`) ? i.sub : '');
      openModal('modal-fat-item');
    },
    'faturas:novo-item': () => {
      if (!atual) return;
      atual.itens ||= [];
      itemEditar = atual.itens.length;
      byId('fat-it-produto').value = '';
      byId('fat-it-talao').textContent = '';
      byId('fat-it-qtd').value = 1;
      byId('fat-it-total').value = '';
      byId('fat-it-cat').value = 'outros';
      preencherSubs('outros');
      openModal('modal-fat-item');
    },
    'faturas:cat-item': () => {
      preencherSubs(byId('fat-it-cat').value);
    },
    'faturas:guardar-item': async () => {
      if (!atual) return;
      if (itemEditar === atual.itens.length) {
        const nome = byId('fat-it-produto').value.trim();
        if (!nome) { toast('Escreve o nome do produto.', 'error'); return; }
        atual.itens.push({ nome, produto: nome, quantidade: 1, unidade: 'un', precoUnitario: 0, total: 0, desconto: 0, categoria: 'outros' });
      }
      const i = atual.itens[itemEditar];
      if (!i) return;
      const quantidade = Number(byId('fat-it-qtd').value) || 1;
      const total = arred(byId('fat-it-total').value);
      Object.assign(i, {
        confirmado: true,
        aprendido: false,
        produto: byId('fat-it-produto').value.trim() || i.nome,
        quantidade,
        total,
        precoUnitario: arred(total / quantidade),
        categoria: byId('fat-it-cat').value,
        sub: byId('fat-it-sub').value,
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
    'faturas:decifrar-antigas': () => decifrarAntigas(),
    'faturas:produto': ({ data }) => abrirProduto(data.chave),
  },
  start() {
    carregado = false;
    faturas = [];
    scope.add(on('route:change', desenharAvisoFundo));
    let charcutariaFeita = false;
    let aliasesCharcutaria = false;
    scope.add(onSnapshot(sharedDoc('config', 'produtos'), (snap) => {
      dicionario = snap.exists() ? snap.data().aliases || {} : {};
      if (!aliasesCharcutaria) { aliasesCharcutaria = true; migrarAliasesCharcutaria(); }
    }, () => { dicionario = {}; }));
    scope.add(onSnapshot(sharedDoc('config', 'lojas_nif'), (snap) => {
      lojasNif = snap.exists() ? snap.data().lojas || {} : {};
    }, () => { lojasNif = {}; }));
    scope.add(onSnapshot(sharedCol(COLECAO), (snap) => {
      faturas = snapToList(snap);
      cacheCatalogo = null;
      carregado = true;
      if (!charcutariaFeita) { charcutariaFeita = true; migrarCharcutaria(); }
      if (atual?.id && !rascunho) {
        const f = faturas.find((x) => x.id === atual.id);
        if (f) atual = structuredClone(f);
      }
      desenharResumo();
      emit('faturas:update');
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
    pendente = null;
    erroFundo = null;
    byId('fat-fundo')?.remove();
  },
};
