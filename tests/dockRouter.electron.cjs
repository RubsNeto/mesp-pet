/* global window */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { _electron } = require(
  process.env.PLAYWRIGHT_PATH ||
    'C:/Users/ruben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const root = path.resolve(__dirname, '..');

(async () => {
  // Exercise the installed 9Router server on an unused loopback port and isolated profile.
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const profile = path.join(root, 'qa', `router-real-${Date.now()}`);
  fs.mkdirSync(path.join(profile, 'opencode'), { recursive: true });
  fs.writeFileSync(
    path.join(profile, 'opencode', 'opencode.json'),
    JSON.stringify({
      provider: { '9router': { options: { baseURL: `http://127.0.0.1:${port}/v1` }, models: {} } },
    }),
  );
  const env = {
    ...process.env,
    MESP_DOCK_DATA_DIR: profile,
    NINEROUTER_BASE_URL: `http://127.0.0.1:${port}/v1`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NINEROUTER_API_KEY;
  const app = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root],
    cwd: root,
    env,
    timeout: 30000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.top-dock');
    const status = await page.evaluate(() => window.mesp.getOpenCodeStatus(true));
    assert.equal(status.runtime.router, 'bundled');
    assert.equal(status.routerState, 'misconfigured');
    assert.deepEqual(await page.evaluate(() => window.mesp.get9RouterConnections()), []);
    for (const provider of ['codex', 'claude', 'gemini-cli', 'providers', 'cli-tools']) {
      const result = await page.evaluate((p) => window.mesp.open9RouterDashboard(p), provider);
      assert.equal(result.ok, true, result.error);
      const url = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().startsWith('http://127.0.0.1:'))
          .webContents.getURL(),
      );
      assert.ok(
        url.includes(
          provider === 'providers'
            ? '/dashboard/providers'
            : provider === 'cli-tools'
              ? '/dashboard/cli-tools'
              : `/dashboard/providers/${provider}`,
        ),
      );
      const response = await fetch(url);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes('9Router'), 'The real installed dashboard is rendered');
      assert.ok(!html.includes('ConfiguraÃ§Ã£o local'));
      assert.ok(!html.includes('Janela de teste'));
    }
    console.log(
      JSON.stringify({
        ok: true,
        installedRouterStarts: true,
        providerPagesServeRealDashboard: true,
        cliToolsPageWorks: true,
        noConfiguredAccountsClaimed: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
