// Netlify Function: vai buscar a página de uma receita do lado do servidor, para contornar o CORS
// do browser. Usada pelo "Importar da web" do Livro de Receitas (js/modules/recipes/importer.js).
// GET /.netlify/functions/receita?url=https://…  → HTML da página.

const MAX_BYTES = 3 * 1024 * 1024;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

export default async (req) => {
  const target = new URL(req.url).searchParams.get('url') || '';
  let url;
  try {
    url = new URL(target);
  } catch {
    return new Response('URL inválido', { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname) || url.hostname.endsWith('.internal')) {
    return new Response('URL não permitido', { status: 400 });
  }
  // 1) Pedido direto (como um browser). 2) Se o site bloquear ou só mostrar a receita com JavaScript,
  // pede a página já renderizada ao leitor r.jina.ai.
  const direto = await buscar(url.href, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  });
  const temReceita = (h) => h && /"@type"\s*:\s*\[?\s*"Recipe"/i.test(h);
  if (temReceita(direto)) return pagina(direto);
  const renderizada = await buscar(`https://r.jina.ai/${url.href}`, { 'X-Return-Format': 'html' }, 25000);
  if (temReceita(renderizada)) return pagina(renderizada);
  const melhor = [direto, renderizada].filter(Boolean).sort((a, b) => b.length - a.length)[0];
  return melhor ? pagina(melhor) : new Response('Não foi possível abrir a página', { status: 502 });
};

async function buscar(href, headers, ms = 10000) {
  try {
    const res = await fetch(href, { redirect: 'follow', signal: AbortSignal.timeout(ms), headers });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!/html|text\/plain/.test(type)) return '';
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return '';
    return new TextDecoder().decode(buf);
  } catch {
    return '';
  }
}

const pagina = (html) => new Response(html, {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
});
