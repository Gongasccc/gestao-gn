import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairImagensBing, termoPesquisa } from '../js/modules/farmacia/fotoWeb.js';

test('lê imagens da página do Bing', () => {
  const pagina = `<a class="iusc" m="{&quot;cid&quot;:&quot;a&quot;,&quot;purl&quot;:&quot;https://farmacia.pt/p&quot;,&quot;murl&quot;:&quot;https://farmacia.pt/ben-u-ron.jpg&quot;,&quot;turl&quot;:&quot;https://tse1.mm.bing.net/th?id=OIP.1&amp;pid=15.1&quot;}">x</a>
    <a class="iusc" m="{&quot;murl&quot;:&quot;https://farmacia.pt/ben-u-ron.jpg&quot;,&quot;turl&quot;:&quot;https://tse1.mm.bing.net/th?id=OIP.1&quot;}"></a>
    <a class="iusc" m="{&quot;murl&quot;:&quot;https://outra.pt/caixa.png&quot;,&quot;turl&quot;:&quot;https://tse2.mm.bing.net/th?id=OIP.2&quot;}"></a>`;
  assert.deepEqual(extrairImagensBing(pagina), [
    { url: 'https://farmacia.pt/ben-u-ron.jpg', miniatura: 'https://tse1.mm.bing.net/th?id=OIP.1&pid=15.1' },
    { url: 'https://outra.pt/caixa.png', miniatura: 'https://tse2.mm.bing.net/th?id=OIP.2' },
  ]);
  assert.deepEqual(extrairImagensBing(''), []);
});

test('termo de pesquisa pede a caixa', () => {
  assert.equal(termoPesquisa(' Paracetamol 1000 '), 'Paracetamol 1000 caixa embalagem medicamento');
});
