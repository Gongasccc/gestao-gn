// Controlo segmentado (tabs) com indicador de vidro deslizante.
import { html } from '../core/dom.js';
import { registerActions } from '../core/events.js';
import { emit } from '../core/state.js';

/** tabs: [{ id, label }] — os painéis devem ter data-tab-panel="<group>:<id>" */
export function tabsTpl(group, tabs, active = tabs[0].id) {
  return html`
    <div class="segmented glass-soft" data-tabs="${group}" role="tablist">
      <span class="segmented__indicator"></span>
      ${tabs.map((t) => html`<button class="segmented__btn ${t.id === active ? 'is-active' : ''}" role="tab" data-action="tabs:select" data-group="${group}" data-tab="${t.id}">${t.label}</button>`)}
    </div>`;
}

export function selectTab(group, tab) {
  const bar = document.querySelector(`[data-tabs="${group}"]`);
  if (!bar) return;
  bar.querySelectorAll('.segmented__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelectorAll(`[data-tab-panel^="${group}:"]`).forEach((p) => {
    const on = p.dataset.tabPanel === `${group}:${tab}`;
    p.hidden = !on;
    if (on) {
      p.classList.remove('anim-panel');
      void p.offsetWidth;
      p.classList.add('anim-panel');
    }
  });
  positionIndicator(bar);
  emit(`tabs:${group}`, tab);
}

export function positionIndicator(bar) {
  const active = bar?.querySelector('.segmented__btn.is-active');
  const ind = bar?.querySelector('.segmented__indicator');
  if (!active || !ind) return;
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}

registerActions({
  'tabs:select': ({ data }) => selectTab(data.group, data.tab),
});

window.addEventListener('resize', () => document.querySelectorAll('[data-tabs]').forEach(positionIndicator));
