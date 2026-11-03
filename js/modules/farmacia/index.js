// Farmácia: fotografar um medicamento, obter a informação essencial com IA (incluindo quantas unidades
// traz a caixa), gerir o inventário com - e +, saber quando acaba, guardar notas e manter uma biblioteca
// com todos os medicamentos que já tiveram. A validade tem contagem decrescente no último mês.
import { onSnapshot, addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { notifyUser } from '../../services/notifications.js';
import { navigate, back } from '../../core/router.js';
import { html, raw, byId, render } from '../../core/dom.js';
import { toast, confirmDialog, withLoading } from '../../core/ui.js';
import { criarProgresso } from '../../core/progress.js';
import { icon } from '../../core/icons.js';
import { session, createScope, emit } from '../../core/state.js';
import { analisarFoto, analisarNome } from './ai.js';
import { procurarFotoCaixa } from './fotoWeb.js';
import { removerFundo, prepararParaIA, miniatura, comLimite } from './imagem.js';
import {
  estadoValidade, textoContagem, formatarData, linksOficiais, DIAS_ALERTA,
  estadoStock, textoStock, textoFimStock, chaveNome,
} from './util.js';
import { iniciarTratamentos, pararTratamentos, blocoTratamentos, paginaTratamento, tratamentosAlertas } from './tratamentos.js';

const COLECAO = 'farmacia';
const PAGINA = 'menu-farmacia';
const PAGINA_NOVO = 'page-farmacia-novo';
const PAGINA_DETALHE = 'page-farmacia-detalhe';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

let medicamentos = [];
let filtro = '';
let vista = 'casa'; // 'casa' | 'biblioteca'
let atualId = null;
let rascunho = null; // { foto, info, fase, progresso, erro }
const scope = createScope();

const emCasa = (m) => !m.arquivado;

// ---------- Componentes ----------

const chipValidade = (validade) => {
  const { estado } = estadoValidade(validade);
  return html`<span class="farm-validade farm-validade--${estado}" data-validade="${validade || ''}">${textoContagem(validade)}</span>`;
};

const chipStock = (m) => {
  const txt = textoStock(m);
  return txt ? html`<span class="farm-stock farm-stock--${estadoStock(m)}">${icon('pill', 12)} ${txt}</span>` : '';
};

const imagemMed = (m, classe = '') => (m.foto
  ? html`<img class="farm-foto ${classe}" src="${m.foto}" alt="${m.nome}" loading="lazy">`
  : html`<div class="farm-foto farm-foto--vazia ${classe}">${icon('pill', 18)}</div>`);

function cartao(m, i) {
  const { estado } = estadoValidade(m.validade);
  const arquivado = !emCasa(m);
  return html`
    <button class="farm-card glass farm-card--${arquivado ? 'arquivado' : estado}" style="--i:${i}" data-action="farmacia:abrir" data-id="${m.id}">
      <div class="farm-card__palco">${imagemMed(m)}</div>
      <div class="farm-card__info">
        <strong class="farm-card__nome">${m.nome || 'Sem nome'}</strong>
        <span class="farm-card__sub">${[m.dosagem, m.forma].filter(Boolean).join(' · ')}</span>
        ${arquivado
          ? html`<span class="farm-stock farm-stock--sem">Já não temos em casa</span>`
          : html`${chipStock(m)}${chipValidade(m.validade)}`}
      </div>
    </button>`;
}

function seletorValidade(validade = '') {
  const [a, m, d] = validade.split('-');
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 12 }, (_, k) => anoAtual - 2 + k);
  const opt = (v, txt, sel) => html`<option value="${v}" ${raw(sel ? 'selected' : '')}>${txt}</option>`;
  return html`
    <div class="farm-validade-input">
      <select class="input" id="farm-val-dia" aria-label="Dia">
        ${opt('', 'Dia', !d)}
        ${Array.from({ length: 31 }, (_, k) => opt(String(k + 1).padStart(2, '0'), k + 1, Number(d) === k + 1))}
      </select>
      <select class="input" id="farm-val-mes" aria-label="Mês">
        ${opt('', 'Mês', !m)}
        ${MESES.map((nome, k) => opt(String(k + 1).padStart(2, '0'), nome, Number(m) === k + 1))}
      </select>
      <select class="input" id="farm-val-ano" aria-label="Ano">
        ${opt('', 'Ano', !a)}
        ${anos.map((ano) => opt(ano, ano, Number(a) === ano))}
      </select>
    </div>
    <p class="farm-dica">Se a embalagem só tiver mês e ano, deixa o dia em branco: conta até ao fim do mês.</p>`;
}

function lerValidade() {
  const a = byId('farm-val-ano')?.value;
  const m = byId('farm-val-mes')?.value;
  const d = byId('farm-val-dia')?.value;
  if (!a || !m) return '';
  return d ? `${a}-${m}-${d}` : `${a}-${m}`;
}

const numOuNull = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return v === '' || v == null || !Number.isFinite(n) || n < 0 ? null : n;
};

const lista = (itens) => itens.map((t) => html`<li>${t}</li>`);

function fichaInfo(m) {
  const blocos = [];
  if (m.resumo) blocos.push(html`<p class="farm-descricao">${m.resumo}</p>`);
  if (m.sintomas?.length) {
    blocos.push(html`<section class="farm-bloco glass"><h3>${icon('check', 18)} Quando tomar</h3><ul class="farm-pontos">${lista(m.sintomas)}</ul></section>`);
  }
  if (m.posologia?.length) {
    blocos.push(html`
      <section class="farm-bloco glass"><h3>${icon('users', 18)} Dose por idade</h3>
        <div class="farm-doses">
          ${m.posologia.map((p) => html`<div class="farm-dose"><span>${p.idade}</span><strong>${p.dose}</strong></div>`)}
        </div>
      </section>`);
  }
  if (m.avisos?.length || m.interacoes?.length) {
    blocos.push(html`
      <section class="farm-bloco farm-bloco--aviso glass"><h3>${icon('alert', 18)} Atenção</h3>
        <ul class="farm-pontos">${lista([...(m.avisos || []), ...(m.interacoes || []).map((t) => `Interação: ${t}`)])}</ul>
      </section>`);
  }
  return blocos;
}

const linksHtml = (m) => html`
  <section class="farm-bloco glass"><h3>${icon('book', 18)} Fontes oficiais</h3>
    <div class="farm-links">
      ${linksOficiais(m).map((l) => html`
        <a class="farm-link" href="${l.url}" target="_blank" rel="noopener noreferrer">
          <span>${l.titulo}</span><small>${l.fonte}</small>${icon('external', 18)}
        </a>`)}
    </div>
    <div class="farm-contactos">
      <a class="btn" href="tel:808242424">SNS 24 · 808 24 24 24</a>
      <a class="btn" href="tel:800250250">Intoxicações (CIAV) · 800 250 250</a>
    </div>
  </section>`;

const avisoMedico = html`<p class="farm-legal">Informação gerada por IA a partir do folheto aprovado. Não substitui o médico nem o farmacêutico: confirma sempre no folheto informativo.</p>`;

// ---------- Páginas ----------

function filtrar(itens) {
  const q = chaveNome(filtro);
  if (!q) return itens;
  return itens.filter((m) => chaveNome([m.nome, m.substancia, m.tipo, m.notas, ...(m.sintomas || [])].join(' ')).includes(q));
}

function renderLista() {
  const alvo = byId('farm-lista');
  if (!alvo) return;
  const casa = medicamentos.filter(emCasa);
  const ordenados = vista === 'casa'
    ? [...casa].sort((a, b) => estadoValidade(a.validade).ms - estadoValidade(b.validade).ms)
    : [...medicamentos].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
  const visiveis = filtrar(ordenados);

  const vazio = filtro.trim()
    ? 'Nenhum medicamento encontrado.'
    : vista === 'casa'
      ? 'Ainda não tens medicamentos em casa. Tira uma foto à embalagem para começar.'
      : 'A biblioteca guarda todos os medicamentos que já tiveram, mesmo os que acabaram.';
  render(alvo, visiveis.length ? visiveis.map(cartao) : html`<div class="farm-vazio">${icon('pill', 40)}<p>${vazio}</p></div>`);

  document.querySelectorAll('.farm-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.vista === vista));
  const conta = byId('farm-conta-biblioteca');
  if (conta) conta.textContent = medicamentos.length;

  const urgentes = casa.filter((m) => ['alerta', 'expirado'].includes(estadoValidade(m.validade).estado));
  const aAcabar = casa.filter((m) => ['baixo', 'vazio'].includes(estadoStock(m)));
  const resumo = byId('farm-resumo');
  if (resumo) {
    render(resumo, html`
      <div><strong>${casa.length}</strong><span>em casa</span></div>
      <div class="${urgentes.length ? 'farm-resumo--alerta' : ''}"><strong>${urgentes.length}</strong><span>a expirar</span></div>
      <div class="${aAcabar.length ? 'farm-resumo--alerta' : ''}"><strong>${aAcabar.length}</strong><span>a acabar</span></div>`);
  }
  const alertas = byId('farm-alertas');
  if (alertas) {
    const avisos = [...new Set([...urgentes, ...aAcabar])];
    render(alertas, avisos.length && vista === 'casa' ? html`
      <h3 class="farm-titulo-secao">Precisa de atenção</h3>
      <div class="farm-alertas-lista">
        ${avisos.map((m) => html`
          <button class="farm-alerta glass" data-action="farmacia:abrir" data-id="${m.id}">
            ${imagemMed(m, 'farm-foto--mini')}
            <span class="farm-alerta__nome">${m.nome}</span>
            ${['baixo', 'vazio'].includes(estadoStock(m)) ? chipStock(m) : chipValidade(m.validade)}
          </button>`)}
      </div>` : '');
  }
}

const templateLista = () => html`
  <div class="farm">
    <section class="farm-hero glass">
      <div class="farm-hero__topo">
        <div>
          <h2>A vossa farmácia</h2>
          <p>Fotografa a caixa: a IA lê o nome, a quantidade e a validade.</p>
        </div>
      </div>
      <div class="farm-resumo" id="farm-resumo"></div>
      <div class="farm-acoes">
        <label class="btn btn--primary farm-btn-foto">
          ${icon('camera', 18)} Tirar foto
          <input type="file" accept="image/*" capture="environment" hidden data-change="farmacia:foto">
        </label>
        <button class="btn" data-action="farmacia:porNome">${icon('edit', 18)} Escrever nome</button>
      </div>
    </section>
    <div class="farm-tabs" role="tablist">
      <button class="farm-tab is-active" data-vista="casa" data-action="farmacia:vista">Em casa</button>
      <button class="farm-tab" data-vista="biblioteca" data-action="farmacia:vista">Biblioteca <span class="farm-tab__n" id="farm-conta-biblioteca"></span></button>
    </div>
    <div id="farm-alertas"></div>
    <input class="input farm-pesquisa" type="search" placeholder="Pesquisar por nome, tipo, sintoma ou nota…" value="${filtro}" data-input="farmacia:filtrar">
    <div class="farm-grid stagger" id="farm-lista"></div>
  </div>`;

// Inventário ao adicionar: quantidade lida na caixa, toma diária e notas.
function blocoInventarioNovo(info, existente) {
  const lido = info.unidadesEmbalagem;
  return html`
    <section class="farm-bloco glass"><h3>${icon('pill', 18)} Inventário</h3>
      ${lido
        ? html`<p class="farm-lido">${icon('check', 14)} A caixa diz <strong>${lido} ${info.unidade}</strong>.</p>`
        : html`<p class="farm-dica">Não consegui ler a quantidade na caixa. Escreve quantas unidades tem.</p>`}
      ${existente ? html`<p class="farm-dica">Já tinham ${existente.nome} na biblioteca${emCasa(existente) && existente.quantidade ? ` (${textoStock(existente)} em casa)` : ''}. Esta caixa é somada ao que já têm.</p>` : ''}
      <div class="farm-campos2">
        <div class="farm-campo"><label for="farm-qtd">Unidades nesta caixa</label>
          <input class="input" id="farm-qtd" type="number" inputmode="numeric" min="0" value="${lido ?? ''}" placeholder="Ex.: 20"></div>
        <div class="farm-campo"><label for="farm-toma">Toma por dia (opcional)</label>
          <input class="input" id="farm-toma" type="number" inputmode="decimal" min="0" step="0.5" value="${existente?.tomaDiaria ?? ''}" placeholder="Ex.: 2"></div>
      </div>
    </section>
    <section class="farm-bloco glass"><h3>${icon('edit', 18)} Notas</h3>
      <textarea class="input textarea" id="farm-notas" placeholder="Ex.: Para a Nádia, tomar depois do jantar. Receitado pelo Dr. Silva.">${existente?.notas || ''}</textarea>
    </section>`;
}

// O mesmo medicamento pode vir com o nome escrito de outra forma ("Ben-u-ron" / "Ben-u-ron 500 mg"):
// compara primeiro o nome completo e depois o nome sem a dosagem, desde que as dosagens não se contradigam.
const DOSE = /\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ml|ui|%)\b/gi;
const semDose = (t) => chaveNome(String(t || '').replace(DOSE, ' '));
// Dosagem em mg para comparar (1 g = 1000 mg); outras unidades ficam como texto.
const doseDe = (m) => {
  const d = (`${m?.nome || ''} ${m?.dosagem || ''}`.match(DOSE) || [])[0];
  if (!d) return '';
  const [, n, u] = d.toLowerCase().match(/([\d.,]+)\s*(\S+)/) || [];
  const v = parseFloat(String(n).replace(',', '.'));
  const mg = { g: 1000, mg: 1, mcg: 0.001, 'µg': 0.001 }[u];
  return mg ? `${+(v * mg).toFixed(4)}mg` : `${v}${u}`;
};
const procurarExistente = (nome, dosagem = '') => {
  const k = chaveNome(nome);
  if (!k) return null;
  const exato = medicamentos.find((m) => chaveNome(m.nome) === k);
  if (exato) return exato;
  const base = semDose(nome);
  const dose = doseDe({ nome, dosagem });
  return base ? medicamentos.find((m) => semDose(m.nome) === base && (!dose || !doseDe(m) || doseDe(m) === dose)) || null : null;
};

function renderNovo() {
  const alvo = byId('farm-novo');
  if (!alvo || !rascunho) return;
  const { foto, original, info, fase, progresso, erro } = rascunho;

  const palco = html`
    <div class="farm-palco ${fase !== 'pronto' ? 'farm-palco--a-processar' : 'farm-palco--pronto'}">
      ${original && !foto ? html`<img class="farm-palco__original" src="${original}" alt="">` : ''}
      ${foto ? html`<img class="farm-palco__recorte" src="${foto}" alt="">` : ''}
      ${!original && !foto ? html`<div class="farm-foto farm-foto--vazia">${icon('pill', 48)}</div>` : ''}
      ${fase === 'ia' ? html`<div class="farm-scan"></div>` : ''}
      ${rascunho.porNome && fase !== 'ia' ? html`
        <label class="farm-palco__trocar pressable" title="${foto ? 'Trocar foto' : 'Adicionar foto'}">
          ${icon('camera', 16)}<span>${foto ? 'Trocar foto' : 'Adicionar foto'}</span>
          <input type="file" accept="image/*" hidden data-change="farmacia:fotoRascunho">
        </label>` : ''}
    </div>`;

  const passosHtml = fase === 'ia' ? html`
    <ol class="farm-passos">
      <li class="ativo"><span class="farm-passo__ponto"></span>${rascunho.ficheiro && !rascunho.porNome ? 'A ler a embalagem com IA' : 'A procurar o medicamento com IA'}
        <small id="farm-progresso">${textoProgresso(progresso)}</small>
        <span class="progress-line" id="farm-progresso-barra" style="--progresso:${progresso?.pct || 0}%"><i></i></span></li>
    </ol>` : '';

  let corpo = '';
  if (erro) {
    corpo = html`
      <div class="farm-erro glass">${erro}</div>
      ${rascunho.ficheiro ? html`<button class="btn" data-action="farmacia:repetirFoto">${icon('repeat', 18)} Tentar ler a foto outra vez</button>` : ''}
      <div class="farm-campo"><label for="farm-dica">Nome do medicamento</label>
        <input class="input" id="farm-dica" placeholder="Ex.: Brufen 400" value="${info?.nome || ''}" data-enter="farmacia:tentarNome"></div>
      <button class="btn btn--primary" data-action="farmacia:tentarNome">Procurar pelo nome</button>`;
  } else if (fase === 'pronto' && info) {
    const existente = procurarExistente(info.nome, info.dosagem);
    corpo = html`
      ${info.confianca === 'baixa' ? html`<div class="farm-erro glass">A IA não tem a certeza. Confirma o nome abaixo e carrega em "Atualizar".</div>` : ''}
      <div class="farm-campo"><label for="farm-nome">Nome</label>
        <div class="farm-linha"><input class="input" id="farm-nome" value="${info.nome}">
        <button class="btn" data-action="farmacia:tentarNome">Atualizar</button></div></div>
      <div class="farm-cabecalho">
        ${info.tipo ? html`<span class="chip farm-chip">${info.tipo}</span>` : ''}
        <span class="chip ${info.receita ? 'farm-chip--receita' : 'farm-chip--livre'}">${info.receita ? 'Receita médica' : 'Venda livre'}</span>
        ${info.substancia ? html`<span class="chip">${info.substancia}${info.dosagem ? ` ${info.dosagem}` : ''}</span>` : ''}
      </div>
      ${blocoInventarioNovo(info, existente)}
      <section class="farm-bloco glass"><h3>${icon('calendar', 18)} Data de validade</h3>${seletorValidade(rascunho.validade || info.validade)}</section>
      ${fichaInfo(info)}
      ${avisoMedico}
      <button class="btn btn--primary farm-guardar" data-action="farmacia:guardar">${existente ? 'Juntar à farmácia' : 'Guardar na farmácia'}</button>`;
  }

  render(alvo, html`${palco}${passosHtml}${corpo}`);
}

function blocoInventario(m) {
  const estado = estadoStock(m);
  const temStock = m.quantidade != null && m.quantidade !== '';
  const porCaixa = Number(m.unidadesEmbalagem) || 0;
  return html`
    <section class="farm-bloco farm-inventario farm-inventario--${estado} glass">
      <h3>${icon('pill', 18)} Inventário</h3>
      <div class="farm-contador">
        <button class="farm-passo-btn pressable" data-action="farmacia:stock" data-delta="-1" aria-label="Menos um" ${raw(temStock && Number(m.quantidade) > 0 ? '' : 'disabled')}>−</button>
        <div class="farm-contador__valor">
          <strong id="farm-qtd-atual">${temStock ? Number(m.quantidade) : '—'}</strong>
          <span>${m.unidade || 'unidades'} em casa</span>
        </div>
        <button class="farm-passo-btn farm-passo-btn--mais pressable" data-action="farmacia:stock" data-delta="1" aria-label="Mais um">+</button>
      </div>
      ${textoFimStock(m) ? html`<p class="farm-fim farm-fim--${estado}">${icon('clock', 14)} ${textoFimStock(m)}</p>` : ''}
      ${estado === 'vazio' ? html`<p class="farm-fim farm-fim--vazio">Acabou. Repõe quando comprares outra caixa.</p>` : ''}
      <div class="farm-inventario__acoes">
        ${porCaixa ? html`<button class="btn btn--small" data-action="farmacia:caixa">${icon('plus', 14)} Comprei uma caixa (+${porCaixa})</button>` : ''}
        <label class="farm-toma">Toma por dia
          <input class="input" id="farm-toma-det" type="number" inputmode="decimal" min="0" step="0.5" value="${m.tomaDiaria ?? ''}" placeholder="—" data-change="farmacia:toma">
        </label>
      </div>
    </section>`;
}

function renderDetalhe() {
  const alvo = byId('farm-detalhe');
  const m = medicamentos.find((x) => x.id === atualId);
  if (!alvo) return;
  if (!m) { render(alvo, html`<div class="farm-vazio"><p>Medicamento não encontrado.</p></div>`); return; }
  const { estado } = estadoValidade(m.validade);
  const arquivado = !emCasa(m);
  render(alvo, html`
    <div class="farm-palco farm-palco--pronto">
      <span class="farm-flutua">${imagemMed(m, 'farm-palco__recorte')}</span>
      <label class="farm-palco__trocar pressable" title="Trocar foto">
        ${icon('camera', 16)}<span>Trocar foto</span>
        <input type="file" accept="image/*" hidden data-change="farmacia:trocarFoto">
      </label>
    </div>
    <h2 class="farm-detalhe__nome">${m.nome}</h2>
    <p class="farm-detalhe__sub">${[m.substancia, m.dosagem, m.forma].filter(Boolean).join(' · ')}</p>
    <div class="farm-cabecalho">
      ${m.tipo ? html`<span class="chip farm-chip">${m.tipo}</span>` : ''}
      <span class="chip ${m.receita ? 'farm-chip--receita' : 'farm-chip--livre'}">${m.receita ? 'Receita médica' : 'Venda livre'}</span>
      ${arquivado ? html`<span class="chip">Na biblioteca</span>` : ''}
    </div>
    ${arquivado ? html`
      <section class="farm-bloco glass">
        <p class="farm-descricao">Já não têm este medicamento em casa. Se voltarem a comprar, repõe-no com um toque.</p>
        <button class="btn btn--primary" data-action="farmacia:repor">${icon('plus', 18)} Voltámos a comprar</button>
      </section>` : html`
      ${blocoInventario(m)}
      ${blocoTratamentos(m)}
      <section class="farm-contagem farm-contagem--${estado} glass">
        <span class="farm-contagem__rotulo">${estado === 'alerta' ? 'Expira em' : estado === 'expirado' ? 'Fora de validade' : 'Validade'}</span>
        ${chipValidade(m.validade)}
        ${m.validade && estado !== 'ok' ? html`<small>${formatarData(m.validade)}</small>` : ''}
      </section>`}
    <section class="farm-bloco glass"><h3>${icon('edit', 18)} Notas</h3>
      <textarea class="input textarea" id="farm-notas-det" placeholder="Detalhes: para quem é, quando tomar, quem receitou…">${m.notas || ''}</textarea>
      <button class="btn" data-action="farmacia:guardarNotas">Guardar notas</button>
    </section>
    ${fichaInfo(m)}
    ${arquivado ? '' : html`
      <section class="farm-bloco glass"><h3>${icon('calendar', 18)} Alterar validade</h3>
        ${seletorValidade(m.validade)}
        <button class="btn" data-action="farmacia:guardarValidade">Guardar validade</button>
      </section>`}
    ${linksHtml(m)}
    ${avisoMedico}
    ${arquivado ? '' : html`<button class="btn farm-arquivar" data-action="farmacia:arquivar">${icon('book', 18)} Já não temos: mover para a biblioteca</button>`}
    <button class="btn farm-apagar" data-action="farmacia:apagar">${icon('trash', 18)} Apagar de vez</button>`);
}

// ---------- Fluxo de adição ----------

const textoProgresso = (p) => (p?.txt ? `${p.txt} · ${p.pct || 0}%` : '');

/** Percentagem durante a leitura: atualiza só o texto e a barra (sem redesenhar a animação). */
function progressoRascunho(id) {
  return criarProgresso((pct, txt) => {
    if (rascunho?.id !== id) return;
    rascunho.progresso = { pct, txt };
    const t = byId('farm-progresso');
    if (t) t.textContent = textoProgresso(rascunho.progresso);
    byId('farm-progresso-barra')?.style.setProperty('--progresso', `${pct}%`);
  });
}

function atualizarRascunho(mudancas) {
  rascunho = { ...rascunho, ...mudancas };
  renderNovo();
}

// A remoção do fundo é só estética: corre depois da IA, com limite de tempo, e nunca bloqueia a leitura.
async function melhorarFoto(ficheiro, id) {
  try {
    const foto = await comLimite(removerFundo(ficheiro, () => {}), 25_000, 'Remoção de fundo demorou demasiado.');
    if (rascunho?.id === id) {
      rascunho = { ...rascunho, foto };
      const img = document.querySelector('#farm-novo .farm-palco__recorte, #farm-novo .farm-palco__original');
      if (img) { img.className = 'farm-palco__recorte'; img.src = foto; }
    }
  } catch (e) {
    console.warn('[farmacia] remoção de fundo', e);
  }
}

async function processarFoto(ficheiro) {
  const id = Date.now();
  const original = URL.createObjectURL(ficheiro);
  rascunho = { id, ficheiro, original, fase: 'ia', progresso: { txt: 'a preparar a foto', pct: 0 } };
  navigate(PAGINA_NOVO);
  const prog = progressoRascunho(id).fase(12, 1500, 'a preparar a foto');
  const foto = await miniatura(ficheiro);
  if (rascunho?.id !== id) { prog.parar(); return; }
  rascunho.foto = foto || '';
  renderNovo();

  try {
    const imagem = await prepararParaIA(ficheiro);
    prog.fase(25, 1500, 'a enviar a foto');
    const pedido = analisarFoto(imagem);
    setTimeout(() => prog.fase(96, 10000, 'a ler a embalagem'), 900);
    const info = await pedido;
    prog.concluir('pronto');
    if (rascunho?.id !== id) return;
    if (!info.identificado) throw new Error('Não consegui ler o nome na foto. Tira outra foto com o nome da caixa bem visível, ou escreve o nome.');
    atualizarRascunho({ info, fase: 'pronto', validade: info.validade || '' });
    melhorarFoto(ficheiro, id);
  } catch (e) {
    if (rascunho?.id === id) atualizarRascunho({ fase: 'erro', erro: e.message });
  } finally {
    prog.parar();
  }
}

// Sem foto tirada pelo utilizador: depois de a IA identificar o medicamento, procura na web uma foto
// da frente da caixa e a IA confirma qual é a certa. Se nenhuma servir, fica sem foto.
function buscarFotoCaixa(id, info) {
  if (rascunho?.ficheiro || rascunho?.fotoManual || (rascunho?.foto && !rascunho.fotoWeb)) return;
  const descricao = [info.nome, info.dosagem].filter(Boolean).join(' ');
  if (rascunho?.fotoWeb) atualizarRascunho({ foto: '', fotoWeb: false });
  rascunho.fotoPedida = descricao;
  procurarFotoCaixa(descricao).then((foto) => {
    if (!foto || rascunho?.id !== id || rascunho.fotoPedida !== descricao || rascunho.ficheiro || rascunho.fotoManual) return;
    atualizarRascunho({ foto, fotoWeb: true });
  }).catch((e) => console.warn('[farmacia] foto da caixa', e));
}

async function pesquisarNome(nome) {
  if (!nome?.trim()) { toast('Escreve o nome do medicamento.', 'error'); return; }
  const validade = byId('farm-val-mes') ? lerValidade() : rascunho?.validade;
  const id = rascunho?.id ?? Date.now();
  rascunho = { ...rascunho, id, porNome: true, progresso: { txt: 'a procurar', pct: 0 } };
  atualizarRascunho({ fase: 'ia', erro: null, info: null, validade });
  const prog = progressoRascunho(id).fase(96, 8000, 'a procurar');
  try {
    const info = await analisarNome(nome.trim());
    prog.concluir('pronto');
    if (!info.identificado) throw new Error(`Não encontrei "${nome}". Verifica o nome escrito na embalagem.`);
    atualizarRascunho({ info, fase: 'pronto', validade: validade || info.validade || '' });
    buscarFotoCaixa(id, info);
  } catch (e) {
    atualizarRascunho({ fase: 'erro', erro: e.message, info: { nome } });
  } finally {
    prog.parar();
  }
}

// ---------- Inventário ----------

const atual = () => medicamentos.find((x) => x.id === atualId);

let gravarStock = null;
function mudarStock(delta) {
  const m = atual();
  if (!m) return;
  const novo = Math.max(0, (Number(m.quantidade) || 0) + delta);
  m.quantidade = novo; // otimista: atualiza já o ecrã
  renderDetalhe();
  clearTimeout(gravarStock);
  gravarStock = setTimeout(() => updateDoc(sharedDoc(COLECAO, m.id), { quantidade: novo }).catch((e) => toast(e.message, 'error')), 400);
}

// ---------- Avisos: relógio e notificações ----------

function tique() {
  const agora = Date.now();
  document.querySelectorAll('.farm [data-validade]').forEach((el) => {
    const v = el.dataset.validade;
    el.textContent = textoContagem(v, agora);
    el.className = `farm-validade farm-validade--${estadoValidade(v, agora).estado}`;
  });
}

// Uma notificação por medicamento e por estado (validade a expirar/expirado; stock a acabar/acabou).
async function notificarAvisos() {
  for (const m of medicamentos.filter(emCasa)) {
    const { estado } = estadoValidade(m.validade);
    const marca = `${m.validade}:${estado}`;
    if (estado !== 'ok' && estado !== 'sem' && m.avisadoValidade !== marca) {
      const texto = estado === 'expirado'
        ? `💊 ${m.nome} passou da validade. Entrega-o numa farmácia (Valormed).`
        : `💊 ${m.nome} expira a ${formatarData(m.validade)}. Falta menos de um mês.`;
      try {
        await updateDoc(sharedDoc(COLECAO, m.id), { avisadoValidade: marca });
        await notifyUser(session.uid, texto);
      } catch (e) { console.warn('[farmacia] notificação de validade falhou', e); }
    }
    const stock = estadoStock(m);
    if ((stock === 'baixo' || stock === 'vazio') && m.avisadoStock !== stock) {
      const texto = stock === 'vazio' ? `💊 ${m.nome} acabou.` : `💊 ${m.nome} está a acabar: ${textoStock(m)}. ${textoFimStock(m)}`.trim();
      try {
        await updateDoc(sharedDoc(COLECAO, m.id), { avisadoStock: stock });
        await notifyUser(session.uid, texto);
      } catch (e) { console.warn('[farmacia] notificação de stock falhou', e); }
    } else if (stock === 'ok' && m.avisadoStock) {
      updateDoc(sharedDoc(COLECAO, m.id), { avisadoStock: null }).catch(() => {});
    }
  }
}

/** Avisos curtos para o Início (validade e stock dos medicamentos em casa). */
export function farmaciaAlertas() {
  const out = [];
  medicamentos.filter(emCasa).forEach((m) => {
    const v = estadoValidade(m.validade).estado;
    if (v === 'alerta' || v === 'expirado') {
      out.push({ fonte: 'Farmácia', icon: 'pill', tom: 'rose', titulo: `${m.nome}: ${v === 'expirado' ? 'fora de validade' : `expira a ${formatarData(m.validade)}`}`, quando: v === 'expirado' ? 'Expirado' : 'Validade', ordem: 1, page: PAGINA, id: m.id });
    }
    const s = estadoStock(m);
    if (s === 'baixo' || s === 'vazio') {
      out.push({ fonte: 'Farmácia', icon: 'pill', tom: 'rose', titulo: s === 'vazio' ? `${m.nome} acabou` : `${m.nome}: ${textoStock(m)}`, quando: textoFimStock(m).replace(/^Dá para /, '').replace(/ \(.*\)$/, '') || 'A acabar', ordem: 0, page: PAGINA, id: m.id });
    }
  });
  return [...tratamentosAlertas(), ...out];
}

// ---------- Módulo ----------

export default {
  id: 'farmacia',
  pages: [
    {
      id: PAGINA,
      title: 'Farmácia',
      root: true,
      template: templateLista,
      onEnter: renderLista,
    },
    { id: PAGINA_NOVO, title: 'Novo medicamento', template: () => html`<div class="farm farm-novo" id="farm-novo"></div>`, onEnter: renderNovo },
    {
      id: PAGINA_DETALHE,
      title: () => medicamentos.find((m) => m.id === atualId)?.nome || 'Medicamento',
      template: () => html`<div class="farm farm-detalhe" id="farm-detalhe"></div>`,
      onEnter: renderDetalhe,
    },
    paginaTratamento,
  ],

  actions: {
    'farmacia:foto': ({ el }) => {
      const ficheiro = el.files?.[0];
      el.value = '';
      if (ficheiro) processarFoto(ficheiro);
    },
    // Foto escolhida à mão para um medicamento procurado pelo nome: só muda a imagem, não volta a ler com a IA.
    'farmacia:fotoRascunho': async ({ el }) => {
      const ficheiro = el.files?.[0];
      el.value = '';
      if (!ficheiro || !rascunho) return;
      const id = rascunho.id;
      const label = el.closest('label');
      label?.classList.add('is-loading');
      rascunho.fotoPedida = null; // a foto da web que ainda esteja a chegar já não a substitui
      try {
        const rapida = await miniatura(ficheiro);
        if (!rapida) throw new Error('Não foi possível abrir a foto.');
        if (rascunho?.id === id) atualizarRascunho({ foto: rapida, fotoWeb: false, fotoManual: true });
        const semFundo = await comLimite(removerFundo(ficheiro, () => {}), 25_000).catch(() => '');
        if (semFundo && rascunho?.id === id && rascunho.foto === rapida) atualizarRascunho({ foto: semFundo });
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        label?.classList.remove('is-loading');
      }
    },
    'farmacia:trocarFoto': async ({ el }) => {
      const ficheiro = el.files?.[0];
      el.value = '';
      const id = atualId;
      if (!ficheiro || !id) return;
      const label = el.closest('label');
      label?.classList.add('is-loading');
      toast('A preparar a foto…');
      try {
        const foto = await comLimite(removerFundo(ficheiro, () => {}), 25_000).catch(() => miniatura(ficheiro));
        if (!foto) throw new Error('Não foi possível abrir a foto.');
        await updateDoc(sharedDoc(COLECAO, id), { foto });
        toast('Foto atualizada');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        label?.classList.remove('is-loading');
      }
    },
    'farmacia:repetirFoto': () => { if (rascunho?.ficheiro) processarFoto(rascunho.ficheiro); },
    'farmacia:porNome': () => {
      rascunho = { id: Date.now(), fase: 'erro', erro: 'Escreve o nome que está na embalagem (com a dosagem, se souberes).' };
      navigate(PAGINA_NOVO);
      setTimeout(() => byId('farm-dica')?.focus(), 350);
    },
    'farmacia:tentarNome': () => pesquisarNome(byId('farm-nome')?.value || byId('farm-dica')?.value),
    'farmacia:filtrar': ({ value }) => { filtro = value; renderLista(); },
    'farmacia:vista': ({ data }) => { vista = data.vista; renderLista(); },
    'farmacia:abrir': ({ data }) => { atualId = data.id; navigate(PAGINA_DETALHE); },

    'farmacia:guardar': async ({ el }) => {
      const { info, foto } = rascunho || {};
      if (!info) return;
      const nome = byId('farm-nome')?.value.trim() || info.nome;
      const qtd = numOuNull(byId('farm-qtd')?.value);
      const toma = numOuNull(byId('farm-toma')?.value);
      const notas = byId('farm-notas')?.value.trim() || '';
      const validade = lerValidade();
      const existente = procurarExistente(nome, info.dosagem);
      const { validade: _v, identificado: _i, confianca: _c, ...ficha } = info;

      if (existente) {
        const base = emCasa(existente) ? Number(existente.quantidade) || 0 : 0;
        await withLoading(el, () => updateDoc(sharedDoc(COLECAO, existente.id), {
          ...ficha,
          nome,
          foto: foto || existente.foto || '',
          unidadesEmbalagem: info.unidadesEmbalagem || qtd || existente.unidadesEmbalagem || null,
          quantidade: qtd == null ? (existente.quantidade ?? null) : base + qtd,
          tomaDiaria: toma ?? existente.tomaDiaria ?? null,
          notas: notas || existente.notas || '',
          validade: validade || existente.validade || '',
          arquivado: false,
          avisadoStock: null,
          atualizadoEm: Date.now(),
        }));
        atualId = existente.id;
        toast(`${nome}: caixa adicionada ao inventário`);
      } else {
        const ref = await withLoading(el, () => addDoc(sharedCol(COLECAO), {
          ...ficha,
          nome,
          foto: foto || '',
          unidadesEmbalagem: info.unidadesEmbalagem || qtd || null,
          quantidade: qtd,
          tomaDiaria: toma,
          notas,
          validade,
          arquivado: false,
          criadoEm: Date.now(),
        }));
        atualId = ref.id;
        toast(`${nome} guardado na farmácia`);
      }
      rascunho = null;
      navigate(PAGINA_DETALHE, { replace: true });
    },

    'farmacia:stock': ({ data }) => mudarStock(Number(data.delta) || 0),
    'farmacia:caixa': () => {
      const m = atual();
      if (m) { mudarStock(Number(m.unidadesEmbalagem) || 0); toast('Caixa adicionada'); }
    },
    'farmacia:toma': async ({ el }) => {
      const m = atual();
      if (!m) return;
      const tomaDiaria = numOuNull(el.value);
      m.tomaDiaria = tomaDiaria;
      renderDetalhe();
      await updateDoc(sharedDoc(COLECAO, m.id), { tomaDiaria });
    },
    'farmacia:guardarNotas': async ({ el }) => {
      if (!atualId) return;
      await withLoading(el, () => updateDoc(sharedDoc(COLECAO, atualId), { notas: byId('farm-notas-det')?.value.trim() || '' }));
      toast('Notas guardadas');
    },
    'farmacia:guardarValidade': async ({ el }) => {
      if (!atualId) return;
      await withLoading(el, () => updateDoc(sharedDoc(COLECAO, atualId), { validade: lerValidade() }));
      toast('Validade atualizada');
    },
    'farmacia:arquivar': async () => {
      const m = atual();
      if (!m) return;
      await updateDoc(sharedDoc(COLECAO, m.id), { arquivado: true, quantidade: 0, avisadoStock: null });
      toast(`${m.nome} ficou na biblioteca`);
      back();
    },
    'farmacia:repor': async ({ el }) => {
      const m = atual();
      if (!m) return;
      await withLoading(el, () => updateDoc(sharedDoc(COLECAO, m.id), {
        arquivado: false,
        quantidade: Number(m.unidadesEmbalagem) || null,
        validade: '',
        avisadoStock: null,
      }));
      toast('De volta à farmácia. Confirma a validade da caixa nova.');
    },
    'farmacia:apagar': async () => {
      const m = atual();
      if (!m) return;
      const ok = await confirmDialog(`${m.nome} vai ser apagado da farmácia e da biblioteca.`, { title: 'Apagar de vez?', confirmLabel: 'Apagar', danger: true });
      if (!ok) return;
      await deleteDoc(sharedDoc(COLECAO, m.id));
      back();
    },
  },

  start() {
    scope.add(onSnapshot(sharedCol(COLECAO), (snap) => {
      medicamentos = snapToList(snap);
      renderLista();
      if (atualId && byId(PAGINA_DETALHE)?.classList.contains('is-active')) renderDetalhe();
      notificarAvisos();
      emit('records:update', 'farmacia');
    }));
    iniciarTratamentos(scope, {
      medicamentos: () => medicamentos,
      aoMudar: () => { if (atualId && byId(PAGINA_DETALHE)?.classList.contains('is-active')) renderDetalhe(); },
    });
    const relogio = setInterval(tique, 1000);
    scope.add(() => clearInterval(relogio));
  },

  stop() {
    scope.clear();
    pararTratamentos();
    medicamentos = [];
    rascunho = null;
    atualId = null;
    filtro = '';
    vista = 'casa';
  },
};
