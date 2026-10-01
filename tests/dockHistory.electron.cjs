/* global document, window, getComputedStyle */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { _electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const profile = path.join(root, 'qa', `history-${Date.now()}`);
  const bin = path.join(profile, 'bin');
  const project = path.join(profile, 'project');
  for (const folder of [bin, project, path.join(profile, 'opencode')])
    fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(profile, 'opencode', 'opencode.json'),
    JSON.stringify({
      provider: { '9router': { options: { baseURL: `http://127.0.0.1:${port}/v1` }, models: {} } },
    }),
  );
  const hookArgs = path.join(profile, 'hook-args.cjs');
  fs.writeFileSync(
    hookArgs,
    `
const notify = process.argv.slice(2).find(arg => arg.startsWith('notify='));
const url = notify?.match(/http:\\/\\/127\\.0\\.0\\.1:\\d+\\/mesp\\/[a-f0-9]+/)?.[0];
if (url) console.log('MESP_QA_HOOK=' + url);
`,
  );
  fs.writeFileSync(
    path.join(bin, 'codex.cmd'),
    `@echo off\r\nif /i "%~1"=="exec" exit /b\r\n"${process.execPath}" "${hookArgs}" %*\r\necho MESP_QA_HISTORY_READY\r\ncmd.exe /d /q\r\n`,
  );
  const env = {
    ...process.env,
    MESP_DOCK_DATA_DIR: profile,
    MESP_DOCK_TEST_HIDDEN: '1',
    PATH: `${bin};${process.env.PATH}`,
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
  const failures = [];
  let app = await launch();
  let page;
  const setup = async () => {
    page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => failures.push(error.message));
    await app.evaluate(({ ipcMain }, folder) => {
      ipcMain.removeHandler('dialog:select-folder');
      ipcMain.handle('dialog:select-folder', () => folder);
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      // Exercise the real IPC route without replacing the user's system clipboard.
      globalThis.__mespQaCopies = [];
      globalThis.__mespQaCopyEnabled = true;
      ipcMain.removeHandler('clipboard:write-text');
      ipcMain.handle('clipboard:write-text', (_event, text) => {
        if (!globalThis.__mespQaCopyEnabled) return false;
        globalThis.__mespQaCopies.push(text);
        return true;
      });
    }, project);
    await page.evaluate(() => {
      window.qaOutput = [];
      window.mesp.onTerminalStdout((message) => window.qaOutput.push(message));
    });
  };
  const ask = async (text) => {
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(text);
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Enter');
  };
  const complete = async (id, content) => {
    await page.waitForFunction(
      (petId) =>
        window.qaOutput
          .filter((message) => message.petId === petId)
          .some((message) => message.data.includes('MESP_QA_HOOK=')),
      id,
    );
    const output = await page.evaluate(
      (petId) =>
        window.qaOutput
          .filter((message) => message.petId === petId)
          .map((message) => message.data)
          .join(''),
      id,
    );
    const hook = output.match(/MESP_QA_HOOK=(http:\/\/127\.0\.0\.1:\d+\/mesp\/[a-f0-9]+)/)?.[1];
    assert.ok(hook);
    const result = spawnSync(
      process.execPath,
      [
        path.join(profile, 'session-hooks', 'notify.cjs'),
        hook,
        JSON.stringify({ type: 'agent-turn-complete', 'last-assistant-message': content }),
      ],
      { windowsHide: true, timeout: 5000 },
    );
    assert.equal(result.status, 0);
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('.dock-message-text')].some((element) =>
          element.textContent.includes(text),
        ),
      content.split('\n')[0],
    );
    await page.waitForFunction(() => !document.querySelector('.dock-typing'));
  };
  try {
    await setup();
    await page.locator('.dock-compact').click();
    await ask('Abrir projeto');
    await page.waitForFunction(
      () => document.querySelector('.terminal-status')?.textContent === 'conectado',
    );
    await ask('echo HISTORIA_REAL_MESP');
    await page.waitForFunction(() =>
      document.querySelector('.dock-chat-reply')?.textContent.includes('HISTORIA_REAL_MESP'),
    );
    const code = 'const total = 42;';
    const firstReply =
      `Resultado da revisão.\n\n\`\`\`ts\r\n${code}\r\n\`\`\`\n\n` +
      Array.from({ length: 90 }, (_, index) => `Passo ${index + 1}: resultado conferido.`).join(
        '\n',
      );
    await complete('mesp-primary', firstReply);
    await page.getByRole('button', { name: 'Copiar código', exact: true }).click();
    assert.equal(await app.evaluate(() => globalThis.__mespQaCopies[0]), code);
    await page.getByRole('button', { name: 'Copiar resposta', exact: true }).click();
    assert.equal(await app.evaluate(() => globalThis.__mespQaCopies[1]), firstReply);
    await page
      .getByRole('button', { name: 'Copiar resposta', exact: true })
      .locator('.dock-copy-feedback')
      .getByText('Resposta copiada.', { exact: true })
      .waitFor({ state: 'attached' });
    await app.evaluate(() => {
      globalThis.__mespQaCopyEnabled = false;
    });
    await page.getByRole('button', { name: 'Copiar código', exact: true }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.dock-copy-button')].some(
        (element) =>
          element.getAttribute('aria-label') === 'Copiar código' &&
          element.title.includes('Não foi possível copiar'),
      ),
    );
    assert.match(
      await page.getByRole('button', { name: 'Copiar código', exact: true }).getAttribute('title'),
      /Não foi possível copiar/,
    );
    await app.evaluate(() => {
      globalThis.__mespQaCopyEnabled = true;
    });
    await page.getByRole('button', { name: 'Copiar código', exact: true }).click();
    assert.equal(await app.evaluate(() => globalThis.__mespQaCopies[2]), code);
    await page.locator('.dock-chat-log').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByRole('button', { name: 'Ir para o fim', exact: true }).waitFor();
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.locator('.top-dock').screenshot({
      path: path.join(root, 'screenshots', 'mesp-history.png'),
      omitBackground: true,
    });
    await ask('echo RESPOSTA_NOVA_MESP');
    await page.getByRole('button', { name: 'Novas mensagens', exact: true }).waitFor();
    assert.ok(
      await page.locator('.dock-chat-log').evaluate((element) => element.scrollTop < 40),
      'New output does not pull the reader away from old messages',
    );
    await page.getByRole('button', { name: 'Novas mensagens', exact: true }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector('.dock-chat-log');
      return element.scrollHeight - element.scrollTop - element.clientHeight < 2;
    });
    await complete('mesp-primary', 'Resultado final da segunda tarefa.');
    const firstDraft = 'Continuar a revisão amanhã';
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(firstDraft);
    await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).click();
    const secondId = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[1].id,
    );
    await ask('echo HISTORIA_SEGUNDO_MESP');
    await page.waitForFunction(() =>
      document.querySelector('.dock-chat-reply')?.textContent.includes('HISTORIA_SEGUNDO_MESP'),
    );
    await complete(secondId, 'Conversa do segundo MESP.');
    const secondDraft = 'Rascunho reservado para o segundo MESP';
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(secondDraft);
    await page.locator('[data-mesp-id="mesp-primary"]').click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    const appearances = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).map((project) => project.traits),
    );
    // Closing the real Electron app tests the final history flush as well as disk restore.
    await app.close();
    app = await launch();
    await setup();
    await page.locator('.dock-compact').click();
    await page.waitForFunction(() =>
      document
        .querySelector('.dock-conversation')
        ?.textContent.includes('Resultado final da segunda tarefa.'),
    );
    assert.match(await page.locator('.dock-conversation').innerText(), /const total = 42;/);
    assert.match(await page.locator('.dock-session-boundary').innerText(), /nova sessão do agente/);
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      firstDraft,
    );
    await page.waitForFunction(
      () => document.querySelector('.terminal-status')?.textContent === 'conectado',
    );
    assert.equal(
      await page.evaluate(() =>
        window.qaOutput.some((message) =>
          /HISTORIA_REAL_MESP|RESPOSTA_NOVA_MESP/.test(message.data),
        ),
      ),
      false,
      'Restored messages are never automatically submitted to a new agent',
    );
    await page.locator(`[data-mesp-id="${secondId}"]`).click();
    await page.waitForFunction(() =>
      document
        .querySelector('.dock-conversation')
        ?.textContent.includes('Conversa do segundo MESP.'),
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      secondDraft,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem('mesp-top-projects-v1')).map((project) => project.traits),
      ),
      appearances,
    );
    await page.locator('[data-mesp-id="mesp-primary"]').click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width: 384, height: 680 }),
    );
    await page.waitForFunction(
      () => document.querySelector('.top-dock').getBoundingClientRect().width <= 361,
    );
    assert.ok(
      await page
        .locator('.dock-chat-log')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    );
    await page.getByRole('button', { name: 'Copiar código', exact: true }).click();
    assert.equal(await app.evaluate(() => globalThis.__mespQaCopies[0]), code);
    await page.locator('.top-dock').screenshot({
      path: path.join(root, 'screenshots', 'mesp-history-narrow.png'),
      omitBackground: true,
    });
    // The 9Router-backed MESP Code chat uses the same copy controls and reading behavior.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('opencode:get-status');
      ipcMain.handle('opencode:get-status', () => ({
        model: '9router/mesp-auto',
        modelCount: 1,
        models: ['9router/mesp-auto'],
        providerPrefixes: ['mesp'],
        routerState: 'ready',
        routerMessage: '',
        routerCheckedAt: Date.now(),
        runtime: {
          opencode: 'bundled',
          node: 'bundled',
          npm: 'bundled',
          router: 'bundled',
          routerBundledAvailable: true,
          portableReady: true,
          setupRequired: false,
        },
      }));
      globalThis.__mespQaPendingCode = null;
      ipcMain.removeHandler('mesp-code:send');
      ipcMain.handle('mesp-code:send', (event, options) => {
        globalThis.__mespQaPendingCode = { sender: event.sender, options };
        return { ok: true };
      });
    });
    await page.evaluate((reply) => {
      const projects = JSON.parse(localStorage.getItem('mesp-top-projects-v1'));
      projects[0].agent = 'mesp-code';
      projects[0].routerModel = '9router/mesp-auto';
      localStorage.setItem('mesp-top-projects-v1', JSON.stringify(projects));
      localStorage.setItem(
        'mesp-code-chat-mesp-primary',
        JSON.stringify({
          messages: [
            {
              id: 'code-user',
              role: 'user',
              text: 'Revise este código.',
              status: 'done',
              tools: [],
            },
            { id: 'code-reply', role: 'assistant', text: reply, status: 'done', tools: [] },
          ],
          mode: 'fast',
          selectedModel: '9router/mesp-auto',
        }),
      );
    }, firstReply);
    await page.reload();
    await page.locator('.dock-compact').click();
    const codeChat = page.getByRole('region', { name: 'Chat MESP Code', exact: true });
    const toolbarFits = await codeChat.locator('.mesp-chat-toolbar').evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const controls = [...element.querySelectorAll(':scope > div, :scope > button')]
        .filter((control) => getComputedStyle(control).display !== 'none')
        .map((control) => control.getBoundingClientRect());
      return (
        controls.every((rect) => rect.left >= outer.left && rect.right <= outer.right + 1) &&
        controls.every((rect, index) =>
          controls
            .slice(index + 1)
            .every(
              (other) =>
                rect.right <= other.left + 1 ||
                other.right <= rect.left + 1 ||
                rect.bottom <= other.top + 1 ||
                other.bottom <= rect.top + 1,
            ),
        )
      );
    });
    assert.equal(
      toolbarFits,
      true,
      'Model, limits and new conversation controls do not overlap in the narrow island',
    );
    await codeChat.getByRole('button', { name: 'Copiar código', exact: true }).click();
    assert.equal(await app.evaluate(() => globalThis.__mespQaCopies[1]), code);
    await codeChat.getByRole('button', { name: 'Copiar resposta', exact: true }).click();
    assert.equal(await app.evaluate(() => globalThis.__mespQaCopies[2]), firstReply);
    await codeChat.locator('.mesp-chat-scroll').evaluate((element) => {
      element.scrollTop = 0;
    });
    await codeChat.getByRole('button', { name: 'Ir para o fim', exact: true }).waitFor();
    await ask('Verifique a última resposta.');
    await codeChat.getByRole('button', { name: 'Novas mensagens', exact: true }).waitFor();
    await app.evaluate(() => {
      const { sender, options } = globalThis.__mespQaPendingCode;
      sender.send('mesp-code:event', {
        petId: options.petId,
        requestId: options.requestId,
        kind: 'text',
        text: 'Nova resposta do MESP Code.',
      });
      sender.send('mesp-code:event', {
        petId: options.petId,
        requestId: options.requestId,
        kind: 'exit',
        code: 0,
        durationMs: 10,
      });
    });
    await codeChat.getByText('Nova resposta do MESP Code.', { exact: true }).waitFor();
    assert.ok(
      await codeChat.locator('.mesp-chat-scroll').evaluate((element) => element.scrollTop < 40),
    );
    await codeChat.getByRole('button', { name: 'Novas mensagens', exact: true }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector('.mesp-chat-scroll');
      return element.scrollHeight - element.scrollTop - element.clientHeight < 2;
    });
    await page.waitForFunction(() => {
      const viewport = document.querySelector('.mesp-chat-scroll').getBoundingClientRect();
      const reply = [...document.querySelectorAll('.mesp-chat-scroll span')].find(
        (element) => element.textContent === 'Nova resposta do MESP Code.',
      );
      if (!reply) return false;
      const bounds = reply.getBoundingClientRect();
      return (
        viewport.height >= 180 && bounds.top >= viewport.top && bounds.bottom <= viewport.bottom
      );
    });
    assert.ok(
      await codeChat
        .locator('.mesp-chat-scroll')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    );
    await page.locator('.top-dock').screenshot({
      path: path.join(root, 'screenshots', 'mesp-code-history-narrow.png'),
      omitBackground: true,
    });
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
    );
    assert.deepEqual(failures, []);
    console.log(
      JSON.stringify({
        ok: true,
        actualElectronApp: true,
        cliConversationsSurviveFullRestart: true,
        separateHistoryAndDraftPerMesp: true,
        restoredHistoryNeverResubmitted: true,
        copyReplyAndCodeViaIpc: true,
        copyFailureIsRecoverable: true,
        readerPositionPreservedDuringNewOutput: true,
        latestMessageShortcut: true,
        sameCopyAndReadingControlsInMespCode: true,
        historyFitsNarrowDock: true,
        latestMespCodeReplyVisibleInNarrowDock: true,
        originalAppearancesPreserved: true,
        isolatedProfile: true,
        systemClipboardUntouched: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
