const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { _electron } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const qa = path.join(root, 'qa');
const bin = path.join(qa, 'bin');
const screenshots = path.join(root, 'screenshots');
for (const folder of [qa, bin, screenshots, path.join(qa, 'project-a'), path.join(qa, 'project-b')])
  fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(
  path.join(qa, 'hook-args.cjs'),
  `
const args = process.argv.slice(2);
const notify = args.find(arg => arg.startsWith('notify='));
const url = notify?.match(/http:\\/\\/127\\.0\\.0\\.1:\\d+\\/mesp\\/[a-f0-9]+/)?.[0];
if (url) console.log('MESP_QA_HOOK=' + url);
`,
);
for (const agent of ['codex', 'claude'])
  fs.writeFileSync(
    path.join(bin, `${agent}.cmd`),
    `@echo off\r\nif /i "%~1"=="exec" (\r\n "${process.execPath}" "${path.join(qa, 'title-reply.cjs')}" codex\r\n exit /b\r\n)\r\nif /i "%~1"=="--print" (\r\n "${process.execPath}" "${path.join(qa, 'title-reply.cjs')}" claude\r\n exit /b\r\n)\r\n"${process.execPath}" "${path.join(qa, 'hook-args.cjs')}" %*\r\necho MESP_QA_${agent.toUpperCase()}_READY\r\ncmd.exe /d /q\r\n`,
  );
fs.writeFileSync(
  path.join(qa, 'title-reply.cjs'),
  `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const agent = process.argv[2];
  const title = agent === 'codex' ? 'Revisar resposta do Codex' : 'Preparar tarefa do Claude';
  if (!input.includes('Tarefa:')) process.exit(2);
  console.log(JSON.stringify(agent === 'codex'
    ? {type:'item.completed',item:{type:'agent_message',text:title}}
    : {type:'result',is_error:false,result:title}));
});
`,
);

(async () => {
  const router = http.createServer((request, response) => {
    const url = request.url;
    if (
      url === '/api/mesp/capabilities' ||
      url.startsWith('/api/usage/stats') ||
      url === '/api/usage/qa-codex' ||
      url === '/api/providers/qa-codex/models'
    ) {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify(
          url === '/api/mesp/capabilities'
            ? { auto: true }
            : url.startsWith('/api/usage/stats')
              ? {
                  totalRequests: 12,
                  totalPromptTokens: 9000,
                  totalCompletionTokens: 1000,
                  totalCost: 0.12,
                  byAccount: {
                    a: {
                      connectionId: 'qa-codex',
                      requests: 12,
                      promptTokens: 9000,
                      completionTokens: 1000,
                      cost: 0.12,
                    },
                  },
                }
              : url === '/api/usage/qa-codex'
                ? {
                    quotas: {
                      session: {
                        used: 45,
                        total: 100,
                        remaining: 55,
                        resetAt: new Date(Date.now() + 600000).toISOString(),
                      },
                      weekly: {
                        used: 20,
                        total: 100,
                        remaining: 80,
                        resetAt: new Date(Date.now() + 86400000).toISOString(),
                      },
                    },
                  }
                : {
                    models: [
                      { id: 'qa-model', name: 'Modelo de teste A' },
                      { id: 'qa-second', name: 'Modelo de teste B' },
                    ],
                  },
        ),
      );
      return;
    }
    if (url === '/v1/models' || url === '/api/providers') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify(
          url === '/v1/models'
            ? { data: [{ id: 'cx/qa-model' }, { id: 'cx/qa-second' }] }
            : {
                connections: [
                  {
                    id: 'qa-codex',
                    name: 'Conta de teste',
                    provider: 'codex',
                    isActive: true,
                    accessToken: 'QA_SECRET',
                  },
                  {
                    id: 'qa-claude',
                    provider: 'claude',
                    isActive: false,
                    email: 'QA_PRIVATE_EMAIL',
                  },
                ],
              },
        ),
      );
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      '<!doctype html><meta charset="utf-8"><title>Teste do 9Router</title><h1>Janela de teste — será fechada automaticamente</h1>',
    );
  });
  await new Promise((resolve) => router.listen(0, '127.0.0.1', resolve));
  const routerBaseURL = `http://127.0.0.1:${router.address().port}/v1`;
  const env = {
    ...process.env,
    MESP_DOCK_DATA_DIR: path.join(qa, `profile-${Date.now()}`),
    MESP_DOCK_TEST_HIDDEN: '1',
    PATH: `${bin};${process.env.PATH}`,
    NINEROUTER_BASE_URL: routerBaseURL,
    NINEROUTER_API_KEY: 'qa-router-test-key',
  };
  fs.mkdirSync(path.join(env.MESP_DOCK_DATA_DIR, 'opencode'), { recursive: true });
  fs.writeFileSync(
    path.join(env.MESP_DOCK_DATA_DIR, 'opencode', 'opencode.json'),
    JSON.stringify({
      provider: {
        '9router': {
          options: { baseURL: routerBaseURL, apiKey: 'qa-router-test-key' },
          models: {},
        },
      },
    }),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root],
    cwd: root,
    env,
    timeout: 30000,
  });
  const failures = [];
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (err) => failures.push(err.message));
    await page.waitForSelector('.top-dock');
    console.log('Dock QA: janela oculta pronta');
    await page.evaluate(() => {
      window.qaOutput = [];
      window.mesp.onTerminalStdout((message) => window.qaOutput.push(message));
    });
    await page.waitForFunction(() =>
      document.querySelector('.top-dock')?.classList.contains('mode-petit'),
    );
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { bounds: w.getBounds(), top: w.isAlwaysOnTop(), frame: w.isResizable() };
    });
    assert.equal(bounds.top, true);
    assert.equal(bounds.frame, false);
    await page.screenshot({ path: path.join(screenshots, 'compact.png'), omitBackground: true });
    await page.locator('.dock-compact').click();
    await page.waitForFunction(
      () => Math.abs(document.querySelector('.top-dock').getBoundingClientRect().width - 680) < 1,
    );
    await page.waitForFunction(
      () => Math.abs(document.querySelector('.top-dock').getBoundingClientRect().height - 340) < 1,
    );
    assert.equal(await page.locator('.dock-projects, nav, #dock-agent').count(), 0);
    await page
      .locator('.top-dock')
      .screenshot({ path: path.join(screenshots, 'welcome.png'), omitBackground: true });
    const ask = async (text) => {
      await page.getByRole('textbox', { name: 'Pedir ao MESP' }).fill(text);
      await page.getByRole('textbox', { name: 'Pedir ao MESP' }).press('Enter');
    };
    await app.evaluate(
      ({ ipcMain }, folders) => {
        let index = 0;
        ipcMain.removeHandler('dialog:select-folder');
        ipcMain.handle('dialog:select-folder', () => folders[index++] || null);
      },
      [path.join(qa, 'project-a'), path.join(qa, 'project-b')],
    );
    await ask('Abrir projeto');
    await page.waitForFunction(() => document.body.textContent.includes('project-a'));
    await page.waitForFunction(
      () => document.querySelector('.terminal-status')?.textContent === 'conectado',
    );
    const first = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0],
    );
    assert.equal(first.agent, 'codex');
    assert.equal(first.traits.family, 'sky');
    assert.equal(
      first.traits.palette.bodyMid,
      '#6fcfee',
      'The original MESP keeps its classic blue',
    );
    await ask('echo QA_CHAT_RESPONSE');
    await page.waitForFunction(() =>
      document.querySelector('.dock-chat-reply')?.textContent.includes('QA_CHAT_RESPONSE'),
    );
    await page.waitForFunction(
      () => document.querySelector('.dock-task-title')?.textContent === 'Revisar resposta do Codex',
    );
    assert.equal(
      await page.getByRole('tab', { name: 'Chat', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    // Settings can be consulted without replacing a running coding task.
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.waitForSelector('.dock-settings');
    await page.waitForFunction(() =>
      document.querySelector('.dock-router-health')?.textContent.includes('2 modelos'),
    );
    assert.equal(
      await page.getByRole('button', { name: 'Usar neste MESP', exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await page.evaluate(
        (id) => window.mesp.terminalWrite(id, 'echo QA_SETTINGS_SESSION_ALIVE\r'),
        first.id,
      ),
      true,
    );
    await page.getByRole('tab', { name: 'Chat', exact: true }).click();
    assert.equal(
      await page.evaluate((id) => window.mesp.terminalWrite(id, 'echo QA_SESSION_A\r'), first.id),
      true,
    );
    await ask('Ajuda');
    await page.getByRole('textbox', { name: 'Pedir ao MESP' }).fill('Rascunho do projeto A');
    await page
      .getByRole('dialog', { name: 'Ajuda do MESP' })
      .getByRole('button', { name: 'Abrir projeto', exact: true })
      .click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1')).length === 2,
    );
    assert.equal(await page.getByRole('textbox', { name: 'Pedir ao MESP' }).inputValue(), '');
    assert.equal(
      await page.evaluate(
        (id) => new Map(JSON.parse(localStorage.getItem('mesp-top-drafts-v1'))).get(id),
        first.id,
      ),
      'Rascunho do projeto A',
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.dock-terminal:not([style*="display: none"]) .terminal-status')
          ?.textContent === 'conectado',
    );
    await ask('Chame o Claude');
    await page.waitForFunction(() =>
      document
        .querySelector('.dock-terminal:not([style*="display: none"]) .kiro-terminal-title')
        ?.textContent.includes('Claude Code'),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.dock-terminal:not([style*="display: none"]) .terminal-status')
          ?.textContent === 'conectado',
    );
    const projects = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')),
    );
    assert.equal(projects[2].agent, 'claude');
    assert.equal(projects.length, 3);
    // An already connected agent remains usable if a later installation lookup fails.
    await app.evaluate(({ ipcMain }) => {
      globalThis.__mespQaFailedChecks = 0;
      ipcMain.removeHandler('app:check-command');
      ipcMain.handle('app:check-command', () => {
        globalThis.__mespQaFailedChecks++;
        return false;
      });
    });
    await ask('Claude: echo QA_DELEGATED_CHAT');
    await page.waitForFunction(() =>
      window.qaOutput.some((m) => m.data.includes('QA_DELEGATED_CHAT')),
    );
    assert.equal(await app.evaluate(() => globalThis.__mespQaFailedChecks), 0);
    // A completed background MESP takes the lead, but never overwrites the active draft/chat.
    await page.getByRole('textbox', { name: 'Pedir ao MESP' }).fill('Rascunho do Claude');
    // Use the actual Codex notification helper and private route, without an AI request.
    const hooksDir = path.join(env.MESP_DOCK_DATA_DIR, 'session-hooks');
    const helper = path.join(hooksDir, 'notify.cjs');
    await page.evaluate((id) => window.mesp.terminalWrite(id, 'echo Task completed\r'), first.id);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.notEqual(
      await page.locator('[data-main="true"]').getAttribute('data-mesp-id'),
      first.id,
      'A tool output cannot finish a Codex turn',
    );
    const codexConfig = await page.evaluate(() =>
      window.qaOutput
        .filter((m) => m.petId === 'mesp-primary')
        .map((m) => m.data)
        .join(''),
    );
    const codexUrl = codexConfig.match(
      /MESP_QA_HOOK=(http:\/\/127\.0\.0\.1:\d+\/mesp\/[a-f0-9]+)/,
    )?.[1];
    assert.ok(codexUrl, 'The fake CLI received its scoped completion hook');
    const notified = require('node:child_process').spawnSync(
      process.execPath,
      [
        helper,
        codexUrl,
        JSON.stringify({
          type: 'agent-turn-complete',
          'last-assistant-message': 'Resposta concluída do Codex.',
        }),
      ],
      { timeout: 5000, windowsHide: true },
    );
    assert.equal(notified.status, 0);
    await page.waitForFunction(
      (id) => document.querySelector('[data-main="true"]')?.getAttribute('data-mesp-id') === id,
      first.id,
    );
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP' }).inputValue(),
      'Rascunho do Claude',
    );
    await page.waitForFunction(
      () => document.querySelector('.dock-task-title')?.textContent === 'Preparar tarefa do Claude',
    );
    await page.locator('.dock-completed-banner').click();
    assert.equal(await page.locator('.dock-task-title').textContent(), 'Revisar resposta do Codex');
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP' }).inputValue(),
      'Rascunho do projeto A',
    );
    assert.match(
      await page.locator('.dock-chat-reply').textContent(),
      /Resposta concluída do Codex/,
    );
    // The + flow allows 4+ smaller MESP, including multiple agents in the same folder.
    for (let i = 1; i <= 3; i++) {
      await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).click();
      assert.equal(await page.locator('.dock-new-form').count(), 0);
      assert.equal(await page.getByRole('textbox', { name: 'Título do novo MESP' }).count(), 0);
      if (i === 1)
        await page.locator('.dock-workspace').screenshot({
          path: path.join(screenshots, 'new-mesp.png'),
          omitBackground: true,
        });
      await page.waitForFunction(
        (count) => JSON.parse(localStorage.getItem('mesp-top-projects-v1')).length === count,
        3 + i,
      );
      await page.waitForFunction(
        () =>
          document.querySelector('.dock-terminal:not([style*="display: none"]) .terminal-status')
            ?.textContent === 'conectado',
      );
      const newbornProject = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('mesp-top-projects-v1')).at(-1),
      );
      assert.equal(newbornProject.workDir, first.workDir);
      assert.equal(newbornProject.agent, 'codex');
      assert.equal(newbornProject.taskTitle, 'Novo MESP');
    }
    const allProjects = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')),
    );
    assert.equal(allProjects.length, 6);
    assert.equal(
      new Set(allProjects.map((p) => JSON.stringify(p.traits))).size,
      allProjects.length,
      'Every creation path gives its new MESP an individual random appearance',
    );
    for (const p of allProjects) {
      assert.equal(p.traits.outlineMode, 'none');
      assert.equal(p.traits.aura, 'none');
      assert.equal(p.traits.eyeStyle, 'round');
      assert.equal(p.traits.bodyShape, 'squircle');
      assert.equal(p.traits.eyeCount, 1);
      assert.equal(p.traits.material, 'matte');
      assert.equal(p.traits.gradient, false);
      assert.deepEqual(p.traits.accessories, []);
      for (const field of ['accessory', 'neck', 'back', 'held', 'spots', 'marks'])
        assert.equal(p.traits[field], 'none');
    }
    assert.equal(await page.locator('.dock-mini-button').count(), 5);
    console.log('Dock QA: criação, sessões e títulos verificados');
    // Petting uses motion over the mascot, closes the white eye and never opens another chat.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const pet = page.locator('[data-main="true"]');
    await pet.click();
    await page.waitForFunction(
      () => document.querySelector('[data-main="true"] canvas')?.dataset.squashed === 'true',
    );
    await pet.screenshot({
      path: path.join(screenshots, 'pressed-mesp.png'),
      omitBackground: true,
    });
    await page.waitForFunction(
      () => document.querySelector('[data-main="true"] canvas')?.dataset.squashed === 'false',
    );
    const petRect = await pet.boundingBox();
    await page.mouse.move(petRect.x + 10, petRect.y + petRect.height / 2);
    await page.mouse.move(petRect.x + petRect.width - 10, petRect.y + petRect.height / 2, {
      steps: 8,
    });
    await page.waitForFunction(
      () => document.querySelector('[data-main="true"] canvas')?.dataset.eye === 'closed',
    );
    assert.equal(await pet.locator('.dock-petting-hand').count(), 1);
    await pet.screenshot({ path: path.join(screenshots, 'petting.png'), omitBackground: true });
    await page.mouse.move(petRect.x - 40, petRect.y + 140);
    await page.waitForFunction(() => !document.querySelector('.dock-petting-hand'));
    await page.locator('.dock-task-title').click();
    await page
      .getByRole('textbox', { name: 'Título da tarefa', exact: true })
      .fill('Revisar pagamentos');
    await page.getByRole('textbox', { name: 'Título da tarefa', exact: true }).press('Enter');
    assert.equal(await page.locator('.dock-task-title').textContent(), 'Revisar pagamentos');
    // Each task owns its own draft.
    await page.getByRole('textbox', { name: 'Pedir ao MESP' }).fill('Meu rascunho de pagamentos');
    await page.locator(`[data-mesp-id="${projects[2].id}"]`).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP' }).inputValue(),
      'Rascunho do Claude',
    );
    await page.locator(`[data-mesp-id="${allProjects[5].id}"]`).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP' }).inputValue(),
      'Meu rascunho de pagamentos',
    );
    await page.getByRole('textbox', { name: 'Pedir ao MESP' }).fill('');
    await new Promise((resolve) => setTimeout(resolve, 900));
    await page
      .locator('.top-dock')
      .screenshot({ path: path.join(screenshots, 'multi-mesp-chat.png'), omitBackground: true });
    // Native IPC checks that both PTYs survive project switching and collapse.
    for (const p of allProjects)
      assert.equal(
        await page.evaluate(
          (id) => window.mesp.terminalWrite(id, 'echo QA_CONCURRENT_ALIVE\r'),
          p.id,
        ),
        true,
      );
    await ask('Meus projetos');
    await page.waitForFunction(() => document.querySelectorAll('.dock-project').length === 6);
    await page
      .locator('.dock-workspace')
      .screenshot({ path: path.join(screenshots, 'projects.png'), omitBackground: true });
    await page.locator('.dock-project').first().click();
    await page.getByRole('button', { name: 'Recolher painel' }).click();
    await page.waitForFunction(() =>
      document.querySelector('.top-dock').classList.contains('mode-petit'),
    );
    for (const p of allProjects)
      assert.equal(
        await page.evaluate(
          (id) => window.mesp.terminalWrite(id, 'echo QA_COLLAPSED_ALIVE\r'),
          p.id,
        ),
        true,
      );
    await page.locator('.dock-compact').click();
    await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
    await page.waitForFunction(
      () => Math.abs(document.querySelector('.top-dock').getBoundingClientRect().width - 1040) < 1,
    );
    await page
      .locator('.top-dock')
      .screenshot({ path: path.join(screenshots, 'terminal.png'), omitBackground: true });
    assert.equal(await page.evaluate(() => document.querySelectorAll('.dock-terminal').length), 6);
    // Claude's Stop hook routes a background result to its own MESP as well.
    const claudeSettings = JSON.parse(
      fs.readFileSync(path.join(hooksDir, `${projects[2].id}.json`), 'utf8'),
    );
    const claudeReply = await fetch(claudeSettings.hooks.Stop[0].hooks[0].url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'Stop',
        last_assistant_message: 'Resultado real do Claude.',
      }),
    });
    assert.deepEqual(await claudeReply.json(), {});
    await page.waitForFunction(
      (id) => document.querySelector('[data-main="true"]')?.dataset.mespId === id,
      projects[2].id,
    );
    await page.waitForFunction(() =>
      window.qaOutput.some((m) => m.data.includes('QA_COLLAPSED_ALIVE')),
    );
    const hitRegions = await page.evaluate(async () => {
      await window.mesp.setDockHitRegions([{ x: 0, y: 0, width: 0, height: 0 }]);
      return Boolean(window.mesp);
    });
    assert.equal(hitRegions, true);
    // Restoring the dock must never reroll an existing MESP's appearance.
    await page.reload();
    await page.waitForSelector('.top-dock');
    await page.waitForFunction(() => document.querySelectorAll('[data-mesp-id]').length === 6);
    const restoredProjects = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')),
    );
    assert.deepEqual(
      restoredProjects.map((p) => ({ id: p.id, traits: p.traits })),
      allProjects.map((p) => ({ id: p.id, traits: p.traits })),
      'The six appearances remain identical after reloading the application',
    );
    // Older colourful, heavily decorated saves retain their colour but lose the adornments.
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('mesp-top-projects-v1'));
      saved[0].traits = {
        ...saved[0].traits,
        bodyShape: 'star',
        eyeCount: 3,
        tuft: 'spiky',
        material: 'jelly',
        gradient: true,
        accessory: 'crown',
        accessories: ['crown', 'glasses'],
        back: 'wings',
        held: 'balloon',
        neck: 'scarf',
        spots: 'stars',
        marks: 'heartcheek',
        blush: true,
        aura: 'sparkles',
      };
      localStorage.setItem('mesp-top-projects-v1', JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('[data-mesp-id]').length === 6);
    const cleanedSaved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0],
    );
    assert.deepEqual(cleanedSaved.traits, allProjects[0].traits);
    // Accessories are available only by explicitly saving a customization.
    await page.locator('.dock-compact').click();
    await page.locator('[data-mesp-id="mesp-primary"]').click();
    await ask('Personalize o MESP');
    await page.getByRole('dialog', { name: 'Personalizar este MESP', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Acessórios', exact: true }).click();
    await page.getByLabel('Cabeça', { exact: true }).selectOption('crown');
    await page.getByRole('button', { name: 'Salvar neste MESP', exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].appearanceCustomized === true,
    );
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('[data-mesp-id]').length === 6);
    const manualAppearance = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].traits,
    );
    assert.deepEqual(manualAppearance.accessories, ['crown']);
    assert.equal(manualAppearance.bodyShape, 'squircle');
    await page.locator('.dock-compact').click();
    await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1')).length === 7,
    );
    const newborn = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[6],
    );
    assert.deepEqual(newborn.traits.accessories, []);
    assert.equal(newborn.traits.accessory, 'none');
    assert.equal(newborn.traits.bodyShape, 'squircle');
    assert.notEqual(newborn.traits.family, 'sky', 'New MESP use another available colour');
    assert.notEqual(newborn.appearanceCustomized, true);
    // Real IPC consults the local router, strips private data and opens the requested provider.
    await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
    await page.waitForSelector('.dock-settings');
    await page.waitForFunction(() =>
      document.querySelector('.dock-router-health')?.textContent.includes('2 modelos'),
    );
    assert.equal(await page.getByRole('textbox', { name: 'Pedir ao MESP' }).count(), 0);
    const accounts = await page.evaluate(() => window.mesp.get9RouterConnections());
    assert.deepEqual(accounts, [
      { provider: 'codex', accounts: 1, active: 1 },
      { provider: 'claude', accounts: 1, active: 0 },
    ]);
    assert.ok(!JSON.stringify(accounts).includes('QA_SECRET'));
    assert.ok(!JSON.stringify(accounts).includes('QA_PRIVATE_EMAIL'));
    assert.match(await page.locator('[data-account-id="qa-codex"]').innerText(), /Conta de teste/);
    assert.match(await page.locator('.dock-consumption').innerText(), /10\s+mil/);
    await page
      .getByRole('combobox', { name: 'Conta do consumo', exact: true })
      .selectOption('qa-codex');
    assert.equal(await page.locator('.dock-account-card').count(), 1);
    assert.match(await page.getByRole('progressbar').first().getAttribute('value'), /45/);
    await page
      .getByRole('combobox', { name: 'Modelo deste MESP', exact: true })
      .selectOption('9router/mesp-auto');
    assert.match(await page.locator('.dock-auto-explanation').innerText(), /Conta de teste/);
    await page
      .getByRole('combobox', { name: 'Período do consumo', exact: true })
      .selectOption('7d');
    await page.waitForFunction(
      () => document.querySelector('.dock-settings')?.getAttribute('aria-busy') === 'false',
    );
    await page
      .locator('.top-dock')
      .screenshot({ path: path.join(screenshots, 'settings.png'), omitBackground: true });
    await page.getByRole('button', { name: /Gerenciar Claude Code/ }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.dock-router-loading')?.getAttribute('aria-label') ===
        '9Router pronto',
    );
    const webPreferences = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('file:'))
        .contentView.children.find((view) =>
          view.webContents?.getURL().includes('/dashboard/providers/claude'),
        )
        .webContents.getLastWebPreferences(),
    );
    assert.equal(webPreferences.nodeIntegration, false);
    assert.equal(webPreferences.sandbox, true);
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
      'Router stays inside the island',
    );
    await page.getByRole('button', { name: /Visão geral/ }).click();
    await page
      .getByRole('combobox', { name: 'Modelo deste MESP' })
      .selectOption('9router/mesp-auto');
    await page.getByRole('button', { name: 'Usar neste MESP', exact: true }).click();
    await page.waitForFunction((id) => {
      const saved = JSON.parse(localStorage.getItem('mesp-top-projects-v1')).find(
        (p) => p.id === id,
      );
      return saved.agent === 'mesp-code' && saved.routerModel === '9router/mesp-auto';
    }, newborn.id);
    assert.equal(
      await page.getByRole('tab', { name: 'Chat', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page.reload();
    await page.waitForSelector('.top-dock');
    const restoredModel = await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('mesp-top-projects-v1')).find((p) => p.id === id)
          .routerModel,
      newborn.id,
    );
    assert.equal(restoredModel, '9router/mesp-auto');
    assert.deepEqual(failures, []);
    console.log(
      JSON.stringify({
        ok: true,
        projects: allProjects.map((p) => ({ name: p.name, title: p.taskTitle, agent: p.agent })),
        completionPromotesWithoutStealingDraft: true,
        chatReceivesActualCliOutput: true,
        miniMesps: 5,
        individualRandomAppearances: true,
        appearancesSurviveReload: true,
        newbornClassicShapeWithoutDecorations: true,
        manualAccessoriesSurviveReload: true,
        clickSquashRestored: true,
        oneClickCreationWithoutForm: true,
        aiTitlesReceivedWithoutBlockingTasks: true,
        legacyAppearancesSimplified: true,
        originalMespKeepsBlue: true,
        routerSettingsConnectProviders: true,
        privateCredentialsStayInMainProcess: true,
        selectedRouterModelPersistsPerMesp: true,
        settingsPreserveRunningTask: true,
        alwaysOnTop: bounds.top,
        sessionsSurviveCollapse: true,
        rendererErrors: failures,
        screenshots,
      }),
    );
  } catch (error) {
    const page = await app.firstWindow();
    console.error(
      await page.evaluate(() => ({
        text: document.body.innerText,
        terminals: [...document.querySelectorAll('.dock-terminal')].map((el) => ({
          style: el.getAttribute('style'),
          text: el.textContent,
        })),
        saved: localStorage.getItem('mesp-top-projects-v1'),
      })),
    );
    await page.screenshot({ path: path.join(screenshots, 'failure.png'), omitBackground: true });
    throw error;
  } finally {
    await app.close();
    await new Promise((resolve) => router.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
