/* global window, document */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { PNG } = require('pngjs');
const { _electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
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
    MESP_DOCK_TEST_HIDDEN: '1',
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
    const { routerLocalAuthHeaders } = await import('../electron/dockRouterLocalAuth.mjs');
    const origin = `http://127.0.0.1:${port}`;
    const headers = () => routerLocalAuthHeaders(path.join(profile, '9router'));
    const protectedSettings = await fetch(`${origin}/api/settings`, {
      method: 'PATCH',
      headers: { ...headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ requireLogin: true }),
    });
    assert.ok(protectedSettings.ok);
    assert.equal((await fetch(`${origin}/api/providers`)).status, 401);
    assert.deepEqual(await page.evaluate(() => window.mesp.get9RouterConnections()), []);
    const native = (script) =>
      app.evaluate(({ BrowserWindow }, source) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.find((child) =>
          child.webContents?.getURL().startsWith('http://127.0.0.1:'),
        );
        if (!view) throw new Error('Embedded router view missing');
        return view.webContents.executeJavaScript(source);
      }, script);
    const viewInfo = () =>
      app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        const view = window.contentView.children.find((child) =>
          child.webContents?.getURL().startsWith('http://127.0.0.1:'),
        );
        return {
          windows: BrowserWindow.getAllWindows().length,
          url: view?.webContents.getURL(),
          visible: view?.getVisible(),
          bounds: view?.getBounds(),
          preferences: view?.webContents.getLastWebPreferences(),
        };
      });
    const waitNative = async (script) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await native(script)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Native condition timed out: ${script}`);
    };
    const open = async (section) => {
      console.log('Router QA:', section);
      const result = await page.evaluate((p) => window.mesp.open9RouterDashboard(p), section);
      assert.equal(result.ok, true, result.error);
      await page.waitForSelector('.dock-router-viewport');
      await page.waitForFunction(
        () =>
          document.querySelector('.dock-router-loading')?.getAttribute('aria-label') ===
          '9Router pronto',
        { timeout: 30000 },
      );
      await waitNative(
        'document.documentElement.classList.contains("dark") && getComputedStyle(document.body).backgroundColor === "rgb(16, 16, 16)"',
      );
    };
    const screenshot = async (name) => {
      await native(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.find((child) =>
          child.webContents?.getURL().startsWith('http://127.0.0.1:'),
        );
        // A hidden native view's first capture can be the pre-theme frame.
        await view.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        await new Promise((resolve) => setTimeout(resolve, 150));
        return (
          await view.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
        )
          .toPNG()
          .toString('base64');
      });
      fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
      fs.writeFileSync(path.join(root, 'screenshots', name), Buffer.from(png, 'base64'));
      if (name === 'router-inline-providers.png' || name === 'router-inline-search.png') {
        const island = await page.locator('.top-dock').boundingBox();
        const parentImage = PNG.sync.read(
          await page.locator('.top-dock').screenshot({ omitBackground: true }),
        );
        const nativeImage = PNG.sync.read(Buffer.from(png, 'base64'));
        const { bounds } = await viewInfo();
        PNG.bitblt(
          nativeImage,
          parentImage,
          0,
          0,
          nativeImage.width,
          nativeImage.height,
          Math.round(bounds.x - island.x),
          Math.round(bounds.y - island.y),
        );
        fs.writeFileSync(
          path.join(
            root,
            'screenshots',
            name === 'router-inline-search.png' ? 'mesp-9router-search.png' : 'mesp-9router.png',
          ),
          PNG.sync.write(parentImage),
        );
      }
    };
    for (const section of [
      'codex',
      'claude',
      'gemini-cli',
      'providers',
      'cli-tools',
      'combos',
      'profile',
      'endpoint',
      'pricing',
      'proxy-pools',
      'quota',
      'usage',
    ]) {
      await open(section);
      const info = await viewInfo();
      assert.equal(info.windows, 1, 'No secondary Electron window');
      assert.equal(info.preferences.nodeIntegration, false);
      assert.equal(info.preferences.sandbox, true);
      assert.ok(info.bounds.width <= 652 && info.bounds.height <= 480);
      const response = await fetch(info.url, { headers: headers() });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes('9Router'));
      assert.ok(!html.includes('ConfiguraÃ§Ã£o local'));
      assert.ok(!html.includes('Janela de teste'));
      const layout = await native(
        `({width:innerWidth, scroll:document.documentElement.scrollWidth, sidebar:document.querySelector('aside') ? getComputedStyle(document.querySelector('aside')).display : 'none', mainHeight:document.querySelector('main')?.getBoundingClientRect().height || innerHeight, height:innerHeight})`,
      );
      assert.equal(layout.sidebar, 'none');
      assert.ok(
        layout.scroll <= layout.width,
        `No horizontal page overflow on ${section}: ${JSON.stringify(layout)}`,
      );
      assert.ok(layout.mainHeight <= layout.height + 1);
      if (section === 'providers' || section === 'profile' || section === 'cli-tools')
        await waitNative(
          '!document.querySelector("main .animate-pulse") && document.querySelectorAll("main button").length > 0',
        );
      if (section === 'providers' || section === 'cli-tools') {
        await waitNative('document.querySelector(".mesp-router-catalog-grid .mesp-router-tile")');
        if (section === 'providers')
          await waitNative('document.querySelectorAll(".mesp-router-tile").length >= 40');
        const icons = await native(`(() => {
          const grid=document.querySelector('.mesp-router-catalog-grid');
          const tiles=Array.from(document.querySelectorAll('.mesp-router-tile'));
          const first=tiles[0], icon=first.querySelector('.mesp-router-tile-icon').getBoundingClientRect(), label=first.querySelector('h3').getBoundingClientRect();
          return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length, count:tiles.length, visible:tiles.filter(tile=>{const rect=tile.getBoundingClientRect();return rect.y>=0 && rect.bottom<=innerHeight;}).length, labelBelowIcon:label.y>=icon.bottom, onlyName:first.innerText.trim()===first.querySelector('h3').innerText.trim()};
        })()`);
        assert.equal(icons.columns, 8, JSON.stringify(icons));
        assert.ok(icons.visible >= (section === 'providers' ? 40 : 16), JSON.stringify(icons));
        assert.ok(
          icons.labelBelowIcon && icons.onlyName,
          'Tiles show only the icon and name beneath it',
        );
      }
      if (section === 'providers' || section === 'profile' || section === 'cli-tools')
        await screenshot(`router-inline-${section}.png`);
      if (section === 'profile')
        console.log(
          'Router QA contrast:',
          await native(
            `Array.from(document.querySelectorAll('main *')).filter(el=>el.children.length===0 && ['Database Location','System','Download Backup'].includes(el.textContent.trim())).map(el=>({text:el.textContent,class:el.className,color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,parentClass:el.parentElement.className,parentColor:getComputedStyle(el.parentElement).color,parentBg:getComputedStyle(el.parentElement).backgroundColor}))`,
          ),
        );
    }
    // Unsaved real form values must survive collapsing and opening the island.
    await open('providers');
    await waitNative('document.querySelectorAll(".mesp-router-tile").length >= 40');
    await page.getByRole('button', { name: 'Buscar opções no 9Router', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Buscar opções no 9Router', exact: true });
    await search.fill('codex');
    await waitNative(
      'document.querySelectorAll(".mesp-router-tile:not(.is-filtered)").length === 1',
    );
    await screenshot('router-inline-search.png');
    await search.fill('provedor-inexistente-qa');
    await waitNative('document.querySelector(".mesp-router-search-empty")');
    await search.press('Escape');
    await waitNative(
      'document.querySelectorAll(".mesp-router-tile:not(.is-filtered)").length >= 40',
    );
    assert.equal(
      await page.locator('.top-dock.mode-home').count(),
      1,
      'Escape closes search before collapsing the island',
    );
    await app.evaluate(({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find((child) =>
        child.webContents?.getURL().startsWith('http://127.0.0.1:'),
      );
      view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: ['control'] });
      view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F', modifiers: ['control'] });
    });
    await search.waitFor();
    await search.fill('Claude');
    await waitNative(
      'document.querySelectorAll(".mesp-router-tile:not(.is-filtered)").length === 1',
    );
    await waitNative(
      'Array.from(document.querySelectorAll(".mesp-router-tile")).some(link => link.pathname === "/dashboard/providers/claude")',
    );
    await native(
      'Array.from(document.querySelectorAll(".mesp-router-tile")).find(link => link.pathname === "/dashboard/providers/claude").click()',
    );
    await waitNative(
      'location.pathname === "/dashboard/providers/claude" && document.documentElement.dataset.mespCatalog === ""',
    );
    await open('providers');
    await waitNative(
      'Array.from(document.querySelectorAll("main button")).some(button => button.textContent.includes("Add OpenAI Compatible"))',
    );
    await native(
      'Array.from(document.querySelectorAll("main button")).find(button => button.textContent.includes("Add OpenAI Compatible")).click()',
    );
    await waitNative('document.querySelector(".fixed.inset-0 input")');
    await native(
      `(() => {const input=document.querySelector('.fixed.inset-0 input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'MESP QA local');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await screenshot('router-inline-form.png');
    await page.getByRole('button', { name: 'Recolher painel', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('.top-dock')?.classList.contains('mode-home'),
    );
    for (let attempt = 0; attempt < 30 && (await viewInfo()).visible; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await viewInfo()).visible, false);
    await open('providers');
    assert.equal(
      await native('document.querySelector(".fixed.inset-0 input")?.value'),
      'MESP QA local',
    );
    // Changing tabs also hides the native view instead of covering the chat.
    await app.evaluate(({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find((child) =>
        child.webContents?.getURL().startsWith('http://127.0.0.1:'),
      );
      view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: ['control'] });
      view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: ['control'] });
    });
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Pedir ao MESP',
    );
    for (let attempt = 0; attempt < 30 && (await viewInfo()).visible; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await viewInfo()).visible, false);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width: 384, height: 680 }),
    );
    await open('providers');
    await screenshot('router-inline-narrow.png');
    assert.equal(
      await native('document.querySelector(".fixed.inset-0 input")?.value'),
      'MESP QA local',
    );
    const modal = await native(
      '(() => {const rect=document.querySelector(".fixed.inset-0 > div").getBoundingClientRect();return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:innerWidth,height:innerHeight};})()',
    );
    assert.ok(
      modal.x >= 0 &&
        modal.y >= 0 &&
        modal.right <= modal.width + 1 &&
        modal.bottom <= modal.height + 1,
      JSON.stringify(modal),
    );
    const narrow = await native(
      '({width:innerWidth, scroll:document.documentElement.scrollWidth, mainWidth:document.querySelector("main").getBoundingClientRect().width})',
    );
    assert.ok(narrow.width <= 342);
    assert.ok(narrow.scroll <= narrow.width);
    assert.ok(narrow.mainWidth <= narrow.width);
    assert.equal(
      await native(
        'getComputedStyle(document.querySelector(".mesp-router-catalog-grid")).gridTemplateColumns.split(" ").length',
      ),
      4,
    );
    assert.equal((await viewInfo()).windows, 1);
    // Submit an actual native form using only the isolated profile and loopback.
    await native(`(() => {
      const inputs=Array.from(document.querySelectorAll('.fixed.inset-0 input'));
      const values=['MESP QA local','oc-mesp-qa','${origin}/v1','qa-local-only','gpt-4.1'];
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      inputs.forEach((input,index)=>{setter.call(input,values[index]);input.dispatchEvent(new Event('input',{bubbles:true}));});
    })()`);
    await native(
      'Array.from(document.querySelectorAll(".fixed.inset-0 button")).find(button=>button.textContent.trim()==="Create").click()',
    );
    await waitNative(
      '!document.querySelector(".fixed.inset-0 input") && document.querySelector("main").textContent.includes("MESP QA local")',
    );
    const savedNodes = await fetch(`${origin}/api/provider-nodes`, { headers: headers() }).then(
      (response) => response.json(),
    );
    assert.ok(
      JSON.stringify(savedNodes).includes('oc-mesp-qa'),
      'Native form persists in the real isolated router',
    );
    await screenshot('router-inline-saved.png');
    await app.evaluate(({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find((child) =>
        child.webContents?.getURL().startsWith('http://127.0.0.1:'),
      );
      view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    });
    await page.waitForFunction(
      () => !document.querySelector('.top-dock').classList.contains('mode-home'),
    );
    assert.equal((await viewInfo()).visible, false);
    console.log(
      JSON.stringify({
        ok: true,
        installedRouterStarts: true,
        providerPagesServeRealDashboard: true,
        cliToolsPageWorks: true,
        singleFloatingWindow: true,
        nativeFormSaved: true,
        draftsSurviveCollapseAndTabs: true,
        narrowModalFits: true,
        escapeCollapsesIsland: true,
        eightColumnIconCatalog: true,
        catalogSearchAndEmptyState: true,
        shortcutsWorkFromNativePanel: true,
        compactCatalogOnNarrowScreens: true,
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
