// Ecrã de entrada/registo/recuperação e ciclo de vida da sessão.
// Os utilizadores entram com um "nome de utilizador", convertido num email interno.
// Quem associa um email real (para recuperar a password) passa a ter esse email na conta;
// guardamos logins/{utilizador} -> email para continuar a poder entrar com o nome de utilizador.
import { byId, show } from '../core/dom.js';
import { registerActions } from '../core/events.js';
import { session } from '../core/state.js';
import { alertDialog } from '../core/ui.js';
import { applyTheme, DEFAULT_ACCENT } from '../core/theme.js';
import {
  auth, getDoc, getDocFromCache, setDoc,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, verifyBeforeUpdateEmail,
} from '../services/firebase.js';
import { profileDoc, loginDoc } from '../services/paths.js';
import { loadHousehold } from '../services/household.js';
import { emit } from '../core/state.js';
import { comPrazo, guardarSessao, lerSessao, esquecerSessao } from '../services/arranque.js';

let mode = 'login'; // 'login' | 'register' | 'forgot'

// Contas antigas usam um email interno; quem associar um email real pode entrar com ele.
const INTERNAL_DOMAIN = '@gestaogn.app';
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const usernameKey = (username) => username.toLowerCase().replace(/[^a-z0-9]/g, '');
const usernameToEmail = (username) => (isEmail(username)
  ? username.toLowerCase()
  : `${usernameKey(username)}${INTERNAL_DOMAIN}`);

/** Email de recuperação associado a um nome de utilizador (ou null). Funciona sem sessão iniciada. */
async function recoveryEmailFor(username) {
  try {
    const snap = await getDoc(loginDoc(usernameKey(username)));
    return snap.exists() ? snap.data().email || null : null;
  } catch {
    return null;
  }
}

/** Mantém logins/{utilizador} atualizado com o email real da conta. */
async function syncLoginEmail(user, profile) {
  const key = usernameKey(profile?.username || '');
  if (!key || !user.email || user.email.endsWith(INTERNAL_DOMAIN)) return;
  try {
    await setDoc(loginDoc(key), { uid: user.uid, email: user.email.toLowerCase() });
  } catch (err) {
    console.warn('[auth] login email', err);
  }
}

export const hasRecoveryEmail = () => !!auth.currentUser?.email && !auth.currentUser.email.endsWith(INTERNAL_DOMAIN);

/** Associa um email real à conta (o Firebase envia um link de confirmação antes de o trocar). */
export async function setRecoveryEmail(email, username = session.profile?.username) {
  if (!isEmail(email)) throw new Error('Email inválido.');
  const clean = email.trim().toLowerCase();
  await verifyBeforeUpdateEmail(auth.currentUser, clean);
  // Guardado já, para que depois de confirmar o email se continue a entrar com o nome de utilizador.
  const key = usernameKey(username || '');
  if (key) await setDoc(loginDoc(key), { uid: auth.currentUser.uid, email: clean }).catch((err) => console.warn('[auth] login email', err));
}

const ERRORS = {
  'auth/invalid-credential': 'Utilizador ou password incorretos.',
  'auth/wrong-password': 'Utilizador ou password incorretos.',
  'auth/user-not-found': 'Utilizador ou password incorretos.',
  'auth/email-already-in-use': 'Esse nome de utilizador já existe.',
  'auth/weak-password': 'A password deve ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiadas tentativas. Tenta daqui a pouco.',
  'auth/network-request-failed': 'Sem ligação à internet.',
  'auth/invalid-email': 'Email inválido.',
  'auth/missing-email': 'Escreve o teu email.',
  'auth/requires-recent-login': 'Por segurança, termina sessão e volta a entrar antes de mudar o email.',
};

function showError(msg) {
  const el = byId('auth-error');
  el.textContent = msg;
  el.hidden = !msg;
  if (msg) {
    const box = byId('auth-card');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }
}

const MODES = {
  login: { title: 'Bem-vindos de volta', submit: 'Entrar', toggle: 'Não tens conta? Cria uma aqui.' },
  register: { title: 'Criar conta', submit: 'Registar e entrar', toggle: 'Já tens conta? Entra aqui.' },
  forgot: { title: 'Recuperar password', submit: 'Enviar link', toggle: 'Voltar a entrar' },
};

function setMode(next) {
  mode = next;
  const m = MODES[mode];
  byId('auth-title').textContent = m.title;
  byId('auth-submit').textContent = m.submit;
  byId('auth-toggle').textContent = m.toggle;
  byId('auth-confirm-wrap').classList.toggle('is-open', mode === 'register');
  byId('auth-email-wrap').classList.toggle('is-open', mode === 'register');
  byId('auth-password').hidden = mode === 'forgot';
  byId('auth-forgot').hidden = mode !== 'login';
  byId('auth-hint').hidden = mode !== 'forgot';
  byId('auth-username').placeholder = mode === 'register' ? 'Nome de utilizador' : 'Utilizador ou email';
  showError('');
}

async function signIn(username, password) {
  try {
    await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  } catch (err) {
    // Quem associou um email real já não tem o email interno: tenta com o email de recuperação.
    const retry = !isEmail(username) && ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(err.code);
    const email = retry ? await recoveryEmailFor(username) : null;
    if (!email) throw err;
    await signInWithEmailAndPassword(auth, email, password);
  }
}

async function register(username, password) {
  if (isEmail(username)) throw new Error('No registo usa um nome de utilizador (o email vai no campo de baixo).');
  if (password !== byId('auth-confirm').value) throw new Error('As passwords não coincidem.');
  const email = byId('auth-email').value.trim();
  if (email && !isEmail(email)) throw new Error('O email de recuperação não é válido.');
  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
  await setDoc(profileDoc(cred.user.uid), {
    uid: cred.user.uid,
    username,
    searchName: username.toLowerCase(),
    theme: 'dark',
    accentColor: DEFAULT_ACCENT,
    avatarUrl: '',
    allowNotifications: false,
  });
  if (email) {
    try { await setRecoveryEmail(email, username); } catch (err) { console.warn('[auth] email de recuperação', err); }
  }
}

async function sendReset(typed) {
  const email = isEmail(typed) ? typed.toLowerCase() : await recoveryEmailFor(typed);
  if (!email) {
    throw new Error('Não encontrámos um email de recuperação para esta conta. Se já associaste um, escreve-o aqui diretamente. Se nunca associaste, não é possível enviar o link: quando voltares a entrar, associa um em Definições.');
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err.code === 'auth/network-request-failed' || err.code === 'auth/too-many-requests') throw err;
    /* não revelar se o email existe */
  }
  const masked = email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${'•'.repeat(Math.min(b.length, 6))}${c}`);
  await alertDialog(`Enviámos um link para ${masked}. Abre-o, define a nova password e volta aqui para entrar. Se não o vires, procura no spam.`, 'Verifica o teu email');
  setMode('login');
}

async function submit() {
  const username = byId('auth-username').value.trim();
  const password = byId('auth-password').value;
  if (!username) return showError(mode === 'forgot' ? 'Escreve o teu utilizador ou email.' : 'Preenche o utilizador e a password.');
  if (mode !== 'forgot' && !password) return showError('Preenche o utilizador e a password.');
  if (!/[a-z0-9]/i.test(username)) return showError('O utilizador deve ter letras ou números.');

  const btn = byId('auth-submit');
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    if (mode === 'login') await signIn(username, password);
    else if (mode === 'register') await register(username, password);
    else await sendReset(username);
  } catch (err) {
    showError(ERRORS[err.code] || (!err.code && err.message) || 'Não foi possível entrar. Verifica os dados.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

function aplicarPerfil(user, p, { sincronizar = true } = {}) {
  session.profile = p || {};
  session.name = p?.username || 'Utilizador';
  session.avatar = p?.avatarUrl || '';
  if (p?.theme) applyTheme(p.theme);
  if (p && sincronizar) syncLoginEmail(user, p);
}

/** Lê o perfil do servidor; se demorar, usa a cópia do Firestore no telemóvel. */
async function lerPerfil(uid, rapido) {
  try {
    return await comPrazo(getDoc(profileDoc(uid)), rapido ? 3000 : 6000);
  } catch (err) {
    console.warn('[auth] perfil do servidor', err?.message);
    return comPrazo(getDocFromCache(profileDoc(uid)), 2000);
  }
}

// Nunca deixa a entrada presa: se o Firestore não responder, abre com a última sessão guardada
// e atualiza em segundo plano quando ele responder.
async function loadProfile(user) {
  session.uid = user.uid;
  const guardada = lerSessao(user.uid);
  try {
    const snap = await lerPerfil(user.uid, !!guardada);
    aplicarPerfil(user, snap.exists() ? snap.data() : null);
    await comPrazo(loadHousehold(session.profile), 8000);
    guardarSessao(user.uid, session);
    return;
  } catch (err) {
    console.warn('[auth] perfil', err?.message || err);
  }
  if (guardada) {
    aplicarPerfil(user, guardada.profile, { sincronizar: false });
    session.householdId = guardada.profile?.householdId || null;
    session.household = guardada.household || null;
    session.members = guardada.members?.length ? guardada.members
      : [{ uid: session.uid, name: session.name, avatar: session.avatar }];
  } else {
    // Sem cópia guardada: usa o que se conseguiu ler (o perfil pode ter vindo e só o casal falhou).
    if (!session.profile?.username) aplicarPerfil(user, null, { sincronizar: false });
    session.householdId = session.profile?.householdId || null;
    session.members = [{ uid: session.uid, name: session.name, avatar: session.avatar }];
  }
  atualizarDepois(user);
}

/** Depois de abrir com a sessão guardada, confirma no servidor e corrige se algo mudou. */
function atualizarDepois(user) {
  const antes = session.householdId;
  getDoc(profileDoc(user.uid)).then(async (snap) => {
    if (session.uid !== user.uid || !snap.exists()) return;
    aplicarPerfil(user, snap.data());
    await loadHousehold(session.profile);
    guardarSessao(user.uid, session);
    emit('avatar:refresh');
    if (session.householdId !== antes) emit('household:changed');
  }).catch((err) => console.warn('[auth] atualizar perfil', err?.message));
}

export async function logout() {
  esquecerSessao(session.uid);
  await signOut(auth);
}

export function initAuth({ onLogin, onLogout }) {
  registerActions({
    'auth:submit': submit,
    'auth:toggle': () => setMode(mode === 'login' ? 'register' : 'login'),
    'auth:forgot': () => setMode('forgot'),
  });

  let loggedIn = false;
  onAuthStateChanged(auth, async (user) => {
    const overlay = byId('auth-overlay');
    if (user) {
      await loadProfile(user);
      loggedIn = true;
      onLogin();
      document.body.classList.add('is-authed');
      overlay.classList.add('is-leaving');
      setTimeout(() => { overlay.hidden = true; overlay.classList.remove('is-leaving'); }, 600);
    } else {
      if (loggedIn) onLogout();
      loggedIn = false;
      Object.assign(session, { uid: null, name: '', avatar: '', profile: {}, householdId: null, household: null, members: [] });
      document.body.classList.remove('is-authed');
      overlay.hidden = false;
      show('auth-loading', false);
      show('auth-card', true);
      byId('auth-password').value = '';
      setMode('login');
    }
  });
}
