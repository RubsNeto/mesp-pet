/* global document, innerWidth */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `todo-${Date.now()}`);
  const cwd = path.join(profile, 'projects', 'mesp-primary');
  fs.mkdirSync(path.join(profile, 'opencode'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  // Keep OpenCode snapshots inside this fixture instead of indexing the app repository.
  execFileSync('git', ['init', '--quiet', cwd], { windowsHide: true });
  const files = [
    [
      'index.html',
      '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Minhas tarefas</title><link rel="stylesheet" href="style.css"><h1>Minhas tarefas</h1><form><input aria-label="Nova tarefa" required><button>Adicionar</button></form><ul></ul><script src="app.js"></script></html>',
    ],
    [
      'style.css',
      'body{margin:0;padding:16px;background:#111;color:white;font:16px system-ui}form{display:flex;gap:8px}input{min-width:0;flex:1}li{display:flex;gap:8px;overflow-wrap:anywhere}li span{flex:1}',
    ],
    [
      'app.js',
      `let tasks=JSON.parse(localStorage.getItem('tasks')||'[]');
const list=document.querySelector('ul'),input=document.querySelector('form input');
function render(){localStorage.setItem('tasks',JSON.stringify(tasks));list.replaceChildren();tasks.forEach((task,i)=>{const li=document.createElement('li'),check=document.createElement('input'),label=document.createElement('span'),remove=document.createElement('button');check.type='checkbox';check.checked=task.done;check.setAttribute('aria-label','Concluir '+task.text);check.onchange=()=>{task.done=check.checked;render()};label.textContent=task.text;remove.textContent='Excluir';remove.onclick=()=>{tasks.splice(i,1);render()};li.append(check,label,remove);list.append(li)})}
document.querySelector('form').onsubmit=e=>{e.preventDefault();if(input.value.trim()){tasks.push({text:input.value.trim(),done:false});input.value='';render()}};render();`,
    ],
  ];
  const requests = [],
    errors = [];
  let step = 0;
  const router = http.createServer(async (req, res) => {
    const reply = (value) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(value));
    };
    if (req.url === '/api/providers')
      return reply({
        connections: [{ id: 'qa', provider: 'codex', isActive: true, testStatus: 'success' }],
      });
    if (req.url.endsWith('/models'))
      return reply({ data: [{ id: 'cx/todo' }], models: [{ id: 'todo' }] });
    if (req.url === '/api/mesp/capabilities') return reply({ auto: true });
    if (req.url !== '/v1/chat/completions') return reply({ settings: {} });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(payload);
    if (!payload.stream)
      return reply({
        choices: [
          {
            message: {
              content: '{"answer":"Explicação de uma lista de tarefas.","needsProject":false}',
            },
          },
        ],
      });
    assert.ok(payload.tools.some((t) => t.function.name === 'write'));
    const file = files[step++];
    const delta = file
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `todo-${step}`,
              type: 'function',
              function: {
                name: 'write',
                arguments: JSON.stringify({ filePath: path.join(cwd, file[0]), content: file[1] }),
              },
            },
          ],
        }
      : { role: 'assistant', content: 'Lista de tarefas criada. Use Abrir site para começar.' };
    res.setHeader('content-type', 'text/event-stream');
    const send = (delta, finish_reason) =>
      res.write(
        'data: ' +
          JSON.stringify({
            id: 'todo-qa',
            object: 'chat.completion.chunk',
            model: payload.model,
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          '\n\n',
      );
    send(delta, null);
    send({}, file ? 'tool_calls' : 'stop');
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
  try {
    app = await _electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [root],
      cwd: root,
      env,
    });
    await app.evaluate(({ ipcMain, BrowserWindow, shell }) => {
      globalThis.__todoQA = { folders: 0, events: [], links: [] };
      const contents = BrowserWindow.getAllWindows()[0].webContents,
        send = contents.send.bind(contents);
      contents.send = (channel, ...args) => {
        if (channel === 'mesp-code:event') globalThis.__todoQA.events.push(args[0]);
        send(channel, ...args);
      };
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      ipcMain.removeHandler('dialog:select-folder');
      ipcMain.handle('dialog:select-folder', () => {
        globalThis.__todoQA.folders++;
        return null;
      });
      shell.openExternal = async (url) => {
        globalThis.__todoQA.links.push(url);
      };
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('.dock-character-button').click();
    await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await field.fill('Como criar uma todolist?');
    await field.press('Enter');
    await page.getByText('Explicação de uma lista de tarefas.', { exact: true }).waitFor();
    assert.equal(await page.locator('.mesp-chat').count(), 0);
    const before = requests.length;
    await field.fill('crie uma todolist');
    await field.press('Enter');
    await page.getByRole('link', { name: 'Abrir site', exact: true }).waitFor();
    await page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].hasActiveTask,
    );
    assert.ok(
      requests.slice(before).every((r) => r.stream && r.tools.length),
      'Creation bypasses fast conversation',
    );
    for (const [name, content] of files)
      assert.equal(fs.readFileSync(path.join(cwd, name), 'utf8'), content);
    const qa = await app.evaluate(() => globalThis.__todoQA);
    assert.equal(qa.folders, 0);
    assert.ok(
      qa.events.some(
        (e) => e.event?.part?.tool === 'write' && e.event.part.state?.status === 'completed',
      ),
    );
    assert.ok(qa.events.some((e) => e.kind === 'exit' && e.code === 0 && !e.error));
    const url = await page.getByRole('textbox', { name: 'Link do site', exact: true }).inputValue();
    await page.getByRole('link', { name: 'Abrir site', exact: true }).click();
    assert.deepEqual(await app.evaluate(() => globalThis.__todoQA.links), [url]);
    const windowPromise = app.waitForEvent('window');
    await app.evaluate(async ({ BrowserWindow }, url) => {
      const win = new BrowserWindow({
        show: false,
        width: 340,
        height: 600,
        webPreferences: { nodeIntegration: false, sandbox: true },
      });
      await win.loadURL(url);
    }, url);
    const preview = await windowPromise;
    preview.on('pageerror', (error) => errors.push(error.message));
    await preview.getByRole('textbox', { name: 'Nova tarefa' }).fill('Verificar entrega');
    await preview.getByRole('button', { name: 'Adicionar', exact: true }).click();
    const checkbox = preview.getByRole('checkbox', { name: 'Concluir Verificar entrega' });
    await checkbox.check();
    await preview.reload();
    assert.equal(await checkbox.isChecked(), true);
    await checkbox.uncheck();
    assert.equal(await checkbox.isChecked(), false);
    await preview.getByRole('button', { name: 'Excluir', exact: true }).click();
    assert.equal(await preview.getByRole('checkbox').count(), 0);
    assert.equal(
      await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await preview.close();
    assert.deepEqual(errors, []);
    const evidence = {
      passed: true,
      profile,
      simulatedProvider: true,
      nativeOpenCode: true,
      exactPrompt: 'crie uma todolist',
      checks: [
        'tutorial stays fast',
        'command executes native write tools',
        'no folder picker',
        'verified clickable preview',
        'add, complete, undo and delete',
        'persistence after reload',
        'narrow screen',
      ],
    };
    fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'requests.json'), JSON.stringify(requests, null, 2));
    if (app) {
      fs.writeFileSync(
        path.join(profile, 'events-failure.json'),
        JSON.stringify(await app.evaluate(() => globalThis.__todoQA), null, 2),
      );
      fs.writeFileSync(
        path.join(profile, 'failure.txt'),
        await (await app.firstWindow()).locator('body').innerText(),
      );
    }
    throw error;
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => router.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
