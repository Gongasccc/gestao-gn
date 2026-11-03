// Selo (logótipo pequeno) de cada supermercado e atalhos para os folhetos. Usado na lista e nos Supermercados.
import { html, raw } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { marcaLoja } from './seccoes.js';
import {
  LOGOS_IMG, LOGOS_SVG, LOGOS_COR, LOGOS_SITE, FOLHETOS, faviconUrl, diasCurtos,
} from './logos.js';

/** Selo da loja: logótipo ou, se não houver, a sigla nas cores da marca. */
export function seloTpl(loja, tam = 44) {
  const m = marcaLoja(loja);
  const estilo = `--marca:${m.cor};--marca2:${m.cor2};--marca-texto:${m.texto};--tam:${tam}px`;
  const sigla = html`<b class="lista-selo__sigla">${m.sigla}</b>`;
  if (LOGOS_IMG[m.id]) {
    return html`<span class="lista-selo lista-selo--img" style="${estilo}" aria-hidden="true"><img src="${LOGOS_IMG[m.id]}" alt="" loading="lazy" onerror="this.parentNode.classList.add('sem-logo')">${sigla}</span>`;
  }
  if (LOGOS_COR[m.id]) {
    return html`<span class="lista-selo lista-selo--logo lista-selo--cor" style="${estilo}" aria-hidden="true">${raw(LOGOS_COR[m.id])}</span>`;
  }
  if (LOGOS_SVG[m.id]) {
    return html`<span class="lista-selo lista-selo--logo" style="${estilo}" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="${LOGOS_SVG[m.id]}"/></svg></span>`;
  }
  if (LOGOS_SITE[m.id]) {
    return html`<span class="lista-selo lista-selo--logo" style="${estilo}" aria-hidden="true">
      <img src="${faviconUrl(LOGOS_SITE[m.id])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('sem-logo')">${sigla}</span>`;
  }
  return html`<span class="lista-selo" style="${estilo}" aria-hidden="true">${m.sigla}</span>`;
}

/** Atalhos para os folhetos de cada cadeia: abrem no navegador (os sites não deixam abrir dentro da app). */
export function folhetosTpl({ titulo = 'Folhetos da semana' } = {}) {
  return html`
    <div class="card glass folhetos">
      <h3 class="card__title">${icon('external', 18)} ${titulo}</h3>
      <div class="folhetos__lojas">
        ${FOLHETOS.map((f) => html`
          <a class="lista-loja-btn folhetos__loja pressable" href="${f.link}" target="_blank" rel="noopener noreferrer"
            aria-label="Folheto ${f.loja}${f.dias?.length ? `, novo à ${diasCurtos(f.dias)}` : ''}" title="${f.loja}">
            ${seloTpl(f.loja)}${f.dias?.length ? html`<small class="folhetos__dias">${diasCurtos(f.dias)}</small>` : ''}
          </a>`)}
      </div>
    </div>`;
}
