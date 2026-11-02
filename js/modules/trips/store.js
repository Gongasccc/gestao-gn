// Estado partilhado entre os ficheiros do módulo Viagens.
import { session } from '../../core/state.js';
import { iconSvg } from '../../core/icons.js';

export const FALLBACK_COVER = 'https://images.unsplash.com/photo-1488646953014-c8bf089f81d1?w=1000&q=70';

export const tripState = {
  trips: [],
  currentTripId: null,
  expenses: [],
  timeline: [],
  friends: [],
};

export const currentTrip = () => tripState.trips.find((t) => t.id === tripState.currentTripId) || null;
export const members = () => currentTrip()?.membros_info || [];
// Inclui pessoas sem conta (convidados), que só existem em membros_info.
export const memberIds = () => (members().length ? members().map((m) => m.uid) : [session.uid]);
export const isGuest = (m) => !!m?.convidado;
export const memberName = (uid) => members().find((m) => m.uid === uid)?.nome || 'Alguém';

export const CATEGORIES = [
  { nome: 'Café', icon: 'coffee', words: ['café', 'cafe', 'galão', 'pastel'] },
  { nome: 'Restauração', icon: 'restaurant', words: ['jantar', 'almoço', 'restaurante', 'comida', 'pizza', 'uber eats', 'ubereats', 'bolt food', 'lanche', 'pequeno-almoço'] },
  { nome: 'Supermercado', icon: 'cart', words: ['supermercado', 'continente', 'pingo', 'lidl', 'auchan', 'mercadona', 'intermarché'] },
  { nome: 'Vestuário', icon: 'bag', words: ['roupa', 'zara', 'compras', 'sapatos', 'primark'] },
  { nome: 'Casa & Mobília', icon: 'home', words: ['mobília', 'mobilia', 'casa', 'ikea', 'decoração'] },
  { nome: 'Transportes', icon: 'fuel', words: ['gasolina', 'combustível', 'gasóleo', 'posto', 'portagem', 'uber', 'bolt', 'comboio', 'metro', 'avião', 'voo', 'táxi', 'parque'] },
  { nome: 'Alojamento', icon: 'bed', words: ['hotel', 'airbnb', 'alojamento', 'quarto', 'hostel'] },
  { nome: 'Lazer', icon: 'play', words: ['bilhete', 'museu', 'bar', 'festa', 'gin', 'cinema', 'concerto', 'parque'] },
  { nome: 'Geral', icon: 'coin', words: [] },
];

export function categoryFor(text = '') {
  const t = text.toLowerCase();
  const match = CATEGORIES.find((c) => c.words.some((w) => t.includes(w)));
  return match ? { nome: match.nome, icon: match.icon } : { nome: 'Geral', icon: 'coin' };
}

export const categoryIcon = (text) => iconSvg(categoryFor(text).icon, 20);

/** Categoria de uma despesa: a escolhida no formulário, ou adivinhada pela descrição. */
export function expenseCategory(e) {
  const c = CATEGORIES.find((x) => x.nome === e.categoria);
  return c ? { nome: c.nome, icon: c.icon } : categoryFor(e.desc);
}
export const isSettlement = (e) => e.tipo === 'liquidacao' || (e.valor === 0 && /^Liquidação/.test(e.desc || ''));
