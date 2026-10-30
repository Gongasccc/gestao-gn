// Inicialização única do Firebase. Todos os módulos importam daqui.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
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
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const APP_ID = 'gestao-gn-app';
