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

export const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Folheto das cadeias mais comuns: link da página dos folhetos e dias em que costuma sair o novo
 * (0 = domingo). São sugestões para preencher o cartão; o casal pode mudar.
 */
export const FOLHETOS = {
  continente: { link: 'https://folhetos.continente.pt/', dias: [2] },
  pingodoce: { link: 'https://www.pingodoce.pt/folhetos/', dias: [2] },
  lidl: { link: 'https://www.lidl.pt/folhetos', dias: [1, 4] },
  auchan: { link: 'https://www.auchan.pt/pt/folhetos/', dias: [] },
  intermarche: { link: 'https://www.intermarche.pt/folhetos/', dias: [] },
};

const chave = (nome) => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Sugestão de folheto pelo nome do cartão ("Cartão Continente" -> continente). */
export function folhetoPadrao(nome) {
  const k = chave(nome);
  const id = Object.keys(FOLHETOS).find((m) => k.includes(m));
  return id ? FOLHETOS[id] : null;
}

/** Dias válidos, sem repetidos e por ordem da semana a começar na segunda. */
export function normalizarDias(dias) {
  const v = [...new Set((Array.isArray(dias) ? dias : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return v.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** "Novo folheto hoje", "amanhã" ou "à terça" — o próximo dia em que o folheto muda. '' sem dias. */
export function proximoFolheto(dias, hoje = new Date()) {
  const v = normalizarDias(dias);
  if (!v.length) return '';
  const d = hoje.getDay();
  const falta = Math.min(...v.map((x) => (x - d + 7) % 7));
  if (falta === 0) return 'Novo folheto hoje';
  if (falta === 1) return 'Novo folheto amanhã';
  const dia = (d + falta) % 7;
  return `Novo folheto ${dia === 0 || dia === 6 ? 'ao' : 'à'} ${DIAS_SEMANA[dia]}`;
}

/** "terça e sexta" */
export function listaDias(dias) {
  const nomes = normalizarDias(dias).map((d) => DIAS_SEMANA[d]);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : (nomes[0] || '');
}
