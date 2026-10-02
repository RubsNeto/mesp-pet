/* global document, innerWidth */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `agent-project-${Date.now()}`);
  fs.mkdirSync(path.join(profile, 'opencode'), { recursive: true });
  const cwd = path.join(profile, 'projects', 'mesp-primary');
  const files = [
    [
      'index.html',
      '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"><title>Projeto MESP</title></head><body><h1>Projeto MESP</h1><button id="count">Cliques: 0</button><script src="app.js"></script></body></html>',
    ],
    [
      'style.css',
      'body{margin:0;padding:24px;background:#111;color:#fff;font:18px system-ui}button{padding:12px;max-width:100%}',
    ],
    [
      'app.js',
      'let count=0;document.querySelector("#count").onclick=()=>document.querySelector("#count").textContent="Cliques: "+(++count);',
    ],
  ];
  const calls = [],
    errors = [];
  let step = 0,
    folderPrompts = 0;
  const router = http.createServer(async (req, res) => {
    const reply = (body) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (req.url === '/api/providers')
      return reply({
        connections: [{ id: 'qa-agent', provider: 'codex', isActive: true, testStatus: 'success' }],
      });
    if (req.url === '/v1/models') return reply({ data: [{ id: 'cx/mesp-coder' }] });
    if (req.url.endsWith('/models')) return reply({ models: [{ id: 'mesp-coder' }] });
    if (req.url === '/api/mesp/capabilities') return reply({ auto: true });
    if (req.url !== '/v1/chat/completions') return reply({ settings: {} });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(payload);
    fs.writeFileSync(path.join(profile, 'requests.json'), JSON.stringify(calls, null, 2));
    if (!payload.stream)
      return reply({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Resposta curta com o contexto.',
                needsProject: false,
              }),
            },
          },
        ],
      });
    const tool = payload.tools?.find((tool) => tool.function.name === 'write');
    let delta, reason;
    if (step < files.length && tool) {
      const [name, content] = files[step++];
      delta = {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: `call_${step}`,
            type: 'function',
            function: {
              name: 'write',
              arguments: JSON.stringify({ filePath: path.join(cwd, name), content }),
            },
          },
        ],
      };
      reason = 'tool_calls';
    } else if (
      step === files.length &&
      payload.tools?.some((tool) => tool.function.name === 'bash')
    ) {
      step++;
      delta = {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'call_verify',
            type: 'function',
            function: {
              name: 'bash',
              arguments: JSON.stringify({
                command: 'node --check app.js',
                description: 'Verificar sintaxe JavaScript',
              }),
            },
          },
        ],
      };
      reason = 'tool_calls';
    } else {
      delta = {
        role: 'assistant',
        content: payload.tools?.length
          ? 'Criei o site com HTML, CSS e JavaScript, incluindo o botão interativo.'
          : 'O JavaScript está em app.js.',
      };
      reason = 'stop';
    }
    res.setHeader('content-type', 'text/event-stream');
    const event = (data) =>
      res.write(
        'data: ' +
          JSON.stringify({
            id: 'chatcmpl-qa',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'cx/mesp-coder',
            ...data,
          }) +
          '\n\n',
      );
    event({ choices: [{ index: 0, delta, finish_reason: null }] });
    event({
      choices: [{ index: 0, delta: {}, finish_reason: reason }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    res.end('data: [DONE]\n\n');
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
    XDG_DATA_HOME: path.join(profile, 'data'),
    XDG_CONFIG_HOME: path.join(profile, 'config'),
    XDG_CACHE_HOME: path.join(profile, 'cache'),
    XDG_STATE_HOME: path.join(profile, 'state'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NINEROUTER_API_KEY;
  let app;
  const launch = () =>
    _electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [root],
      cwd: root,
      env,
    });
  try {
    app = await launch();
    const setup = async () => {
      await app.evaluate(({ ipcMain, shell, BrowserWindow }) => {
        globalThis.__agentEvents = [];
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        const nativeSend = contents.send.bind(contents);
        contents.send = (channel, ...args) => {
          if (channel === 'mesp-code:event') globalThis.__agentEvents.push(args[0]);
          nativeSend(channel, ...args);
        };
        ipcMain.removeHandler('dock:generate-title');
        ipcMain.handle('dock:generate-title', () => null);
        ipcMain.removeHandler('dialog:select-folder');
        ipcMain.handle('dialog:select-folder', () => {
          globalThis.__agentFolderPrompts = (globalThis.__agentFolderPrompts || 0) + 1;
          return null;
        });
        globalThis.__agentLinks = [];
        shell.openExternal = async (url) => {
          globalThis.__agentLinks.push(url);
        };
        shell.openPath = async () => '';
      });
      const page = await app.firstWindow();
      page.setDefaultTimeout(120000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.locator('.dock-character-button').click();
      await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
      return page;
    };
    let page = await setup();
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .fill(
        'Crie um site com HTML, CSS e JavaScript com um botão contador e mande o link para abrir.',
      );
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Enter');
    await page.getByRole('link', { name: 'Abrir site', exact: true }).waitFor();
    assert.equal(step, 4, 'The installed OpenCode writes the files and runs syntax verification');
    const events = await app.evaluate(() => globalThis.__agentEvents);
    assert.ok(
      events.some(
        (event) =>
          event.event?.part?.tool === 'bash' && event.event.part.state?.status === 'completed',
      ),
    );
    for (const [name, content] of files)
      assert.equal(fs.readFileSync(path.join(cwd, name), 'utf8'), content);
    assert.ok(
      calls.some((call) => call.tools?.length),
      'The router receives tool definitions',
    );
    folderPrompts = await app.evaluate(() => globalThis.__agentFolderPrompts || 0);
    assert.equal(folderPrompts, 0);
    assert.equal(await page.locator('textarea:visible').count(), 1);
    const url = await page.getByRole('textbox', { name: 'Link do site', exact: true }).inputValue();
    assert.match(await (await fetch(url)).text(), /Projeto MESP/);
    await page.getByRole('link', { name: 'Abrir site', exact: true }).click();
    assert.deepEqual(await app.evaluate(() => globalThis.__agentLinks), [url]);
    const previewPromise = app.waitForEvent('window');
    await app.evaluate(async ({ BrowserWindow }, url) => {
      const preview = new BrowserWindow({
        show: false,
        width: 340,
        height: 600,
        webPreferences: { nodeIntegration: false, sandbox: true },
      });
      await preview.loadURL(url);
    }, url);
    const preview = await previewPromise;
    await preview.getByRole('button', { name: 'Cliques: 0' }).click();
    await preview.getByRole('button', { name: 'Cliques: 1' }).waitFor();
    assert.equal(
      await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await preview.close();
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .fill('Qual arquivo contém o JavaScript?');
    await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).press('Enter');
    await page.getByText('O JavaScript está em app.js.', { exact: true }).waitFor();
    assert.ok(!calls.at(-1).tools?.length, 'Simple follow-up questions use the fast path');
    assert.ok(
      JSON.stringify(calls.at(-1).messages).includes('botão contador'),
      'Questions retain the original project context',
    );
    await page
      .getByRole('textbox', { name: 'Pedir ao MESP', exact: true })
      .fill('Rascunho preservado');
    await page.getByRole('button', { name: 'Recolher painel', exact: true }).click();
    await page.locator('.dock-character-button').click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true }).inputValue(),
      'Rascunho preservado',
    );
    await page.locator('.top-dock').screenshot({ path: path.join(profile, 'project-ready.png') });
    await app.close();
    app = await launch();
    page = await setup();
    await page.getByRole('link', { name: 'Abrir site', exact: true }).waitFor();
    const newUrl = await page
      .getByRole('textbox', { name: 'Link do site', exact: true })
      .inputValue();
    assert.notEqual(newUrl, url);
    assert.equal((await fetch(newUrl)).status, 200);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        profile,
        checks: [
          'native tools create HTML/CSS/JS',
          'verified local link',
          'real browser interaction',
          'responsive preview',
          'no folder dialog',
          'one composer',
          'draft and preview survive restart',
        ],
      }),
    );
  } catch (error) {
    if (app) {
      const page = await app.firstWindow();
      console.error(await page.locator('body').innerText());
      await page.locator('.top-dock').screenshot({ path: path.join(profile, 'failure.png') });
    }
    throw error;
  } finally {
    if (app) await app.close();
    router.closeAllConnections();
    await new Promise((resolve) => router.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
