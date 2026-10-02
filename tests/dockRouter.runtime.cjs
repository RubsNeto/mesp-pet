const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, 'qa', `router-routing-${Date.now()}`);
const fixtureFile = path.join(profile, 'quota-fixture.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

(async () => {
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(fixtureFile, '{}');
  // Only this test child overrides quota responses. Native auth, model discovery,
  // streams, account fallback and usage storage are the actual installed 9Router.
  const preload = path.join(profile, 'quota-fixture.cjs');
  fs.writeFileSync(
    preload,
    String.raw`
    const http = require('node:http'), fs = require('node:fs');
    const original = http.createServer.bind(http);
    http.createServer = (...args) => {
      const i = args.findIndex(a => typeof a === 'function');
      if (i < 0) return original(...args);
      const handler = args[i];
      args[i] = (req, res) => {
        const quotas = JSON.parse(fs.readFileSync(process.env.MESP_QA_QUOTAS, 'utf8'));
        const id = req.url?.match(/^\/api\/usage\/([^/?]+)$/)?.[1];
        if (id && quotas[id]) { res.setHeader('content-type','application/json'); res.end(JSON.stringify(quotas[id])); return; }
        handler(req,res);
      };
      return original(...args);
    };
  `,
  );
  const requests = [];
  let failNear = false;
  let failAll = false;
  let unsupportedModel = false;
  let unsupportedCalls = 0;
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: [
            { id: 'mesp-coder', name: 'MESP Coder' },
            { id: 'fallback-coder', name: 'MESP Coder Alternativo' },
          ],
        }),
      );
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({
      account: req.headers.authorization,
      model: body.model,
      prompt: body.messages?.at(-1)?.content,
      messages: body.messages,
    });
    if (unsupportedModel && body.model === 'mesp-coder') {
      unsupportedCalls++;
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { code: 'model_not_supported', message: 'The requested model is not supported.' },
        }),
      );
      return;
    }
    if (failAll || (failNear && req.headers.authorization === 'Bearer qa-near')) {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'rate limit' } }));
      return;
    }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(
        `data: ${JSON.stringify({ id: 'qa', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { content: 'Resposta do roteador real' }, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: 'qa', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
      );
      res.end('data: [DONE]\n\n');
    } else {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'qa',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Resposta real' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    }
  });
  await listen(upstream);
  const reservation = http.createServer();
  await listen(reservation);
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const routerApp = path.join(root, 'node_modules/9router/app');
  const child = spawn(
    process.execPath,
    ['--require', preload, path.join(root, 'dist-electron/dockRouterRuntime.cjs')],
    {
      cwd: routerApp,
      windowsHide: true,
      env: {
        ...process.env,
        DATA_DIR: path.join(profile, 'data'),
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        BASE_URL: origin,
        NODE_ENV: 'production',
        REQUIRE_API_KEY: 'false',
        ENABLE_REQUEST_LOGS: 'false',
        INITIAL_PASSWORD: 'qa-local-password',
        MESP_ROUTER_SERVER: path.join(routerApp, 'custom-server.js'),
        MESP_QA_QUOTAS: fixtureFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (chunk) => (log = (log + chunk).slice(-5000)));
  child.stderr.on('data', (chunk) => (log = (log + chunk).slice(-5000)));
  let adminCookie;
  const api = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(adminCookie ? { cookie: adminCookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    assert.ok(response.ok, `${route}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  };
  try {
    const deadline = Date.now() + 25000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${origin}/v1/models`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        if (child.exitCode !== null) throw Error(log);
      }
      await delay(250);
    }
    assert.ok(ready, log);
    assert.equal((await api('/api/mesp/capabilities')).auto, true);
    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'qa-local-password' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie);
    adminCookie = cookie;
    await fetch(`${origin}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ requireLogin: true, tunnelDashboardAccess: false }),
    });
    const { node } = await api('/api/provider-nodes', {
      name: 'Provedor de teste local',
      prefix: 'mespqa',
      apiType: 'chat',
      baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
      type: 'openai-compatible',
    });
    const create = async (name, key, priority) =>
      (
        await api('/api/providers', {
          provider: node.id,
          name,
          apiKey: key,
          priority,
          testStatus: 'success',
        })
      ).connection;
    // Native priority deliberately prefers the distant reset. Auto must override it.
    const far = await create('Reset distante', 'qa-far', 1),
      near = await create('Reset próximo', 'qa-near', 2),
      empty = await create('Cota esgotada', 'qa-empty', 3);
    const quota = (used, reset) => ({
      quotas: {
        session: {
          used,
          total: 100,
          remaining: 100 - used,
          resetAt: new Date(Date.now() + reset).toISOString(),
        },
      },
    });
    fs.writeFileSync(
      fixtureFile,
      JSON.stringify({
        [far.id]: quota(30, 3600000),
        [near.id]: quota(80, 60000),
        [empty.id]: quota(100, 5000),
      }),
    );
    const send = async (model, stream = true) => {
      const response = await fetch(`${origin}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream,
          messages: [
            { role: 'user', content: 'O projeto se chama Atlas' },
            { role: 'assistant', content: 'Vou manter esse contexto.' },
            { role: 'user', content: 'Validar Auto' },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      return { response, text };
    };
    const first = await send('mesp-auto');
    assert.ok(first.text.includes('Resposta do roteador real'));
    assert.ok(first.text.includes('[DONE]'));
    assert.equal(requests.at(-1).account, 'Bearer qa-near');
    assert.equal(requests.at(-1).model, 'mesp-coder');
    assert.equal(first.response.headers.get('x-mesp-account'), near.id);
    failNear = true;
    await send('mesp-auto');
    assert.equal(requests.at(-1).account, 'Bearer qa-far');
    assert.ok(
      requests.at(-1).messages.some((message) => message.content === 'O projeto se chama Atlas'),
      'Fallback keeps the same conversation context',
    );
    assert.ok(!requests.some((item) => item.account === 'Bearer qa-empty'));
    failNear = false;
    await send('mespqa/mesp-coder', false);
    assert.equal(requests.at(-1).model, 'mesp-coder');
    assert.ok(
      requests.at(-1).messages.some((message) => message.content === 'O projeto se chama Atlas'),
      'Manual model keeps context too',
    );
    const stats = await api('/api/usage/stats?period=all');
    assert.ok(stats.totalRequests >= 3);
    assert.ok(Object.values(stats.byAccount).some((item) => item.connectionId === near.id));
    const { createRouterOverviewService } = await import('../electron/dockRouter.mjs');
    const overview = await createRouterOverviewService({
      origin,
      headers: { cookie: adminCookie },
    }).overview('all');
    assert.ok(overview.models.some((m) => m.id === '9router/mespqa/mesp-coder'));
    assert.ok(overview.totals.tokens >= 30);
    assert.ok(!JSON.stringify(overview).includes('qa-near'));
    unsupportedModel = true;
    await send('mesp-auto');
    assert.equal(requests.at(-1).model, 'fallback-coder');
    assert.ok(
      unsupportedCalls > 0,
      'The native router rejected a model before Auto tried an alternative',
    );
    assert.ok(!requests.some((item) => item.account === 'Bearer qa-empty'));
    unsupportedModel = false;
    failAll = true;
    const unavailable = await fetch(`${origin}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'mesp-auto',
        stream: true,
        messages: [{ role: 'user', content: 'Sem cota' }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    await unavailable.text();
    assert.ok(unavailable.status >= 400);
    assert.ok(
      !requests.some((item) => item.account === 'Bearer qa-empty'),
      'Fallback never spends an exhausted account',
    );
    console.log(
      JSON.stringify({
        ok: true,
        installed9Router: true,
        autoUsesNearestReset: true,
        nativeAccountPriorityOverridden: true,
        exhaustedAccountsSkipped: true,
        nativeFallbackWorks: true,
        streamPreserved: true,
        manualModelWorks: true,
        usageRecordedByAccount: true,
        noRealAccountsOrApis: true,
      }),
    );
  } finally {
    // This is the exact child launched by this test; no process-name termination.
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once('close', resolve);
    });
    await new Promise((resolve) => upstream.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
