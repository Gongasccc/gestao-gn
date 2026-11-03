import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairImagensBing, termoPesquisa, imagemDaPagina, enderecosValidos } from '../js/modules/farmacia/fotoWeb.js';

test('lê só os resultados reais da página do Bing', () => {
  const m = (o) => JSON.stringify(o).replace(/"/g, '&quot;').replace(/&(?!quot;)/g, '&amp;');
  const pagina = `<a class="iusc" style="x" m="${m({ murl: 'https://farmacia.pt/ben-u-ron.jpg', turl: 'https://tse1.mm.bing.net/th?id=OIP.1&pid=15.1', t: 'Ben-u-ron 1000' })}" href="#">x</a>
    <div m="${m({ murl: 'https://filmes.com/capa.jpg', turl: 'https://tse3.mm.bing.net/th?id=OIP.3' })}" class="outro"></div>
    <a m="${m({ murl: 'https://farmacia.pt/ben-u-ron.jpg', turl: 'https://tse1.mm.bing.net/th?id=OIP.1' })}" class="iusc"></a>
    <a class="iusc" m="${m({ murl: 'https://outra.pt/caixa.png', turl: 'https://tse2.mm.bing.net/th?id=OIP.2' })}"></a>`;
  assert.deepEqual(extrairImagensBing(pagina), [
    { url: 'https://farmacia.pt/ben-u-ron.jpg', miniatura: 'https://tse1.mm.bing.net/th?id=OIP.1&pid=15.1', titulo: 'Ben-u-ron 1000' },
    { url: 'https://outra.pt/caixa.png', miniatura: 'https://tse2.mm.bing.net/th?id=OIP.2', titulo: '' },
  ]);
  assert.deepEqual(extrairImagensBing(''), []);
});

test('termo de pesquisa pede a caixa', () => {
  assert.equal(termoPesquisa(' Paracetamol 1000 '), 'Paracetamol 1000 embalagem caixa farmácia');
});

test('lê a imagem principal de uma página de produto', () => {
  assert.equal(imagemDaPagina('<head><meta property="og:image" content="https://loja.pt/img/ben-u-ron.jpg?a=1&amp;b=2"></head>'), 'https://loja.pt/img/ben-u-ron.jpg?a=1&b=2');
  assert.equal(imagemDaPagina('<meta content="/media/caixa.png" name="twitter:image">', 'https://loja.pt/p/x'), 'https://loja.pt/media/caixa.png');
  assert.equal(imagemDaPagina('<script type="application/ld+json">{"@type":"Product","image":["https://loja.pt/c.webp"]}</script>'), 'https://loja.pt/c.webp');
  assert.equal(imagemDaPagina('<p>sem imagem</p>'), '');
});

test('filtra endereços de páginas', () => {
  assert.deepEqual(enderecosValidos(['https://a.pt/p', 'nada', 'https://a.pt/p', 'ftp://x', 'http://b.pt']), ['https://a.pt/p', 'http://b.pt/']);
});
