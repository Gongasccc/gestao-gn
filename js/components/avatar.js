import { html, raw } from '../core/dom.js';
import { initials } from '../core/format.js';
import { session, on } from '../core/state.js';

const hasPhoto = (url) => typeof url === 'string' && url.length > 5;

/** Avatar circular com foto ou iniciais. size: sm | md | lg | xl */
export function avatar(name, url, size = 'md') {
  return html`<span class="avatar avatar--${size}">${hasPhoto(url)
    ? html`<img src="${url}" alt="" loading="lazy">`
    : html`<span>${initials(name)}</span>`}</span>`;
}

/** Atualiza todos os elementos marcados com data-avatar="me". */
export function refreshMyAvatars() {
  document.querySelectorAll('[data-avatar="me"]').forEach((el) => {
    el.innerHTML = hasPhoto(session.avatar)
      ? String(html`<img src="${session.avatar}" alt="">`)
      : String(html`<span>${initials(session.name)}</span>`);
  });
  document.querySelectorAll('[data-username="me"]').forEach((el) => { el.textContent = session.name; });
}

on('avatar:refresh', refreshMyAvatars);

export { hasPhoto, raw };
