/* global window */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = path.join(root, 'qa', `computer-${Date.now()}`);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mesp-computer-access-'));
  const source = path.join(outside, 'arquivo com espaços.txt');
  const written = path.join(outside, 'resultado.txt');
  const commandResult = path.join(outside, 'comando.txt');
  const copied = path.join(outside, 'copia-exata.txt');
  const planCopy = path.join(outside, 'plan-must-not-copy.txt');
  const assistedCopy = path.join(outside, 'assisted-copy.txt');
  const planTarget = path.join(outside, 'plan-must-not-write.txt');
  const assistedTarget = path.join(outside, 'assisted.txt');
  const token = `arquivo externo real ${Date.now()}`;
  fs.writeFileSync(source, token);
  fs.mkdirSync(path.join(profile, 'opencode'), { recursive: true });
  const requests = [],
    errors = [],
    stages = new Map();
  const dashboardLocked = process.argv.includes('--dashboard-locked');
  const router = http.createServer(async (req, res) => {
    const reply = (body) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (dashboardLocked && req.url.startsWith('/api/') && req.url !== '/api/mesp/capabilities') {
      res.statusCode = 401;
      return reply({ error: 'Dashboard authentication required' });
    }
    if (req.url === '/api/providers')
      return reply({
        connections: [{ id: 'qa', provider: 'codex', isActive: true, testStatus: 'success' }],
      });
    if (req.url.endsWith('/models'))
      return reply({ data: [{ id: 'cx/mesp-coder' }], models: [{ id: 'mesp-coder' }] });
    if (req.url === '/api/mesp/capabilities') return reply({ auto: true });
    if (req.url !== '/v1/chat/completions') return reply({ settings: {} });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(payload);
    fs.writeFileSync(path.join(profile, 'requests.json'), JSON.stringify(requests, null, 2));
    if (!payload.stream)
      return reply({
        choices: [{ message: { content: '{"answer":"Conversa rápida.","needsProject":false}' } }],
      });
    const user = String(payload.messages.filter((m) => m.role === 'user').at(-1)?.content || '');
    const marker = /QA_COMPUTER_(AUTO|PLAN|ASSISTED_COPY|ASSISTED)/.exec(user)?.[1];
    const copyTool =
      payload.tools?.find((t) => t.function.name.endsWith('_copy_file'))?.function.name ||
      'mesp_computer_copy_file';
    const stage = stages.get(marker) || 0;
    stages.set(marker, stage + 1);
    const ps = `[IO.File]::WriteAllText('${commandResult.replaceAll("'", "''")}',[IO.File]::ReadAllText('${source.replaceAll("'", "''")}') + ' comando Windows')`;
    const actions =
      marker === 'AUTO'
        ? [
            ['read', { filePath: source }],
            ['write', { filePath: written, content: token + ' editado' }],
            [copyTool, { source, destination: copied }],
            [
              'bash',
              {
                command: `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, 'utf16le').toString('base64')}`,
                description: 'Executar PowerShell em arquivo externo',
              },
            ],
          ]
        : marker === 'PLAN'
          ? [
              ['read', { filePath: source }],
              ['write', { filePath: planTarget, content: 'must be denied' }],
              [copyTool, { source, destination: planCopy }],
            ]
          : marker === 'ASSISTED_COPY'
            ? [
                ['read', { filePath: source }],
                [copyTool, { source, destination: assistedCopy }],
              ]
            : [
                ['read', { filePath: source }],
                ['write', { filePath: assistedTarget, content: 'aprovado' }],
              ];
    const action = actions[stage];
    const delta = action
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `call_${marker}_${stage}`,
              type: 'function',
              function: { name: action[0], arguments: JSON.stringify(action[1]) },
            },
          ],
        }
      : { role: 'assistant', content: `QA_COMPUTER_${marker} concluído` };
    const envelope = (choices) => ({
      id: 'chatcmpl-computer',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'cx/mesp-coder',
      choices,
    });
    res.setHeader('content-type', 'text/event-stream');
    res.write(
      'data: ' + JSON.stringify(envelope([{ index: 0, delta, finish_reason: null }])) + '\n\n',
    );
    res.write(
      'data: ' +
        JSON.stringify(
          envelope([{ index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' }]),
        ) +
        '\n\n',
    );
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
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      globalThis.__computerEvents = [];
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      const send = wc.send.bind(wc);
      wc.send = (channel, ...args) => {
        if (channel === 'mesp-code:event') globalThis.__computerEvents.push(args[0]);
        send(channel, ...args);
      };
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
      ipcMain.removeHandler('dialog:select-folder');
      ipcMain.handle('dialog:select-folder', () => {
        globalThis.__computerFolderPrompts = (globalThis.__computerFolderPrompts || 0) + 1;
        return null;
      });
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(150000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(() => localStorage.getItem('mesp-top-projects-v1'));
    await page.evaluate(() => {
      const pets = JSON.parse(localStorage.getItem('mesp-top-projects-v1'));
      pets[0].routerModel = '9router/mesp-auto';
      localStorage.setItem('mesp-top-projects-v1', JSON.stringify(pets));
    });
    await page.reload();
    await page.locator('.dock-character-button').click();
    await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await field.fill(
      `Leia "${source}", grave resultado.txt ao lado e execute PowerShell para verificar: QA_COMPUTER_AUTO`,
    );
    await field.press('Enter');
    await page.getByText('QA_COMPUTER_AUTO concluído', { exact: true }).waitFor();
    await page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].hasActiveTask,
    );
    const cwd = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0].workDir,
    );
    assert.ok(!source.startsWith(cwd + path.sep), 'Fixture is outside the selected workspace');
    assert.equal(fs.readFileSync(written, 'utf8'), token + ' editado');
    assert.equal(fs.readFileSync(commandResult, 'utf8'), token + ' comando Windows');
    assert.equal(fs.readFileSync(copied, 'utf8'), token, 'Native MCP copy preserves every byte');
    assert.ok(
      requests.some((r) => r.stream && r.model === 'mesp-auto'),
      'Native Auto is registered and reaches the router even when dashboard access fails',
    );
    assert.ok(
      requests.some((r) =>
        r.messages.some((m) => m.role === 'tool' && String(m.content).includes(token)),
      ),
      'The native read returns actual external file contents',
    );
    assert.equal(await app.evaluate(() => globalThis.__computerFolderPrompts || 0), 0);
    const run = async (mode, marker) => {
      const requestId = `computer-${marker.toLowerCase().replaceAll('_', '-')}`;
      const petId = `qa-${requestId}`;
      const result = await page.evaluate((payload) => window.mesp.sendMespCode(payload), {
        petId,
        requestId,
        mode,
        model: '9router/cx/mesp-coder',
        cwd,
        prompt: `Leia "${source}": QA_COMPUTER_${marker}`,
        limits: { maxDurationMs: 150000, maxTokens: 100000, maxToolCalls: 10 },
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      return { petId, requestId };
    };
    const waitEvent = async (requestId, kind) => {
      const deadline = Date.now() + 150000;
      while (Date.now() < deadline) {
        const event = await app.evaluate(
          (_electron, { requestId, kind }) =>
            globalThis.__computerEvents.find((e) => e.requestId === requestId && e.kind === kind),
          { requestId, kind },
        );
        if (event) return event;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(`No ${kind} event for ${requestId}`);
    };
    const plan = await run('plan', 'PLAN');
    const planExit = await waitEvent(plan.requestId, 'exit');
    assert.equal(planExit.error, undefined, JSON.stringify(planExit));
    assert.equal(
      fs.existsSync(planTarget),
      false,
      'Plan cannot write outside or inside the workspace',
    );
    const assisted = await run('assisted', 'ASSISTED');
    assert.equal(
      fs.existsSync(planCopy),
      false,
      'Plan cannot bypass read-only permissions using MCP',
    );
    const permission = await waitEvent(assisted.requestId, 'permission');
    assert.equal(
      permission.permission.action,
      'edit',
      'External directory access does not replace write approval',
    );
    assert.equal(fs.existsSync(assistedTarget), false, 'Assisted write waits for approval');
    const approved = await page.evaluate(
      (payload) => window.mesp.replyMespCodePermission(payload),
      { ...assisted, permissionId: permission.permission.id, reply: 'once' },
    );
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const assistedExit = await waitEvent(assisted.requestId, 'exit');
    assert.equal(assistedExit.error, undefined, JSON.stringify(assistedExit));
    assert.equal(fs.readFileSync(assistedTarget, 'utf8'), 'aprovado');
    const copySession = await run('assisted', 'ASSISTED_COPY');
    const copyPermission = await waitEvent(copySession.requestId, 'permission');
    assert.match(copyPermission.permission.action, /copy_file/);
    assert.equal(fs.existsSync(assistedCopy), false, 'MCP copy waits for assisted approval');
    const copyApproved = await page.evaluate(
      (payload) => window.mesp.replyMespCodePermission(payload),
      { ...copySession, permissionId: copyPermission.permission.id, reply: 'once' },
    );
    assert.equal(copyApproved.ok, true);
    const copyExit = await waitEvent(copySession.requestId, 'exit');
    assert.equal(copyExit.error, undefined, JSON.stringify(copyExit));
    assert.equal(fs.readFileSync(assistedCopy, 'utf8'), token);
    const events = await app.evaluate(() => globalThis.__computerEvents);
    for (const id of [plan.requestId, assisted.requestId])
      assert.ok(
        events.some(
          (e) =>
            e.requestId === id &&
            e.event?.part?.tool === 'read' &&
            e.event.part.state?.status === 'completed',
        ),
        `External read succeeds in ${id}`,
      );
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(profile, 'events.json'), JSON.stringify(events, null, 2));
    console.log(
      JSON.stringify({
        profile,
        outside,
        dashboardLocked,
        checks: [
          'no repository dialog',
          'native external read',
          'native external write',
          'Windows command outside cwd',
          'Plan reads and denies writes',
          'Assisted reads and approves writes',
          'MCP copies exact bytes and respects Plan and Assisted',
          'native Auto reaches the model API',
        ],
        passed: true,
      }),
    );
  } catch (error) {
    if (app)
      fs.writeFileSync(
        path.join(profile, 'events-failure.json'),
        JSON.stringify(await app.evaluate(() => globalThis.__computerEvents), null, 2),
      );
    throw error;
  } finally {
    if (app) await app.close();
    router.closeAllConnections();
    await new Promise((resolve) => router.close(resolve));
    // Delete only the exact temporary fixture created by this test.
    assert.equal(path.dirname(outside), os.tmpdir());
    assert.ok(path.basename(outside).startsWith('mesp-computer-access-'));
    fs.rmSync(outside, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
