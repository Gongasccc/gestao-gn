// Importar o extrato do mês (PDF do banco): o PDF é lido no próprio dispositivo (nunca é enviado
// a nenhum servidor nem à IA), os movimentos são categorizados por regras e pelas correções do casal,
// o casal revê e as despesas entram de uma só vez nas Finanças.
import { html, render, byId } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { toast, openModal, closeModal, modalTemplate, promptDialog } from '../../core/ui.js';
import { money, isoToShort } from '../../core/format.js';
import { takeFile } from '../../core/images.js';
import { doc, setDoc, writeBatch, db } from '../../services/firebase.js';
import { sharedCol, sharedDoc } from '../../services/paths.js';
import { lerExtratoDeTexto, marcarDuplicados, pedidoCategorias, promptCategorias, lerRespostaCategorias } from './ler.js';
import { pedirJson } from '../../services/gemini.js';
import { textoDoPdf, PdfProtegido } from './pdf.js';

const MODAL = 'fin-extrato-modal';
const MAX_PDF = 15 * 1024 * 1024;

let ctx = { categorias: [], despesas: () => [], aprendidas: () => ({}), aoImportar: () => {} };
let estado = { fase: 'escolher', erro: '', nome: '', extrato: null, linhas: [] };
let pagoPor = '';
let divisao = 'metade';

export function configurarExtrato(opcoes) { ctx = { ...ctx, ...opcoes }; }

const selecionadas = () => estado.linhas.filter((l) => l.incluir);

function memberOptions() {
  return session.members.map((m) => ({ value: m.uid, label: m.uid === session.uid ? `${m.name.split(' ')[0]} (eu)` : m.name.split(' ')[0] }));
}

function desenhar() {
  const { fase } = estado;
  if (fase === 'escolher') {
    render('fin-extrato-body', html`
      <p class="muted small">Exporta o PDF dos movimentos do mês na app ou no site do banco (CGD, Millennium, Novo Banco, Santander, BPI, Revolut…). A app lê todos os movimentos e sugere a categoria de cada um. Revês tudo antes de importar.</p>
      ${estado.erro ? html`<div class="ext-erro">${icon('close', 16)} <span>${estado.erro}</span></div>` : ''}
      <label class="btn btn--primary btn--large btn--block pressable ext-escolher">${icon('file', 18)} Escolher PDF do extrato
        <input type="file" accept="application/pdf,.pdf" hidden data-change="fin:ext-ficheiro">
      </label>
      <p class="muted small ext-nota">${icon('check', 14)} Privado: o PDF é lido aqui no teu dispositivo e nunca é enviado. Para afinar as categorias, a IA recebe só os nomes das lojas (sem valores, datas, saldos, IBAN nem nomes de pessoas). Só ficam guardadas as despesas que escolheres.</p>`);
    return;
  }
  if (fase === 'ler') {
    render('fin-extrato-body', html`
      <div class="ext-ler">
        <span class="spinner"></span>
        <strong>A ler os movimentos…</strong>
        <span class="muted small">${estado.nome}</span>
        <span class="muted small">No teu dispositivo, sem enviar o PDF.</span>
      </div>`);
    return;
  }
  const { extrato, linhas } = estado;
  const debitos = linhas.length;
  const entradas = extrato.movimentos.filter((m) => m.tipo === 'credito').length;
  const dup = linhas.filter((l) => l.duplicado).length;
  const membros = memberOptions();
  render('fin-extrato-body', html`
    <div class="ext-topo">
      <span class="ext-topo__banco">${icon('file', 16)} ${extrato.banco || 'Extrato'}</span>
      ${extrato.periodo.inicio ? html`<span class="muted small">${isoToShort(extrato.periodo.inicio, false)} – ${isoToShort(extrato.periodo.fim || extrato.periodo.inicio)}</span>` : ''}
      <span class="muted small">${debitos} despesa(s)${entradas ? ` · ${entradas} entrada(s) não contam` : ''}${dup ? ` · ${dup} já registada(s)` : ''}</span>
    </div>
    <p class="muted small ext-afinar" id="ext-afinar" ${estado.afinar ? '' : 'hidden'}>${estado.afinar === 'aguardar' ? 'A IA está a afinar as categorias (só recebe os nomes das lojas)…' : estado.afinar}</p>
    ${membros.length > 1 ? html`
      <div class="ext-opcoes">
        <div class="field"><label class="field__label" for="ext-pago">Quem pagou</label>
          <select id="ext-pago" class="input" data-change="fin:ext-pago">${membros.map((o) => html`<option value="${o.value}" ${o.value === pagoPor ? 'selected' : ''}>${o.label}</option>`)}</select></div>
        <div class="field"><label class="field__label" for="ext-div">Como se divide</label>
          <select id="ext-div" class="input" data-change="fin:ext-div">
            <option value="metade" ${divisao === 'metade' ? 'selected' : ''}>A meias</option>
            <option value="pagador" ${divisao === 'pagador' ? 'selected' : ''}>Pessoal (só de quem pagou)</option>
          </select></div>
      </div>` : ''}
    <div class="ext-acoes-lista">
      <button class="btn btn--small btn--glass pressable" data-action="fin:ext-todos" data-v="1">Selecionar todos</button>
      <button class="btn btn--small btn--glass pressable" data-action="fin:ext-todos" data-v="0">Nenhum</button>
    </div>
    <div class="ext-lista">
      ${linhas.map((l, i) => html`
        <div class="ext-linha ${l.incluir ? '' : 'is-off'}" id="ext-linha-${i}">
          <label class="ext-linha__check"><input type="checkbox" ${l.incluir ? 'checked' : ''} data-change="fin:ext-toggle" data-i="${i}" aria-label="Importar ${l.comerciante}"></label>
          <span class="ext-linha__main">
            <span class="record__title">${l.comerciante}</span>
            <span class="record__meta">${l.data ? isoToShort(l.data, false) : 'sem data'}${l.descricao !== l.comerciante ? ` · ${l.descricao}` : ''}</span>
            ${l.duplicado ? html`<span class="chip chip--warn ext-chip">Já registada</span>` : ''}
            ${l.transferencia ? html`<span class="chip chip--muted ext-chip">Transferência / levantamento</span>` : ''}
            <select class="input input--small ext-linha__cat" data-change="fin:ext-cat" data-i="${i}" aria-label="Categoria">
              ${ctx.categorias.map((c) => html`<option value="${c.value}" ${c.value === l.categoria ? 'selected' : ''}>${c.label}</option>`)}
            </select>
          </span>
          <span class="record__value">${money(l.valor)}</span>
        </div>`)}
    </div>
    <div class="ext-rodape">
      <button class="btn" data-action="fin:ext-recomecar">Outro PDF</button>
      <button class="btn btn--primary pressable" id="ext-importar" data-action="fin:ext-importar"></button>
    </div>`);
  atualizarBotao();
}

function atualizarBotao() {
  const btn = byId('ext-importar');
  if (!btn) return;
  const sel = selecionadas();
  btn.disabled = !sel.length;
  btn.textContent = sel.length ? `Importar ${sel.length} · ${money(sel.reduce((s, l) => s + l.valor, 0))}` : 'Nada selecionado';
}

/** Abre o PDF; se tiver palavra-passe pede-a (até 3 tentativas). Devolve null se o utilizador cancelar. */
async function abrirPdf(bytes) {
  let password;
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    try {
      return await textoDoPdf(bytes.slice(), { password });
    } catch (e) {
      if (!(e instanceof PdfProtegido) || tentativa === 3) throw e;
      password = await promptDialog(e.errada ? 'Palavra-passe errada. Tenta outra vez.' : 'O banco protegeu este PDF. Escreve a palavra-passe (fica só neste dispositivo).', {
        title: 'PDF protegido', type: 'password', confirmLabel: 'Abrir',
      });
      if (password == null) return null;
    }
  }
  return null;
}

async function processar(file) {
  if (!file) return;
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    estado = { ...estado, fase: 'escolher', erro: 'Escolhe um ficheiro PDF.' };
    return desenhar();
  }
  if (file.size > MAX_PDF) {
    estado = { ...estado, fase: 'escolher', erro: 'O PDF é demasiado grande (máx. 15 MB).' };
    return desenhar();
  }
  estado = { fase: 'ler', erro: '', nome: file.name, extrato: null, linhas: [] };
  desenhar();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const paginas = await abrirPdf(bytes);
    if (!paginas) { estado = { ...estado, fase: 'escolher', erro: '' }; return desenhar(); }
    if (!paginas.some((p) => p.length)) throw new Error('Este PDF não tem texto (parece uma imagem digitalizada). Descarrega o extrato em PDF diretamente da app ou do site do banco.');
    const extrato = lerExtratoDeTexto(paginas, { aprendidas: ctx.aprendidas() });
    if (!extrato.movimentos.length) throw new Error('Não encontrei movimentos neste PDF. Confirma que é o extrato de movimentos da conta (não o resumo).');
    const debitos = extrato.movimentos.filter((m) => m.tipo === 'debito');
    if (!debitos.length) throw new Error('O extrato só tem entradas de dinheiro, não há despesas para importar.');
    const linhas = marcarDuplicados(debitos, ctx.despesas().filter((e) => e.tipo !== 'acerto'))
      .map((m) => ({ ...m, categoriaSugerida: m.categoria, incluir: !m.duplicado && !m.transferencia }));
    estado = { ...estado, fase: 'rever', extrato, linhas, afinar: 'aguardar' };
    afinarComIa(estado);
  } catch (e) {
    console.error('[extrato]', e);
    estado = { ...estado, fase: 'escolher', erro: e?.message || 'Não foi possível ler o extrato.' };
  }
  desenhar();
}

/** Pede à IA categorias melhores só com os nomes dos comerciantes (sem valores, datas, saldos ou IBAN). */
async function afinarComIa(alvo) {
  const itens = pedidoCategorias(alvo.linhas, ctx.aprendidas());
  if (!itens.length) { alvo.afinar = ''; return; }
  let novas = {};
  try {
    novas = lerRespostaCategorias(await pedirJson([{ texto: promptCategorias(itens) }]), itens);
  } catch (e) {
    console.warn('[extrato] categorias da IA indisponíveis', e);
  }
  if (estado !== alvo || alvo.fase !== 'rever') return;
  let mudou = 0;
  alvo.linhas.forEach((l, i) => {
    const c = novas[l.chave];
    // Só troca as que ainda têm a sugestão automática (não mexe no que o utilizador já mudou).
    if (c && l.categoria === l.categoriaSugerida && c !== l.categoria) {
      l.categoria = c;
      l.categoriaSugerida = c;
      mudou += 1;
      const sel = document.querySelector(`[data-change="fin:ext-cat"][data-i="${i}"]`);
      if (sel) sel.value = c;
    } else if (c) l.categoriaSugerida = l.categoria === l.categoriaSugerida ? c : l.categoriaSugerida;
  });
  alvo.afinar = mudou ? `A IA afinou ${mudou} categoria(s).` : '';
  const aviso = byId('ext-afinar');
  if (aviso) { aviso.textContent = alvo.afinar; aviso.hidden = !alvo.afinar; }
}

async function importar(btn) {
  const sel = selecionadas();
  if (!sel.length) return;
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    const agora = Date.now();
    const quem = pagoPor || session.uid;
    const div = session.members.length > 1 ? divisao : 'pagador';
    // O Firestore aceita até 500 escritas por lote.
    for (let i = 0; i < sel.length; i += 450) {
      const lote = writeBatch(db);
      sel.slice(i, i + 450).forEach((l, j) => {
        lote.set(doc(sharedCol('despesas')), {
          descricao: l.comerciante, valor: l.valor, categoria: l.categoria, pagoPor: quem, divisao: div,
          data: l.data || new Date().toISOString().slice(0, 10), origem: 'extrato', descricaoBanco: l.descricao,
          createdBy: session.uid, timestamp: agora + i + j,
        });
      });
      await lote.commit();
    }
    // Aprende as categorias que o casal corrigiu, para os próximos extratos.
    const novas = {};
    estado.linhas.forEach((l) => { if (l.chave && l.categoria !== l.categoriaSugerida) novas[l.chave] = l.categoria; });
    if (Object.keys(novas).length) {
      await setDoc(sharedDoc('config', 'categorias_extrato'), { regras: novas }, { merge: true });
    }
    // Abre as Finanças no mês com mais movimentos importados.
    const meses = {};
    sel.forEach((l) => { const m = (l.data || '').slice(0, 7); if (m) meses[m] = (meses[m] || 0) + 1; });
    const mes = Object.entries(meses).sort((a, b) => b[1] - a[1])[0]?.[0];
    await closeModal(MODAL);
    toast(`${sel.length} despesa(s) importada(s)`);
    ctx.aoImportar(mes);
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

export function abrirExtrato() {
  estado = { fase: 'escolher', erro: '', nome: '', extrato: null, linhas: [] };
  pagoPor = session.uid;
  divisao = 'metade';
  desenhar();
  openModal(MODAL);
}

export const extratoModal = () => modalTemplate(MODAL, 'Importar extrato do banco', html`<div id="fin-extrato-body"></div>`, { wide: true });

export const extratoActions = {
  'fin:extrato': () => abrirExtrato(),
  'fin:ext-ficheiro': ({ ev }) => processar(takeFile(ev)),
  'fin:ext-recomecar': () => { estado = { fase: 'escolher', erro: '', nome: '', extrato: null, linhas: [] }; desenhar(); },
  'fin:ext-pago': ({ value }) => { pagoPor = value; },
  'fin:ext-div': ({ value }) => { divisao = value; },
  'fin:ext-toggle': ({ el, data }) => {
    const l = estado.linhas[Number(data.i)];
    if (!l) return;
    l.incluir = el.checked;
    byId(`ext-linha-${data.i}`)?.classList.toggle('is-off', !l.incluir);
    atualizarBotao();
  },
  'fin:ext-cat': ({ value, data }) => {
    const i = Number(data.i);
    const l = estado.linhas[i];
    if (!l) return;
    l.categoria = value;
    // Aplica a mesma categoria aos outros movimentos do mesmo comerciante que ainda tinham a sugestão automática.
    estado.linhas.forEach((o, j) => {
      if (j !== i && o.chave && o.chave === l.chave && o.categoria === o.categoriaSugerida) {
        o.categoria = value;
        const sel = document.querySelector(`[data-change="fin:ext-cat"][data-i="${j}"]`);
        if (sel) sel.value = value;
      }
    });
  },
  'fin:ext-todos': ({ data }) => {
    estado.linhas.forEach((l) => { l.incluir = data.v === '1'; });
    desenhar();
  },
  'fin:ext-importar': ({ el }) => importar(el),
};
