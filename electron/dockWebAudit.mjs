export async function auditDeveloperPreview({ url, createWindow, signal, timeout = 15_000 }) {
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
  const timer = globalThis.setTimeout(() => {
    expired = true;
    close();
  }, timeout);
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
    for (const width of [320, 390, 1024]) {
      if (signal.aborted || window.isDestroyed()) break;
      window.setContentSize(width, 720);
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
    if (issues.length && !results.some((check) => check.status === 'failed'))
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
    globalThis.clearTimeout(timer);
    signal.removeEventListener('abort', close);
    close();
  }
}
