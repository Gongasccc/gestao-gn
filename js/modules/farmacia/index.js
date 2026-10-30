// Farmácia: fotografar um medicamento, remover o fundo, obter a informação essencial com IA
// e acompanhar a validade com contagem decrescente no último mês.
import { onSnapshot, addDoc, updateDoc, deleteDoc } from '../../services/firebase.js';
import { sharedCol, sharedDoc, snapToList } from '../../services/paths.js';
import { notifyUser } from '../../services/notifications.js';
import { navigate, back } from '../../core/router.js';
import { html, raw, byId, render } from '../../core/dom.js';
import { toast, confirmDialog, openModal, closeModal, modalTemplate, withLoading } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { session, createScope } from '../../core/state.js';
import { analisarFoto, analisarNome, temChavePessoal, guardarChavePessoal } from './ai.js';
import { removerFundo, prepararParaIA, miniatura, preCarregarRemocaoFundo } from './imagem.js';
import { estadoValidade, textoContagem, formatarData, linksOficiais, DIAS_ALERTA } from './util.js';

const COLECAO = 'farmacia';
const PAGINA = 'menu-farmacia';
const PAGINA_NOVO = 'page-farmacia-novo';
const PAGINA_DETALHE = 'page-farmacia-detalhe';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

let medicamentos = [];
let filtro = '';
let atualId = null;
let rascunho = null; // { foto, info, fase, progresso, erro }
const scope = createScope();

// ---------- Componentes ----------

const chipValidade = (validade) => {
  const { estado } = estadoValidade(validade);
  return html`<span class="farm-validade farm-validade--${estado}" data-validade="${validade || ''}">${textoContagem(validade)}</span>`;
};

const imagemMed = (m, classe = '') => (m.foto
  ? html`<img class="farm-foto ${classe}" src="${m.foto}" alt="${m.nome}" loading="lazy">`
  : html`<div class="farm-foto farm-foto--vazia ${classe}">${icon('pill', 18)}</div>`);

function cartao(m, i) {
  const { estado } = estadoValidade(m.validade);
  return html`
    <button class="farm-card glass farm-card--${estado}" style="--i:${i}" data-action="farmacia:abrir" data-id="${m.id}">
      <div class="farm-card__palco">${imagemMed(m)}</div>
      <div class="farm-card__info">
        <strong class="farm-card__nome">${m.nome || 'Sem nome'}</strong>
        <span class="farm-card__sub">${[m.dosagem, m.forma].filter(Boolean).join(' · ')}</span>
        ${m.tipo ? html`<span class="chip farm-chip">${m.tipo}</span>` : ''}
        ${chipValidade(m.validade)}
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

function renderLista() {
  const alvo = byId('farm-lista');
  if (!alvo) return;
  const ordenados = [...medicamentos].sort((a, b) => estadoValidade(a.validade).ms - estadoValidade(b.validade).ms);
  const q = filtro.trim().toLowerCase();
  const visiveis = q
    ? ordenados.filter((m) => [m.nome, m.substancia, m.tipo, ...(m.sintomas || [])].join(' ').toLowerCase().includes(q))
    : ordenados;

  render(alvo, visiveis.length
    ? visiveis.map(cartao)
    : html`<div class="farm-vazio">${icon('pill', 40)}<p>${q ? 'Nenhum medicamento encontrado.' : 'Ainda não tens medicamentos. Tira uma foto à embalagem para começar.'}</p></div>`);

  const urgentes = ordenados.filter((m) => ['alerta', 'expirado'].includes(estadoValidade(m.validade).estado));
  const resumo = byId('farm-resumo');
  if (resumo) {
    render(resumo, html`
      <div><strong>${medicamentos.length}</strong><span>medicamentos</span></div>
      <div class="${urgentes.length ? 'farm-resumo--alerta' : ''}"><strong>${urgentes.length}</strong><span>a expirar</span></div>`);
  }
  const alertas = byId('farm-alertas');
  if (alertas) {
    render(alertas, urgentes.length ? html`
      <h3 class="farm-titulo-secao">A expirar em ${DIAS_ALERTA} dias</h3>
      <div class="farm-alertas-lista">
        ${urgentes.map((m) => html`
          <button class="farm-alerta glass" data-action="farmacia:abrir" data-id="${m.id}">
            ${imagemMed(m, 'farm-foto--mini')}
            <span class="farm-alerta__nome">${m.nome}</span>
            ${chipValidade(m.validade)}
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
          <p>Fotografa a embalagem e a IA diz-te o essencial.</p>
        </div>
        <button class="farm-icone-btn" data-action="farmacia:definicoes" aria-label="Definições da IA">${icon('settings', 18)}</button>
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
    <div id="farm-alertas"></div>
    <input class="input farm-pesquisa" type="search" placeholder="Pesquisar por nome, tipo ou sintoma…" value="${filtro}" data-input="farmacia:filtrar">
    <div class="farm-grid stagger" id="farm-lista"></div>
  </div>`;

function renderNovo() {
  const alvo = byId('farm-novo');
  if (!alvo || !rascunho) return;
  const { foto, original, info, fase, progresso, erro } = rascunho;

  const palco = html`
    <div class="farm-palco ${fase !== 'pronto' ? 'farm-palco--a-processar' : 'farm-palco--pronto'}">
      ${original && !foto ? html`<img class="farm-palco__original" src="${original}" alt="">` : ''}
      ${foto ? html`<img class="farm-palco__recorte" src="${foto}" alt="">` : ''}
      ${!original && !foto ? html`<div class="farm-foto farm-foto--vazia">${icon('pill', 48)}</div>` : ''}
      ${fase !== 'pronto' && fase !== 'erro' ? html`<div class="farm-scan"></div>` : ''}
    </div>`;

  const passos = [
    ['fundo', 'Remover o fundo'],
    ['ia', 'Identificar com IA'],
  ];
  const ordem = ['fundo', 'ia', 'pronto'];
  const passosHtml = html`
    <ol class="farm-passos">
      ${passos.filter(([id]) => id !== 'fundo' || original).map(([id, txt]) => {
        const feito = ordem.indexOf(fase) > ordem.indexOf(id) || (fase === 'erro' && rascunho.feitos?.includes(id));
        const ativo = fase === id;
        return html`<li class="${feito ? 'feito' : ''} ${ativo ? 'ativo' : ''}">
          <span class="farm-passo__ponto"></span>${txt}
          ${ativo ? html`<small id="farm-progresso">${textoProgresso(progresso)}</small>` : ''}
        </li>`;
      })}
    </ol>`;

  let corpo = '';
  if (erro) {
    corpo = html`
      <div class="farm-erro glass">${erro}</div>
      <div class="farm-campo"><label for="farm-dica">Nome do medicamento</label>
        <input class="input" id="farm-dica" placeholder="Ex.: Brufen 400" value="${info?.nome || ''}" data-enter="farmacia:tentarNome"></div>
      <button class="btn btn--primary" data-action="farmacia:tentarNome">Tentar com o nome</button>`;
  } else if (fase === 'pronto' && info) {
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
      ${fichaInfo(info)}
      <section class="farm-bloco glass"><h3>${icon('calendar', 18)} Data de validade</h3>${seletorValidade(rascunho.validade)}</section>
      ${avisoMedico}
      <button class="btn btn--primary farm-guardar" data-action="farmacia:guardar">Guardar na farmácia</button>`;
  }

  render(alvo, html`${palco}${passosHtml}${corpo}`);
}

function renderDetalhe() {
  const alvo = byId('farm-detalhe');
  const m = medicamentos.find((x) => x.id === atualId);
  if (!alvo) return;
  if (!m) { render(alvo, html`<div class="farm-vazio"><p>Medicamento não encontrado.</p></div>`); return; }
  const { estado } = estadoValidade(m.validade);
  render(alvo, html`
    <div class="farm-palco farm-palco--pronto">${imagemMed(m, 'farm-palco__recorte')}</div>
    <h2 class="farm-detalhe__nome">${m.nome}</h2>
    <p class="farm-detalhe__sub">${[m.substancia, m.dosagem, m.forma].filter(Boolean).join(' · ')}</p>
    <div class="farm-cabecalho">
      ${m.tipo ? html`<span class="chip farm-chip">${m.tipo}</span>` : ''}
      <span class="chip ${m.receita ? 'farm-chip--receita' : 'farm-chip--livre'}">${m.receita ? 'Receita médica' : 'Venda livre'}</span>
    </div>
    <section class="farm-contagem farm-contagem--${estado} glass">
      <span class="farm-contagem__rotulo">${estado === 'alerta' ? 'Expira em' : estado === 'expirado' ? 'Fora de validade' : 'Validade'}</span>
      ${chipValidade(m.validade)}
      ${m.validade && estado !== 'ok' ? html`<small>${formatarData(m.validade)}</small>` : ''}
    </section>
    ${fichaInfo(m)}
    <section class="farm-bloco glass"><h3>${icon('calendar', 18)} Alterar validade</h3>
      ${seletorValidade(m.validade)}
      <button class="btn" data-action="farmacia:guardarValidade">Guardar validade</button>
    </section>
    ${linksHtml(m)}
    ${avisoMedico}
    <button class="btn farm-apagar" data-action="farmacia:apagar">${icon('trash', 18)} Remover da farmácia</button>`);
}

// ---------- Fluxo de adição ----------

const textoProgresso = (p) => (p?.txt ? `${p.txt}${p.p ? ` ${Math.round(p.p * 100)}%` : ''}` : '');

// O progresso muda muitas vezes por segundo: atualiza só o texto, sem redesenhar a página.
function mostrarProgresso(txt, p) {
  rascunho = { ...rascunho, progresso: { txt, p } };
  const el = byId('farm-progresso');
  if (el) el.textContent = textoProgresso(rascunho.progresso);
}

function atualizarRascunho(mudancas) {
  rascunho = { ...rascunho, ...mudancas };
  renderNovo();
}

async function processarFoto(ficheiro) {
  const original = URL.createObjectURL(ficheiro);
  rascunho = { original, fase: 'fundo', feitos: [] };
  navigate(PAGINA_NOVO);

  // A IA e a remoção de fundo correm em paralelo; a IA usa a foto original (lê melhor a embalagem).
  const pedidoIA = prepararParaIA(ficheiro).then((img) => analisarFoto(img));
  pedidoIA.catch(() => {});

  try {
    const foto = await removerFundo(ficheiro, mostrarProgresso);
    atualizarRascunho({ foto, fase: 'ia', progresso: null, feitos: ['fundo'] });
  } catch (e) {
    console.warn('Remoção de fundo falhou', e);
    atualizarRascunho({ foto: await miniatura(ficheiro), fase: 'ia', progresso: null, feitos: ['fundo'] });
    toast('Não foi possível remover o fundo; ficou a foto original.', 'info');
  }

  try {
    const info = await pedidoIA;
    if (!info.identificado) throw new Error('Não consegui identificar o medicamento pela foto. Escreve o nome para continuar.');
    atualizarRascunho({ info, fase: 'pronto' });
  } catch (e) {
    atualizarRascunho({ fase: 'erro', erro: e.message, feitos: ['fundo'] });
  } finally {
    URL.revokeObjectURL(original);
  }
}

async function pesquisarNome(nome) {
  if (!nome?.trim()) { toast('Escreve o nome do medicamento.', 'error'); return; }
  const validade = byId('farm-val-mes') ? lerValidade() : rascunho?.validade;
  atualizarRascunho({ fase: 'ia', erro: null, info: null, validade, feitos: rascunho?.foto ? ['fundo'] : [] });
  try {
    const info = await analisarNome(nome.trim());
    if (!info.identificado) throw new Error(`Não encontrei "${nome}". Verifica o nome escrito na embalagem.`);
    atualizarRascunho({ info, fase: 'pronto' });
  } catch (e) {
    atualizarRascunho({ fase: 'erro', erro: e.message, info: { nome } });
  }
}

// ---------- Validade: relógio e notificação ----------

function tique() {
  const agora = Date.now();
  document.querySelectorAll('.farm [data-validade]').forEach((el) => {
    const v = el.dataset.validade;
    el.textContent = textoContagem(v, agora);
    el.className = `farm-validade farm-validade--${estadoValidade(v, agora).estado}`;
  });
}

// Uma notificação por medicamento e por estado (a expirar / expirado).
async function notificarValidades() {
  for (const m of medicamentos) {
    const { estado } = estadoValidade(m.validade);
    const marca = `${m.validade}:${estado}`;
    if (estado === 'ok' || estado === 'sem' || m.avisadoValidade === marca) continue;
    const texto = estado === 'expirado'
      ? `💊 ${m.nome} passou da validade. Entrega-o numa farmácia (Valormed).`
      : `💊 ${m.nome} expira a ${formatarData(m.validade)}. Falta menos de um mês.`;
    try {
      await updateDoc(sharedDoc(COLECAO, m.id), { avisadoValidade: marca });
      await notifyUser(session.uid, texto);
    } catch (e) {
      console.warn('[farmacia] notificação de validade falhou', e);
    }
  }
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
      onEnter: () => { renderLista(); preCarregarRemocaoFundo(); },
    },
    { id: PAGINA_NOVO, title: 'Novo medicamento', template: () => html`<div class="farm farm-novo" id="farm-novo"></div>`, onEnter: renderNovo },
    {
      id: PAGINA_DETALHE,
      title: () => medicamentos.find((m) => m.id === atualId)?.nome || 'Medicamento',
      template: () => html`<div class="farm farm-detalhe" id="farm-detalhe"></div>`,
      onEnter: renderDetalhe,
    },
  ],

  modals: () => modalTemplate('modal-farmacia-ia', 'IA da Farmácia', html`
    <p class="farm-dica">Por defeito a app usa o Gemini através do Firebase AI Logic do projeto. Se preferires, cola aqui uma chave pessoal da Gemini API (aistudio.google.com). Fica guardada só neste dispositivo.</p>
    <input class="input" id="farm-chave" type="password" autocomplete="off" placeholder="Chave da Gemini API (opcional)">
    <div class="btn-row">
      <button class="btn pressable" data-action="modal:close" data-modal="modal-farmacia-ia">Cancelar</button>
      <button class="btn btn--primary pressable" data-action="farmacia:guardarChave">Guardar</button>
    </div>`),

  actions: {
    'farmacia:foto': ({ el }) => {
      const ficheiro = el.files?.[0];
      el.value = '';
      if (ficheiro) processarFoto(ficheiro);
    },
    'farmacia:porNome': () => {
      rascunho = { fase: 'erro', erro: 'Escreve o nome que está na embalagem (com a dosagem, se souberes).', feitos: [] };
      navigate(PAGINA_NOVO);
      setTimeout(() => byId('farm-dica')?.focus(), 350);
    },
    'farmacia:tentarNome': () => pesquisarNome(byId('farm-nome')?.value || byId('farm-dica')?.value),
    'farmacia:filtrar': ({ value }) => { filtro = value; renderLista(); },
    'farmacia:abrir': ({ data }) => { atualId = data.id; navigate(PAGINA_DETALHE); },

    'farmacia:guardar': async ({ el }) => {
      const { info, foto } = rascunho || {};
      if (!info) return;
      const nome = byId('farm-nome')?.value.trim() || info.nome;
      const ref = await withLoading(el, () => addDoc(sharedCol(COLECAO), {
        ...info,
        nome,
        foto: foto || '',
        validade: lerValidade(),
        criadoEm: Date.now(),
      }));
      rascunho = null;
      atualId = ref.id;
      toast(`${nome} guardado na farmácia`);
      navigate(PAGINA_DETALHE, { replace: true });
    },

    'farmacia:guardarValidade': async ({ el }) => {
      if (!atualId) return;
      await withLoading(el, () => updateDoc(sharedDoc(COLECAO, atualId), { validade: lerValidade() }));
      toast('Validade atualizada');
    },

    'farmacia:apagar': async () => {
      const m = medicamentos.find((x) => x.id === atualId);
      if (!m) return;
      const ok = await confirmDialog(`${m.nome} vai ser removido da farmácia.`, { title: 'Remover medicamento?', confirmLabel: 'Remover', danger: true });
      if (!ok) return;
      await deleteDoc(sharedDoc(COLECAO, m.id));
      back();
    },

    'farmacia:definicoes': () => {
      const input = byId('farm-chave');
      if (input) input.placeholder = temChavePessoal() ? 'Chave guardada (vazio para apagar)' : 'Chave da Gemini API (opcional)';
      openModal('modal-farmacia-ia');
    },
    'farmacia:guardarChave': () => {
      const input = byId('farm-chave');
      guardarChavePessoal(input?.value || '');
      if (input) input.value = '';
      closeModal('modal-farmacia-ia');
      toast(temChavePessoal() ? 'Chave guardada neste dispositivo' : 'A usar o Firebase AI Logic', 'info');
    },
  },

  start() {
    scope.add(onSnapshot(sharedCol(COLECAO), (snap) => {
      medicamentos = snapToList(snap);
      renderLista();
      if (atualId && byId(PAGINA_DETALHE)?.classList.contains('is-active')) renderDetalhe();
      notificarValidades();
    }));
    const relogio = setInterval(tique, 1000);
    scope.add(() => clearInterval(relogio));
  },

  stop() {
    scope.clear();
    medicamentos = [];
    rascunho = null;
    atualId = null;
    filtro = '';
  },
};
