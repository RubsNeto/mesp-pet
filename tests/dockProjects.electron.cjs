/* global document, window, getComputedStyle */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `multi-project-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, MESP_DOCK_DATA_DIR: profile, MESP_DOCK_TEST_HIDDEN: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    _electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [root],
      cwd: root,
      env,
    });
  let app = await launch();
  let page;
  const checks = [];
  const errors = [];
  const check = (text) => {
    checks.push(text);
    console.log(`PASS ${text}`);
  };
  const setup = async () => {
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await app.evaluate(({ ipcMain }) => {
      globalThis.__projectsQA = { titles: [], calls: [], folders: 0, notifications: [] };
      ipcMain.removeHandler('dock:resolve-intent');
      ipcMain.handle('dock:resolve-intent', () => ({
        action: 'conversation',
        workspace: 'none',
        web: false,
        source: 'model',
      }));
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', (_event, payload) => {
        globalThis.__projectsQA.titles.push(payload);
        return null;
      });
      ipcMain.removeHandler('dock:chat');
      ipcMain.handle(
        'dock:chat',
        (_event, payload) =>
          new Promise((resolve) => globalThis.__projectsQA.calls.push({ payload, resolve })),
      );
      ipcMain.removeHandler('dialog:select-folder');
      ipcMain.handle('dialog:select-folder', () => {
        globalThis.__projectsQA.folders++;
        return null;
      });
      ipcMain.removeHandler('app:notify');
      ipcMain.handle('app:notify', (_event, payload) => {
        globalThis.__projectsQA.notifications.push(payload);
        return true;
      });
    });
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))?.length,
    );
  };
  const projects = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('mesp-top-projects-v1')));
  const choose = (id) => page.locator(`.dock-project-switcher [data-project-id="${id}"]`).click();
  const ask = async (text) => {
    const field = page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await field.fill(text);
    await field.press('Enter');
  };
  const hook = (event) =>
    app.evaluate(
      ({ BrowserWindow }, payload) =>
        BrowserWindow.getAllWindows()[0].webContents.send('dock:agent-event', payload),
      event,
    );
  const finish = (id, answer = 'Resultado pronto') =>
    app.evaluate(
      async (_electron, { id, answer }) => {
        const deadline = Date.now() + 10000;
        let call;
        while (
          !(call = globalThis.__projectsQA.calls.find(
            (call) => call.payload.petId === id && !call.done,
          )) &&
          Date.now() < deadline
        )
          await new Promise((resolve) => setTimeout(resolve, 50));
        if (!call) throw new Error(`Missing request ${id}`);
        call.done = true;
        call.resolve({ ok: true, answer, needsProject: false });
      },
      { id, answer },
    );
  const shot = async (name) => {
    await page.waitForFunction(
      () => {
        const dock = document.querySelector('.top-dock');
        const previous = dock.dataset.qaBounds;
        dock.dataset.qaBounds = `${dock.style.width}/${dock.style.height}`;
        return previous === dock.dataset.qaBounds;
      },
      null,
      { polling: 150 },
    );
    await page
      .locator('.top-dock')
      .screenshot({ path: path.join(profile, `${name}.png`), omitBackground: true });
  };
  try {
    await setup();
    const first = (await projects())[0];
    const names = [
      'ERP',
      'CRM',
      'Loja',
      'Site',
      'API',
      'ERP',
      'Financeiro',
      'App',
      'Suporte',
      'Portal',
    ];
    await page.addInitScript(
      ({ first, names }) => {
        if (localStorage.getItem('mesp-qa-seeded')) return;
        localStorage.setItem('mesp-qa-seeded', '1');
        localStorage.setItem(
          'mesp-top-projects-v1',
          JSON.stringify(
            names.map((name, index) => ({
              ...first,
              id: index ? `mesp-test-${index}` : first.id,
              name,
              taskTitle: index === 5 ? 'Revisar estoque' : `Tarefa ${name}`,
              agent: index % 2 ? 'claude' : 'codex',
            })),
          ),
        );
      },
      { first, names },
    );
    await page.reload();
    await page.locator('.dock-compact').click();
    await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
    assert.equal(await page.locator('.dock-project-switcher button').count(), 10);
    assert.equal(
      await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).isDisabled(),
      true,
    );
    check('Ten systems remain accessible with visible names and a scrollable compact switcher');

    const ids = (await projects()).map((p) => p.id);
    await choose(ids[0]);
    await ask('Corrigir cálculo de impostos');
    await page.waitForFunction(() =>
      document.querySelector('.dock-title small')?.textContent.includes('Em andamento'),
    );
    await choose(ids[1]);
    await ask('Integrar WhatsApp no CRM');
    await choose(ids[2]);
    const draft = 'Rascunho da loja\nNão trocar esta conversa';
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill(draft);
    await finish(ids[0], 'Impostos corrigidos.');
    await finish(ids[1], 'Integração WhatsApp pronta.');
    await page.getByRole('button', { name: 'Ver 2 resultados novos', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      draft,
    );
    assert.equal((await projects()).find((p) => p.id === ids[2]).name, 'Loja');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Pedir ao MESP',
    );
    const selection = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-selection-v1')),
    );
    assert.equal(selection.selectedId, ids[2]);
    assert.equal(selection.primaryId, ids[1]);
    check(
      'Two background completions promote the mascot while preserving the active chat, focus and draft',
    );
    await shot('01-parallel-results');

    await page.getByRole('button', { name: 'Ver 2 resultados novos', exact: true }).click();
    const overview = page.getByRole('region', { name: 'Seus MESP', exact: true });
    assert.equal(await overview.locator('.dock-project').count(), 2);
    await overview.getByRole('textbox', { name: 'Buscar projeto ou tarefa' }).fill('whatsapp');
    assert.equal(await overview.locator('.dock-project').count(), 1);
    await overview.locator('.dock-project').click();
    await page.getByText('Integração WhatsApp pronta.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver 1 resultados novos', exact: true }).waitFor();
    assert.equal((await projects()).find((p) => p.id === ids[0]).resultSeenAt, undefined);
    check('Finished filter and search open the correct result and acknowledge only that MESP');

    const before = await app.evaluate(() => globalThis.__projectsQA.titles.length);
    await ask('continue');
    await page.waitForFunction(() =>
      document.querySelector('.dock-title small')?.textContent.includes('Em andamento'),
    );
    assert.equal(
      await page.locator('.dock-task-title strong').textContent(),
      'Integrar WhatsApp no CRM',
    );
    assert.equal(await app.evaluate(() => globalThis.__projectsQA.titles.length), before);
    await finish(ids[1]);
    check('Continue retains a meaningful task name without another title query');

    await page.locator('.dock-task-title').click();
    await page.getByRole('textbox', { name: 'Título da tarefa' }).fill('CRM prioritário');
    await page.getByRole('textbox', { name: 'Título da tarefa' }).press('Enter');
    await ask('Criar relatórios de clientes');
    assert.equal(await page.locator('.dock-task-title strong').textContent(), 'CRM prioritário');
    await finish(ids[1]);
    await page.locator('.dock-task-title').click();
    await page.getByRole('button', { name: 'Usar título automático', exact: true }).click();
    await ask('Criar painel comercial');
    await page.waitForFunction(
      () =>
        document.querySelector('.dock-task-title strong')?.textContent === 'Criar painel comercial',
    );
    await finish(ids[1]);
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).every((p) => !p.hasActiveTask),
    );
    check('Manual titles persist across tasks and can return to automatic naming explicitly');

    await app.evaluate(({ ipcMain }) => {
      globalThis.__projectsQA.deferredTitles = [];
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle(
        'dock:generate-title',
        (_event, payload) =>
          new Promise((resolve) => {
            globalThis.__projectsQA.deferredTitles.push({ payload, resolve });
          }),
      );
    });
    await choose(ids[7]);
    await ask('Implementar catálogo de produtos');
    await page.waitForFunction(() =>
      document.querySelector('.dock-title small')?.textContent.includes('Em andamento'),
    );
    await finish(ids[7]);
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).every((p) => !p.hasActiveTask),
    );
    assert.equal(await app.evaluate(() => globalThis.__projectsQA.deferredTitles.length), 1);
    await ask('Criar cobrança automática');
    await page.waitForFunction(() =>
      document.querySelector('.dock-title small')?.textContent.includes('Em andamento'),
    );
    assert.equal(
      await app.evaluate(() => globalThis.__projectsQA.deferredTitles.length),
      1,
      'A title request must not compete with the main answer',
    );
    await finish(ids[7]);
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).every((p) => !p.hasActiveTask),
    );
    await app.evaluate(() =>
      globalThis.__projectsQA.deferredTitles[1].resolve('Cobrança automática'),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.dock-task-title strong')?.textContent === 'Cobrança automática',
    );
    await app.evaluate(() =>
      globalThis.__projectsQA.deferredTitles[0].resolve('Catálogo de produtos'),
    );
    const captured = await app.evaluate(() => globalThis.__projectsQA.deferredTitles[1].payload);
    assert.ok(
      JSON.parse(captured.prompt).pedidosAnteriores.includes('Implementar catálogo de produtos'),
    );
    assert.equal(
      await page.locator('.dock-task-title strong').textContent(),
      'Cobrança automática',
    );
    check(
      'Delayed AI title for an older task cannot replace the newer objective; naming receives conversation context',
    );
    await ask('Revisar layout do app');
    await finish(ids[7]);
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).every((p) => !p.hasActiveTask),
    );
    await page.locator('.dock-task-title').click();
    await page.getByRole('textbox', { name: 'Título da tarefa' }).fill('App revisado');
    await page.getByRole('textbox', { name: 'Título da tarefa' }).press('Enter');
    await app.evaluate(() =>
      globalThis.__projectsQA.deferredTitles[2].resolve('Título automático atrasado'),
    );
    assert.equal(await page.locator('.dock-task-title strong').textContent(), 'App revisado');
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
    });
    check('A delayed title query respects a manual rename made while the title is pending');

    await choose(ids[3]);
    await hook({ petId: ids[4], state: 'thinking', prompt: 'Corrigir endpoints de pagamento' });
    await hook({ petId: ids[4], state: 'waiting' });
    await ask('Quem está trabalhando?');
    await page.getByRole('region', { name: 'Seus MESP' }).waitFor();
    assert.equal(
      await overview.getByRole('button', { name: /^Em andamento/ }).getAttribute('aria-pressed'),
      'true',
    );
    await overview.getByRole('button', { name: /^Atenção/ }).click();
    assert.equal(await overview.locator('.dock-project').count(), 1);
    await shot('02-attention');
    await overview.getByRole('button', { name: 'Voltar à conversa', exact: true }).click();
    await hook({ petId: ids[4], state: 'success', content: 'Endpoints corrigidos.' });
    await page.getByRole('button', { name: 'Ver 2 resultados novos', exact: true }).waitFor();
    const notifications = await app.evaluate(() => globalThis.__projectsQA.notifications);
    assert.ok(
      notifications.some((n) => n.body.includes('API') && n.body.includes('Corrigir endpoints')),
    );
    check(
      'Native session hooks classify approval separately and identify project and task on completion',
    );

    await hook({ petId: ids[5], state: 'thinking', prompt: 'Ajustar estoque' });
    await hook({ petId: ids[5], state: 'error', content: 'Erro ao ajustar estoque.' });
    await hook({ petId: ids[6], state: 'thinking', prompt: 'Conferir extratos' });
    await page.getByRole('button', { name: 'Ver todos os MESP', exact: true }).click();
    await overview.getByRole('button', { name: /^Todos/ }).click();
    await overview.getByRole('textbox', { name: 'Buscar projeto ou tarefa' }).fill('ERP');
    assert.equal(await overview.locator('.dock-project').count(), 2);
    await overview.getByRole('textbox', { name: 'Buscar projeto ou tarefa' }).fill('INEXISTENTE');
    await overview.getByText('Nenhum projeto ou tarefa encontrado.').waitFor();
    await overview.getByRole('button', { name: 'Ver todos os MESP', exact: true }).click();
    assert.equal(await overview.locator('.dock-project').count(), 10);
    check(
      'Duplicate system names remain distinguishable by task; empty search has a recovery action',
    );

    for (const width of [380, 320, 1280]) {
      await app.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width, height: 800 }),
        width,
      );
      await page.waitForFunction((width) => window.innerWidth === width, width);
      await shot(`03-width-${width}`);
      assert.ok(await page.locator('.dock-workspace').evaluate((el) => el.clientHeight > 140));
      assert.ok(
        await page
          .locator('.dock-projects-overview')
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      assert.ok(
        await page
          .locator('.top-dock')
          .evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth),
      );
    }
    check('320px, 380px and desktop layouts scroll within the island without horizontal overflow');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page
        .locator('.dock-project-switcher button')
        .first()
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      '0s',
    );
    check('Reduced motion disables added transitions');

    const beforeRestart = await projects();
    assert.equal(await app.evaluate(() => globalThis.__projectsQA.folders), 0);
    await app.close();
    app = await launch();
    await setup();
    await page.locator('.dock-compact').click();
    await page.getByRole('button', { name: 'Ver todos os MESP', exact: true }).click();
    const afterRestart = await projects();
    for (const id of [ids[0], ids[4]])
      assert.equal(
        afterRestart.find((p) => p.id === id).completedAt,
        beforeRestart.find((p) => p.id === id).completedAt,
      );
    assert.equal(afterRestart.find((p) => p.id === ids[5]).taskError, true);
    assert.equal(afterRestart.find((p) => p.id === ids[6]).taskInterrupted, true);
    assert.ok(!afterRestart.some((p) => p.hasActiveTask));
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      '',
    );
    await page
      .getByRole('region', { name: 'Seus MESP' })
      .getByRole('button', { name: /^Atenção/ })
      .click();
    assert.equal(await page.locator('.dock-projects-overview .dock-project').count(), 2);
    check(
      'Restart retains results, acknowledgements and errors while identifying interrupted sessions honestly',
    );
    await page
      .getByRole('region', { name: 'Seus MESP' })
      .getByRole('button', { name: 'Voltar à conversa' })
      .click();
    await choose(ids[2]);
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      draft,
    );
    assert.deepEqual(
      afterRestart.map((p) => p.traits),
      beforeRestart.map((p) => p.traits),
    );
    assert.deepEqual(
      afterRestart.map((p) => [p.agent, p.taskTitle, p.titlePinned]),
      beforeRestart.map((p) => [p.agent, p.taskTitle, p.titlePinned]),
    );
    check('Drafts, agent choices, task names and appearances survive restart');
    assert.deepEqual(errors, []);
    check('No renderer errors or unsolicited folder dialogs');
  } finally {
    fs.writeFileSync(
      path.join(profile, 'report.json'),
      JSON.stringify(
        {
          profile,
          checks,
          errors,
          actualElectron: true,
          isolatedProfile: true,
          simulatedAgents: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ checks: checks.length, profile }));
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
