/* global document, innerHeight */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { _electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const profile = path.join(root, 'qa', `usability-${Date.now()}`);
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
  const launch = () =>
    _electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [root],
      cwd: root,
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ dialog }) => {
      globalThis.__mespQaFolderPrompts = 0;
      dialog.showOpenDialog = async () => {
        globalThis.__mespQaFolderPrompts++;
        return { canceled: true, filePaths: [] };
      };
    });
    const firstDraft = 'Rascunho do primeiro projeto — revisão\nDetalhes adicionais do código';
    const secondDraft = 'Rascunho do segundo projeto — outra tarefa';
    await page.locator('.dock-compact').click();
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .fill('Rascunho do primeiro projeto — revisão');
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Shift+Enter');
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .pressSequentially('Detalhes adicionais do código');
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    const multilineBounds = await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .boundingBox();
    assert.ok(multilineBounds.height >= 40 && multilineBounds.height <= 112);
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('.top-dock').screenshot({
      path: path.join(root, 'screenshots', 'mesp-multiline.png'),
      omitBackground: true,
    });
    await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).click();
    const secondId = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[1].id,
    );
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(secondDraft);
    await page.locator('.dock-task-title').click();
    await page
      .getByRole('textbox', { name: 'Título da tarefa', exact: true })
      .fill('Revisar carrinho');
    await page.getByRole('textbox', { name: 'Título da tarefa', exact: true }).press('Enter');
    await page.waitForFunction(
      (id) =>
        JSON.parse(localStorage.getItem('mesp-top-drafts-v1')).some(
          ([key, text]) => key === id && text.includes('outra tarefa'),
        ),
      secondId,
    );
    await page.locator('[data-mesp-id="mesp-primary"]').click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    await page.locator('.dock-task-title').click();
    await page
      .getByRole('textbox', { name: 'Título da tarefa', exact: true })
      .fill('Revisar pagamentos');
    await page.getByRole('textbox', { name: 'Título da tarefa', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'O que posso pedir?', exact: true }).click();
    const help = page.getByRole('dialog', { name: 'Ajuda do MESP', exact: true });
    await help.waitFor();
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector('.top-dock').getBoundingClientRect().height -
            Math.min(640, innerHeight - 24),
        ) < 1,
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    await page
      .locator('.top-dock')
      .screenshot({ path: path.join(root, 'screenshots', 'mesp-help.png'), omitBackground: true });
    assert.ok(
      await help.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      'All help actions and tips fit at the regular width',
    );
    const initialBounds = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const bounds = window.getBounds();
      window.setBounds({ x: 0, y: 0, width: 384, height: 480 });
      return bounds;
    });
    await page.waitForFunction(
      () => document.querySelector('.top-dock').getBoundingClientRect().width <= 361,
    );
    assert.ok(
      await help.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      'Help scrolls vertically without horizontal clipping on small screens',
    );
    const codeDraft =
      'Revise este código:\n' +
      Array.from({ length: 8 }, (_, index) => `const value${index} = ${index};`).join('\n');
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(codeDraft);
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      codeDraft,
    );
    const longDraft = await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        scrolls: element.scrollHeight > element.clientHeight,
      }));
    assert.equal(longDraft.height, 112);
    assert.equal(longDraft.scrolls, true);
    await page.locator('.top-dock').screenshot({
      path: path.join(root, 'screenshots', 'mesp-help-narrow.png'),
      omitBackground: true,
    });
    await app.evaluate(
      ({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds),
      initialBounds,
    );
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(firstDraft);
    await page.keyboard.press('Escape');
    await help.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.top-dock.mode-home').count(), 1);
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    await page.getByRole('button', { name: 'O que posso pedir?', exact: true }).click();
    await help.getByRole('button', { name: 'Gerenciar contas', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.dock-router-viewport')?.getAttribute('data-router-page') ===
          'providers' &&
        document.querySelector('.dock-router-loading')?.getAttribute('aria-label') ===
          '9Router pronto',
      undefined,
      { timeout: 60000 },
    );
    await page.keyboard.press('Control+k');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Pedir ao MESP',
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    for (const [command, target] of [
      ['Modelos', 'overview'],
      ['Ver consumo', 'usage'],
      ['Conectar Codex', 'codex'],
      ['Configurar ferramentas', 'cli-tools'],
    ]) {
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(command);
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Enter');
      await page.getByRole('tab', { name: 'Configurações', exact: true }).waitFor();
      if (target === 'overview')
        await page.waitForFunction(
          () =>
            document.querySelector('.dock-settings') &&
            !document.querySelector('.dock-router-viewport'),
        );
      else
        await page.waitForFunction(
          (value) =>
            document.querySelector('.dock-router-viewport')?.getAttribute('data-router-page') ===
              value &&
            document.querySelector('.dock-router-loading')?.getAttribute('aria-label') ===
              '9Router pronto',
          target,
        );
      await page.keyboard.press('Control+k');
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('aria-label') === 'Pedir ao MESP',
      );
    }
    assert.equal(
      await app.evaluate(() => globalThis.__mespQaFolderPrompts),
      0,
      'Local commands never open a project chooser or send a task',
    );
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .fill('Abrir MESP Revisar carrinho');
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Enter');
    await page.waitForFunction(() =>
      document.querySelector('.dock-task-title')?.textContent.includes('Revisar carrinho'),
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      secondDraft,
    );
    await page.locator('[data-mesp-id="mesp-primary"]').click();
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(firstDraft);
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.keyboard.press('Control+k');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Pedir ao MESP',
    );
    assert.equal(
      await page.getByRole('tab', { name: 'Chat', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('.top-dock').classList.contains('mode-home'),
    );
    await page.keyboard.press('Control+k');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Pedir ao MESP',
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.locator('.dock-compact').click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    await page.locator(`[data-mesp-id="${secondId}"]`).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      secondDraft,
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
    );
    console.log(
      JSON.stringify({
        ok: true,
        actualElectronApp: true,
        draftsSurviveFullRestartPerMesp: true,
        multilineDraftsAndShiftEnter: true,
        clickableHelpPreservesDraft: true,
        naturalCommandsOpenSettingsInsideDock: true,
        taskTitleSelectsMesp: true,
        responsiveHelpAndLongCodeDrafts: true,
        shortcutReturnsToChatAndFocusesInput: true,
        shortcutReopensCollapsedDock: true,
        isolatedProfile: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
