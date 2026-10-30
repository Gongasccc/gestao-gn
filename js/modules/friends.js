// Amigos: pesquisa de utilizadores, pedidos e a minha rede.
import { html, render, byId, emptyState, setText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createScope, session, emit } from '../core/state.js';
import { toast } from '../core/ui.js';
import { onSnapshot, getDocs, setDoc } from '../services/firebase.js';
import { userCol, otherUserDoc, profilesCol, snapToList } from '../services/paths.js';
import { notifyUser } from '../services/notifications.js';
import { avatar } from '../components/avatar.js';

const scope = createScope();
let friends = [];
let searchTimer = null;
let profilesCache = null;

export const getFriends = () => friends;

function drawFriends() {
  setText('profile-friends-count', friends.length);
  render('friends-list', friends.length
    ? friends.map((f) => html`
      <div class="user-row glass-soft">
        ${avatar(f.name, f.avatarUrl, 'md')}
        <span class="user-row__name">${f.name}</span>
      </div>`)
    : emptyState('Ainda não adicionaste ninguém. Pesquisa acima pelo nome de utilizador.', icon('users', 28)),
  { stagger: true });
}

async function search(term) {
  const out = byId('friends-search-results');
  if (term.length < 2) { render(out, ''); return; }
  render(out, html`<div class="skeleton-row"></div><div class="skeleton-row"></div>`);
  if (!profilesCache) profilesCache = snapToList(await getDocs(profilesCol()));
  const friendIds = new Set(friends.map((f) => f.uid));
  const results = profilesCache.filter((p) => p.uid !== session.uid && p.searchName?.includes(term));
  render(out, results.length
    ? results.map((u) => html`
      <div class="user-row glass-soft">
        ${avatar(u.username, u.avatarUrl, 'md')}
        <span class="user-row__name">${u.username}</span>
        ${friendIds.has(u.uid)
          ? html`<span class="chip chip--muted">${icon('check', 12)} Na rede</span>`
          : html`<button class="btn btn--small btn--primary pressable" data-action="friends:request" data-uid="${u.uid}" data-name="${u.username}">${icon('userPlus', 14)} Adicionar</button>`}
      </div>`)
    : emptyState('Ninguém encontrado.'), { stagger: true });
}

export default {
  id: 'friends',
  pages: [{
    id: 'menu-familia',
    title: 'Amigos',
    root: true,
    template: () => html`
      <div class="search-field glass-soft">
        ${icon('search', 18)}
        <input type="search" id="friends-search" class="search-field__input" placeholder="Procurar utilizador (mín. 2 letras)…" data-input="friends:search" autocomplete="off">
      </div>
      <div class="list" id="friends-search-results"></div>
      <h3 class="section-title">A minha rede</h3>
      <div class="list" id="friends-list"></div>`,
    onEnter: () => { profilesCache = null; },
  }],
  actions: {
    'friends:search': ({ value }) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => search(value.trim().toLowerCase()), 250);
    },
    'friends:request': async ({ el, data }) => {
      el.disabled = true;
      await setDoc(otherUserDoc(data.uid, 'requests', session.uid), {
        fromUid: session.uid,
        fromName: session.name,
        fromAvatar: session.avatar || '',
        timestamp: Date.now(),
      });
      await notifyUser(data.uid, `${session.name} enviou-te um pedido de amizade.`);
      el.outerHTML = String(html`<span class="chip chip--muted">${icon('check', 12)} Pedido enviado</span>`);
      toast(`Pedido enviado a ${data.name}`);
    },
  },
  start() {
    scope.add(onSnapshot(userCol('friends'), (s) => {
      friends = snapToList(s);
      drawFriends();
      emit('friends:changed', friends);
    }));
  },
  stop() {
    scope.clear();
    friends = [];
    profilesCache = null;
  },
};
