/* global document, window */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { isDeepStrictEqual } = require('node:util');
const { _electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const inspect = process.argv.includes('--inspect');
const results = [];
const failures = [];
const check = (name, passed, details) => {
  results.push({ name, passed: !!passed, details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed ? '' : `: ${JSON.stringify(details)}`}`);
};

(async () => {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const profile = path.join(root, 'qa', `complete-audit-${Date.now()}`);
  const shots = path.join(profile, 'screenshots');
  const project = path.join(profile, 'project');
  for (const folder of [shots, project, path.join(profile, 'opencode')])
    fs.mkdirSync(folder, { recursive: true });
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
  let page;
  const setup = async () => {
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => failures.push(error.message));
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      ipcMain.removeHandler('opencode:get-status');
      ipcMain.handle('opencode:get-status', () => ({
        model: '9router/mesp-auto',
        modelCount: 1,
        models: ['9router/mesp-auto'],
        providerPrefixes: ['mesp'],
        routerState: 'ready',
        routerMessage: '',
        routerCheckedAt: Date.now(),
        runtime: { setupRequired: false, portableReady: true },
      }));
      ipcMain.removeHandler('mesp-code:send');
      globalThis.__mespAuditRequests = [];
      ipcMain.handle('mesp-code:send', (event, options) => {
        globalThis.__mespAuditRequests.push({ sender: event.sender, options });
        return { ok: true };
      });
      ipcMain.removeHandler('mesp-code:cancel');
      ipcMain.handle('mesp-code:cancel', (event, payload) => {
        event.sender.send('mesp-code:event', {
          ...payload,
          kind: 'exit',
          cancelled: true,
          code: 0,
        });
        return true;
      });
    });
  };
  const settle = async () => {
    await page.locator('.top-dock').evaluate((el) => {
      delete el.dataset.qaBounds;
    });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.top-dock');
        if (!el) return false;
        const key = `${el.style.width}/${el.style.height}`;
        const previous = el.dataset.qaBounds;
        el.dataset.qaBounds = key;
        return previous === key;
      },
      null,
      { polling: 150 },
    );
  };
  const resize = async (width, height = 720) => {
    await app.evaluate(
      ({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds),
      { x: 0, y: 0, width, height },
    );
    await page.waitForFunction((w) => window.innerWidth === w, width);
    await settle();
  };
  const screenshot = async (name) =>
    page.screenshot({ path: path.join(shots, `${name}.png`), omitBackground: true });
  const expand = () => page.locator('.dock-compact').click({ position: { x: 8, y: 38 } });
  const finishTask = () =>
    app.evaluate(() => {
      const { sender, options } = globalThis.__mespAuditRequests.at(-1);
      sender.send('mesp-code:event', {
        petId: options.petId,
        requestId: options.requestId,
        kind: 'text',
        text: 'Resultado de verificação simulado.',
      });
      sender.send('mesp-code:event', {
        petId: options.petId,
        requestId: options.requestId,
        kind: 'exit',
        code: 0,
        durationMs: 20,
      });
    });
  try {
    await setup();
    await expand();
    await settle();
    await screenshot('01-primeiro-uso');
    const draft = 'Rascunho preservado durante a revisão\nSegunda linha';
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(draft);
    for (let n = 1; n < 10; n++)
      await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).click();
    check(
      'limite de dez personagens',
      await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).isDisabled(),
    );
    const projects = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')),
    );
    check(
      'cores diferentes e sem acessórios automáticos',
      new Set(projects.map((p) => p.traits.family)).size === 10 &&
        projects.every(
          (p) =>
            p.traits.eyeCount === 1 && !p.traits.accessories.length && p.traits.aura === 'none',
        ),
    );
    for (const width of [320, 384, 520, 680, 1366]) {
      await resize(width);
      const expanded = await page.evaluate(() => {
        const shell = document.querySelector('.top-dock').getBoundingClientRect();
        const title = document.querySelector('.dock-task-title').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.dock-mesp-rail button')].map((el) =>
          el.getBoundingClientRect(),
        );
        return {
          shell: { left: shell.left, right: shell.right, width: shell.width },
          titleWidth: title.width,
          buttonsInside: buttons.every((r) => r.left >= -1 && r.right <= window.innerWidth + 1),
          noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      check(
        `painel com dez MESP em ${width}px`,
        expanded.shell.left >= -1 &&
          expanded.shell.right <= width + 1 &&
          expanded.titleWidth >= 96 &&
          expanded.buttonsInside &&
          expanded.noHorizontalScroll,
        expanded,
      );
      await screenshot(`02-dez-mesp-${width}`);
      await page.getByRole('button', { name: 'Recolher painel', exact: true }).click();
      await settle();
      const compact = await page.locator('.top-dock').boundingBox();
      check(
        `ilha recolhida em ${width}px`,
        compact.x >= -1 && compact.x + compact.width <= width + 1,
        compact,
      );
      await screenshot(`03-recolhido-${width}`);
      await expand();
      await settle();
    }
    await resize(384, 600);
    await page.getByRole('button', { name: 'Ver todos os MESP', exact: true }).click();
    await page.keyboard.press('Escape');
    check(
      'Esc fecha a lista antes de recolher',
      (await page.locator('.top-dock.mode-home').count()) === 1 &&
        (await page.locator('.dock-project-overlay').count()) === 0,
    );
    if (!(await page.locator('.top-dock.mode-home').count())) await expand();
    await page.getByRole('tab', { name: 'Chat', exact: true }).click();
    await page.getByRole('button', { name: 'Personalizar MESP', exact: true }).click();
    await settle();
    await screenshot('04-personalizar-384');
    const customization = await page
      .locator('.dock-appearance, .mesp-cz-overlay')
      .evaluate((el) => {
        const card = el.querySelector('.mesp-cz-card') || el;
        const r = card.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          fits:
            r.left >= 0 &&
            r.right <= window.innerWidth + 1 &&
            r.top >= 0 &&
            r.bottom <= window.innerHeight + 1,
        };
      });
    check(
      'personalização dentro da ilha e da janela',
      customization.fits && (await page.locator('.top-dock .dock-appearance').count()) === 1,
      customization,
    );
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    check(
      'cancelar mantém a aparência',
      JSON.stringify(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem('mesp-top-projects-v1')).map((p) => p.traits),
        ),
      ) === JSON.stringify(projects.map((p) => p.traits)),
    );
    await page.evaluate((folder) => {
      const items = JSON.parse(localStorage.getItem('mesp-top-projects-v1'));
      items[0].workDir = folder;
      items[0].agent = 'mesp-code';
      items[0].routerModel = '9router/mesp-auto';
      localStorage.setItem('mesp-top-projects-v1', JSON.stringify(items));
      localStorage.setItem(
        'mesp-code-chat-mesp-primary',
        JSON.stringify({ messages: [], mode: 'fast', selectedModel: '9router/mesp-auto' }),
      );
    }, project);
    await page.reload();
    await expand();
    await page.locator('[data-mesp-id="mesp-primary"]').click();
    await settle();
    await screenshot('05-mesp-code-384');
    const visibleComposers = await page
      .locator('.dock-composer textarea, .mesp-composer textarea')
      .evaluateAll((els) =>
        els.filter((el) => el.checkVisibility()).map((el) => el.getAttribute('aria-label')),
      );
    check('um campo principal para conversar', visibleComposers.length === 1, visibleComposers);
    const codeInput = page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await codeInput.fill('Rascunho exclusivo do MESP Code');
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.keyboard.press('Control+k');
    check(
      'Ctrl+K foca o campo do agente selecionado',
      await codeInput.evaluate((el) => document.activeElement === el),
    );
    check(
      'rascunho MESP Code preservado ao voltar',
      (await codeInput.inputValue()) === 'Rascunho exclusivo do MESP Code',
    );
    await page.locator('.mesp-chat-suggestions button').first().click();
    check(
      'sugestões usam o campo visível sem apagar o rascunho',
      (await codeInput.inputValue()).startsWith('Rascunho exclusivo do MESP Code\n\n') &&
        (await codeInput.evaluate((el) => document.activeElement === el)),
    );
    const composerSendBounds = await page
      .getByRole('button', { name: 'Enviar pedido', exact: true })
      .boundingBox();
    await codeInput.fill('Primeira tarefa de revisão');
    await codeInput.press('Enter');
    await page.getByRole('button', { name: 'Parar', exact: true }).waitFor();
    const composerStop = page.getByRole('button', { name: 'Parar', exact: true });
    const composerStopBounds = await composerStop.boundingBox();
    check(
      'botão de enviar vira parar no mesmo círculo',
      composerStopBounds.width <= 32 &&
        composerStopBounds.width === composerStopBounds.height &&
        Math.abs(composerStopBounds.x - composerSendBounds.x) <= 1 &&
        (await codeInput.inputValue()) === '' &&
        (await composerStop.isEnabled()) &&
        (await composerStop.textContent()).trim() === '' &&
        (await page.getByRole('button', { name: 'Enviar pedido', exact: true }).count()) === 0,
    );
    check(
      'envio inicia e permite parar pelo chat',
      (await app.evaluate(() => globalThis.__mespAuditRequests.length)) === 1 &&
        (await page.getByRole('button', { name: 'Parar', exact: true }).isVisible()),
    );
    await codeInput.fill('Segunda tarefa da fila');
    await codeInput.press('Enter');
    await page.locator('.mesp-prompt-queue').waitFor();
    check(
      'tarefa adicional entra na fila',
      (await app.evaluate(() => globalThis.__mespAuditRequests.length)) === 1 &&
        (await codeInput.inputValue()) === '',
    );
    await codeInput.fill('Este rascunho não foi enviado');
    await finishTask();
    await page.waitForFunction(
      () => document.querySelectorAll('.mesp-message.role-user').length >= 2,
    );
    check(
      'fila inicia sem apagar o próximo rascunho',
      (await codeInput.inputValue()) === 'Este rascunho não foi enviado' &&
        (await app.evaluate(() => globalThis.__mespAuditRequests.length)) === 2,
    );
    await page.getByRole('button', { name: 'Sair do MESP', exact: true }).click();
    await page.getByRole('dialog', { name: 'Sair com tarefas ativas', exact: true }).waitFor();
    check(
      'sair pede confirmação dentro da ilha durante tarefa',
      (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1,
    );
    await page.getByRole('button', { name: 'Continuar trabalhando', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await page.getByRole('dialog', { name: 'Sair com tarefas ativas', exact: true }).waitFor();
    check(
      'fechar a janela também preserva o agente até confirmar',
      await app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().length === 1 &&
          !BrowserWindow.getAllWindows()[0].isDestroyed(),
      ),
    );
    await page.getByRole('button', { name: 'Continuar trabalhando', exact: true }).click();
    await page.getByRole('button', { name: 'Parar', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.mesp-composer-stop'));
    check(
      'botão volta a enviar depois da interrupção',
      await page.getByRole('button', { name: 'Enviar pedido', exact: true }).isVisible(),
    );
    check(
      'parar encerra a tarefa e libera o MESP',
      (await page.evaluate(
        () => !JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].hasActiveTask,
      )) && (await codeInput.inputValue()) === 'Este rascunho não foi enviado',
    );
    await codeInput.fill('personalizar MESP');
    await codeInput.press('Enter');
    await page.getByRole('dialog', { name: 'Personalizar este MESP', exact: true }).waitFor();
    check(
      'comando local funciona no mesmo campo do MESP Code',
      (await app.evaluate(() => globalThis.__mespAuditRequests.length)) === 2,
    );
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    check(
      'fechar a personalização devolve o foco ao chat MESP Code',
      await codeInput.evaluate((el) => document.activeElement === el),
    );
    await codeInput.press('Escape');
    check(
      'Esc recolhe o chat MESP Code',
      (await page.locator('.top-dock.mode-home').count()) === 0,
    );
    await page.keyboard.press('Control+k');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Pedir ao MESP',
    );
    check(
      'Ctrl+K reabre e foca o chat MESP Code recolhido',
      (await page.locator('.top-dock.mode-home').count()) === 1,
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Recolher painel', exact: true }).click();
    await expand();
    await settle();
    const reduced = await page.evaluate(() => ({
      animations: document.getAnimations().filter((a) => a.playState === 'running').length,
      height: document.querySelector('.top-dock').getBoundingClientRect().height,
      width: window.innerWidth,
    }));
    check(
      'movimento reduzido sem transições em andamento',
      reduced.animations === 0 && Math.abs(reduced.height - 576) <= 1,
      reduced,
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const lastId = projects[9].id;
    await page.locator(`[data-mesp-id="${lastId}"]`).click();
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .fill('Continuar aqui depois de reabrir');
    await page.waitForFunction(
      (id) =>
        JSON.parse(localStorage.getItem('mesp-top-drafts-v1')).some(
          ([key, value]) => key === id && value === 'Continuar aqui depois de reabrir',
        ),
      lastId,
    );
    await page.getByRole('button', { name: 'Personalizar MESP', exact: true }).click();
    await page.getByRole('tab', { name: 'Acessórios', exact: true }).click();
    const chosenAccessory = await page
      .getByLabel('Cabeça', { exact: true })
      .locator('option')
      .nth(1)
      .getAttribute('value');
    await page.getByLabel('Cabeça', { exact: true }).selectOption(chosenAccessory);
    await screenshot('06-acessorios-384');
    await page.getByRole('button', { name: 'Salvar neste MESP', exact: true }).click();
    await page.waitForFunction(
      ({ id, accessory }) =>
        JSON.parse(localStorage.getItem('mesp-top-projects-v1'))
          .find((p) => p.id === id)
          .traits.accessories.includes(accessory),
      { id: lastId, accessory: chosenAccessory },
    );
    check(
      'personalização afeta somente o personagem escolhido',
      await page.evaluate(
        ({ id, accessory, primaryFamily }) => {
          const items = JSON.parse(localStorage.getItem('mesp-top-projects-v1'));
          return (
            items.find((p) => p.id === id).traits.accessories.includes(accessory) &&
            items.filter((p) => p.id !== id).every((p) => p.traits.accessories.length === 0) &&
            items[0].traits.family === primaryFamily
          );
        },
        { id: lastId, accessory: chosenAccessory, primaryFamily: projects[0].traits.family },
      ),
    );
    const expectedTraits = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).map((p) => p.traits),
    );
    await app.close();
    app = await launch();
    await setup();
    await expand();
    check(
      'retoma o MESP selecionado após reiniciar',
      (await page.locator(`[data-mesp-id="${lastId}"]`).getAttribute('aria-current')) === 'true',
    );
    if ((await page.locator(`[data-mesp-id="${lastId}"]`).getAttribute('aria-current')) !== 'true')
      await page.locator(`[data-mesp-id="${lastId}"]`).click();
    const restoredDraft = await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .inputValue();
    const restoredTraits = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).map((p) => p.traits),
    );
    check(
      'rascunho e aparência sobrevivem ao reinício',
      restoredDraft === 'Continuar aqui depois de reabrir' &&
        isDeepStrictEqual(restoredTraits, expectedTraits),
      { restoredDraft, traitsMatch: isDeepStrictEqual(restoredTraits, expectedTraits) },
    );
    check('renderer sem exceções', failures.length === 0, failures);
    check(
      'apenas uma janela',
      (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1,
    );
    const report = {
      inspect,
      profile,
      actualElectronApp: true,
      isolatedProfile: true,
      simulatedAgent: true,
      results,
    };
    fs.writeFileSync(path.join(profile, 'report.json'), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        ok: results.every((result) => result.passed),
        checks: results.length,
        profile,
        failedChecks: results.filter((result) => !result.passed).map((result) => result.name),
      }),
    );
    if (!inspect)
      assert.deepEqual(
        results.filter((r) => !r.passed).map((r) => r.name),
        [],
      );
  } finally {
    fs.writeFileSync(
      path.join(profile, 'report.json'),
      JSON.stringify(
        {
          inspect,
          profile,
          actualElectronApp: true,
          isolatedProfile: true,
          simulatedAgent: true,
          results,
          rendererErrors: failures,
        },
        null,
        2,
      ),
    );
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
