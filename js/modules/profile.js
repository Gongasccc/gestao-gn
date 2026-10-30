// Perfil do utilizador e Definições (tema, cor, permissões, sessão).
import { html, byId, render } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { session, emit } from '../core/state.js';
import { toast, confirmDialog } from '../core/ui.js';
import { compressImage, takeFile } from '../core/images.js';
import { applyTheme, applyAccent, currentTheme, ACCENTS } from '../core/theme.js';
import { setDoc } from '../services/firebase.js';
import { profileDoc } from '../services/paths.js';
import { hasPhoto } from '../components/avatar.js';
import { logout } from '../app/auth.js';

const saveProfile = (data) => setDoc(profileDoc(), data, { merge: true });

function drawProfile() {
  const btn = byId('profile-remove-photo');
  if (btn) btn.hidden = !hasPhoto(session.avatar);
}

function drawSettings() {
  const theme = currentTheme();
  render('theme-toggle-label', html`${icon(theme === 'light' ? 'moon' : 'sun', 18)} ${theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'}`);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase();
  render('accent-grid', ACCENTS.map((c) => html`
    <button class="swatch pressable ${c.toLowerCase() === accent ? 'is-selected' : ''}" style="--swatch:${c}" data-action="settings:accent" data-color="${c}" aria-label="Cor ${c}"></button>`));
  const p = session.profile || {};
  const loc = byId('switch-location');
  const notif = byId('switch-notifications');
  if (loc) loc.checked = !!p.allowLocation;
  if (notif) notif.checked = !!p.allowNotifications;
}

export default {
  id: 'profile',
  pages: [
    {
      id: 'menu-perfil',
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
      title: 'Definições',
      root: true,
      template: () => html`
        <div class="card glass">
          <div class="setting-row">
            <span>${icon('pin', 18)} Localização</span>
            <label class="switch"><input type="checkbox" id="switch-location" data-change="settings:location"><span class="switch__track"></span></label>
          </div>
          <div class="setting-row">
            <span>${icon('bell', 18)} Notificações push</span>
            <label class="switch"><input type="checkbox" id="switch-notifications" data-change="settings:notifications"><span class="switch__track"></span></label>
          </div>
        </div>
        <button class="row-link glass pressable" data-action="settings:theme"><span id="theme-toggle-label"></span></button>
        <div class="card glass">
          <h3 class="card__title">${icon('palette', 18)} Cor de destaque</h3>
          <div class="swatch-grid" id="accent-grid"></div>
        </div>
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
    'settings:accent': async ({ data }) => {
      applyAccent(data.color);
      drawSettings();
      await saveProfile({ accentColor: data.color });
    },
    'settings:location': async ({ el }) => {
      if (el.checked && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => toast('Localização concedida'),
          () => { el.checked = false; toast('Permissão de localização recusada', 'error'); saveProfile({ allowLocation: false }); },
        );
      }
      session.profile.allowLocation = el.checked;
      await saveProfile({ allowLocation: el.checked });
    },
    'settings:notifications': async ({ el }) => {
      if (el.checked && 'Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') toast('Notificações ativadas');
        else { el.checked = false; toast('Permissão de notificações recusada', 'error'); }
      }
      session.profile.allowNotifications = el.checked;
      await saveProfile({ allowNotifications: el.checked });
    },
    'settings:logout': async () => {
      if (await confirmDialog('Vais precisar de entrar outra vez.', { title: 'Terminar sessão?', confirmLabel: 'Sair', danger: true })) logout();
    },
  },
};
