// Contas sem dependências (testadas em tests/juntos.test.mjs): votações, eventos, rotinas e despensa.

const pad = (n) => String(n).padStart(2, '0');
export const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deISO = (s) => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, (m || 1) - 1, d || 1); };
const DIA_MS = 86_400_000;

// ---------- Votações ----------

/**
 * Resultado de uma votação. votos: { uid: indiceDaOpcao | [indices] } (várias escolhas quando multipla).
 * Devolve [{ indice, texto, votos, pct, quem: [uid], vence }] pela ordem das opções.
 */
export function resultado(votacao) {
  const opcoes = votacao?.opcoes || [];
  const contagem = opcoes.map((texto, indice) => ({ indice, texto, votos: 0, quem: [] }));
  for (const [uid, v] of Object.entries(votacao?.votos || {})) {
    for (const i of [].concat(v)) {
      if (contagem[i]) { contagem[i].votos += 1; contagem[i].quem.push(uid); }
    }
  }
  const votantes = Object.keys(votacao?.votos || {}).length;
  const max = Math.max(0, ...contagem.map((c) => c.votos));
  return contagem.map((c) => ({ ...c, pct: votantes ? Math.round((c.votos / votantes) * 100) : 0, vence: max > 0 && c.votos === max }));
}

/** Novo mapa de votos depois de alguém tocar numa opção (tocar outra vez tira o voto). */
export function votar(votacao, uid, indice) {
  const votos = { ...(votacao?.votos || {}) };
  if (votacao?.multipla) {
    const atuais = new Set([].concat(votos[uid] ?? []));
    if (atuais.has(indice)) atuais.delete(indice); else atuais.add(indice);
    if (atuais.size) votos[uid] = [...atuais].sort((a, b) => a - b); else delete votos[uid];
  } else if (votos[uid] === indice) delete votos[uid];
  else votos[uid] = indice;
  return votos;
}

// ---------- Eventos e aniversários ----------

/**
 * Próxima ocorrência de um evento ('AAAA-MM-DD'). Os anuais (aniversários) repetem todos os anos;
 * 29 de fevereiro passa a 28 nos anos comuns. Devolve null quando um evento único já passou.
 */
export function proximaData(evento, hoje = new Date()) {
  if (!evento?.data) return null;
  const h = isoDia(hoje);
  if (!evento.anual) return evento.data >= h ? evento.data : null;
  const [, m, d] = evento.data.split('-').map(Number);
  for (const ano of [hoje.getFullYear(), hoje.getFullYear() + 1]) {
    const dia = m === 2 && d === 29 && new Date(ano, 1, 29).getMonth() !== 1 ? 28 : d;
    const s = `${ano}-${pad(m)}-${pad(dia)}`;
    if (s >= h) return s;
  }
  return null;
}

export const diasAte = (iso, hoje = new Date()) => Math.round((deISO(iso) - deISO(isoDia(hoje))) / DIA_MS);

/** Idade que faz na próxima data (só aniversários com ano de nascimento). */
export function idadeQueFaz(evento, hoje = new Date()) {
  if (!evento?.anual || evento.tipo !== 'aniversario' || !evento.data) return null;
  const nasc = Number(evento.data.slice(0, 4));
  const prox = proximaData(evento, hoje);
  if (!prox || !nasc || nasc < 1900) return null;
  return Number(prox.slice(0, 4)) - nasc;
}

/** Eventos ordenados pela próxima data, sem os que já passaram. */
export function proximosEventos(eventos, hoje = new Date()) {
  return eventos
    .map((e) => ({ ...e, proxima: proximaData(e, hoje) }))
    .filter((e) => e.proxima)
    .map((e) => ({ ...e, faltam: diasAte(e.proxima, hoje) }))
    .sort((a, b) => a.faltam - b.faltam || String(a.titulo).localeCompare(String(b.titulo), 'pt'));
}

export function textoFaltam(n) {
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  if (n < 7) return `Daqui a ${n} dias`;
  if (n < 60) return `Daqui a ${Math.round(n / 7) === 1 ? '1 semana' : `${Math.round(n / 7)} semanas`}`;
  return `Daqui a ${Math.round(n / 30)} meses`;
}

// ---------- Rotinas (tarefas que rodam) ----------

export const FREQUENCIAS = [
  { value: 'diaria', label: 'Todos os dias', dias: 1 },
  { value: 'semanal', label: 'Todas as semanas', dias: 7 },
  { value: 'quinzenal', label: 'De 15 em 15 dias', dias: 14 },
  { value: 'mensal', label: 'Todos os meses', dias: 30 },
];
export const diasDaFrequencia = (f) => FREQUENCIAS.find((x) => x.value === f)?.dias || 7;

/** Pessoa de quem é a vez agora. pessoas: [{ id, nome }] pela ordem da roda. */
export function vezDe(rotina) {
  const pessoas = rotina?.pessoas || [];
  if (!pessoas.length) return null;
  const i = ((Number(rotina.vez) || 0) % pessoas.length + pessoas.length) % pessoas.length;
  return pessoas[i];
}

/** Próxima data a partir de quando foi feita. */
export function proximaVez(rotina, feitaEm = new Date()) {
  const d = new Date(feitaEm.getFullYear(), feitaEm.getMonth(), feitaEm.getDate());
  if (rotina?.frequencia === 'mensal') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + diasDaFrequencia(rotina?.frequencia));
  return isoDia(d);
}

/**
 * Marca a rotina como feita por `quemId` (pode não ser quem estava na vez: troca de turno).
 * Devolve as alterações a gravar: { vez, proxima, pontos, historico }.
 */
export function concluirRotina(rotina, quemId, agora = new Date()) {
  const pessoas = rotina.pessoas || [];
  const idx = Math.max(0, pessoas.findIndex((p) => p.id === quemId));
  const pontos = { ...(rotina.pontos || {}) };
  pontos[quemId] = (pontos[quemId] || 0) + (Number(rotina.valor) || 1);
  const historico = [{ quem: quemId, quando: agora.getTime() }, ...(rotina.historico || [])].slice(0, 20);
  return { vez: pessoas.length ? (idx + 1) % pessoas.length : 0, proxima: proximaVez(rotina, agora), pontos, historico };
}

/** 'atrasada' | 'hoje' | 'em-breve' (até 2 dias) | 'ok'. */
export function estadoRotina(rotina, hoje = new Date()) {
  if (!rotina?.proxima) return 'hoje';
  const n = diasAte(rotina.proxima, hoje);
  if (n < 0) return 'atrasada';
  if (n === 0) return 'hoje';
  if (n <= 2) return 'em-breve';
  return 'ok';
}

/** Ranking somado de todas as rotinas: [{ id, nome, pontos }] do maior para o menor. */
export function ranking(rotinas) {
  const tot = new Map();
  for (const r of rotinas) {
    for (const p of r.pessoas || []) if (!tot.has(p.id)) tot.set(p.id, { id: p.id, nome: p.nome, pontos: 0 });
    for (const [id, n] of Object.entries(r.pontos || {})) {
      const atual = tot.get(id) || { id, nome: (r.pessoas || []).find((p) => p.id === id)?.nome || '?', pontos: 0 };
      atual.pontos += Number(n) || 0;
      tot.set(id, atual);
    }
  }
  return [...tot.values()].sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, 'pt'));
}

// ---------- Despensa ----------

/** 'acabou' | 'pouco' (no mínimo ou abaixo) | 'ok'. */
export function estadoDespensa(item) {
  const q = Number(item?.quantidade) || 0;
  const min = Number(item?.minimo) || 0;
  if (q <= 0) return 'acabou';
  if (min && q <= min) return 'pouco';
  return 'ok';
}

const chave = (t) => String(t || '').toLocaleLowerCase('pt').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const chaveProduto = chave;

/**
 * Junta os produtos de uma fatura à despensa: soma a quantidade aos que já existem (pelo nome)
 * e devolve os novos à parte. itensFatura: [{ produto | nome | descricao, quantidade }].
 */
export function juntarFatura(despensa, itensFatura) {
  const porNome = new Map(despensa.map((d) => [chave(d.nome), d]));
  const atualizar = new Map();
  const novos = new Map();
  for (const i of itensFatura || []) {
    const nome = String(i.produto || i.nome || i.descricao || i.texto || '').trim();
    const k = chave(nome);
    if (!k) continue;
    const qtd = Math.max(1, Math.round(Number(i.quantidade) || 1));
    const existente = porNome.get(k);
    if (existente) {
      const base = atualizar.get(existente.id)?.quantidade ?? (Number(existente.quantidade) || 0);
      atualizar.set(existente.id, { id: existente.id, quantidade: base + qtd });
    } else {
      const n = novos.get(k);
      novos.set(k, { nome, quantidade: (n?.quantidade || 0) + qtd });
    }
  }
  return { atualizar: [...atualizar.values()], novos: [...novos.values()] };
}

// ---------- Pesquisa geral ----------

/** Pontuação simples: todas as palavras têm de aparecer; começar pela pesquisa vale mais. */
export function pontuar(texto, pesquisa) {
  const t = chave(texto);
  const palavras = chave(pesquisa).split(' ').filter(Boolean);
  if (!palavras.length || !palavras.every((p) => t.includes(p))) return 0;
  return (t.startsWith(palavras[0]) ? 3 : 1) + (t === chave(pesquisa) ? 5 : 0);
}
