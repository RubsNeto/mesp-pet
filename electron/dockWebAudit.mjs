export async function auditDeveloperPreview({ url, createWindow, signal, timeout = 0 }) {
  const window = createWindow();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    if (new globalThis.URL(target).origin !== new globalThis.URL(url).origin)
      event.preventDefault();
  });
  const issues = [];
  const results = [];
  const started = Date.now();
  let expired = false;
  const close = () => {
    if (!window.isDestroyed()) window.destroy();
  };
  const timer =
    timeout > 0
      ? globalThis.setTimeout(() => {
          expired = true;
          close();
        }, timeout)
      : null;
  signal.addEventListener('abort', close, { once: true });
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') issues.push(String(details.message).slice(0, 2000));
  });
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) issues.push(`A página não carregou: ${description}`);
  });
  window.webContents.on('preload-error', (_event, _path, error) => issues.push(error.message));
  try {
    await window.loadURL(url);
    if (signal.aborted) throw new Error('Prévia cancelada.');
    window.webContents.debugger.attach('1.3');
    const resources = await window.webContents.executeJavaScript(
      `JSON.stringify({title:document.title, viewport:!!document.querySelector('meta[name="viewport"]'), images:[...document.images].filter(image=>image.complete && image.naturalWidth===0 && image.getAttribute('src')).map(image=>image.getAttribute('src')).slice(0,10)})`,
    );
    const page = JSON.parse(resources);
    const problems = [...issues, ...page.images.map((file) => `Imagem não carregou: ${file}`)];
    if (!page.viewport) problems.push('Falta meta viewport para dispositivos móveis.');
    results.push({
      name: 'Página e recursos',
      status: problems.length ? 'failed' : 'passed',
      code: problems.length ? 1 : 0,
      durationMs: Date.now() - started,
      output: problems.join('\n') || `Página carregada: ${page.title}`,
    });
    const accessibility = JSON.parse(
      await window.webContents.executeJavaScript(`JSON.stringify((()=>{
      const issues=[];
      const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
      const name=e=>e.getAttribute('aria-label')||String(e.getAttribute('aria-labelledby')||'').split(/\\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim()||[...e.labels||[]].map(l=>l.textContent).join(' ').trim()||e.getAttribute('title')||e.getAttribute('alt')||e.querySelector('img[alt]')?.getAttribute('alt')||(e.tagName==='BUTTON'||e.tagName==='A'||e.getAttribute('role')==='button'?e.textContent:'');
      if(!document.title.trim())issues.push('Defina um título para a página.');
      if(!document.documentElement.lang.trim())issues.push('Defina o idioma em html[lang].');
      for(const e of [...document.querySelectorAll('button,[role="button"],a[href]')].filter(visible))
        if(!/[\\p{L}\\p{N}]/u.test(name(e)||''))issues.push('Controle sem nome acessível: '+e.outerHTML.slice(0,180));
      for(const e of [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea')].filter(visible))
        if(!name(e)?.trim())issues.push('Campo sem rótulo: '+e.outerHTML.slice(0,180));
      for(const e of [...document.images].filter(visible))if(!e.hasAttribute('alt'))issues.push('Imagem sem alt: '+e.getAttribute('src'));
      const ids=new Set();for(const e of document.querySelectorAll('[id]')){if(ids.has(e.id))issues.push('ID duplicado: '+e.id);ids.add(e.id);}
      for(const e of [...document.querySelectorAll('button,input,select,textarea,a[href]')].filter(visible))
        if(e.getAttribute('tabindex')==='-1'&&!e.disabled&&!e.closest('[role="tablist"],[role="toolbar"],[role="listbox"],[role="menu"],[role="tree"],[role="radiogroup"],[role="grid"]'))issues.push('Controle removido do teclado: '+e.outerHTML.slice(0,180));
      return issues.slice(0,30);
    })())`),
    );
    results.push({
      name: 'Acessibilidade dos controles',
      status: accessibility.length ? 'failed' : 'passed',
      code: accessibility.length ? 1 : 0,
      durationMs: Date.now() - started,
      output:
        accessibility.join('\n') ||
        'Idioma, título, nomes, rótulos, imagens, IDs e teclado verificados.',
    });
    for (const width of [320, 390, 768, 1024, 1440]) {
      if (signal.aborted || window.isDestroyed()) break;
      window.setContentSize(width, 720);
      await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height: 720,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const metrics = JSON.parse(
        await window.webContents.executeJavaScript(
          `new Promise(resolve=>setTimeout(()=>resolve(JSON.stringify({width:innerWidth,content:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)})),60))`,
        ),
      );
      const passed =
        metrics.width >= width - 1 &&
        metrics.width <= width + 1 &&
        metrics.content <= metrics.width + 2;
      results.push({
        name: `Responsividade: ${width}px`,
        status: passed ? 'passed' : 'failed',
        code: passed ? 0 : 1,
        durationMs: 60,
        output: `Tela: ${metrics.width}px; conteúdo: ${metrics.content}px.`,
      });
    }
    await window.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,150))');
    if (
      issues.length &&
      !results.some((check) => check.name === 'Página e recursos' && check.status === 'failed')
    )
      results.push({
        name: 'Erros no navegador',
        status: 'failed',
        code: 1,
        durationMs: Date.now() - started,
        output: issues.join('\n'),
      });
    return results;
  } catch (error) {
    return [
      {
        name: 'Prévia no navegador',
        status: signal.aborted ? 'cancelled' : 'failed',
        code: null,
        durationMs: Date.now() - started,
        output: expired ? 'O navegador excedeu o limite de tempo.' : error.message,
      },
    ];
  } finally {
    if (timer) globalThis.clearTimeout(timer);
    signal.removeEventListener('abort', close);
    close();
  }
}
