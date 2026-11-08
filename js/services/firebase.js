// Inicialização única do Firebase. Todos os módulos importam daqui.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

export {
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove,
  orderBy,
  limit,
  serverTimestamp,
  deleteField,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// A configuração web do Firebase é pública por natureza; a segurança vem das regras do Firestore.
const firebaseConfig = {
  apiKey: 'AIzaSyA0eKe5JypkhtfrssIie0BA5g_2QMzr5d0',
  authDomain: 'gestao-gn.firebaseapp.com',
  projectId: 'gestao-gn',
  storageBucket: 'gestao-gn.firebasestorage.app',
  appId: '1:443510448711:web:a615ebd9cf2ec549e60762',
};

export const app = initializeApp(firebaseConfig);
// Cache local persistente: a app abre e mostra os dados mesmo sem rede, e sincroniza depois.
// No iPhone a base de dados local (IndexedDB) pode ficar bloqueada e não responder; se não responder
// depressa, esta abertura usa só memória. Nada é apagado: as alterações guardadas no telemóvel
// continuam lá e são enviadas numa próxima abertura em que a base de dados responda.
const NOME_CACHE = `firestore/[DEFAULT]/${firebaseConfig.projectId}/main`;

function abreA(nome, ms) {
  return new Promise((ok) => {
    let fim = false;
    const acabar = (v) => { if (!fim) { fim = true; ok(v); } };
    setTimeout(() => acabar(false), ms);
    try {
      const r = indexedDB.open(nome); // sem versão: nunca altera a base de dados
      r.onsuccess = () => { try { r.result.close(); } catch { /* nada */ } acabar(true); };
      r.onerror = () => acabar(false);
      r.onblocked = () => acabar(false);
    } catch { acabar(false); }
  });
}

async function cacheLocalResponde() {
  if (typeof indexedDB === 'undefined') return false;
  try {
    // Só abre a base do Firestore se já existir (abrir uma que não existe criava-a vazia e estragava-a).
    const existe = indexedDB.databases
      ? (await Promise.race([indexedDB.databases(), new Promise((ok) => setTimeout(() => ok(null), 2500))]))
      : [];
    if (existe === null) return false;
    const nome = existe.some((d) => d.name === NOME_CACHE) ? NOME_CACHE : 'ninho-sonda';
    return await abreA(nome, 2500);
  } catch {
    return false;
  }
}

export const cacheLocalAtiva = await cacheLocalResponde();
if (!cacheLocalAtiva) console.warn('[firebase] base de dados local não respondeu: esta abertura usa só memória');

export const db = initializeFirestore(app, {
  localCache: cacheLocalAtiva
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache(),
});
export const auth = getAuth(app);
export const APP_ID = 'gestao-gn-app';
