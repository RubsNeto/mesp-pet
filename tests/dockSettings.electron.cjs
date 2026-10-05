/* global document */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = path.join(root, 'qa', `settings-ui-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, MESP_DOCK_DATA_DIR: profile, MESP_DOCK_TEST_HIDDEN: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root],
    cwd: root,
    env,
  });
  const checks = [],
    errors = [];
  const check = (name) => {
    checks.push(name);
    console.log(`PASS ${name}`);
  };
  try {
    await app.evaluate(({ ipcMain }) => {
      const counters = (requests) => ({
        requests,
        inputTokens: requests * 20,
        outputTokens: requests * 5,
        cachedTokens: 0,
        tokens: requests * 25,
        cost: requests * 0.01,
      });
      const providers = [
        ['codex', 'Codex', 'cx'],
        ['claude', 'Claude Code', 'cc'],
        ['gemini-cli', 'Gemini', 'gc'],
        ['antigravity', 'Antigravity', 'ag'],
      ];
      globalThis.__settingsPeriods = [];
      ipcMain.removeHandler('opencode:get-status');
      ipcMain.handle('opencode:get-status', () => ({
        models: [],
        modelCount: 96,
        routerState: 'ready',
        runtime: { setupRequired: false },
      }));
      ipcMain.removeHandler('dock:router-overview');
      const overview = (_event, payload) => {
        globalThis.__settingsPeriods.push(payload.period);
        const accounts = providers.map(([provider, providerName, prefix], i) => ({
          id: `account-${i}`,
          label:
            i === 0 ? 'equipe-com-um-email-muito-longo@empresa.exemplo' : `Conta ${providerName}`,
          provider,
          providerName,
          prefix,
          active: true,
          health: i === 2 ? 'auth' : 'active',
          quotaState: 'available',
          plan: 'Pro',
          limitReached: false,
          quotas: [
            {
              key: 'session',
              usedPercent: 35,
              unlimited: false,
              resetAt: Date.now() + 3600000,
              remaining: 65,
              total: 100,
            },
          ],
          locks: [],
          lastFailure: null,
          consumption: counters(i + 1),
        }));
        const models = providers.flatMap(([provider, providerName, prefix], i) =>
          Array.from({ length: 24 }, (_v, j) => ({
            id: `9router/${prefix}/model-${j}`,
            name: `${providerName} modelo ${j}`,
            provider,
            providerName,
            accountIds: [`account-${i}`],
            source: 'live',
          })),
        );
        return {
          updatedAt: Date.now(),
          period: payload.period,
          accountSource: 'live',
          accounts,
          models,
          totals: counters(10),
          modelsAvailable: true,
          usageAvailable: true,
          auto: {
            supported: true,
            available: true,
            next: {
              model: models[0].id,
              accountId: accounts[0].id,
              accountLabel: accounts[0].label,
              provider: 'codex',
              resetAt: Date.now() + 3600000,
              quotaKnown: true,
              live: true,
            },
          },
        };
      };
      ipcMain.handle('dock:router-overview', overview);
      ipcMain.removeHandler('dock:router-models');
      ipcMain.handle('dock:router-models', (event) => overview(event, { period: 'today' }));
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('.dock-compact').click();
    const composer = page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await composer.fill('Rascunho que deve continuar intacto');
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('.dock-connection-card').length === 4,
    );
    assert.equal(
      await page.getByRole('tab', { name: 'Contas', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    assert.equal(await page.getByText('Reconectar', { exact: true }).count(), 1);
    check(
      'Connections show account identity and reconnection state without claiming an expired account is connected',
    );
    await page.getByRole('tab', { name: 'Modelos', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Buscar modelos' });
    const list = page.getByRole('listbox', { name: 'Modelos disponíveis' });
    assert.equal(await list.getByRole('option').count(), 97);
    assert.equal(
      await list.locator('[aria-selected="true"]').getAttribute('data-model'),
      '9router/mesp-auto',
    );
    await search.fill('Cláude 23');
    assert.equal(await list.getByRole('option').count(), 1);
    await search.press('Enter');
    await composer.waitFor();
    assert.equal(await composer.inputValue(), 'Rascunho que deve continuar intacto');
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].routerModel,
      ),
      '9router/cc/model-23',
    );
    check(
      'Accent-insensitive search and Enter apply a model immediately while preserving the composer draft',
    );
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.getByRole('tab', { name: 'Modelos', exact: true }).click();
    await page
      .getByRole('group', { name: 'Filtrar modelos por provedor' })
      .getByRole('button', { name: 'Gemini', exact: true })
      .click();
    assert.equal(await list.getByRole('option').count(), 25);
    await search.fill('inexistente');
    assert.equal(await list.getByRole('option').count(), 0);
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    assert.equal(await list.getByRole('option').count(), 97);
    await search.press('ArrowDown');
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.model),
      '9router/mesp-auto',
    );
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.model),
      '9router/cx/model-0',
    );
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await composer.waitFor();
    check(
      'Provider filters, empty-search recovery and arrow-key selection work with 96 models and Auto',
    );
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.locator('[data-account-id="account-1"] .dock-account-usage-link').click();
    const account = page.getByRole('combobox', { name: 'Conta do consumo' });
    assert.equal(await account.inputValue(), 'account-1');
    assert.equal(await page.locator('.dock-consumption strong').first().textContent(), '2');
    await account.selectOption('all');
    assert.equal(await page.locator('.dock-consumption strong').first().textContent(), '10');
    await page.getByRole('combobox', { name: 'Período do consumo' }).selectOption('7d');
    await page.waitForFunction(
      () => document.querySelector('.dock-consumption strong')?.textContent === '10',
    );
    assert.ok((await app.evaluate(() => globalThis.__settingsPeriods)).includes('7d'));
    check(
      'Account shortcuts, general consumption and period filters request and display the correct data',
    );
    for (const size of [
      { width: 320, height: 480 },
      { width: 384, height: 560 },
      { width: 680, height: 780 },
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, ...size }),
        size,
      );
      for (const [tab, id] of [
        ['Contas', 'accounts'],
        ['Consumo', 'usage'],
        ['Modelos', 'models'],
      ]) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await page.waitForTimeout(450);
        const geometry = await page.locator('.dock-settings').evaluate((el) => {
          const root = el.getBoundingClientRect();
          const body = el.querySelector('.dock-settings-body');
          const footer = el.querySelector('.dock-settings-bottom').getBoundingClientRect();
          const picker = el.querySelector('.dock-model-list');
          return {
            width: root.width,
            horizontal: body.scrollWidth > body.clientWidth + 1,
            footerVisible: footer.bottom <= root.bottom + 1,
            modelHeight: picker?.clientHeight,
            modelScrollable: picker ? picker.scrollHeight > picker.clientHeight : true,
            pieces: [
              ...el.querySelectorAll(
                '.dock-settings-heading,.dock-settings-tabs,.dock-settings-body,.dock-current-model,.dock-model-picker,.dock-model-searchbar,.dock-model-filters,.dock-model-result-caption',
              ),
            ].map((item) => ({
              class: item.className,
              height: item.getBoundingClientRect().height,
            })),
          };
        });
        assert.equal(geometry.horizontal, false, JSON.stringify({ size, tab, geometry }));
        assert.equal(geometry.footerVisible, true, JSON.stringify({ size, tab, geometry }));
        await page.locator('.top-dock').screenshot({
          path: path.join(profile, `${id}-${size.width}.png`),
          omitBackground: true,
        });
        if (id === 'models') {
          assert.ok(geometry.modelHeight > 90, JSON.stringify(geometry));
          assert.ok(geometry.modelScrollable);
        }
        await page.locator('.top-dock').screenshot({
          path: path.join(profile, `${id}-${size.width}.png`),
          omitBackground: true,
        });
      }
    }
    check(
      'Models, accounts and consumption fit 320, 384 and 680 pixel windows; search and footer remain visible',
    );
    await search.fill('Codex 14');
    await page.keyboard.press('Escape');
    await page.locator('.top-dock.mode-petit').waitFor();
    await page.locator('.dock-compact').click();
    await search.waitFor();
    assert.equal(await search.inputValue(), 'Codex 14');
    assert.equal(
      await page.getByRole('tab', { name: 'Modelos', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await list.getByRole('option').click();
    await composer.waitFor();
    await page.reload();
    await page.locator('.dock-compact').click();
    assert.equal(await composer.inputValue(), 'Rascunho que deve continuar intacto');
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].routerModel,
      ),
      '9router/cx/model-14',
    );
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      ipcMain.removeHandler('dock:resolve-intent');
      ipcMain.handle('dock:resolve-intent', () => ({
        action: 'conversation',
        workspace: 'none',
        web: false,
        source: 'model',
      }));
      ipcMain.removeHandler('dock:chat');
      ipcMain.handle(
        'dock:chat',
        () =>
          new Promise((resolve) => {
            globalThis.__finishSettingsTask = resolve;
          }),
      );
    });
    await composer.fill('Converse sobre projetos durante o teste de modelos');
    await composer.press('Enter');
    await page.getByRole('button', { name: 'Parar', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.getByRole('tab', { name: 'Modelos', exact: true }).click();
    await list.waitFor();
    assert.equal(await list.getByRole('option').count(), 97);
    assert.equal(await list.locator('[role="option"]:enabled').count(), 0);
    await page
      .getByText('Você pode consultar os modelos. Pare ou conclua a tarefa para trocar.', {
        exact: true,
      })
      .waitFor();
    await app.evaluate(() =>
      globalThis.__finishSettingsTask({
        ok: true,
        answer: 'Tarefa concluída.',
        needsProject: false,
      }),
    );
    await page.waitForFunction(
      () => document.querySelectorAll('.dock-model-option:enabled').length === 97,
    );
    assert.equal(
      await list.locator('[aria-selected="true"]').getAttribute('data-model'),
      '9router/cx/model-14',
    );
    check(
      'Active tasks allow browsing but block model changes; completing the task unlocks selection',
    );
    assert.deepEqual(errors, []);
    check(
      'Minimizing keeps the model page and search; selection and drafts survive reload with no renderer errors',
    );
    fs.writeFileSync(
      path.join(profile, 'report.json'),
      JSON.stringify(
        { checks, errors, simulatedAccounts: true, realAuthenticationTested: false },
        null,
        2,
      ),
    );
    console.log(`Screenshots: ${profile}`);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
