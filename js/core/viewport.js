// iPhone (app no ecrã principal): por vezes o iOS encolhe a área da página — depois de fechar o
// teclado, ao voltar à app ou ao rodar — e as barras fixas ao fundo "sobem", deixando um espaço por baixo.
// Medimos a diferença entre o ecrã e a área da página e empurramos as barras de volta para o fundo.
const standalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const aEscrever = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;

function medir() {
  const root = document.documentElement;
  if (!standalone() || aEscrever()) { root.style.setProperty('--fundo-gap', '0px'); return; }
  const retrato = matchMedia('(orientation: portrait)').matches;
  const ecra = retrato ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const gap = Math.round(ecra - window.innerHeight);
  // Só corrige faixas pequenas (zona segura/barra de estado); valores maiores são o teclado ou outra coisa.
  root.style.setProperty('--fundo-gap', gap > 0 && gap < 120 ? `${gap}px` : '0px');
}

let pendente = 0;
const agendar = () => { cancelAnimationFrame(pendente); pendente = requestAnimationFrame(medir); };

export function initViewportFix() {
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
  ['resize', 'orientationchange', 'pageshow', 'focusin', 'focusout'].forEach((ev) => window.addEventListener(ev, agendar, { passive: true }));
  window.visualViewport?.addEventListener('resize', agendar, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(agendar, 250); });
  // Depois de fechar o teclado o iOS às vezes deixa a página deslocada: um pequeno "toque" repõe a disposição.
  window.addEventListener('focusout', () => setTimeout(() => { if (!aEscrever()) { window.scrollTo(window.scrollX, window.scrollY); agendar(); } }, 120));
  medir();
}
