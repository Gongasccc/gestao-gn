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
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('html')) return new Response('A página não é HTML', { status: 415 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response('Página demasiado grande', { status: 413 });
    return new Response(buf, {
      status: res.ok ? 200 : 502,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  } catch {
    return new Response('Não foi possível abrir a página', { status: 502 });
  }
};
