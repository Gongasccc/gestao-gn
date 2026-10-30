// Comportamento "de app" no telemóvel: sem zoom, imagens partidas escondidas e um toque discreto nos botões.

function blockZoom() {
  // O iOS ignora user-scalable=no no viewport, por isso cortamos os gestos de pinça aqui.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (ev) => ev.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (ev) => {
    if (ev.touches.length > 1 || (ev.scale && ev.scale !== 1)) ev.preventDefault();
  }, { passive: false });
  // O duplo toque é tratado em CSS (touch-action no html), sem atrasar os cliques.
}

export function initGlassEffects() {
  blockZoom();

  // Imagens partidas (ex.: sem rede) não mostram o ícone do browser.
  document.addEventListener('error', (ev) => {
    if (ev.target?.tagName === 'IMG') ev.target.classList.add('img-broken');
  }, true);
  document.addEventListener('load', (ev) => {
    if (ev.target?.tagName === 'IMG') ev.target.classList.remove('img-broken');
  }, true);

  // Ondulação ao toque nos botões.
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest?.('.btn, .pressable');
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(r.width, r.height) * 1.6;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${ev.clientX - r.left - size / 2}px`;
    ripple.style.top = `${ev.clientY - r.top - size / 2}px`;
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }, { passive: true });
}
