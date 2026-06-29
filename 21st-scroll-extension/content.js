// content.js — destrava o scroll no 21st.dev
// Estratégia: o scroll costuma estar preso num container interno com altura
// fixa (h-dvh/100vh) + overflow:hidden. Em vez de mexer só no body, varremos
// TODOS os elementos e destravamos os que estão cortando conteúdo.

(function () {
  'use strict';

  const TAG = '[21st-scroll]';
  let lastCount = -1;

  // CSS base: libera html/body e remove travas óbvias.
  function injectStyle() {
    if (document.getElementById('force-scroll-21st')) return;
    const style = document.createElement('style');
    style.id = 'force-scroll-21st';
    style.textContent = `
      html, body {
        overflow-y: auto !important;
        height: auto !important;
        max-height: none !important;
        position: static !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Destrava cada elemento que esconde conteúdo maior que sua área visível,
  // ou que está travado na altura da viewport.
  function unlockAll() {
    injectStyle();
    let unlocked = 0;
    const vh = window.innerHeight;
    const all = document.querySelectorAll('body *');

    for (const el of all) {
      const cs = getComputedStyle(el);

      // 1) Container que esconde conteúdo vertical maior que ele mesmo.
      const oy = cs.overflowY;
      const clipsY = oy === 'hidden' || oy === 'clip';
      if (clipsY && el.scrollHeight > el.clientHeight + 4) {
        el.style.setProperty('overflow-y', 'auto', 'important');
        unlocked++;
      }

      // 2) Container preso na altura da viewport (h-screen/h-dvh/100vh).
      //    Relaxa altura pra ele crescer com o conteúdo.
      const h = parseFloat(cs.height);
      const lockedToViewport =
        Math.abs(h - vh) <= 2 && el.scrollHeight > el.clientHeight + 4;
      if (lockedToViewport) {
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');
        el.style.setProperty('overflow-y', 'visible', 'important');
        el.style.setProperty('min-height', vh + 'px', 'important');
        unlocked++;
      }
    }

    // body com position:fixed = trava de scroll de modal que não foi removida.
    if (getComputedStyle(document.body).position === 'fixed') {
      document.body.style.setProperty('position', 'static', 'important');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('padding-right');
    }

    if (unlocked !== lastCount) {
      console.info(`${TAG} ativo — ${unlocked} container(es) destravado(s).`);
      lastCount = unlocked;
    }
    return unlocked;
  }

  // MutationObserver com debounce (perf).
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      unlockAll();
    });
  }

  function start() {
    if (!document.body) {
      requestAnimationFrame(start);
      return;
    }
    unlockAll();
    new MutationObserver(schedule).observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['style', 'class'],
    });
  }

  injectStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  window.addEventListener('load', unlockAll);
  // Reforços tardios (hidratação do React).
  [500, 1500, 3000, 5000].forEach((t) => setTimeout(unlockAll, t));

  console.info(`${TAG} carregado.`);
})();
