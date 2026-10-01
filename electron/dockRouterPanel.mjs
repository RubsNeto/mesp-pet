// Public navigation and layout only. Credentials never enter this module.
export const ROUTER_PANEL_SECTIONS = [
  { id: 'providers', path: '/dashboard/providers', label: 'Contas e provedores', group: 'Sua IA' },
  { id: 'codex', path: '/dashboard/providers/codex', label: 'Codex', group: 'Sua IA' },
  { id: 'claude', path: '/dashboard/providers/claude', label: 'Claude Code', group: 'Sua IA' },
  { id: 'gemini-cli', path: '/dashboard/providers/gemini-cli', label: 'Gemini', group: 'Sua IA' },
  { id: 'quota', path: '/dashboard/quota', label: 'Cotas e resets', group: 'Sua IA' },
  { id: 'usage', path: '/dashboard/usage', label: 'Histórico de consumo', group: 'Sua IA' },
  { id: 'combos', path: '/dashboard/combos', label: 'Combos de modelos', group: 'Sua IA' },
  {
    id: 'cli-tools',
    path: '/dashboard/cli-tools',
    label: 'Ferramentas e agentes',
    group: 'Conexões',
  },
  { id: 'endpoint', path: '/dashboard/endpoint', label: 'Endpoint e chaves', group: 'Conexões' },
  { id: 'proxy-pools', path: '/dashboard/proxy-pools', label: 'Proxies', group: 'Conexões' },
  { id: 'profile', path: '/dashboard/profile', label: 'Preferências do 9Router', group: 'Ajustes' },
  {
    id: 'pricing',
    path: '/dashboard/settings/pricing',
    label: 'Preços dos modelos',
    group: 'Ajustes',
  },
  {
    id: 'token-saver',
    path: '/dashboard/token-saver',
    label: 'Economia de tokens',
    group: 'Ajustes',
  },
  { id: 'skills', path: '/dashboard/skills', label: 'Skills', group: 'Ajustes' },
  { id: 'dashboard', path: '/dashboard', label: 'Painel do servidor', group: 'Avançado' },
  { id: 'basic-chat', path: '/dashboard/basic-chat', label: 'Testar conversa', group: 'Avançado' },
  { id: 'translator', path: '/dashboard/translator', label: 'Tradutor de APIs', group: 'Avançado' },
  { id: 'console-log', path: '/dashboard/console-log', label: 'Logs', group: 'Avançado' },
  { id: 'mitm', path: '/dashboard/mitm', label: 'MITM', group: 'Avançado' },
  { id: 'pxpipe', path: '/dashboard/pxpipe', label: 'PxPipe', group: 'Avançado' },
  ...['image', 'video', 'tts', 'stt', 'embedding', 'web'].map((kind) => ({
    id: `media-${kind}`,
    path: `/dashboard/media-providers/${kind}`,
    label: {
      image: 'Imagens',
      video: 'Vídeo',
      tts: 'Voz',
      stt: 'Transcrição',
      embedding: 'Embeddings',
      web: 'Busca na web',
    }[kind],
    group: 'Mídia',
  })),
];
export function routerPanelSection(value) {
  return ROUTER_PANEL_SECTIONS.find((item) => item.id === value) || ROUTER_PANEL_SECTIONS[0];
}
export function routerPanelPage(pathname) {
  const ordered = [...ROUTER_PANEL_SECTIONS].sort((a, b) => b.path.length - a.path.length);
  return (
    ordered.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))?.id ||
    'providers'
  );
}
// The renderer supplies CSS pixel bounds. Reject malformed values, clamp to the
// parent, and round inward so native content never covers the island's controls.
export function routerPanelBounds(raw, size) {
  if (!raw || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(raw[key]))) return null;
  if (raw.width < 1 || raw.height < 1 || size.width < 1 || size.height < 1) return null;
  const x = Math.max(0, Math.ceil(raw.x)),
    y = Math.max(0, Math.ceil(raw.y));
  const right = Math.min(size.width, Math.floor(raw.x + raw.width));
  const bottom = Math.min(size.height, Math.floor(raw.y + raw.height));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
// Adapt the installed dashboard's existing links, preserving native navigation
// and account actions. Observe React updates without copying or replacing its DOM.
export const ROUTER_CATALOG_SCRIPT = String.raw`(() => {
  if (window.__mespCatalogInstalled) return;
  window.__mespCatalogInstalled = true;
  const expanded = new WeakSet();
  let searchTerm = '';
  const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filter = () => {
    if (!document.documentElement.dataset.mespCatalog) return;
    const main = document.querySelector('main');
    if (!main) return;
    const needle = fold(searchTerm.trim());
    const tiles = Array.from(main.querySelectorAll('.mesp-router-tile'));
    let matches = 0;
    tiles.forEach(link => {
      const visible = !needle || fold(link.querySelector('h3')?.textContent || '').includes(needle);
      link.classList.toggle('is-filtered', !visible);
      if (visible) matches++;
    });
    main.querySelectorAll('.mesp-router-catalog-action').forEach(button => button.classList.toggle('is-filtered', Boolean(needle)));
    let empty = main.querySelector('.mesp-router-search-empty');
    if (needle && tiles.length && !matches) {
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'mesp-router-search-empty';
        empty.setAttribute('role', 'status');
        empty.textContent = 'Nenhuma opção encontrada. Tente outro nome ou limpe a busca.';
        const root = main.querySelector('.mesp-router-catalog-root');
        root?.parentElement.insertBefore(empty, root);
      }
    } else empty?.remove();
  };
  window.__mespCatalogSearch = value => { searchTerm = typeof value === 'string' ? value.slice(0, 120) : ''; filter(); };
  const adapt = () => {
    const path = location.pathname;
    const catalog = path === '/dashboard/providers' ? 'providers' : path === '/dashboard/cli-tools' ? 'tools' : /^\/dashboard\/media-providers\/[^/]+$/.test(path) ? 'media' : '';
    document.documentElement.dataset.mespCatalog = catalog;
    if (!catalog) { document.querySelector('.mesp-router-search-empty')?.remove(); return; }
    const main = document.querySelector('main');
    if (!main) return;
    const grids = new Set();
    main.querySelectorAll('.grid > a').forEach(link => {
      const label = link.querySelector('h3');
      const icon = link.querySelector('.size-8, .size-10') || link.querySelector('img')?.parentElement;
      if (!label || !icon) return;
      link.classList.add('mesp-router-tile');
      label.classList.add('mesp-router-tile-label');
      icon.classList.add('mesp-router-tile-icon');
      const name = label.textContent.trim();
      link.title = name;
      link.setAttribute('aria-label', name);
      grids.add(link.parentElement);
    });
    grids.forEach(grid => grid.classList.add('mesp-router-catalog-grid'));
    const root = main.querySelector('.max-w-7xl > .flex.flex-col');
    if (root) {
      root.classList.add('mesp-router-catalog-root');
      root.closest('.custom-scrollbar')?.classList.add('mesp-router-catalog-scroll');
      if (catalog === 'tools') root.classList.add('grid', 'mesp-router-catalog-grid');
      if (catalog === 'providers') Array.from(root.children).forEach(section => {
        root.classList.add('grid', 'mesp-router-catalog-grid');
        section.classList.add('mesp-router-catalog-section');
        const heading = section.querySelector('h2');
        if (heading) heading.parentElement.classList.add('mesp-router-catalog-heading');
        const custom = Array.from(section.querySelectorAll('button')).some(button => /Add (OpenAI|Anthropic) Compatible|Adicionar.*compat/i.test(button.textContent));
        if (custom) {
          section.classList.add('mesp-router-catalog-custom');
          section.classList.toggle('is-empty', !section.querySelector('.mesp-router-tile'));
        }
      });
    }
    if (catalog === 'providers') main.querySelectorAll('button').forEach(button => {
      const text = button.textContent;
      if (root?.contains(button)) {
        const action = /Add OpenAI Compatible|Adicionar.*OpenAI/i.test(text) ? 'OpenAI' : /Add Anthropic Compatible|Adicionar.*Anthropic/i.test(text) ? 'Anthropic' : /Test All|Testar tod/i.test(text) ? (/OAuth/i.test(button.title) ? 'Testar OAuth' : 'Testar APIs') : '';
        if (action) { button.classList.add('mesp-router-catalog-action'); button.dataset.mespLabel = action; if (!button.title) button.title = text.trim(); if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', text.trim()); }
      }
      if (/(Show all|Mostrar todos|Exibir todos).*\d+/i.test(text)) {
        if (!expanded.has(button)) { expanded.add(button); button.click(); }
      }
      if (/(Show all|Show less|Mostrar todos|Mostrar menos|Exibir todos).*provider|provedor/i.test(text)) button.classList.add('mesp-router-catalog-expand');
    });
    filter();
  };
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; adapt(); }); };
  new MutationObserver(schedule).observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('popstate', schedule);
  adapt();
})();`;
export const ROUTER_COMPACT_CSS = String.raw`
html, body { height: 100% !important; overflow: hidden !important; color-scheme: dark; }
body:not(:has(main)) { overflow-y: auto !important; overscroll-behavior: contain; }
body:not(:has(main)) > div { max-width: 100% !important; margin: 0 !important; }
body { font: 12px/1.5 'Segoe UI', system-ui, sans-serif !important; background: #101010 !important; }
:root, .dark { --bg: #101010 !important; --bg-alt: #151515 !important; --surface: #202020 !important; --text-main: #f0f0f0 !important; --text-muted: #a7a7a7 !important; --text-subtle: #929292 !important; }
main h1, main h2, main h3, main label, main strong, .fixed.inset-0 label, .fixed.inset-0 h2 { color: #ededed !important; }
.text-black, .text-gray-900, .text-slate-900, .text-text-main { color: #ededed !important; }
.bg-white, [class*="bg-white/"] { background-color: #292929 !important; color: #ededed !important; }
[class*="bg-primary"] *, [class*="bg-orange-"] * { color: inherit !important; }
[class*="border-"] { border-color: #303030 !important; }
aside, header:has(button[aria-label="Donate"]), header:has(a[href="/dashboard/profile"]) { display: none !important; }
body > div, body > div > div { min-width: 0 !important; }
main { width: 100% !important; height: 100dvh !important; min-width: 0 !important; margin: 0 !important; padding: 14px !important; overflow: auto !important; overscroll-behavior: contain; background: #101010 !important; }
main > div { max-width: 100% !important; margin-inline: 0 !important; min-width: 0 !important; }
main { animation: mesp-router-content 180ms ease-out; }
h1 { font-size: 17px !important; line-height: 1.3 !important; letter-spacing: -.025em; }
h2 { font-size: 14px !important; line-height: 1.4 !important; }
h3 { font-size: 12px !important; }
p, .text-sm { font-size: 12px !important; }
.text-xs { font-size: 11px !important; }
.text-3xl, .text-4xl { font-size: 23px !important; }
button, input, select, textarea { font-family: inherit !important; font-size: 12px !important; }
button { min-height: 30px; border-radius: 9px !important; transition: background-color 160ms ease, opacity 160ms ease !important; }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { min-width: 0 !important; max-width: 100% !important; border-radius: 9px !important; }
input:focus, select:focus, textarea:focus, button:focus-visible { outline: 1px solid #949494 !important; outline-offset: 2px; box-shadow: none !important; }
.rounded-xl, .rounded-2xl, .rounded-lg { border-radius: 12px !important; }
.p-6, .p-8 { padding: 14px !important; }
.gap-6, .gap-8 { gap: 12px !important; }
.space-y-6 > :not([hidden]) ~ :not([hidden]), .space-y-8 > :not([hidden]) ~ :not([hidden]) { margin-top: 16px !important; }
.mb-6, .mb-8 { margin-bottom: 16px !important; }
[class*="grid-cols-3"], [class*="grid-cols-4"], [class*="grid-cols-5"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
.grid > *, .flex > * { min-width: 0; }
.justify-between { flex-wrap: wrap; gap: 8px; }
.min-w-\[800px\], .min-w-\[600px\] { min-width: 0 !important; }
.overflow-x-auto { max-width: 100%; }
pre { max-width: 100%; overflow: auto; font-size: 11px !important; }
.truncate { max-width: 100%; }
img { max-width: 100%; }
/* App catalogs: logos and names only, eight columns at dock width. */
html[data-mesp-catalog]:not([data-mesp-catalog=""]) main { padding: 10px !important; }
.mesp-router-catalog-scroll { padding: 0 !important; }
.mesp-router-catalog-root { padding: 0 !important; gap: 12px !important; }
.grid.mesp-router-catalog-grid { grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)) !important; gap: 6px !important; }
.mesp-router-tile { display: block; min-width: 0; border-radius: 12px; text-decoration: none; }
.mesp-router-tile.is-filtered { display: none !important; }
html[data-mesp-catalog] button.mesp-router-catalog-action.is-filtered { display: none !important; }
.mesp-router-search-empty { margin: 8px 0 14px; color: #b7b7b7; }
.mesp-router-tile div { display: contents !important; }
a.mesp-router-tile > div { display: flex !important; flex-direction: column; align-items: center; justify-content: flex-start; gap: 4px !important; height: 64px !important; min-height: 64px; padding: 4px 3px !important; background: transparent !important; border: 0 !important; border-radius: 10px !important; transition: background-color 160ms ease !important; }
.mesp-router-tile:hover > div, .mesp-router-tile:focus-visible > div { background: #252525 !important; }
.mesp-router-tile:focus-visible { outline: 1px solid #949494; outline-offset: 1px; }
.mesp-router-tile :is(span, p, button, svg) { display: none !important; }
.mesp-router-tile .mesp-router-tile-icon { display: grid !important; place-items: center; width: 26px !important; height: 26px !important; min-height: 26px; background: transparent !important; border: 0 !important; }
.mesp-router-tile .mesp-router-tile-icon :is(span, svg) { display: block !important; }
.mesp-router-tile .mesp-router-tile-icon :is(img, svg) { width: 26px !important; height: 26px !important; object-fit: contain; }
.mesp-router-tile-icon img:is([alt^="Ollama"], [alt="Chutes AI"], [alt="Featherless"]) { filter: invert(1); }
.mesp-router-tile .mesp-router-tile-label { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; width: 100%; height: 26px; margin: 0; color: #c7c7c7 !important; font-size: 10.5px !important; font-weight: 450 !important; line-height: 13px !important; text-align: center; white-space: normal !important; text-overflow: clip !important; overflow-wrap: anywhere; }
.mesp-router-catalog-heading { flex-direction: row !important; align-items: center !important; justify-content: space-between !important; flex-wrap: nowrap !important; gap: 8px !important; }
.mesp-router-catalog-heading > h2 { font-size: 11px !important; color: #989898 !important; font-weight: 500 !important; }
html[data-mesp-catalog="tools"] .mesp-router-catalog-root { display: grid !important; gap: 6px !important; }
html[data-mesp-catalog="tools"] .mesp-router-catalog-root > div,
html[data-mesp-catalog="tools"] .mesp-router-catalog-root .mesp-router-catalog-grid { display: contents !important; }
html[data-mesp-catalog="tools"] .mesp-router-catalog-root .flex:has(> h2) { display: none !important; }
.mesp-router-catalog-heading button { width: auto !important; min-height: 26px; padding: 4px 7px !important; font-size: 10px !important; }
.mesp-router-catalog-custom.is-empty { order: 2; }
.mesp-router-catalog-custom.is-empty h2, .mesp-router-catalog-custom.is-empty [class*="border-dashed"], .mesp-router-catalog-expand { display: none !important; }
.mesp-router-catalog-custom .mesp-router-catalog-heading > .grid { display: flex !important; flex-wrap: wrap; gap: 8px !important; }
.mesp-router-catalog-custom .mesp-router-catalog-heading { justify-content: flex-start !important; flex-wrap: wrap !important; }
html[data-mesp-catalog="providers"] .mesp-router-catalog-root { display: grid !important; gap: 6px !important; }
html[data-mesp-catalog="providers"] .mesp-router-catalog-section,
html[data-mesp-catalog="providers"] .mesp-router-catalog-heading,
html[data-mesp-catalog="providers"] .mesp-router-catalog-heading > div,
html[data-mesp-catalog="providers"] .mesp-router-catalog-root .mesp-router-catalog-grid { display: contents !important; }
html[data-mesp-catalog="providers"] .mesp-router-catalog-heading > h2 { display: none !important; }
html[data-mesp-catalog="providers"] .mesp-router-catalog-heading .relative:empty { display: none !important; }
html[data-mesp-catalog="providers"] .mesp-router-catalog-custom .mesp-router-catalog-heading > .grid { display: contents !important; }
html[data-mesp-catalog="providers"] .mesp-router-catalog-custom.is-empty > :not(.mesp-router-catalog-heading) { display: none !important; }
html[data-mesp-catalog="providers"] button.mesp-router-catalog-action { display: flex !important; flex-direction: column; align-items: center; justify-content: flex-start; gap: 4px !important; height: 64px !important; min-height: 64px; width: 100% !important; padding: 4px 3px !important; font-size: 0 !important; background: transparent !important; border: 0 !important; color: #a7a7a7 !important; order: 10; }
html[data-mesp-catalog="providers"] button.mesp-router-catalog-action > span { display: grid; place-items: center; width: 26px; height: 26px; font-size: 22px !important; }
html[data-mesp-catalog="providers"] button.mesp-router-catalog-action::after { content: attr(data-mesp-label); height: 26px; font-size: 10.5px; line-height: 13px; font-weight: 450; text-align: center; }
html[data-mesp-catalog="providers"] button.mesp-router-catalog-action:hover { background: #252525 !important; }
.fixed.inset-0 { padding: 8px !important; backdrop-filter: blur(5px); }
.fixed.inset-0 > div { max-width: calc(100vw - 16px) !important; max-height: calc(100dvh - 16px) !important; min-width: 0 !important; overflow-y: auto !important; }
.fixed.inset-0 [class*="max-w-"] { max-width: calc(100vw - 16px) !important; }
@keyframes mesp-router-content { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3c3c3c; border-radius: 5px; }
@media (max-width: 440px) {
  main { padding: 10px !important; }
  [class*="grid-cols-2"], [class*="grid-cols-3"], [class*="grid-cols-4"], [class*="grid-cols-5"] { grid-template-columns: minmax(0, 1fr) !important; }
  .grid.mesp-router-catalog-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
  .p-6, .p-8 { padding: 11px !important; }
  .flex-nowrap { flex-wrap: wrap !important; }
}
@media (max-width: 240px) { .grid.mesp-router-catalog-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
`;
