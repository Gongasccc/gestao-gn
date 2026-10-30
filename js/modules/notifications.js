// Notificações e pedidos de amizade.
import { html, render, emptyState } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session } from '../core/state.js';
import { relativeTime } from '../core/format.js';
import { toast } from '../core/ui.js';
import { onSnapshot, deleteDoc, setDoc, getDoc, writeBatch, db } from '../services/firebase.js';
import { userCol, userDoc, otherUserDoc, profileDoc, snapToList } from '../services/paths.js';
import { notifyUser } from '../services/notifications.js';
import { setBadge } from '../navigation/sidebar.js';
import { avatar } from '../components/avatar.js';
import { currentPage } from '../core/router.js';

const scope = createScope();
let notifications = [];
let requests = [];

function draw() {
  const reqHtml = requests.map((r) => html`
    <div class="notif glass-soft">
      <div class="notif__row">
        ${avatar(r.fromName, r.fromAvatar, 'sm')}
        <div class="notif__body"><strong>${r.fromName}</strong> quer adicionar-te à rede.</div>
      </div>
      <div class="btn-row btn-row--compact">
        <button class="btn btn--small" data-action="notif:decline" data-id="${r.id}">Recusar</button>
        <button class="btn btn--small btn--primary" data-action="notif:accept" data-id="${r.id}">${icon('check', 14)} Aceitar</button>
      </div>
    </div>`);

  const sorted = [...notifications].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const notifHtml = sorted.map((n) => html`
    <div class="notif glass-soft ${n.lida ? '' : 'is-unread'}">
      <div class="notif__head">
        <span class="notif__brand"><img src="assets/brand/logopreto_fundobranco.png" alt="">Gestão G&amp;N</span>
        <span class="notif__time">${n.timestamp ? relativeTime(n.timestamp) : n.horaStr || ''}</span>
        <button class="icon-btn icon-btn--subtle" data-action="notif:delete" data-id="${n.id}" aria-label="Apagar">${icon('trash', 14)}</button>
      </div>
      <div class="notif__body">${n.texto}</div>
    </div>`);

  render('notif-list', (requests.length || notifications.length)
    ? html`${requests.length ? html`<h3 class="section-title">Pedidos de amizade</h3>${reqHtml}` : ''}
           ${notifications.length ? html`<h3 class="section-title">Recentes</h3>${notifHtml}` : ''}`
    : emptyState('Sem notificações. Está tudo em dia!', icon('bell', 28)), { stagger: true });

  setBadge('notifications', notifications.filter((n) => !n.lida).length + requests.length);
}

async function markAllRead() {
  const unread = notifications.filter((n) => !n.lida);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(userDoc('notifications', n.id), { lida: true }));
  await batch.commit();
}

export default {
  id: 'notifications',
  pages: [{
    id: 'menu-notificacoes',
    title: 'Notificações',
    root: true,
    template: () => html`<div class="list" id="notif-list"></div>`,
    onEnter: () => setTimeout(markAllRead, 1200),
  }],
  actions: {
    'notif:delete': async ({ el, data }) => {
      el.closest('.notif')?.classList.add('is-removing');
      setTimeout(() => deleteDoc(userDoc('notifications', data.id)), 220);
    },
    'notif:accept': async ({ data }) => {
      const req = requests.find((r) => r.id === data.id);
      if (!req) return;
      let theirAvatar = req.fromAvatar || '';
      try {
        const snap = await getDoc(profileDoc(req.fromUid));
        if (snap.exists()) theirAvatar = snap.data().avatarUrl || '';
      } catch { /* sem avatar */ }
      await setDoc(userDoc('friends', req.fromUid), { uid: req.fromUid, name: req.fromName, avatarUrl: theirAvatar, timestamp: Date.now() });
      await setDoc(otherUserDoc(req.fromUid, 'friends', session.uid), { uid: session.uid, name: session.name, avatarUrl: session.avatar || '', timestamp: Date.now() });
      await deleteDoc(userDoc('requests', req.id));
      await notifyUser(req.fromUid, `${session.name} aceitou o teu pedido de amizade.`);
      toast(`${req.fromName} foi adicionado à tua rede`);
    },
    'notif:decline': async ({ data }) => {
      await deleteDoc(userDoc('requests', data.id));
    },
  },
  start() {
    scope.add(onSnapshot(userCol('notifications'), (s) => {
      notifications = snapToList(s);
      draw();
      if (currentPage() === 'menu-notificacoes') setTimeout(markAllRead, 1200);
    }));
    scope.add(onSnapshot(userCol('requests'), (s) => { requests = snapToList(s); draw(); }));
  },
  stop() {
    scope.clear();
    notifications = [];
    requests = [];
  },
};
