// Caminhos do Firestore centralizados. Os grupos usam os mesmos households/{hid} do antigo casal,
// por isso os dados existentes continuam a funcionar sem migração.
import { db, APP_ID, doc, collection } from './firebase.js';
import { session } from '../core/state.js';
import { espacoPara } from './espacos.js';

const root = ['artifacts', APP_ID];

export const profileDoc = (uid = session.uid) => doc(db, ...root, 'public', 'data', 'profiles', uid);
export const profilesCol = () => collection(db, ...root, 'public', 'data', 'profiles');

/** Coleção dentro do utilizador: userCol('tarefas') ou userCol('carros', carId, 'pastas'). */
export const userCol = (...segments) => collection(db, ...root, 'users', session.uid, ...segments);
export const userDoc = (...segments) => doc(db, ...root, 'users', session.uid, ...segments);
export const otherUserCol = (uid, ...segments) => collection(db, ...root, 'users', uid, ...segments);
export const otherUserDoc = (uid, ...segments) => doc(db, ...root, 'users', uid, ...segments);

/**
 * Espaço partilhado do grupo ativo (família, amigos, casal...). Sem grupo cai no espaço pessoal,
 * e uma página partilhada com outras pessoas vai para partilhas/{sid} (ver espacos.js).
 * Assim os módulos funcionam igual em todos os casos.
 */
const ctx = () => ({ uid: session.uid, householdId: session.householdId, household: session.household, profile: session.profile });
export const spaceSegments = (segments = []) => espacoPara(segments, ctx());
export const sharedCol = (...segments) => collection(db, ...root, ...spaceSegments(segments), ...segments);
export const sharedDoc = (...segments) => doc(db, ...root, ...spaceSegments(segments), ...segments);
/** Pasta no Firebase Storage correspondente ao espaço atual (ver storage.rules). */
export const storageScope = () => (session.householdId ? ['households', session.householdId] : ['users', session.uid]).join('/');

export const householdsCol = () => collection(db, ...root, 'households');
export const householdDoc = (hid = session.householdId) => doc(db, ...root, 'households', hid);
export const householdColOf = (hid, ...segments) => collection(db, ...root, 'households', hid, ...segments);
export const householdDocOf = (hid, ...segments) => doc(db, ...root, 'households', hid, ...segments);
export const partilhaDoc = (sid) => doc(db, ...root, 'partilhas', sid);
export const partilhasCol = () => collection(db, ...root, 'partilhas');
export const partilhaDocOf = (sid, ...segments) => doc(db, ...root, 'partilhas', sid, ...segments);
export const partilhaColOf = (sid, ...segments) => collection(db, ...root, 'partilhas', sid, ...segments);
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
