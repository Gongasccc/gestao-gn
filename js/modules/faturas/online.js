// Pesquisa de um produto nas lojas online portuguesas.
// Nenhuma cadeia portuguesa tem uma API pública de preços, e ler as páginas delas por trás
// (scraping) vai contra os termos e o robots.txt dos sites e precisaria de um servidor.
// Por isso a app abre a pesquisa oficial de cada loja, com o nome padrão já escrito,
// e compara com os preços que vocês pagaram (das faturas).

const google = (site) => (q) => `https://www.google.com/search?q=${encodeURIComponent(`${q} site:${site}`)}`;

export const LOJAS_ONLINE = [
  { id: 'continente', nome: 'Continente', url: (q) => `https://www.continente.pt/pesquisa/?q=${encodeURIComponent(q)}` },
  { id: 'pingodoce', nome: 'Pingo Doce', url: google('pingodoce.pt') },
  { id: 'auchan', nome: 'Auchan', url: (q) => `https://www.auchan.pt/pt/pesquisa?q=${encodeURIComponent(q)}` },
  { id: 'intermarche', nome: 'Intermarché', url: google('intermarche.pt') },
  { id: 'elcorteingles', nome: 'El Corte Inglés', url: (q) => `https://www.elcorteingles.pt/supermercado/pesquisa/?term=${encodeURIComponent(q)}` },
  { id: 'lidl', nome: 'Lidl (folheto)', url: (q) => `https://www.lidl.pt/q/search?q=${encodeURIComponent(q)}` },
  { id: 'kuantokusta', nome: 'KuantoKusta', url: (q) => `https://www.kuantokusta.pt/search?q=${encodeURIComponent(q)}` },
  { id: 'google', nome: 'Google Shopping', url: (q) => `https://www.google.com/search?tbm=shop&hl=pt-PT&gl=pt&q=${encodeURIComponent(q)}` },
];

/** Termo de pesquisa a partir do nome padrão: sem "×" e com a embalagem simplificada. */
export function termoPesquisa(nome) {
  return String(nome || '')
    .replace(/\s*×\s*/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

export function linkPesquisa(lojaId, nome) {
  const loja = LOJAS_ONLINE.find((l) => l.id === lojaId);
  return loja ? loja.url(termoPesquisa(nome)) : '';
}
