// Efeitos "liquid glass": reflexo que segue o dedo/rato e refração (apenas em browsers Chromium).

const REFRACTION_FILTER = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <filter id="liquid-refraction" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" seed="11" result="noise"/>
    <feGaussianBlur in="noise" stdDeviation="2.5" result="soft"/>
    <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;

function supportsRefraction() {
  // backdrop-filter com url(#svg) só funciona bem em Chromium (Chrome, Edge, Android).
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand) || [];
  return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b));
}

export function initGlassEffects() {
  document.body.insertAdjacentHTML('beforeend', REFRACTION_FILTER);
  if (supportsRefraction()) document.documentElement.classList.add('can-refract');

  // Reflexo dinâmico: atualiza --mx/--my no elemento de vidro sob o ponteiro.
  let raf = 0;
  document.addEventListener('pointermove', (ev) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = ev.target.closest?.('.glass--interactive, .pressable.glass');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((ev.clientY - r.top) / r.height) * 100}%`);
    });
  }, { passive: true });

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
