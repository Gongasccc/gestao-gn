// Foto da caixa a partir do nome: quando o medicamento é escrito à mão (sem foto), procura uma imagem
// da frente da embalagem na pesquisa de imagens do Bing. O browser não pode ler o Bing diretamente
// (CORS), por isso usamos os mesmos leitores/proxies públicos do importador de receitas.
import { miniatura, comLimite } from './imagem.js';

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

/** Lê os resultados da página de imagens do Bing: [{ url, miniatura }]. */
export function extrairImagensBing(pagina) {
  const vistos = new Set();
  const out = [];
  const texto = desfazer(String(pagina || ''));
  const re = /"murl":"(https?:[^"]+)"[^}]*?"turl":"(https?:[^"]+)"/g;
  let m;
  while ((m = re.exec(texto))) {
    const url = m[1].replace(/\\\//g, '/');
    if (vistos.has(url)) continue;
    vistos.add(url);
    out.push({ url, miniatura: m[2].replace(/\\\//g, '/') });
  }
  return out;
}

export const termoPesquisa = (nome) => `${String(nome || '').trim()} caixa embalagem medicamento`;

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

/**
 * Devolve a foto da caixa como data URL (para guardar com o medicamento) ou, se não for possível
 * descarregá-la, o endereço da miniatura do Bing. Devolve '' se não encontrar nada.
 */
export async function procurarFotoCaixa(nome) {
  if (!String(nome || '').trim()) return '';
  const pesquisa = `https://www.bing.com/images/search?q=${encodeURIComponent(termoPesquisa(nome))}&form=HDRSC2`;
  const pagina = await buscar(PAGINAS, pesquisa, 'texto');
  const resultados = extrairImagensBing(pagina).slice(0, 4);
  for (const r of resultados) {
    for (const src of [r.url, r.miniatura]) {
      const blob = await buscar(IMAGENS, src, 'imagem');
      const foto = blob && await miniatura(blob);
      if (foto) return foto;
    }
  }
  return resultados[0]?.miniatura || '';
}
