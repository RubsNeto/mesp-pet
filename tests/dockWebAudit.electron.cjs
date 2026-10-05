const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `web-audit-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.url === '/slow') return;
    if (req.url === '/missing.png') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.end(
      req.url === '/good'
        ? '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ready</title><style>*{box-sizing:border-box}body{margin:0;padding:20px}main{max-width:800px;width:100%}</style><main>Working page<div role="button" tabindex="0">Executar</div><a href="/good"><img alt="Página inicial" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E"></a><div role="tablist"><button role="tab" tabindex="0">Primeira aba</button><button role="tab" tabindex="-1">Segunda aba</button></div></main></html>'
        : '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="width:1500px">Overflow</div><img src="/missing.png"><script>console.error("Broken action");window.open("https://example.com")</script>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, MESP_DOCK_TEST_HIDDEN: '1', MESP_DOCK_DATA_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await _electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [root],
      cwd: root,
      env,
    });
    const moduleURL = path.join(root, 'electron', 'dockWebAudit.mjs');
    const run = (route, cancel = false) =>
      app.evaluate(
        async ({ BrowserWindow }, { moduleURL, url, cancel }) => {
          const { auditDeveloperPreview } = process
            .getBuiltinModule('module')
            .createRequire(moduleURL)(moduleURL);
          const controller = new AbortController();
          const timer = cancel ? setTimeout(() => controller.abort(), 150) : null;
          try {
            return await auditDeveloperPreview({
              url,
              signal: controller.signal,
              timeout: 5000,
              createWindow: () =>
                new BrowserWindow({
                  show: false,
                  webPreferences: {
                    sandbox: true,
                    nodeIntegration: false,
                    contextIsolation: true,
                    backgroundThrottling: false,
                  },
                }),
            });
          } finally {
            if (timer) clearTimeout(timer);
          }
        },
        { moduleURL, url: `http://127.0.0.1:${server.address().port}/${route}`, cancel },
      );
    const good = await run('good');
    assert.equal(good.length, 7);
    assert.ok(
      good.every((check) => check.status === 'passed'),
      JSON.stringify(good),
    );
    const broken = await run('bad');
    assert.ok(broken.some((check) => check.output.includes('Broken action')));
    assert.ok(broken.some((check) => check.output.includes('Imagem não carregou')));
    assert.equal(
      broken.filter((check) => check.name.startsWith('Responsividade') && check.status === 'failed')
        .length,
      5,
    );
    const cancelled = await run('slow', true);
    assert.equal(cancelled[0].status, 'cancelled');
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
      'Audits leave no secondary windows',
    );
    const evidence = {
      passed: true,
      profile,
      checks: [
        'good page with accessible controls and 320/390/768/1024/1440px audit',
        'missing resource reported',
        'browser error reported',
        'overflow detected',
        'window.open blocked',
        'cancel slow page',
        'no orphan audit windows',
      ],
    };
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    await app?.close().catch(() => {});
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
