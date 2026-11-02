// Código QR das faturas portuguesas (Portaria n.º 195/2020).
// Todas as faturas e talões emitidos em Portugal têm um QR com os dados fiscais do documento:
//   A:NIF emitente*B:NIF adquirente*C:país*D:tipo*E:estado*F:data AAAAMMDD*G:n.º documento*H:ATCUD*
//   I1:espaço fiscal*I2..I8:bases e IVA*N:total de impostos*O:total com impostos*Q:hash*R:certificado
// Ler o QR no próprio dispositivo dá a loja (pelo NIF), a data e o total sem enviar a fatura a ninguém.
import { arred } from './stats.js';

// NIF -> cadeia, para as lojas cujo NIF é o mesmo em todo o país. As outras (Intermarché, Spar, …)
// são franchisadas, com um NIF por loja: a app aprende o nome quando o utilizador o corrige.
export const LOJAS_NIF = {
  502011475: 'Continente',
  500829993: 'Pingo Doce',
  503340855: 'Lidl',
};

const TIPOS = {
  FT: 'Fatura', FS: 'Fatura simplificada', FR: 'Fatura-recibo', NC: 'Nota de crédito', ND: 'Nota de débito',
};

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Valida um NIF português (9 dígitos com dígito de controlo módulo 11). */
export function nifValido(nif) {
  const s = String(nif ?? '').replace(/\D/g, '');
  if (!/^[1-9]\d{8}$/.test(s)) return false;
  const soma = [...s.slice(0, 8)].reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const resto = soma % 11;
  const controlo = resto < 2 ? 0 : 11 - resto;
  return controlo === Number(s[8]);
}

/** Lê o texto de um QR da AT e devolve os campos (A, B, …, I7, O) ou null se não for um. */
export function lerCamposQr(texto) {
  if (typeof texto !== 'string' || !texto.includes('*')) return null;
  const campos = {};
  for (const parte of texto.trim().split('*')) {
    const i = parte.indexOf(':');
    if (i < 1) continue;
    campos[parte.slice(0, i).trim().toUpperCase()] = parte.slice(i + 1).trim();
  }
  if (!/^\d{9}$/.test(campos.A || '') || !campos.O || !/^\d{8}$/.test(campos.F || '')) return null;
  return campos;
}

/** Converte o QR da AT nos dados de uma fatura da app. lojasAprendidas: { nif: 'Nome' }. */
export function faturaDoQr(texto, lojasAprendidas = {}) {
  const c = lerCamposQr(texto);
  if (!c) return null;
  const somaIva = ['I4', 'I6', 'I8', 'J4', 'J6', 'J8', 'K4', 'K6', 'K8'].reduce((s, k) => s + num(c[k]), 0);
  const nifCliente = c.B && c.B !== '999999990' ? c.B : '';
  return {
    loja: lojasAprendidas[c.A] || LOJAS_NIF[c.A] || '',
    nif: c.A,
    nifCliente,
    data: `${c.F.slice(0, 4)}-${c.F.slice(4, 6)}-${c.F.slice(6, 8)}`,
    total: arred(num(c.O)),
    iva: arred(num(c.N) || somaIva),
    documento: c.G || '',
    tipoDocumento: TIPOS[c.D] || c.D || '',
    atcud: c.H && c.H !== '0' ? c.H : '',
    anulada: c.E === 'A',
  };
}
