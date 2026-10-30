// Ecrã de entrada/registo e ciclo de vida da sessão.
// Os utilizadores entram com um "nome de utilizador", convertido num email interno.
import { byId, show } from '../core/dom.js';
import { registerActions } from '../core/events.js';
import { session } from '../core/state.js';
import { alertDialog } from '../core/ui.js';
import { applyTheme, applyAccent, DEFAULT_ACCENT } from '../core/theme.js';
import {
  auth, getDoc, setDoc,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, verifyBeforeUpdateEmail,
} from '../services/firebase.js';
import { profileDoc } from '../services/paths.js';
import { loadHousehold } from '../services/household.js';

let isLoginMode = true;

// Contas antigas usam um email interno; quem associar um email real pode entrar com ele.
const INTERNAL_DOMAIN = '@gestaogn.app';
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const usernameToEmail = (username) => (isEmail(username)
  ? username.toLowerCase()
  : `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}${INTERNAL_DOMAIN}`);

export const hasRecoveryEmail = () => !!auth.currentUser?.email && !auth.currentUser.email.endsWith(INTERNAL_DOMAIN);

/** Associa um email real à conta (o Firebase envia um link de confirmação antes de o trocar). */
export async function setRecoveryEmail(email) {
  if (!isEmail(email)) throw new Error('Email inválido.');
  await verifyBeforeUpdateEmail(auth.currentUser, email.trim().toLowerCase());
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

function setMode(login) {
  isLoginMode = login;
  byId('auth-title').textContent = login ? 'Bem-vindos de volta' : 'Criar conta';
  byId('auth-submit').textContent = login ? 'Entrar' : 'Registar e entrar';
  byId('auth-toggle').textContent = login ? 'Não tens conta? Cria uma aqui.' : 'Já tens conta? Entra aqui.';
  byId('auth-confirm-wrap').classList.toggle('is-open', !login);
  showError('');
}

async function submit() {
  const username = byId('auth-username').value.trim();
  const password = byId('auth-password').value;
  if (!username || !password) return showError('Preenche o utilizador e a password.');
  if (!/[a-z0-9]/i.test(username)) return showError('O utilizador deve ter letras ou números.');
  if (!isLoginMode && isEmail(username)) return showError('No registo usa um nome de utilizador. O email de recuperação adiciona-se depois nas Definições.');

  const btn = byId('auth-submit');
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    if (isLoginMode) {
      await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    } else {
      if (password !== byId('auth-confirm').value) {
        showError('As passwords não coincidem.');
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
      await setDoc(profileDoc(cred.user.uid), {
        uid: cred.user.uid,
        username,
        searchName: username.toLowerCase(),
        theme: 'dark',
        accentColor: DEFAULT_ACCENT,
        avatarUrl: '',
        allowLocation: false,
        allowNotifications: false,
      });
    }
  } catch (err) {
    showError(ERRORS[err.code] || 'Não foi possível entrar. Verifica os dados.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

async function loadProfile(user) {
  session.uid = user.uid;
  try {
    const snap = await getDoc(profileDoc(user.uid));
    if (snap.exists()) {
      const p = snap.data();
      session.profile = p;
      session.name = p.username || 'Utilizador';
      session.avatar = p.avatarUrl || '';
      if (p.theme) applyTheme(p.theme);
      if (p.accentColor) applyAccent(p.accentColor);
    } else {
      session.name = 'Utilizador';
    }
    await loadHousehold(session.profile);
  } catch (err) {
    console.error('[auth] perfil', err);
  }
}

async function forgot() {
  const typed = byId('auth-username').value.trim();
  if (!isEmail(typed)) {
    return alertDialog('Escreve no campo de utilizador o email de recuperação que associaste à conta (Definições > Email de recuperação) e carrega outra vez aqui. Se nunca associaste um email, pede ao teu parceiro(a) para te ajudar a criar uma conta nova.', 'Recuperar password');
  }
  try {
    await sendPasswordResetEmail(auth, typed.toLowerCase());
  } catch { /* não revelar se o email existe */ }
  return alertDialog(`Se existir uma conta com ${typed}, vais receber um email para definir uma nova password.`, 'Email enviado');
}

export async function logout() {
  await signOut(auth);
}

export function initAuth({ onLogin, onLogout }) {
  registerActions({
    'auth:submit': submit,
    'auth:toggle': () => setMode(!isLoginMode),
    'auth:forgot': forgot,
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
      setMode(true);
    }
  });
}
