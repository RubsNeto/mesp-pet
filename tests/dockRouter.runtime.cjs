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
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (input, options) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('https://api.githubcopilot.com/'))
        return nativeFetch(process.env.MESP_QA_UPSTREAM + '/copilot/' + url.slice('https://api.githubcopilot.com/'.length), options);
      return nativeFetch(input, options);
    };
    const original = http.createServer.bind(http);
    http.createServer = (...args) => {
      const i = args.findIndex(a => typeof a === 'function');
      if (i < 0) return original(...args);
      const handler = args[i];
      args[i] = (req, res) => {
        if (req.method === 'POST' && req.url === '/api/qa/copilot') {
          req.resume();
          const path = require('node:path');
          const runtime = require(path.join(path.dirname(process.env.MESP_ROUTER_SERVER), '.next-cli-build/server/webpack-runtime.js'));
          // Seed only this isolated profile through the installed native OAuth storage function.
          Promise.resolve(runtime(9248).iE({ provider: 'github', name: 'Copilot isolado', authType: 'oauth',
            accessToken: 'qa-github', expiresAt: new Date(Date.now() + 3600000).toISOString(), isActive: true, testStatus: 'success',
            providerSpecificData: { copilotToken: 'qa-copilot', copilotTokenExpiresAt: Math.floor(Date.now()/1000) + 3600 } }))
            .then(connection => { res.setHeader('content-type','application/json'); res.end(JSON.stringify({ connection: { id: connection.id } })); })
            .catch(() => { res.writeHead(500); res.end('{}'); });
          return;
        }
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
  let emptyModel = false;
  let slowNear = false;
  const adaptiveModels = true;
  let copilotStream;
  let responseDelay = 0;
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/copilot/models') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: [
            {
              id: 'gpt-5-mini',
              name: 'GPT-5 mini',
              capabilities: { type: 'chat', supports: { tool_calls: true } },
            },
          ],
        }),
      );
      return;
    }
    if (req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: [
            { id: 'mesp-coder', name: 'MESP Coder' },
            { id: 'fallback-coder', name: 'MESP Coder Alternativo' },
            ...(adaptiveModels
              ? [
                  { id: 'mesp-mini', name: 'MESP Mini' },
                  { id: 'mesp-opus', name: 'MESP Opus' },
                ]
              : []),
          ],
        }),
      );
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === '/copilot/chat/completions') {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: 'The requested model is not supported.', code: 'model_not_supported' },
        }),
      );
      return;
    }
    if (req.url === '/copilot/responses') {
      copilotStream = body.stream;
      const response = {
        id: 'resp_qa_copilot',
        model: 'gpt-5-mini',
        object: 'response',
        status: 'completed',
        output: [
          {
            id: 'msg_qa',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              { type: 'output_text', text: 'Copilot traduzido corretamente.', annotations: [] },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
      if (!body.stream) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(response));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const event of [
        { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
        {
          type: 'response.output_text.delta',
          item_id: 'msg_qa',
          output_index: 0,
          content_index: 0,
          delta: 'Copilot traduzido corretamente.',
        },
        { type: 'response.completed', response },
      ])
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end('data: [DONE]\n\n');
      return;
    }
    requests.push({
      account: req.headers.authorization,
      model: body.model,
      prompt: body.messages?.at(-1)?.content,
      messages: body.messages,
    });
    if (slowNear && req.headers.authorization === 'Bearer qa-slow') {
      const timer = setTimeout(() => {
        if (!res.destroyed) res.end('{}');
      }, 5000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    if (responseDelay) await delay(responseDelay);
    if (emptyModel && body.model === 'mesp-opus') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: null } }] }));
      return;
    }
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
        MESP_QA_UPSTREAM: `http://127.0.0.1:${upstream.address().port}`,
        MESP_AUTO_TIMEOUT_MS: '1000',
        MESP_DOCK_TEST_HIDDEN: '1',
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
    const text = await response.text();
    assert.ok(response.ok, `${route}: HTTP ${response.status}`);
    const data = JSON.parse(text);
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
    const send = async (
      model,
      stream = true,
      session = 'ses_qa_auto',
      prompt = 'Corrija o código',
      purpose = '',
    ) => {
      const response = await fetch(`${origin}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': session,
          ...(purpose ? { 'x-mesp-purpose': purpose } : {}),
        },
        body: JSON.stringify({
          model,
          stream,
          messages: [
            { role: 'user', content: 'O projeto se chama Atlas' },
            { role: 'assistant', content: 'Vou manter esse contexto.' },
            { role: 'user', content: prompt },
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
    assert.equal(first.response.headers.get('x-mesp-model'), 'mespqa/mesp-coder');
    await delay(50);
    assert.ok(log.includes('"session":"ses_qa_auto"'));
    assert.ok(log.includes('"model":"mespqa/mesp-coder"'));
    failNear = true;
    await send('mesp-auto');
    assert.equal(requests.at(-1).account, 'Bearer qa-far');
    assert.ok(
      requests.at(-1).messages.some((message) => message.content === 'O projeto se chama Atlas'),
      'Fallback keeps the same conversation context',
    );
    assert.ok(!requests.some((item) => item.account === 'Bearer qa-empty'));
    const beforeRepeat = requests.filter((item) => item.account === 'Bearer qa-near').length;
    await send('mesp-auto');
    assert.equal(
      requests.filter((item) => item.account === 'Bearer qa-near').length,
      beforeRepeat,
      'A second request must not retry the same exhausted account from a stale cache',
    );
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
    await api('/api/providers/' + near.id, { isActive: false }, 'PUT');
    // Force the runtime's actual discovery after enabling the additional live test models.
    await delay(15100);
    const light = await send('mesp-auto', false, 'ses_light', 'Qual é a capital do Brasil?');
    assert.equal(light.response.headers.get('x-mesp-complexity'), 'light');
    assert.equal(requests.at(-1).model, 'mesp-mini', log.slice(-2500));
    const technicalQuestion = await send('mesp-auto', false, 'ses_light_api', 'O que é uma API?');
    assert.equal(requests.at(-1).model, 'mesp-mini');
    assert.equal(technicalQuestion.response.headers.get('x-mesp-complexity'), 'light');
    assert.ok(Number(technicalQuestion.response.headers.get('x-mesp-routing-ms')) < 100);
    const intent = await send(
      'mesp-auto',
      false,
      'ses_intent',
      'Audite a segurança e refatore a arquitetura do sistema',
      'intent',
    );
    assert.equal(intent.response.headers.get('x-mesp-complexity'), 'light');
    assert.equal(requests.at(-1).model, 'mesp-mini');
    const warmup = await fetch(`${origin}/api/mesp/warmup`);
    assert.equal(warmup.status, 202);
    assert.equal((await warmup.json()).warming, true);
    await send('mesp-auto', false, 'ses_standard', 'Corrija o formulário React');
    assert.equal(requests.at(-1).model, 'fallback-coder');
    await send(
      'mesp-auto',
      false,
      'ses_advanced',
      'Audite a segurança e refatore a arquitetura do sistema',
    );
    assert.equal(requests.at(-1).model, 'mesp-opus');
    emptyModel = true;
    const emptyFallback = await send(
      'mesp-auto',
      false,
      'ses_empty',
      'Audite a segurança e refatore a arquitetura do sistema',
    );
    assert.equal(emptyFallback.response.status, 200);
    assert.equal(requests.at(-1).model, 'fallback-coder');
    const beforeEmpty = requests.filter((item) => item.model === 'mesp-opus').length;
    await send(
      'mesp-auto',
      false,
      'ses_repeat_empty',
      'Audite a segurança e refatore a arquitetura do sistema',
    );
    assert.equal(
      requests.filter((item) => item.model === 'mesp-opus').length,
      beforeEmpty,
      'Empty model replies are cooled down without disabling other models of the account',
    );
    emptyModel = false;
    await api('/api/providers/' + far.id, { isActive: false }, 'PUT');
    const slow = await create('Conta lenta', 'qa-slow', 1),
      backup = await create('Alternativa rápida', 'qa-backup', 2);
    fs.writeFileSync(
      fixtureFile,
      JSON.stringify({
        [slow.id]: quota(50, 60000),
        [backup.id]: quota(50, 3600000),
        [empty.id]: quota(100, 5000),
      }),
    );
    await delay(15100);
    responseDelay = 100;
    const parallelStart = requests.length;
    await Promise.all([
      send('mesp-auto', false, 'ses_parallel_a', 'Pergunta simples'),
      send('mesp-auto', false, 'ses_parallel_b', 'Pergunta simples'),
    ]);
    assert.equal(
      new Set(requests.slice(parallelStart).map((item) => item.account)).size,
      2,
      'Simultaneous MESP requests spread across funded accounts',
    );
    responseDelay = 0;
    slowNear = true;
    const cancelledStart = requests.length;
    const cancelled = new AbortController();
    const pending = fetch(`${origin}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'mesp-auto',
        stream: false,
        messages: [{ role: 'user', content: 'Pergunta simples' }],
      }),
      signal: cancelled.signal,
    });
    await delay(150);
    cancelled.abort();
    await assert.rejects(pending);
    await delay(100);
    assert.equal(
      requests.length - cancelledStart,
      1,
      'Cancellation never replays the task on another account',
    );
    const slowAt = Date.now();
    const slowResult = await fetch(`${origin}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'mesp-auto',
        stream: false,
        messages: [{ role: 'user', content: 'Pergunta de teste' }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(slowResult.status, 200);
    assert.equal(slowResult.headers.get('x-mesp-account'), backup.id);
    await slowResult.text();
    assert.ok(
      Date.now() - slowAt < 5000,
      'A stalled account fails over without waiting for the upstream timeout',
    );
    slowNear = false;
    // Test the installed Copilot executor and its Responses translator, with no real GitHub API.
    const copilot = (await api('/api/qa/copilot', {})).connection;
    assert.ok(copilot.id);
    const translated = await send('gh/gpt-5-mini', false, 'ses_copilot', 'Teste de tradução');
    const { parseRouterConversation } = await import('../electron/dockChatResponse.mjs');
    assert.equal(
      parseRouterConversation(JSON.parse(translated.text))?.answer,
      'Copilot traduzido corretamente.',
    );
    assert.equal(
      copilotStream,
      true,
      'Non-streaming callers still get a valid translated Copilot Responses reply',
    );
    await api('/api/providers/' + copilot.id, { isActive: false }, 'PUT');
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
        complexitySelectsModel: true,
        technicalQuestionsUseLightModel: true,
        warmRoutingUnder100ms: true,
        staleQuotaDoesNotRepeatFailures: true,
        emptyResponseFallback: true,
        timedOutAccountHandled: true,
        simultaneousAccountsBalanced: true,
        cancellationNeverReplayed: true,
        copilotResponsesTranslation: true,
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
