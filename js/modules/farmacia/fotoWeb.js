// Foto da caixa a partir do nome: quando o medicamento é escrito à mão (sem foto), procura uma imagem
// da frente da embalagem na pesquisa de imagens do Bing. O browser não pode ler o Bing diretamente
// (CORS), por isso usamos os mesmos leitores/proxies públicos do importador de receitas.
import { miniatura, comLimite, reduzirParaIA } from './imagem.js';

const PAGINAS = [
  { build: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html' } },
  { build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
];
const IMAGENS = [
  { build: (u) => u },
  { build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
];

const desfazer = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

/** Lê os resultados da página de imagens do Bing (só os resultados reais, links "iusc"): [{ url, miniatura, titulo }]. */
export function extrairImagensBing(pagina) {
  const vistos = new Set();
  const out = [];
  const html = String(pagina || '');
  const re = /class="iusc"[^>]*?\sm="([^"]+)"|\sm="([^"]+)"[^>]*?class="iusc"/g;
  let m;
  while ((m = re.exec(html))) {
    let dados;
    try { dados = JSON.parse(desfazer(m[1] || m[2])); } catch { continue; }
    const url = dados?.murl;
    if (!/^https?:/.test(url || '') || vistos.has(url)) continue;
    vistos.add(url);
    out.push({ url, miniatura: dados.turl || url, titulo: String(dados.t || '') });
  }
  return out;
}

export const termoPesquisa = (nome) => `${String(nome || '').trim()} embalagem caixa farmácia`;

async function buscar(lista, url, tipo) {
  for (const p of lista) {
    try {
      const res = await comLimite(fetch(p.build(url), { headers: p.headers || {} }), 12_000);
      if (!res.ok) continue;
      if (tipo === 'texto') {
        const t = await res.text();
        if (t.includes('murl')) return t;
      } else {
        const b = await res.blob();
        if (b.size > 2000 && /^image\//.test(b.type || 'image/')) return b;
      }
    } catch { /* tenta o seguinte */ }
  }
  return null;
}

// A pesquisa de imagens às vezes traz resultados sem relação (capas de filmes, anúncios): a IA vê as
// miniaturas e escolhe a que mostra mesmo a frente da caixa deste medicamento, ou nenhuma.
async function escolherComIA(descricao, candidatos) {
  const partes = [{ texto: `Estas ${candidatos.length} imagens vêm de uma pesquisa na web, numeradas de 0 a ${candidatos.length - 1} pela ordem em que aparecem.
Qual mostra a FRENTE DA CAIXA (embalagem) do medicamento "${descricao}"? Tem de ser a embalagem desse medicamento (nome e dosagem compatíveis), não um blister solto, frasco de outro produto, pessoa, filme ou anúncio.
Responde APENAS com JSON: {"indice": número da melhor imagem, ou null se nenhuma servir}.` }];
  for (const c of candidatos) partes.push({ base64: c.base64, mime: 'image/jpeg' });
  const { pedirJson } = await import('../../services/gemini.js');
  const r = await pedirJson(partes);
  const i = Number(r?.indice);
  return Number.isInteger(i) && i >= 0 && i < candidatos.length ? i : -1;
}

/**
 * Devolve a foto da frente da caixa como data URL (para guardar com o medicamento), ou '' se não
 * encontrar nenhuma imagem que a IA confirme ser a embalagem certa.
 */
export async function procurarFotoCaixa(descricao) {
  if (!String(descricao || '').trim()) return '';
  const pesquisa = `https://www.bing.com/images/search?q=${encodeURIComponent(termoPesquisa(descricao))}&form=HDRSC2`;
  const pagina = await buscar(PAGINAS, pesquisa, 'texto');
  const resultados = extrairImagensBing(pagina).slice(0, 6);
  // Miniaturas pequenas para a IA comparar.
  const candidatos = [];
  for (const r of resultados) {
    const blob = await buscar(IMAGENS, r.miniatura, 'imagem');
    const base64 = blob && await reduzirParaIA(blob).catch(() => '');
    if (base64) candidatos.push({ ...r, blob, base64 });
  }
  if (!candidatos.length) return '';
  const escolhido = candidatos[await escolherComIA(descricao, candidatos)];
  if (!escolhido) return '';
  const grande = await buscar(IMAGENS, escolhido.url, 'imagem');
  return (grande && await miniatura(grande)) || await miniatura(escolhido.blob) || '';
}
