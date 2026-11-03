// Importar o extrato do banco (PDF, CSV ou Excel) em três passos, por esta ordem:
//   1. o ficheiro é lido no próprio dispositivo (nunca é enviado a nenhum servidor nem à IA);
//   2. os dados pessoais (titular, IBAN, NIF, cartões, morada, telefones…) são retirados dos movimentos;
//   3. só depois a IA recebe os nomes das lojas (sem valores, datas nem saldos) para categorizar e limpar
//      os nomes. A IA pode ser desligada. O casal revê tudo e as despesas entram de uma só vez.
import { html, render, byId } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { toast, openModal, closeModal, modalTemplate, promptDialog } from '../../core/ui.js';
import { money, isoToShort } from '../../core/format.js';
import { takeFile } from '../../core/images.js';
import { doc, setDoc, writeBatch, db } from '../../services/firebase.js';
import { sharedCol, sharedDoc } from '../../services/paths.js';
import { lerExtratoDeTexto, lerExtratoDeTabela, lerCsv, marcarDuplicados, pedidoCategorias, promptCategorias, lerRespostaIa, nomeComerciante } from './ler.js';
import { descreverRemovidos } from './privacidade.js';
import { pedirJson } from '../../services/gemini.js';
import { textoDoPdf, tabelaDoExcel, PdfProtegido } from './pdf.js';

const MODAL = 'fin-extrato-modal';
const MAX_PDF = 15 * 1024 * 1024;

let ctx = { categorias: [], despesas: () => [], aprendidas: () => ({}), nomesAprendidos: () => ({}), aoImportar: () => {} };
let estado = { fase: 'escolher', erro: '', nome: '', extrato: null, linhas: [], progresso: 0 };
const CHAVE_IA = 'gn.extrato.ia';
const usarIa = () => { try { return localStorage.getItem(CHAVE_IA) !== '0'; } catch { return true; } };
const definirIa = (sim) => { try { localStorage.setItem(CHAVE_IA, sim ? '1' : '0'); } catch { /* sem storage */ } };
const ACEITA = 'application/pdf,.pdf,.csv,text/csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
      <p class="muted small">Exporta os movimentos do mês na app ou no site do banco (CGD, Millennium, Novo Banco, Santander, BPI, Revolut…) em PDF, Excel ou CSV. Revês tudo antes de importar.</p>
      ${estado.erro ? html`<div class="ext-erro">${icon('close', 16)} <span>${estado.erro}</span></div>` : ''}
      <ol class="ext-passos">
        <li><span class="ext-passos__n">1</span><span><strong>Lido no teu dispositivo</strong><small>O ficheiro nunca sai do telemóvel/computador e não é guardado.</small></span></li>
        <li><span class="ext-passos__n">2</span><span><strong>Dados pessoais retirados</strong><small>Nome, IBAN, NIF, n.º de cartão, morada e telefones saem antes de tudo o resto.</small></span></li>
        <li><span class="ext-passos__n">3</span><span><strong>Só depois, a IA</strong><small>Recebe apenas os nomes das lojas (sem valores, datas nem saldos) para categorizar e limpar os nomes.</small></span></li>
      </ol>
      <label class="ext-ia-toggle">
        <input type="checkbox" ${usarIa() ? 'checked' : ''} data-change="fin:ext-ia">
        <span><strong>Usar IA no passo 3</strong><small>Desliga para categorizar só com as regras da app e as vossas correções.</small></span>
      </label>
      <label class="btn btn--primary btn--large btn--block pressable ext-escolher">${icon('file', 18)} Escolher extrato (PDF, Excel ou CSV)
        <input type="file" accept="${ACEITA}" hidden data-change="fin:ext-ficheiro">
      </label>`);
    return;
  }
  if (fase === 'ler') {
    const pct = Math.round((estado.progresso || 0) * 100);
    render('fin-extrato-body', html`
      <div class="ext-ler">
        <strong>A ler os movimentos… <span id="ext-pct">${pct}%</span></strong>
        <div class="progress ext-ler__barra"><span id="ext-barra" style="width:${pct}%"></span></div>
        <span class="muted small">${estado.nome}</span>
        <span class="muted small">${icon('shield', 14)} No teu dispositivo, sem enviar o ficheiro.</span>
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
    <div class="ext-privacidade card glass-soft" id="ext-privacidade">${privacidadeTpl()}</div>
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
            <input class="ext-linha__nome" value="${l.comerciante}" data-change="fin:ext-nome" data-i="${i}" aria-label="Nome da despesa" maxlength="60">
            <span class="record__meta">${l.data ? isoToShort(l.data, false) : 'sem data'} · ${l.descricao}</span>
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
      <button class="btn" data-action="fin:ext-recomecar">Outro ficheiro</button>
      <button class="btn btn--primary pressable" id="ext-importar" data-action="fin:ext-importar"></button>
    </div>`);
  atualizarBotao();
}

function privacidadeTpl() {
  const { extrato } = estado;
  const p = extrato.privacidade || { cabecalho: [], movimentos: {} };
  const tipos = [...p.cabecalho, ...Object.keys(p.movimentos)];
  const nMovs = Object.values(p.movimentos).length ? estado.linhas.length : 0;
  const ia = estado.ia || {};
  const passo = (ok, titulo, texto, extra = '') => html`
    <li class="${ok === true ? 'is-ok' : ok === 'a-correr' ? 'is-a-correr' : 'is-off'}">
      <span class="ext-passos__n">${ok === true ? icon('check', 14) : ok === 'a-correr' ? html`<span class="spinner spinner--small"></span>` : '–'}</span>
      <span><strong>${titulo}</strong><small>${texto}</small>${extra}</span>
    </li>`;
  const iaTexto = ia.estado === 'off' ? 'Desligada: categorias pelas regras da app e pelas vossas correções.'
    : ia.estado === 'nada' ? 'Não foi preciso: todas as lojas já eram conhecidas.'
      : ia.estado === 'a-correr' ? `A categorizar ${ia.enviados.length} loja(s)…`
        : ia.estado === 'erro' ? 'A IA não respondeu. Ficam as categorias da app (podes mudar à mão).'
          : `Recebeu ${ia.enviados.length} nome(s) de lojas: ${ia.mudou ? `mudou ${ia.mudou} categoria(s)` : 'categorias confirmadas'}${ia.nomes ? ` e limpou ${ia.nomes} nome(s)` : ''}.`;
  return html`
    <ol class="ext-passos ext-passos--feito">
      ${passo(true, 'Lido no teu dispositivo', `${extrato.movimentos.length} movimento(s). O ficheiro não foi enviado nem guardado.`)}
      ${passo(true, 'Dados pessoais retirados', tipos.length
    ? `Retirados: ${descreverRemovidos(tipos)}${nMovs ? '' : ' (do cabeçalho)'}. Não são guardados nem enviados.`
    : 'Não encontrei dados pessoais nos movimentos.')}
      ${passo(ia.estado === 'a-correr' ? 'a-correr' : ia.estado === 'feito' ? true : false, 'IA: categorias e nomes', iaTexto,
    ia.enviados?.length ? html`<details class="ext-enviado"><summary>Ver exatamente o que a IA recebe</summary><p>${ia.enviados.join(' · ')}</p></details>` : '')}
    </ol>`;
}

function redesenharPrivacidade() {
  const alvo = byId('ext-privacidade');
  if (alvo && estado.fase === 'rever') render(alvo, privacidadeTpl());
}

function mostrarProgresso(p) {
  estado.progresso = p;
  const pct = `${Math.round(p * 100)}%`;
  const t = byId('ext-pct');
  if (t) t.textContent = pct;
  const b = byId('ext-barra');
  if (b) b.style.width = pct;
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
      return await textoDoPdf(bytes.slice(), { password, progresso: (p) => mostrarProgresso(0.1 + p * 0.8) });
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

const tipoFicheiro = (file) => {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return 'csv';
  if (/\.xlsx?$/i.test(file.name) || /spreadsheet|ms-excel/.test(file.type)) return 'excel';
  return '';
};

async function processar(file) {
  if (!file) return;
  const tipo = tipoFicheiro(file);
  if (!tipo) {
    estado = { ...estado, fase: 'escolher', erro: 'Escolhe um extrato em PDF, Excel ou CSV.' };
    return desenhar();
  }
  if (file.size > MAX_PDF) {
    estado = { ...estado, fase: 'escolher', erro: 'O ficheiro é demasiado grande (máx. 15 MB).' };
    return desenhar();
  }
  estado = { fase: 'ler', erro: '', nome: file.name, extrato: null, linhas: [], progresso: 0.05 };
  desenhar();
  try {
    const opcoes = { aprendidas: ctx.aprendidas(), nomesConhecidos: session.members.map((m) => m.name).filter(Boolean) };
    let extrato;
    if (tipo === 'pdf') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const paginas = await abrirPdf(bytes);
      if (!paginas) { estado = { ...estado, fase: 'escolher', erro: '' }; return desenhar(); }
      if (!paginas.some((p) => p.length)) throw new Error('Este PDF não tem texto (parece uma imagem digitalizada). Descarrega o extrato em PDF, Excel ou CSV diretamente da app ou do site do banco.');
      extrato = lerExtratoDeTexto(paginas, opcoes);
    } else {
      mostrarProgresso(0.3);
      const tabela = tipo === 'csv' ? lerCsv(await lerTexto(file)) : await tabelaDoExcel(new Uint8Array(await file.arrayBuffer()));
      mostrarProgresso(0.8);
      extrato = lerExtratoDeTabela(tabela, opcoes);
    }
    mostrarProgresso(1);
    if (!extrato.movimentos.length) throw new Error('Não encontrei movimentos neste ficheiro. Confirma que é o extrato de movimentos da conta (não o resumo).');
    const debitos = extrato.movimentos.filter((m) => m.tipo === 'debito');
    if (!debitos.length) throw new Error('O extrato só tem entradas de dinheiro, não há despesas para importar.');
    const nomes = ctx.nomesAprendidos();
    const linhas = marcarDuplicados(debitos, ctx.despesas().filter((e) => e.tipo !== 'acerto'))
      .map((m) => {
        const comerciante = nomes[m.chave] || m.comerciante;
        return { ...m, comerciante, nomeSugerido: comerciante, categoriaSugerida: m.categoria, incluir: !m.duplicado && !m.transferencia };
      });
    estado = { ...estado, fase: 'rever', extrato, linhas, ia: { estado: usarIa() ? 'a-correr' : 'off', enviados: [] } };
    if (usarIa()) afinarComIa(estado);
  } catch (e) {
    console.error('[extrato]', e);
    estado = { ...estado, fase: 'escolher', erro: e?.message || 'Não foi possível ler o extrato.' };
  }
  desenhar();
}

/** Texto de um CSV: UTF-8, ou Windows-1252 (Excel em português) se aparecerem caracteres inválidos. */
async function lerTexto(file) {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

/**
 * Passo 3: a IA recebe só os nomes das lojas (já sem dados pessoais, sem valores, datas ou saldos),
 * devolve categoria + nome limpo. Não mexe no que o utilizador já mudou à mão.
 */
async function afinarComIa(alvo) {
  const itens = pedidoCategorias(alvo.linhas, ctx.aprendidas());
  alvo.ia = { estado: itens.length ? 'a-correr' : 'nada', enviados: itens.map((i) => i.texto) };
  if (!itens.length) return;
  let resposta = null;
  try {
    resposta = lerRespostaIa(await pedirJson([{ texto: promptCategorias(itens) }]), itens);
  } catch (e) {
    console.warn('[extrato] IA indisponível', e);
  }
  if (estado !== alvo || alvo.fase !== 'rever') return;
  if (!resposta) { alvo.ia.estado = 'erro'; redesenharPrivacidade(); return; }
  let mudou = 0;
  let nomes = 0;
  alvo.linhas.forEach((l, i) => {
    const c = resposta.categorias[l.chave];
    if (c && l.categoria === l.categoriaSugerida && c !== l.categoria) {
      l.categoria = c;
      mudou += 1;
      const sel = document.querySelector(`[data-change="fin:ext-cat"][data-i="${i}"]`);
      if (sel) sel.value = c;
    }
    if (c && l.categoria === l.categoriaSugerida) l.categoriaSugerida = c;
    const n = resposta.nomes[l.chave];
    if (n && l.comerciante === l.nomeSugerido && n !== l.comerciante) {
      l.comerciante = n;
      l.nomeSugerido = n;
      nomes += 1;
      const inp = document.querySelector(`[data-change="fin:ext-nome"][data-i="${i}"]`);
      if (inp) inp.value = n;
    }
  });
  alvo.ia = { ...alvo.ia, estado: 'feito', mudou, nomes };
  redesenharPrivacidade();
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
    // Aprende as categorias e os nomes que o casal corrigiu (e os nomes limpos pela IA), para os próximos extratos.
    const novas = {};
    const nomes = {};
    estado.linhas.forEach((l) => {
      if (!l.chave) return;
      if (l.categoria !== l.categoriaSugerida) novas[l.chave] = l.categoria;
      if (!l.transferencia && l.chave.length >= 3 && l.comerciante && l.comerciante !== nomeComerciante(l.descricao)) nomes[l.chave] = l.comerciante;
    });
    if (Object.keys(novas).length || Object.keys(nomes).length) {
      await setDoc(sharedDoc('config', 'categorias_extrato'), { regras: novas, nomes }, { merge: true });
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
  estado = { fase: 'escolher', erro: '', nome: '', extrato: null, linhas: [], progresso: 0 };
  pagoPor = session.uid;
  divisao = 'metade';
  desenhar();
  openModal(MODAL);
}

export const extratoModal = () => modalTemplate(MODAL, 'Importar extrato do banco', html`<div id="fin-extrato-body"></div>`, { wide: true });

export const extratoActions = {
  'fin:extrato': () => abrirExtrato(),
  'fin:ext-ficheiro': ({ ev }) => processar(takeFile(ev)),
  'fin:ext-recomecar': () => { estado = { fase: 'escolher', erro: '', nome: '', extrato: null, linhas: [], progresso: 0 }; desenhar(); },
  'fin:ext-ia': ({ el }) => definirIa(el.checked),
  'fin:ext-nome': ({ el, data }) => {
    const l = estado.linhas[Number(data.i)];
    if (l) l.comerciante = el.value.trim() || l.nomeSugerido;
  },
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
