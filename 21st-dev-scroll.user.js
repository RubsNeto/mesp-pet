// ==UserScript==
// @name         21st.dev - Forçar Scroll
// @namespace    https://github.com/SEU-USUARIO/userscripts
// @version      1.1.0
// @description  Restaura o scroll vertical no 21st.dev removendo overflow:hidden / travas de altura aplicadas pelo app.
// @author       você
// @match        https://21st.dev/*
// @match        https://*.21st.dev/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // 1) CSS de alta prioridade: libera overflow no html/body e remove travas comuns.
  const css = `
    html, body {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      height: auto !important;
      max-height: none !important;
      position: static !important;
      /* alguns sites usam overscroll/scroll-lock no body */
      overscroll-behavior: auto !important;
      touch-action: auto !important;
    }
    /* Containers raiz do React costumam fixar 100vh + overflow hidden */
    #__next, #root, [data-overlay-container], main {
      overflow: visible !important;
      height: auto !important;
      max-height: none !important;
    }
  `;

  function injectStyle() {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
      return;
    }
    const style = document.createElement('style');
    style.id = 'mesp-force-scroll';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  injectStyle();

  // 2) Reaplica inline porque o React pode sobrescrever via style inline ou
  //    adicionar classes de "scroll lock" (ex.: ao abrir/fechar modais).
  function forceScroll() {
    const targets = [document.documentElement, document.body];
    for (const el of targets) {
      if (!el) continue;
      el.style.setProperty('overflow-y', 'auto', 'important');
      el.style.setProperty('height', 'auto', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('position', 'static', 'important');
      // Remove "padding-right" que libs de modal adicionam ao travar o scroll
      el.style.removeProperty('padding-right');
    }
  }

  // 3) Observa mudanças de atributo (style/class) no html e body e reaplica.
  function startObserver() {
    if (!document.body) return;
    forceScroll();
    const obs = new MutationObserver(forceScroll);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // 4) Segurança extra: reaplica após o carregamento completo (React hidrata depois).
  window.addEventListener('load', forceScroll);
  setTimeout(forceScroll, 1000);
  setTimeout(forceScroll, 3000);
})();
