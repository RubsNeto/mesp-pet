/* global window, document */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `developer-${Date.now()}`);
  const cwd = path.join(profile, 'project');
  fs.mkdirSync(path.join(profile, 'opencode'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  execFileSync('git', ['init', '-q', cwd], { windowsHide: true });
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({
      type: 'module',
      scripts: { test: 'node --test app.test.js', check: 'node wait.cjs' },
    }),
  );
  fs.writeFileSync(path.join(cwd, 'app.js'), 'export function add(a,b){return a+b}');
  fs.writeFileSync(
    path.join(cwd, 'app.test.js'),
    'import {test} from "node:test";import assert from "node:assert/strict";import {add} from "./app.js";test("addition",()=>assert.equal(add(2,3),5));',
  );
  fs.writeFileSync(
    path.join(cwd, 'wait.cjs'),
    'const fs=require("node:fs");if(fs.existsSync("wait.flag")){fs.writeFileSync("check.pid",String(process.pid));setInterval(()=>{},1000)}',
  );
  fs.writeFileSync(path.join(cwd, 'user-draft.txt'), 'Customer work: preserve exactly.');
  let step = 0,
    cancelStep = 0,
    fixes = new Set();
  const calls = [],
    errors = [];
  const router = http.createServer(async (req, res) => {
    const reply = (data) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(data));
    };
    if (req.url === '/api/mesp/capabilities') return reply({ auto: true });
    if (req.url === '/api/providers')
      return reply({
        connections: [
          { id: 'qa-developer', provider: 'codex', isActive: true, testStatus: 'success' },
        ],
      });
    if (req.url === '/v1/models') return reply({ data: [{ id: 'cx/qa-developer' }] });
    if (req.url.endsWith('/models')) return reply({ models: [{ id: 'qa-developer' }] });
    if (req.url !== '/v1/chat/completions') return reply({ settings: {} });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(payload);
    if (!payload.stream)
      return reply({
        choices: [
          {
            message: {
              content: JSON.stringify({ action: 'execute', workspace: 'existing', web: false }),
            },
          },
        ],
      });
    const latest = String(
      payload.messages.filter((message) => message.role === 'user').at(-1)?.content || '',
    );
    const cancelling = latest.includes('QA_CANCEL_CHECK');
    const repair = latest.includes('Correção automática');
    const repairAttempt = Number(latest.match(/Correção automática (\d+)/)?.[1] || 0);
    let delta,
      reason = 'stop';
    const write = (name, content, id) => ({
      role: 'assistant',
      tool_calls: [
        {
          index: 0,
          id,
          type: 'function',
          function: {
            name: 'write',
            arguments: JSON.stringify({ filePath: path.join(cwd, name), content }),
          },
        },
      ],
    });
    if (cancelling && cancelStep++ === 0) {
      delta = write('wait.flag', 'wait', 'cancel-check-write');
      reason = 'tool_calls';
    } else if (cancelling) delta = { role: 'assistant', content: 'Arquivo criado.' };
    else if (!repair && step++ === 0) {
      delta = write('app.js', 'export function add(a,b){return a-b}', 'bad-implementation');
      reason = 'tool_calls';
    } else if (repair && !fixes.has(repairAttempt)) {
      fixes.add(repairAttempt);
      const expression = repairAttempt === 1 ? 'a*b' : repairAttempt === 2 ? 'a/b' : 'a+b';
      delta = write(
        'app.js',
        `export function add(a,b){return ${expression}}`,
        'fix-implementation-' + repairAttempt,
      );
      reason = 'tool_calls';
    } else delta = { role: 'assistant', content: 'Implementação finalizada.' };
    res.setHeader('content-type', 'text/event-stream');
    const send = (item, finish) =>
      res.write(
        'data: ' +
          JSON.stringify({
            id: 'developer-qa',
            object: 'chat.completion.chunk',
            model: payload.model,
            choices: [{ index: 0, delta: item, finish_reason: finish }],
            ...(finish
              ? { usage: { prompt_tokens: 40000, completion_tokens: 1000, total_tokens: 41000 } }
              : {}),
          }) +
          '\n\n',
      );
    send(delta, null);
    send({}, reason);
    res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => router.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(
    path.join(profile, 'opencode', 'opencode.json'),
    JSON.stringify({
      provider: {
        '9router': {
          npm: '@ai-sdk/openai-compatible',
          options: { baseURL: `http://127.0.0.1:${router.address().port}/v1`, apiKey: 'qa-only' },
          models: { 'cx/qa-developer': { name: 'QA', tool_call: true } },
        },
      },
    }),
  );
  const env = {
    ...process.env,
    MESP_DOCK_DATA_DIR: profile,
    MESP_DOCK_TEST_HIDDEN: '1',
    XDG_DATA_HOME: path.join(profile, 'data'),
    XDG_CONFIG_HOME: path.join(profile, 'config'),
    XDG_CACHE_HOME: path.join(profile, 'cache'),
    XDG_STATE_HOME: path.join(profile, 'state'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    _electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [root],
      cwd: root,
      env,
    });
  let app;
  try {
    app = await launch();
    let page = await app.firstWindow();
    page.setDefaultTimeout(180000);
    page.on('pageerror', (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow, ipcMain }) => {
      globalThis.__developerQA = [];
      const clock = Date.now.bind(Date);
      globalThis.__developerClockOffset = 0;
      Date.now = () => clock() + globalThis.__developerClockOffset;
      const contents = BrowserWindow.getAllWindows()[0].webContents,
        send = contents.send.bind(contents);
      contents.send = (channel, ...args) => {
        if (channel === 'mesp-code:event') {
          globalThis.__developerQA.push(args[0]);
          if (args[0].kind === 'started' && args[0].petId === 'mesp-primary')
            globalThis.__developerClockOffset = 600000;
        }
        send(channel, ...args);
      };
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      globalThis.__developerCopies = [];
      ipcMain.removeHandler('clipboard:write-text');
      ipcMain.handle('clipboard:write-text', (_event, text) => {
        globalThis.__developerCopies.push(text);
        return true;
      });
    });
    await page.waitForFunction(() => localStorage.getItem('mesp-top-projects-v1'));
    await page.evaluate((cwd) => {
      const pets = JSON.parse(localStorage.getItem('mesp-top-projects-v1'));
      pets[0].workDir = cwd;
      pets[0].agentPresetId = 'mesp-code';
      pets[0].routerModel = '9router/cx/qa-developer';
      localStorage.setItem('mesp-top-projects-v1', JSON.stringify(pets));
      localStorage.setItem(
        'mesp-code-chat-mesp-primary',
        JSON.stringify({
          messages: [],
          mode: 'fast',
          limitsVersion: 2,
          limits: { maxDurationMs: 300000, maxTokens: 1000, maxToolCalls: 1 },
        }),
      );
    }, cwd);
    await page.reload();
    await page.locator('.dock-character-button').first().click();
    await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
    const field = () => page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await field().fill('Corrija a soma em app.js e valide o projeto.');
    await field().press('Enter');
    await page.waitForFunction(() =>
      document.querySelector('.mesp-message-live')?.textContent.includes('Implementando'),
    );
    const conflict = await page.evaluate(
      async (cwd) =>
        window.mesp.sendMespCode({
          petId: 'mesp-conflict',
          requestId: 'run-conflict',
          cwd,
          mode: 'autonomous',
          model: '9router/cx/qa-developer',
          prompt: 'Altere app.js',
          history: [],
          limits: { maxDurationMs: 300000, maxTokens: 100000, maxToolCalls: 50 },
        }),
      cwd,
    );
    assert.equal(conflict.ok, false);
    assert.match(conflict.error, /Outro MESP/);
    await page.evaluate((cwd) => {
      window.__waitingDeveloper = window.mesp.sendMespCode({
        petId: 'mesp-waiting',
        requestId: 'run-waiting',
        cwd,
        mode: 'autonomous',
        model: '9router/cx/qa-developer',
        prompt: 'Altere app.js',
        waitForProject: true,
        history: [],
        limits: { maxDurationMs: 300000, maxTokens: 100000, maxToolCalls: 50 },
      });
    }, cwd);
    await app.evaluate(async () => {
      const deadline = Date.now() + 5000;
      while (
        !globalThis.__developerQA.some(
          (event) => event.petId === 'mesp-waiting' && event.event?.phase?.startsWith('Aguardando'),
        ) &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.ok(
      (await app.evaluate(() => globalThis.__developerQA)).some(
        (event) => event.petId === 'mesp-waiting' && event.event?.phase?.startsWith('Aguardando'),
      ),
    );
    assert.equal(
      await page.evaluate(() => window.mesp.cancelMespCode('mesp-waiting', 'run-waiting')),
      true,
    );
    assert.equal((await page.evaluate(() => window.__waitingDeveloper)).ok, true);
    await page.locator('.dock-delivery.status-passed').waitFor();
    const events = await app.evaluate(() => globalThis.__developerQA);
    const delivery = events.find((event) => event.event?.type === 'developer_report').event.report;
    assert.equal(delivery.repairs, 3, 'Corrections continue beyond the former two-attempt budget');
    assert.ok(
      delivery.durationMs > 300000,
      'Elapsed clock beyond five minutes does not terminate work',
    );
    assert.ok(!JSON.stringify(events).includes('Limite de tokens atingido'));
    assert.deepEqual(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('mesp-code-chat-mesp-primary')).limits,
      ),
      { maxDurationMs: 0, maxTokens: 0, maxToolCalls: 0 },
    );
    await app.evaluate(() => {
      globalThis.__developerClockOffset = 0;
    });
    assert.ok(delivery.checks.some((check) => check.name === 'test' && check.code === 0));
    assert.ok(calls.some((call) => JSON.stringify(call.messages).includes('addition')));
    assert.ok(calls.some((call) => JSON.stringify(call.messages).includes('user-draft.txt')));
    assert.equal(
      fs.readFileSync(path.join(cwd, 'user-draft.txt'), 'utf8'),
      'Customer work: preserve exactly.',
    );
    assert.equal(
      events.filter((event) => event.kind === 'exit' && event.petId === 'mesp-primary').length,
      1,
      'Repair is continuous, with one final completion',
    );
    await page.locator('.dock-delivery summary').first().click();
    await page.getByRole('button', { name: 'Copiar entrega', exact: true }).click();
    assert.match((await app.evaluate(() => globalThis.__developerCopies))[0], /test: passed/);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width: 320, height: 760 }),
    );
    assert.equal(
      await page
        .locator('.dock-delivery')
        .first()
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await page.locator('.top-dock').screenshot({
      path: path.join(profile, 'delivery-320.png'),
      timeout: 10000,
      animations: 'disabled',
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width: 760, height: 900 }),
    );
    await page.getByRole('button', { name: 'Salvar relatório', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Relatório salvo:' }).waitFor();
    assert.equal(
      fs.readdirSync(path.join(profile, 'deliveries')).filter((name) => name.endsWith('.md'))
        .length,
      1,
    );
    await field().fill('Crie um arquivo wait.flag para QA_CANCEL_CHECK.');
    await field().press('Enter');
    await page.waitForFunction(() =>
      document.querySelector('.mesp-message-live')?.textContent.includes('Verificando: check'),
    );
    await page.waitForFunction((cwd) => window.mesp && cwd, cwd);
    const pidFile = path.join(cwd, 'check.pid');
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(pidFile) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(fs.existsSync(pidFile));
    const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    const requestId = await app.evaluate(
      () => globalThis.__developerQA.filter((event) => event.kind === 'started').at(-1).requestId,
    );
    assert.equal(
      await page.evaluate(
        (requestId) => window.mesp.cancelMespCode('mesp-primary', requestId),
        requestId,
      ),
      true,
    );
    await page.locator('.dock-delivery.status-cancelled').waitFor();
    assert.throws(() => process.kill(childPid, 0), 'Cancelled check child must exit');
    await field().fill('Rascunho preservado após reiniciar');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    await page.locator('.dock-character-button').first().click();
    assert.equal(await field().inputValue(), 'Rascunho preservado após reiniciar');
    await page.locator('.dock-delivery.status-passed').waitFor();
    await page.locator('.dock-delivery.status-passed > details > summary').click();
    await page.getByRole('button', { name: 'Salvar relatório', exact: true }).first().click();
    await page.getByRole('status').filter({ hasText: 'Relatório salvo:' }).waitFor();
    assert.deepEqual(errors, []);
    const evidence = {
      passed: true,
      simulatedProvider: true,
      nativeOpenCode: true,
      profile,
      checks: [
        'real failing Node test repaired automatically',
        'three successive corrections exceed the previous two-correction cap',
        'old saved duration, token and tool budgets migrate to unlimited execution',
        'native task completes beyond five minutes of simulated elapsed time and 100k tokens',
        'original user files preserved',
        'same-project conflict blocked',
        'same-project task waits automatically and can be cancelled before tools',
        'one continuous task through correction',
        'independent tests pass',
        'export delivery',
        'copy delivery without touching system clipboard',
        'delivery layout fits 320px',
        'cancel owned verification process',
        'draft and delivery survive restart',
        'export survives restart',
      ],
    };
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    await app?.close().catch(() => {});
    router.closeAllConnections();
    await new Promise((resolve) => router.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
