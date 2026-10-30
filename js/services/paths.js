// Caminhos do Firestore centralizados. A estrutura de dados é a mesma da versão anterior,
// por isso os dados existentes continuam a funcionar sem migração.
import { db, APP_ID, doc, collection } from './firebase.js';
import { session } from '../core/state.js';

const root = ['artifacts', APP_ID];

export const profileDoc = (uid = session.uid) => doc(db, ...root, 'public', 'data', 'profiles', uid);
export const profilesCol = () => collection(db, ...root, 'public', 'data', 'profiles');

/** Coleção dentro do utilizador: userCol('tarefas') ou userCol('carros', carId, 'pastas'). */
export const userCol = (...segments) => collection(db, ...root, 'users', session.uid, ...segments);
export const userDoc = (...segments) => doc(db, ...root, 'users', session.uid, ...segments);
export const otherUserCol = (uid, ...segments) => collection(db, ...root, 'users', uid, ...segments);
export const otherUserDoc = (uid, ...segments) => doc(db, ...root, 'users', uid, ...segments);

/**
 * Espaço partilhado do casal. Se o utilizador ainda não tem casal, cai no espaço pessoal,
 * por isso os módulos funcionam igual nos dois casos.
 */
export const spaceSegments = () => (session.householdId
  ? ['households', session.householdId]
  : ['users', session.uid]);
export const sharedCol = (...segments) => collection(db, ...root, ...spaceSegments(), ...segments);
export const sharedDoc = (...segments) => doc(db, ...root, ...spaceSegments(), ...segments);
/** Pasta no Firebase Storage correspondente ao espaço atual (ver storage.rules). */
export const storageScope = () => spaceSegments().join('/');

export const householdsCol = () => collection(db, ...root, 'households');
export const householdDoc = (hid = session.householdId) => doc(db, ...root, 'households', hid);
export const householdColOf = (hid, ...segments) => collection(db, ...root, 'households', hid, ...segments);
export const householdDocOf = (hid, ...segments) => doc(db, ...root, 'households', hid, ...segments);
export const inviteDoc = (code) => doc(db, ...root, 'invites', code);
/** Nome de utilizador -> email de recuperação (lido antes de iniciar sessão). */
export const loginDoc = (key) => doc(db, ...root, 'logins', key);
export const userColOf = (uid, ...segments) => collection(db, ...root, 'users', uid, ...segments);

export const tripsCol = () => collection(db, ...root, 'viagens_partilhadas');
export const tripDoc = (tripId) => doc(db, ...root, 'viagens_partilhadas', tripId);
export const tripCol = (tripId, sub) => collection(db, ...root, 'viagens_partilhadas', tripId, sub);
export const tripSubDoc = (tripId, sub, id) => doc(db, ...root, 'viagens_partilhadas', tripId, sub, id);

/** Converte um QuerySnapshot num array de objetos com id. */
export const snapToList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
