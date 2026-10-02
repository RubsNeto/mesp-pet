/* global document, innerHeight */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `routing-ui-${Date.now()}`);
  const project = path.join(profile, 'project');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(profile, 'opencode'));
  const requests = [],
    checks = [],
    errors = [];
  let interruptedResponse = false;
  const check = (name) => {
    checks.push(name);
    console.log(`PASS ${name}`);
  };
  const router = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    const reply = (value) => res.end(JSON.stringify(value));
    if (req.url === '/v1/chat/completions') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(payload);
      const prompt = payload.messages.at(-1).content;
      if (prompt === 'Aguarde até eu interromper') {
        res.writeHead(200);
        res.flushHeaders();
        const timer = setTimeout(() => reply({ choices: [] }), 10000);
        res.once('close', () => {
          interruptedResponse = true;
          clearTimeout(timer);
        });
        return;
      }
      return reply({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: prompt.includes('arquivos')
                  ? 'Para corrigir, preciso acessar uma pasta de projeto.'
                  : 'Resposta do 9Router mantendo o contexto.',
                needsProject: prompt.includes('arquivos'),
              }),
            },
          },
        ],
      });
    }
    if (req.url === '/api/providers')
      return reply({
        connections: [
          {
            id: 'qa-codex',
            provider: 'codex',
            name: 'Codex QA',
            isActive: true,
            testStatus: 'success',
          },
          {
            id: 'qa-claude',
            provider: 'claude',
            name: 'Claude QA',
            isActive: true,
            testStatus: 'success',
          },
        ],
      });
    if (req.url === '/v1/models')
      return reply({ data: [{ id: 'cx/model-a' }, { id: 'cc/model-b' }] });
    if (req.url.endsWith('/models'))
      return reply({ models: [{ id: req.url.includes('claude') ? 'model-b' : 'model-a' }] });
    if (req.url === '/api/mesp/capabilities') return reply({ auto: true, source: 'mesp' });
    if (req.url.startsWith('/api/usage/stats'))
      return reply({
        totalRequests: 3,
        totalPromptTokens: 15,
        totalCompletionTokens: 5,
        totalCost: 0.01,
      });
    if (req.url.startsWith('/api/usage/'))
      return reply({
        quotas: {
          session: {
            used: 20,
            total: 100,
            remaining: 80,
            resetAt: new Date(Date.now() + 60000).toISOString(),
          },
        },
      });
    return reply({ settings: {} });
  });
  await new Promise((resolve) => router.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${router.address().port}/v1`;
  fs.writeFileSync(
    path.join(profile, 'opencode', 'opencode.json'),
    JSON.stringify({ provider: { '9router': { options: { baseURL }, models: {} } } }),
  );
  const env = {
    ...process.env,
    MESP_DOCK_DATA_DIR: profile,
    MESP_DOCK_TEST_HIDDEN: '1',
    NINEROUTER_BASE_URL: baseURL,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NINEROUTER_API_KEY;
  const app = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root],
    cwd: root,
    env,
  });
  try {
    await app.evaluate(({ ipcMain }, project) => {
      globalThis.__routingQA = { calls: [], folders: 0, choose: false, nativeSpawns: 0 };
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      ipcMain.removeHandler('terminal:spawn');
      ipcMain.handle('terminal:spawn', () => {
        globalThis.__routingQA.nativeSpawns++;
        return { ok: false };
      });
      ipcMain.removeHandler('dialog:select-folder');
      ipcMain.handle('dialog:select-folder', () => {
        globalThis.__routingQA.folders++;
        return globalThis.__routingQA.choose ? project : null;
      });
      ipcMain.removeHandler('mesp-code:send');
      ipcMain.handle('mesp-code:send', (event, payload) => {
        globalThis.__routingQA.calls.push(payload);
        const emit = (data) =>
          event.sender.send('mesp-code:event', {
            petId: payload.petId,
            requestId: payload.requestId,
            ...data,
          });
        setTimeout(() => {
          emit({ kind: 'started', mode: payload.mode, engine: 'opencode-server' });
          emit({ kind: 'event', event: { type: 'session_created', sessionID: 'ses_qa_context' } });
          emit({
            kind: 'event',
            event: { type: 'text', part: { text: 'Resultado da tarefa preservando o contexto.' } },
          });
          emit({ kind: 'exit', code: 0, durationMs: 20 });
        }, 30);
        return { ok: true };
      });
    }, project);
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(() => localStorage.getItem('mesp-top-projects-v1'));
    const first = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0],
    );
    await page.locator('.dock-compact').click();
    for (const size of [
      { width: 320, height: 560 },
      { width: 680, height: 1080 },
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, ...size }),
        size,
      );
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill('/');
      await page.getByRole('listbox', { name: 'Comandos disponíveis', exact: true }).waitFor();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const bounds = await page.locator('.dock-command-popover').evaluate((el) => {
        const menu = el.getBoundingClientRect();
        const header = document.querySelector('.dock-header').getBoundingClientRect();
        return {
          top: menu.top,
          bottom: menu.bottom,
          headerBottom: header.bottom,
          screenHeight: innerHeight,
        };
      });
      assert.ok(
        bounds.top >= bounds.headerBottom && bounds.bottom <= bounds.screenHeight,
        JSON.stringify(bounds),
      );
      await page.locator('.top-dock').screenshot({
        path: path.join(profile, `commands-clean-${size.width}.png`),
        omitBackground: true,
      });
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).fill('');
    }
    check('Slash commands fit the screen and preserve the mascot header with one empty MESP');
    await page.addInitScript((first) => {
      if (!localStorage.getItem('qa-migration')) {
        localStorage.setItem('qa-migration', '1');
        localStorage.setItem(
          'mesp-top-projects-v1',
          JSON.stringify([
            { ...first, agent: 'codex', taskTitle: 'Projeto Atlas' },
            {
              ...first,
              id: 'mesp-old-claude',
              agent: 'claude',
              name: 'CRM',
              routerModel: '9router/cc/model-b',
            },
          ]),
        );
        localStorage.setItem(
          'mesp-top-conversations-v1',
          JSON.stringify({
            [first.id]: [
              { id: 'old-u', role: 'user', content: 'O projeto se chama Atlas' },
              { id: 'old-a', role: 'assistant', content: 'Contexto salvo da conversa anterior.' },
            ],
          }),
        );
        localStorage.setItem(
          'mesp-top-drafts-v1',
          JSON.stringify([[first.id, 'Rascunho antes da atualização']]),
        );
      }
    }, first);
    await page.reload();
    await page.locator('.dock-compact').click();
    await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
    const field = () => page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    const ask = async (text) => {
      await field().fill(text);
      await field().press('Enter');
    };
    const idle = async () => {
      try {
        await page.waitForFunction(() =>
          JSON.parse(localStorage.getItem('mesp-top-projects-v1')).every((p) => !p.hasActiveTask),
        );
      } catch (error) {
        fs.writeFileSync(
          path.join(profile, 'timeout.json'),
          JSON.stringify(
            {
              pets: await page.evaluate(() => localStorage.getItem('mesp-top-projects-v1')),
              calls: await app.evaluate(() => globalThis.__routingQA),
              errors,
            },
            null,
            2,
          ),
        );
        throw error;
      }
    };
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')).every(
        (p) => p.agent === 'mesp-code',
      ),
    );
    assert.equal(await field().inputValue(), 'Rascunho antes da atualização');
    await page.getByText('Contexto salvo da conversa anterior.', { exact: true }).waitFor();
    assert.equal(await app.evaluate(() => globalThis.__routingQA.nativeSpawns), 0);
    check(
      'Existing Codex and Claude pets migrate to 9Router, preserving appearance, model, draft and conversation',
    );
    await ask('oi');
    await idle();
    assert.equal(requests.length, 0);
    assert.equal(await app.evaluate(() => globalThis.__routingQA.folders), 0);
    check('Greeting stays immediate and never opens a repository or a native agent');
    await field().fill('/');
    const commandList = page.getByRole('listbox', { name: 'Comandos disponíveis', exact: true });
    await commandList.waitFor();
    assert.equal(await commandList.getByRole('option').count(), 10);
    await field().press('ArrowDown');
    await field().press('Tab');
    assert.equal(await field().inputValue(), '/accounts');
    await commandList.waitFor({ state: 'hidden' });
    await field().fill('/mo');
    assert.equal(await commandList.getByRole('option').count(), 1);
    await commandList.getByRole('option', { name: /Modelos/ }).click();
    assert.equal(await field().inputValue(), '/model');
    assert.equal(requests.length, 0);
    await field().fill('/');
    await field().press('Escape');
    assert.equal(await page.locator('.top-dock.mode-home').count(), 1);
    await commandList.waitFor({ state: 'hidden' });
    for (const size of [
      { width: 320, height: 560 },
      { width: 384, height: 680 },
      { width: 680, height: 800 },
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, ...size }),
        size,
      );
      await field().fill('');
      await field().fill('/');
      await commandList.waitFor();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const dimensions = await page.locator('.dock-command-popover').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const d = document.querySelector('.top-dock').getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          dockLeft: d.left,
          dockRight: d.right,
          height: innerHeight,
        };
      });
      assert.ok(
        dimensions.x >= dimensions.dockLeft &&
          dimensions.right <= dimensions.dockRight + 1 &&
          dimensions.y >= 0 &&
          dimensions.bottom <= dimensions.height,
        JSON.stringify(dimensions),
      );
      await page.locator('.top-dock').screenshot({
        path: path.join(profile, `commands-${size.width}.png`),
        omitBackground: true,
      });
      await field().press('Escape');
    }
    check('Slash menu supports click, search, arrow keys, Tab and Escape, and fits narrow screens');
    await ask('/model');
    const selector = page.getByRole('listbox', { name: 'Modelos disponíveis', exact: true });
    await selector.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.dock-model-option').length === 3);
    assert.equal(
      await selector.locator('[aria-selected="true"]').getAttribute('data-model'),
      '9router/mesp-auto',
    );
    const options = await selector
      .locator('[data-model]')
      .evaluateAll((items) => items.map((item) => item.dataset.model));
    assert.deepEqual(
      new Set(options),
      new Set(['9router/mesp-auto', '9router/cx/model-a', '9router/cc/model-b']),
    );
    check('/model lists Auto and models from every configured account');
    await selector.locator('[data-model="9router/cc/model-b"]').click();
    await ask('Qual é o nome do projeto?');
    await idle();
    assert.equal(requests.at(-1).model, 'cc/model-b');
    assert.ok(requests.at(-1).messages.some((m) => m.content === 'O projeto se chama Atlas'));
    check(
      'Manual model selection uses the real router HTTP request with previous conversation context',
    );
    await ask('/model');
    await selector.waitFor();
    await selector.locator('[data-model="9router/mesp-auto"]').click();
    await ask('Continue com o mesmo contexto');
    await idle();
    assert.equal(requests.at(-1).model, 'mesp-auto');
    assert.ok(requests.at(-1).messages.some((m) => m.content === 'O projeto se chama Atlas'));
    check('Auto changes routing without erasing the history');
    const sendButton = page.getByRole('button', { name: 'Enviar pedido', exact: true });
    const sendBounds = await sendButton.boundingBox();
    await ask('Aguarde até eu interromper');
    const stopButton = page.getByRole('button', { name: 'Parar', exact: true });
    await stopButton.waitFor();
    assert.equal(await field().inputValue(), '');
    assert.equal(await stopButton.isEnabled(), true);
    assert.equal(await sendButton.count(), 0);
    assert.equal(await stopButton.count(), 1);
    const stopBounds = await stopButton.boundingBox();
    assert.ok(stopBounds.width <= 32 && stopBounds.width === stopBounds.height);
    assert.ok(Math.abs(stopBounds.x - sendBounds.x) <= 1);
    assert.equal((await stopButton.textContent()).trim(), '');
    await page.waitForFunction(() => document.querySelector('.dock-conversation-actions'));
    await field().fill('Meu rascunho depois de parar');
    const stopAt = Date.now();
    await stopButton.click();
    await sendButton.waitFor();
    await idle();
    assert.ok(
      Date.now() - stopAt < 3000,
      'Stop should abort rather than wait for the upstream response',
    );
    assert.equal(await field().inputValue(), 'Meu rascunho depois de parar');
    const stoppedPet = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0],
    );
    assert.equal(stoppedPet.taskError, false);
    for (let attempt = 0; attempt < 20 && !interruptedResponse; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(interruptedResponse, 'The real router HTTP connection should be aborted');
    check(
      'The send button becomes a compact stop button, aborts the router, restores send and preserves the draft',
    );
    await ask('corrija os arquivos');
    await idle();
    assert.equal(await app.evaluate(() => globalThis.__routingQA.folders), 0);
    const access = page.getByRole('button', { name: 'Escolher projeto e continuar', exact: true });
    await access.waitFor();
    await field().fill('Meu rascunho continua aqui');
    await access.click();
    assert.equal(await field().inputValue(), 'Meu rascunho continua aqui');
    await app.evaluate(() => {
      globalThis.__routingQA.choose = true;
    });
    await access.click();
    await page.waitForFunction(() => document.querySelector('.mesp-chat'));
    await idle();
    const calls = await app.evaluate(() => globalThis.__routingQA.calls);
    fs.writeFileSync(path.join(profile, 'calls.json'), JSON.stringify(calls, null, 2));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].history.some((m) => m.content === 'O projeto se chama Atlas'));
    assert.equal(await field().inputValue(), 'Meu rascunho continua aqui');
    check(
      'Opening a project transfers free conversation context into MESP Code and preserves the draft',
    );
    await field().fill('/');
    await commandList.waitFor();
    assert.equal(await commandList.getByRole('option').count(), 10);
    await commandList.getByRole('option', { name: /Modelos/ }).click();
    await field().press('Enter');
    await selector.waitFor();
    await page.keyboard.press('Control+k');
    check('The same slash menu works in the project composer without losing context');
    await ask('/model');
    await selector.waitFor();
    await selector.locator('[data-model="9router/cx/model-a"]').click();
    await ask('Continue a implementação');
    await idle();
    const next = (await app.evaluate(() => globalThis.__routingQA.calls)).at(-1);
    assert.equal(next.model, '9router/cx/model-a');
    assert.ok(
      next.history.some((m) => m.content === 'O projeto se chama Atlas') ||
        next.sessionId === 'ses_qa_context',
    );
    check('/model works inside a project and preserves the existing session or its history');
    await page.getByRole('button', { name: 'Adicionar MESP', exact: true }).click();
    const pets = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')),
    );
    assert.ok(pets.every((p) => p.agent === 'mesp-code'));
    fs.writeFileSync(path.join(profile, 'pets.json'), JSON.stringify(pets, null, 2));
    assert.equal(pets.at(-1).routerModel, '9router/cx/model-a');
    assert.equal(await app.evaluate(() => globalThis.__routingQA.nativeSpawns), 0);
    check('New pets inherit the router model without starting Codex or Claude directly');
    await page.reload();
    await page.locator('.dock-compact').click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mesp-top-projects-v1')),
    );
    assert.equal(saved.find((p) => p.id === first.id).routerModel, '9router/cx/model-a');
    assert.deepEqual(saved.find((p) => p.id === first.id).traits, first.traits);
    assert.deepEqual(errors, []);
    check('Models and appearances persist after reload with no renderer errors');
    fs.writeFileSync(
      path.join(profile, 'report.json'),
      JSON.stringify(
        { checks, errors, simulatedAccounts: true, realUserAuthenticationTested: false },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
    await new Promise((resolve) => router.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
