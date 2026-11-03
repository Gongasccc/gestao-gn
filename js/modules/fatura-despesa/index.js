// Ler uma fatura nas Finanças (combustível, luz, água, telecomunicações, restaurantes…) e registá-la
// como despesa. Mesma ordem que o extrato:
//   1. lida no dispositivo (código QR da AT + OCR/PDF), a foto não é enviada nem guardada;
//   2. os dados pessoais (bloco do cliente, NIF, matrícula, morada, cartões…) são retirados do texto;
//   3. só se faltar alguma coisa, a IA recebe esse texto limpo para completar (pode ser desligada).
// Se a mesma despesa já veio do extrato (mesma data e valor), a fatura junta-se a ela em vez de duplicar.
import { html, render, byId } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { session } from '../../core/state.js';
import { toast, openModal, closeModal, modalTemplate } from '../../core/ui.js';
import { money, isoToShort, todayISO } from '../../core/format.js';
import { compressImage, takeFile } from '../../core/images.js';
import { addDoc, updateDoc, getDocs } from '../../services/firebase.js';
import { sharedCol, sharedDoc } from '../../services/paths.js';
import { pedirJson } from '../../services/gemini.js';
import { carregarImagem, procurarQr, textoPorOcr, lerPdf } from '../faturas/local.js';
import { faturaDoQr, lerCamposQr } from '../faturas/qr.js';
import { descreverRemovidos } from '../extrato/privacidade.js';
import { lerFaturaDespesa, textoFaturaParaIa, promptFatura, juntarRespostaIa } from './ler.js';

const MODAL = 'fin-fatura-modal';
const MAX_PDF = 15 * 1024 * 1024;
const CHAVE_IA = 'gn.fatura.ia';
const usarIa = () => { try { return localStorage.getItem(CHAVE_IA) !== '0'; } catch { return true; } };
const definirIa = (sim) => { try { localStorage.setItem(CHAVE_IA, sim ? '1' : '0'); } catch { /* sem storage */ } };

let ctx = { categorias: [], despesas: () => [], aoGuardar: () => {} };
let estado = { fase: 'escolher' };
let carros = [];

export function configurarFatura(opcoes) { ctx = { ...ctx, ...opcoes }; }

const membros = () => session.members.map((m) => ({ value: m.uid, label: m.uid === session.uid ? `${m.name.split(' ')[0]} (eu)` : m.name.split(' ')[0] }));
const n2 = (v) => (v ? String(v) : '');

/** Despesa já registada (ex.: vinda do extrato) com a mesma data e valor. */
function despesaIgual(f) {
  if (!f.valor || !f.data) return null;
  return ctx.despesas().find((e) => e.tipo !== 'acerto' && e.data === f.data && Math.abs(Number(e.valor) - f.valor) < 0.011) || null;
}

function passosTpl() {
  const { ia = {}, removidos = [] } = estado;
  const passo = (ok, titulo, texto, extra = '') => html`
    <li class="${ok === true ? 'is-ok' : ok === 'a-correr' ? 'is-a-correr' : 'is-off'}">
      <span class="ext-passos__n">${ok === true ? icon('check', 14) : ok === 'a-correr' ? html`<span class="spinner spinner--small"></span>` : '–'}</span>
      <span><strong>${titulo}</strong><small>${texto}</small>${extra}</span>
    </li>`;
  const iaTexto = ia.estado === 'off' ? 'Desligada.'
    : ia.estado === 'nada' ? 'Não foi precisa: a leitura no dispositivo chegou.'
      : ia.estado === 'erro' ? 'Não respondeu. Confirma os campos à mão.'
        : ia.estado === 'feito' ? 'Completou os campos que faltavam com o texto já limpo.' : 'A completar…';
  return html`
    <ol class="ext-passos ext-passos--feito">
      ${passo(true, 'Lida no teu dispositivo', estado.leitura || 'A foto não foi enviada nem guardada.')}
      ${passo(true, 'Dados pessoais retirados', removidos.length ? `Retirados: ${descreverRemovidos(removidos)}.` : 'Não encontrei dados pessoais no texto.')}
      ${passo(ia.estado === 'feito' ? true : ia.estado === 'a-correr' ? 'a-correr' : false, 'IA (só se faltar algo)', iaTexto,
    ia.enviado ? html`<details class="ext-enviado"><summary>Ver exatamente o que a IA recebeu</summary><pre>${ia.enviado}</pre></details>` : '')}
    </ol>`;
}

function desenhar() {
  const { fase } = estado;
  if (fase === 'escolher') {
    render('fin-fatura-body', html`
      <p class="muted small">Combustível, luz, água, internet, restaurantes, oficina… A app lê o código QR e o texto da fatura e preenche a despesa por ti.</p>
      ${estado.erro ? html`<div class="ext-erro">${icon('close', 16)} <span>${estado.erro}</span></div>` : ''}
      <div class="ffat-botoes">
        <label class="btn btn--primary btn--large pressable">${icon('camera', 18)} Tirar foto
          <input type="file" accept="image/*" capture="environment" hidden data-change="fin:fat-ficheiro"></label>
        <label class="btn btn--glass btn--large pressable">${icon('file', 18)} Galeria ou PDF
          <input type="file" accept="image/*,application/pdf,.pdf" hidden data-change="fin:fat-ficheiro"></label>
      </div>
      <label class="ext-ia-toggle">
        <input type="checkbox" ${usarIa() ? 'checked' : ''} data-change="fin:fat-ia">
        <span><strong>IA para completar o que faltar</strong><small>Recebe só o texto, já sem nome, NIF, morada, matrícula nem cartões. Nunca a foto.</small></span>
      </label>
      <p class="muted small ext-nota">${icon('shield', 14)} A foto é lida no teu dispositivo e não fica guardada. Os talões de supermercado com produtos ficam melhor em Supermercado, para comparar preços.</p>`);
    return;
  }
  if (fase === 'ler') {
    const pct = Math.round((estado.progresso || 0) * 100);
    render('fin-fatura-body', html`
      <div class="ext-ler">
        ${estado.preview ? html`<img class="ffat-preview" src="${estado.preview}" alt="">` : ''}
        <strong><span id="ffat-etapa">${estado.etapa || 'A ler a fatura…'}</span> <span id="ffat-pct">${pct}%</span></strong>
        <div class="progress ext-ler__barra"><span id="ffat-barra" style="width:${pct}%"></span></div>
        <span class="muted small">${icon('shield', 14)} No teu dispositivo, sem enviar a fatura.</span>
      </div>`);
    return;
  }
  const f = estado.fatura;
  const c = f.combustivel;
  const igual = despesaIgual(f);
  const ms = membros();
  const comCarro = !!c || f.categoria === 'transportes';
  render('fin-fatura-body', html`
    <div class="ext-privacidade card glass-soft" id="ffat-passos">${passosTpl()}</div>
    ${f.supermercado ? html`<p class="muted small">${icon('cart', 14)} Parece um talão de supermercado. Fica registado aqui como despesa; para guardar os produtos e comparar preços usa o Supermercado.</p>` : ''}
    <div class="field"><label class="field__label" for="ffat-desc">Descrição</label>
      <input id="ffat-desc" class="input" value="${f.descricao || ''}" placeholder="ex.: Combustível Galp" maxlength="60"></div>
    <div class="ffat-grelha">
      <div class="field"><label class="field__label" for="ffat-valor">Valor (€)</label>
        <input id="ffat-valor" class="input" type="number" step="0.01" inputmode="decimal" value="${n2(f.valor)}" data-change="fin:fat-valor"></div>
      <div class="field"><label class="field__label" for="ffat-data">Data</label>
        <input id="ffat-data" class="input" type="date" value="${f.data || todayISO()}" data-change="fin:fat-valor"></div>
    </div>
    <div class="field"><label class="field__label" for="ffat-cat">Categoria</label>
      <select id="ffat-cat" class="input" data-change="fin:fat-cat">${ctx.categorias.map((o) => html`<option value="${o.value}" ${o.value === f.categoria ? 'selected' : ''}>${o.label}</option>`)}</select></div>
    ${html`
      <div class="ffat-combustivel card glass-soft" id="ffat-combustivel" ${comCarro ? '' : 'hidden'}>
        <strong>${icon('fuel', 16)} Combustível</strong>
        <div class="ffat-grelha">
          <div class="field"><label class="field__label" for="ffat-tipo">Tipo</label>
            <input id="ffat-tipo" class="input" value="${c?.tipo || ''}" placeholder="ex.: Gasóleo" list="ffat-tipos"></div>
          <div class="field"><label class="field__label" for="ffat-litros">Litros</label>
            <input id="ffat-litros" class="input" type="number" step="0.01" inputmode="decimal" value="${n2(c?.litros)}"></div>
          <div class="field"><label class="field__label" for="ffat-preco">Preço/L (€)</label>
            <input id="ffat-preco" class="input" type="number" step="0.001" inputmode="decimal" value="${n2(c?.precoLitro)}"></div>
          <div class="field"><label class="field__label" for="ffat-km">Km (opcional)</label>
            <input id="ffat-km" class="input" type="number" inputmode="numeric" value="${n2(c?.km)}"></div>
        </div>
        <datalist id="ffat-tipos">${['Gasóleo', 'Gasóleo aditivado', 'Gasolina 95', 'Gasolina 98', 'GPL', 'AdBlue', 'Carregamento elétrico'].map((t) => html`<option value="${t}">`)}</datalist>
        ${carros.length ? html`<div class="field"><label class="field__label" for="ffat-carro">Carro</label>
          <select id="ffat-carro" class="input"><option value="">—</option>${carros.map((car) => html`<option value="${car.id}" ${car.id === estado.carroId ? 'selected' : ''}>${car.nome}${car.matricula ? ` · ${car.matricula}` : ''}</option>`)}</select></div>` : ''}
      </div>`}
    ${ms.length > 1 ? html`
      <div class="ext-opcoes">
        <div class="field"><label class="field__label" for="ffat-pago">Quem pagou</label>
          <select id="ffat-pago" class="input">${ms.map((o) => html`<option value="${o.value}" ${o.value === session.uid ? 'selected' : ''}>${o.label}</option>`)}</select></div>
        <div class="field"><label class="field__label" for="ffat-div">Como se divide</label>
          <select id="ffat-div" class="input"><option value="metade">A meias</option><option value="pagador">Pessoal (só de quem pagou)</option><option value="outro">Toda do outro (adiantei)</option></select></div>
      </div>` : ''}
    <div id="ffat-igual">${igualTpl(igual)}</div>
    ${f.nif || f.atcud ? html`<p class="muted small">Emitente NIF ${f.nif || '—'}${f.atcud ? ` · ATCUD ${f.atcud}` : ''}</p>` : ''}
    <div class="ext-rodape">
      <button class="btn" data-action="fin:fat-recomecar">Outra fatura</button>
      <button class="btn btn--primary pressable" data-action="fin:fat-guardar">${icon('check', 16)} Guardar despesa</button>
    </div>`);
}

const igualTpl = (igual) => (igual ? html`
  <label class="ext-ia-toggle ffat-igual">
    <input type="checkbox" id="ffat-juntar" checked>
    <span><strong>Juntar à despesa já registada</strong><small>«${igual.descricao}» · ${money(igual.valor)} · ${isoToShort(igual.data, false)}${igual.origem === 'extrato' ? ' (do extrato)' : ''}. Evita contar duas vezes.</small></span>
  </label>` : '');

function progresso(p, etapa) {
  estado.progresso = p;
  if (etapa) estado.etapa = etapa;
  const pct = `${Math.round(p * 100)}%`;
  const t = byId('ffat-pct');
  if (t) t.textContent = pct;
  const b = byId('ffat-barra');
  if (b) b.style.width = pct;
  const e = byId('ffat-etapa');
  if (e && etapa) e.textContent = etapa;
}

async function processar(file) {
  if (!file || estado.fase === 'ler') return;
  const ePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (ePdf && file.size > MAX_PDF) { estado = { fase: 'escolher', erro: 'O PDF é demasiado grande (máx. 15 MB).' }; return desenhar(); }
  estado = { fase: 'ler', progresso: 0.03, etapa: ePdf ? 'A abrir o PDF…' : 'A preparar a foto…', preview: '' };
  desenhar();
  try {
    let qrTexto = null;
    let texto = '';
    if (ePdf) {
      const pdf = await lerPdf(file);
      texto = pdf.texto;
      progresso(0.4, 'A procurar o código QR…');
      for (const pagina of pdf.paginas) {
        qrTexto = await procurarQr(pagina, (t) => !!lerCamposQr(t)).catch(() => null);
        if (qrTexto) break;
      }
    } else {
      estado.preview = await compressImage(file, { maxSize: 2400, quality: 0.9 });
      desenhar();
      const img = await carregarImagem(estado.preview);
      progresso(0.1, 'A procurar o código QR…');
      qrTexto = await procurarQr(img, (t) => !!lerCamposQr(t)).catch(() => null);
      progresso(0.2, 'A ler o texto da fatura…');
      texto = await textoPorOcr(img, (p) => progresso(0.2 + p * 0.65, 'A ler o texto da fatura…')).catch((e) => { console.warn('[fatura] OCR', e); return ''; });
    }
    progresso(0.88, 'A organizar os dados…');
    const qr = qrTexto ? faturaDoQr(qrTexto) : null;
    let fatura = lerFaturaDespesa(texto, qr);
    const perfil = { nomes: session.members.map((m) => m.name).filter(Boolean) };
    const limpo = textoFaturaParaIa(texto, perfil);
    const leitura = qr ? (texto ? 'Código QR da AT e texto lidos aqui.' : 'Código QR da AT lido aqui.') : texto ? 'Texto lido aqui (sem código QR).' : 'Não consegui ler a fatura: preenche à mão.';
    estado = { ...estado, leitura, removidos: limpo.removidos, ia: { estado: 'nada' } };
    const falta = !fatura.valor || !fatura.data || !fatura.descricao || fatura.categoria === 'outros'
      || (fatura.combustivel && (!fatura.combustivel.litros || !fatura.combustivel.precoLitro));
    if (falta && usarIa() && limpo.texto.replace(/[^\p{L}]/gu, '').length > 15) {
      progresso(0.92, 'A IA está a completar (só o texto limpo)…');
      estado.ia = { estado: 'a-correr', enviado: limpo.texto };
      try {
        fatura = juntarRespostaIa(fatura, await pedirJson([{ texto: promptFatura(limpo.texto) }]), { temQr: !!qr });
        estado.ia.estado = 'feito';
      } catch (e) {
        console.warn('[fatura] IA', e);
        estado.ia.estado = 'erro';
      }
    } else if (falta && !usarIa()) estado.ia = { estado: 'off' };
    progresso(1, 'Pronto');
    const carro = fatura.combustivel?.matricula
      ? carros.find((c) => String(c.matricula || '').replace(/\W/g, '') === fatura.combustivel.matricula.replace(/\W/g, ''))
      : carros.length === 1 ? carros[0] : null;
    estado = { ...estado, fase: 'rever', fatura, qr: !!qr, carroId: carro?.id || '' };
  } catch (e) {
    console.error('[fatura]', e);
    estado = { fase: 'escolher', erro: 'Não foi possível ler a fatura no dispositivo (sem ligação para descarregar o leitor?).' };
  }
  desenhar();
}

const valorDe = (id) => byId(id)?.value?.trim() || '';
const numeroDe = (id) => { const n = Number(String(valorDe(id)).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

async function guardar(btn) {
  const valor = Math.round(numeroDe('ffat-valor') * 100) / 100;
  const descricao = valorDe('ffat-desc') || estado.fatura.emitente || 'Fatura';
  if (!valor) { toast('Indica o valor da fatura.', 'error'); return; }
  const data = valorDe('ffat-data') || todayISO();
  const categoria = valorDe('ffat-cat') || 'outros';
  const f = estado.fatura;
  const tipo = valorDe('ffat-tipo');
  const litros = numeroDe('ffat-litros');
  const combustivel = !byId('ffat-combustivel')?.hidden && (tipo || litros) ? {
    tipo, litros, precoLitro: numeroDe('ffat-preco'), km: Math.round(numeroDe('ffat-km')) || null, carroId: valorDe('ffat-carro') || null,
  } : null;
  // Só dados da fatura (do emitente); nada do cliente. A foto não é guardada.
  const fatura = Object.fromEntries(Object.entries({
    emitente: f.emitente, nif: f.nif, atcud: f.atcud, documento: f.documento, tipoDocumento: f.tipoDocumento, leitura: estado.qr ? 'qr' : 'texto',
  }).filter(([, v]) => v));
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    const igual = byId('ffat-juntar')?.checked ? despesaIgual({ valor, data }) : null;
    if (igual) {
      await updateDoc(sharedDoc('despesas', igual.id), {
        fatura, ...(combustivel ? { combustivel } : {}), ...(igual.origem === 'extrato' ? { descricao, categoria } : {}),
      });
      toast('Fatura junta à despesa que já estava registada');
    } else {
      await addDoc(sharedCol('despesas'), {
        descricao, valor, categoria, data,
        pagoPor: valorDe('ffat-pago') || session.uid,
        divisao: session.members.length > 1 ? valorDe('ffat-div') || 'metade' : 'pagador',
        origem: 'fatura', fatura, ...(combustivel ? { combustivel } : {}),
        createdBy: session.uid, timestamp: Date.now(),
      });
      toast('Despesa registada');
    }
    await closeModal(MODAL);
    ctx.aoGuardar(data.slice(0, 7));
  } catch (e) {
    console.error('[fatura] guardar', e);
    toast('Não foi possível guardar. Tenta outra vez.', 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

async function carregarCarros() {
  try {
    const s = await getDocs(sharedCol('carros'));
    carros = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { carros = []; }
}

export function abrirFatura() {
  estado = { fase: 'escolher' };
  carregarCarros();
  desenhar();
  openModal(MODAL);
}

export const faturaModal = () => modalTemplate(MODAL, 'Ler fatura', html`<div id="fin-fatura-body"></div>`, { wide: true });

export const faturaActions = {
  'fin:fatura': () => abrirFatura(),
  'fin:fat-ficheiro': ({ ev }) => processar(takeFile(ev)),
  'fin:fat-ia': ({ el }) => definirIa(el.checked),
  'fin:fat-guardar': ({ el }) => guardar(el),
  'fin:fat-recomecar': () => { estado = { fase: 'escolher' }; desenhar(); },
  'fin:fat-cat': ({ value }) => {
    const caixa = byId('ffat-combustivel');
    if (caixa) caixa.hidden = !(value === 'transportes' || estado.fatura?.combustivel);
  },
  'fin:fat-valor': () => {
    const alvo = byId('ffat-igual');
    if (alvo) render(alvo, igualTpl(despesaIgual({ valor: Math.round(numeroDe('ffat-valor') * 100) / 100, data: valorDe('ffat-data') })));
  },
};
