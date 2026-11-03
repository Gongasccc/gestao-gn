// Validades, contagem decrescente e links oficiais.
const DIA = 86_400_000;
export const DIAS_ALERTA = 30;

// Validade guardada como 'AAAA-MM-DD' (ou 'AAAA-MM' quando a embalagem só tem mês/ano).
// O medicamento vale até ao fim desse dia (ou do último dia do mês).
export function fimValidade(validade) {
  if (!validade) return null;
  const [a, m, d] = validade.split('-').map(Number);
  if (!a || !m) return null;
  return d ? new Date(a, m - 1, d, 23, 59, 59) : new Date(a, m, 0, 23, 59, 59);
}

export function estadoValidade(validade, agora = Date.now()) {
  const fim = fimValidade(validade);
  if (!fim) return { estado: 'sem', ms: Infinity };
  const ms = fim.getTime() - agora;
  if (ms <= 0) return { estado: 'expirado', ms };
  if (ms <= DIAS_ALERTA * DIA) return { estado: 'alerta', ms };
  return { estado: 'ok', ms };
}

const dois = (n) => String(n).padStart(2, '0');

export function textoContagem(validade, agora = Date.now()) {
  const { estado, ms } = estadoValidade(validade, agora);
  if (estado === 'sem') return 'Sem validade';
  if (estado === 'expirado') {
    const dias = Math.floor(-ms / DIA);
    return dias === 0 ? 'Expirou hoje' : `Expirado há ${dias} dia${dias === 1 ? '' : 's'}`;
  }
  if (estado === 'ok') return `Válido até ${formatarData(validade)}`;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  return `${d}d ${dois(Math.floor((s % 86400) / 3600))}h ${dois(Math.floor((s % 3600) / 60))}m ${dois(s % 60)}s`;
}

export function formatarData(validade) {
  const [a, m, d] = (validade || '').split('-');
  if (!a) return '';
  return d ? `${d}/${m}/${a}` : `${m}/${a}`;
}

// Infarmed (INFOMED) é a fonte oficial em Portugal para o Folheto Informativo e o RCM.
const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/**
 * Fontes da informação de um medicamento: só endereços exatos de páginas que a pesquisa Google
 * encontrou. Um endereço dito pela IA só é aceite se o domínio estiver entre as páginas da pesquisa
 * (para não mostrar links inventados). Se nenhum passar, usa os links da própria pesquisa.
 * paginasPesquisa: [{ url, titulo }] (titulo = domínio da página, como a Google o devolve).
 */
export function fontesValidas(propostas, paginasPesquisa = []) {
  const dominiosPesquisa = new Set(paginasPesquisa.map((p) => String(p.titulo || dominio(p.url)).replace(/^www\./, '').toLowerCase()));
  const out = [];
  for (const f of propostas || []) {
    const url = String(f?.url || '');
    const d = dominio(url);
    if (!/^https?:\/\//.test(url) || !d || out.some((o) => o.url === url)) continue;
    if (dominiosPesquisa.size && ![...dominiosPesquisa].some((x) => d === x || d.endsWith(`.${x}`) || x.endsWith(`.${d}`))) continue;
    out.push({ titulo: String(f.titulo || d), fonte: d, url });
  }
  if (!out.length) {
    for (const p of paginasPesquisa) {
      if (!/^https?:\/\//.test(p.url || '') || out.some((o) => o.url === p.url)) continue;
      const d = String(p.titulo || dominio(p.url));
      out.push({ titulo: d, fonte: d, url: p.url });
    }
  }
  return out.slice(0, 6);
}

// ---------- Inventário ----------
// quantidade: unidades que ainda há em casa; tomaDiaria: unidades por dia (opcional).
export const STOCK_BAIXO = 5;
export const DIAS_STOCK_ALERTA = 7;

export function diasRestantes(m) {
  const q = Number(m?.quantidade);
  const t = Number(m?.tomaDiaria);
  if (!Number.isFinite(q) || !Number.isFinite(t) || t <= 0) return null;
  return Math.floor(q / t);
}

export function dataFimStock(m, agora = new Date()) {
  const d = diasRestantes(m);
  if (d == null) return null;
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  fim.setDate(fim.getDate() + d);
  return fim;
}

/** 'sem' (sem inventário), 'vazio', 'baixo' ou 'ok'. */
export function estadoStock(m) {
  if (m?.quantidade == null || m.quantidade === '') return 'sem';
  const q = Number(m.quantidade);
  if (q <= 0) return 'vazio';
  const d = diasRestantes(m);
  if ((d != null && d <= DIAS_STOCK_ALERTA) || (d == null && q <= STOCK_BAIXO)) return 'baixo';
  return 'ok';
}

export function textoStock(m) {
  if (m?.quantidade == null || m.quantidade === '') return '';
  const q = Number(m.quantidade);
  const u = m.unidade || 'unidades';
  if (q <= 0) return `Acabou`;
  return `${q} ${q === 1 ? u.replace(/s$/, '') : u}`;
}

export function textoFimStock(m, agora = new Date()) {
  const d = diasRestantes(m);
  if (d == null) return '';
  if (d <= 0) return 'Acaba hoje';
  const fim = dataFimStock(m, agora);
  const dt = `${String(fim.getDate()).padStart(2, '0')}/${String(fim.getMonth() + 1).padStart(2, '0')}`;
  return `Dá para ${d} dia${d === 1 ? '' : 's'} (até ${dt})`;
}

export const chaveNome = (nome) => String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
