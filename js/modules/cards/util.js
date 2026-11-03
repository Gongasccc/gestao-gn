// Funções puras dos Cartões (testadas em tests/cartoes.test.mjs).

/** Aceita "continente.pt/folheto" e acrescenta https://. Devolve '' se não for um link válido. */
export function normalizarLink(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  const comEsquema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : '';
  } catch { return ''; }
}
