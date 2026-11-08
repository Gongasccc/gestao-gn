// Perfil do utilizador e Definições (tema, cor, permissões, sessão).
import { html, byId, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { session, emit } from '../core/state.js';
import { toast, confirmDialog, promptDialog, alertDialog } from '../core/ui.js';
import { compressImage, takeFile } from '../core/images.js';
import { applyTheme, currentTheme } from '../core/theme.js';
import { setDoc } from '../services/firebase.js';
import { profileDoc } from '../services/paths.js';
import { hasPhoto } from '../components/avatar.js';
import { logout, hasRecoveryEmail, setRecoveryEmail } from '../app/auth.js';
import { auth } from '../services/firebase.js';

const saveProfile = (data) => setDoc(profileDoc(), data, { merge: true });

function drawProfile() {
  const btn = byId('profile-remove-photo');
  if (btn) btn.hidden = !hasPhoto(session.avatar);
}

function drawSettings() {
  const theme = currentTheme();
  render('theme-toggle-label', html`${icon(theme === 'light' ? 'moon' : 'sun', 18)} ${theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'}`);
  render('recovery-email-label', hasRecoveryEmail()
    ? html`${icon('check', 18)} Email de recuperação: ${auth.currentUser.email}`
    : html`${icon('shield', 18)} Adicionar email de recuperação`);
  const p = session.profile || {};
  const notif = byId('switch-notifications');
  if (notif) notif.checked = !!p.allowNotifications && estadoNotificacoes() === 'ok';
  const hint = byId('notif-hint');
  if (hint) {
    const msg = MENSAGENS_NOTIF[estadoNotificacoes()];
    hint.hidden = !msg;
    hint.textContent = msg || '';
  }
}

const eIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const eAppInstalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** ok | ios-safari (falta adicionar ao ecrã principal) | sem-suporte | bloqueadas */
function estadoNotificacoes() {
  if (eIOS() && !eAppInstalada()) return 'ios-safari';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueadas';
  return 'ok';
}

const MENSAGENS_NOTIF = {
  'ios-safari': 'No iPhone, as notificações só funcionam com a app no ecrã principal: no Safari toca em Partilhar e depois em "Adicionar ao ecrã principal". Abre a app a partir desse ícone e ativa aqui.',
  'sem-suporte': 'Este browser não suporta notificações.',
  bloqueadas: 'As notificações estão bloqueadas. Ativa-as nas definições do telemóvel (iPhone: Definições > Notificações > Nós).',
};

export default {
  id: 'profile',
  pages: [
    {
      id: 'menu-perfil',
      width: 'medium',
      title: 'Perfil',
      template: () => html`
        <div class="profile-hero">
          <label class="profile-hero__avatar pressable" title="Alterar foto">
            <span class="avatar avatar--xl avatar--ring" data-avatar="me"></span>
            <span class="profile-hero__cam">${icon('camera', 14)}</span>
            <input type="file" accept="image/*" hidden data-change="profile:photo">
          </label>
          <h2 class="profile-hero__name" data-username="me"></h2>
          <span class="muted">Conta pessoal</span>
          <button class="btn btn--small btn--danger-soft" id="profile-remove-photo" data-action="profile:remove-photo" hidden>${icon('trash', 14)} Remover foto</button>
        </div>
        <button class="row-link glass pressable" data-action="nav:go" data-page="menu-familia">
          <span>${icon('users', 18)} Amigos</span>
          <span class="stat-num" id="profile-friends-count">0</span>
        </button>`,
      onEnter: drawProfile,
    },
    {
      id: 'menu-definicoes',
      width: 'medium',
      title: 'Definições',
      root: true,
      template: () => html`
        <button class="row-link glass pressable" data-action="nav:go" data-page="menu-casal">
          <span>${icon('users', 18)} Grupos e partilhas</span>${icon('chevronRight', 18)}
        </button>
        <div class="card glass">
          <div class="setting-row">
            <span>${icon('bell', 18)} Notificações push</span>
            <label class="switch"><input type="checkbox" id="switch-notifications" data-change="settings:notifications"><span class="switch__track"></span></label>
          </div>
          <p class="muted setting-hint" id="notif-hint" hidden></p>
        </div>
        <button class="row-link glass pressable" data-action="settings:theme"><span id="theme-toggle-label"></span></button>
        <button class="row-link glass pressable" data-action="settings:recovery"><span id="recovery-email-label"></span>${icon('chevronRight', 18)}</button>
        <button class="btn btn--danger btn--block pressable" data-action="settings:logout">${icon('logout', 18)} Terminar sessão</button>`,
      onEnter: drawSettings,
    },
  ],
  actions: {
    'profile:photo': async ({ ev }) => {
      const file = takeFile(ev);
      if (!file) return;
      session.avatar = await compressImage(file, { maxSize: 400, quality: 0.8 });
      emit('avatar:refresh');
      drawProfile();
      await saveProfile({ avatarUrl: session.avatar });
      toast('Foto de perfil atualizada');
    },
    'profile:remove-photo': async () => {
      if (!(await confirmDialog('A tua foto de perfil será removida.', { title: 'Remover foto?', confirmLabel: 'Remover', danger: true }))) return;
      session.avatar = '';
      emit('avatar:refresh');
      drawProfile();
      await saveProfile({ avatarUrl: '' });
    },
    'settings:theme': async () => {
      const theme = applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
      drawSettings();
      await saveProfile({ theme });
    },
    'settings:notifications': async ({ el }) => {
      const estado = estadoNotificacoes();
      if (el.checked && estado !== 'ok') {
        el.checked = false;
        drawSettings();
        toast(MENSAGENS_NOTIF[estado], 'info', 6000);
        return;
      }
      if (el.checked) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') toast('Notificações ativadas');
        else { el.checked = false; toast('Permissão de notificações recusada', 'error'); }
      }
      session.profile.allowNotifications = el.checked;
      await saveProfile({ allowNotifications: el.checked });
    },
    'settings:recovery': async () => {
      const email = await promptDialog('Vais receber um link para confirmar. Depois disso continuas a entrar com o teu utilizador (ou com o email) e, se te esqueceres da password, recebes aqui o link para a mudar.', {
        title: 'Email de recuperação', type: 'email', placeholder: 'nome@exemplo.com', confirmLabel: 'Enviar confirmação',
      });
      if (!email) return;
      try {
        await setRecoveryEmail(email);
        alertDialog(`Enviámos um link para ${email}. Abre-o para concluir; depois disso a app pede-te para voltares a entrar.`, 'Confirma o teu email');
      } catch (err) {
        toast(err.code === 'auth/requires-recent-login' ? 'Termina sessão e volta a entrar antes de mudar o email.' : (err.message || 'Não foi possível.'), 'error', 4000);
      }
    },
    'settings:logout': async () => {
      if (await confirmDialog('Vais precisar de entrar outra vez.', { title: 'Terminar sessão?', confirmLabel: 'Sair', danger: true })) logout();
    },
  },
};
