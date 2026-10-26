// MESP's local 9Router adapter. Shared dependencies are read, never written.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

(async () => {
  const {
    createRouterOverviewService,
    autoRouterCandidates,
    patchRouterAccountSelection,
    patchRouterCopilotResponses,
    routerPatchTargets,
    classifyRouterRequest,
    createRouterHealth,
  } = await import('./dockRouter.mjs');
  const { parseRouterConversation } = await import('./dockChatResponse.mjs');
  const { routerLocalAuthHeaders } = await import('./dockRouterLocalAuth.mjs');
  const { providerRank } = await import('./dockRouterPriority.mjs');
  const { readProviderPriority, readModelVerification, writeModelVerification } =
    await import('./dockRouterPriorityFile.mjs');
  const { verificationKey, verificationState, isChatModel, definitiveFailure } =
    await import('./dockModelVerification.mjs');
  // Which models actually answered on which account; kept in memory and saved shortly after.
  let verification = readModelVerification(process.env.DATA_DIR);
  let verificationTimer = null;
  const markVerified = (accountId, model, ok, status) => {
    verification[verificationKey(accountId, model)] = {
      ok,
      at: Date.now(),
      ...(Number.isInteger(status) ? { status } : {}),
    };
    clearTimeout(verificationTimer);
    verificationTimer = setTimeout(() => {
      try {
        verification = writeModelVerification(process.env.DATA_DIR, verification);
      } catch {
        /* A read-only profile must not stop routing. */
      }
    }, 400);
  };
  // Read on every request so a new order applies without restarting the router.
  const priority = () => readProviderPriority(process.env.DATA_DIR);
  const serverPath = process.env.MESP_ROUTER_SERVER;
  if (!serverPath || !fs.existsSync(serverPath)) throw new Error('Runtime do 9Router ausente.');
  let routerVersion = 'unknown';
  for (const candidate of [
    path.join(path.dirname(serverPath), '..', 'package.json'),
    path.join(path.dirname(serverPath), 'package.json'),
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (pkg.name === '9router' && pkg.version) {
        routerVersion = pkg.version;
        break;
      }
    } catch {
      /* Try the next location. */
    }
  }
  const chunkDir = fs.realpathSync(
    path.join(path.dirname(serverPath), '.next-cli-build/server/chunks'),
  );
  const chunkFiles = fs
    .readdirSync(chunkDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(chunkDir, name));
  const targets = routerPatchTargets(chunkFiles, (file) => fs.readFileSync(file, 'utf8'));
  const patches = new Map([
    [targets.auth, patchRouterAccountSelection(fs.readFileSync(targets.auth, 'utf8'))],
  ]);
  if (targets.copilot && targets.copilot !== targets.auth)
    patches.set(
      targets.copilot,
      patchRouterCopilotResponses(fs.readFileSync(targets.copilot, 'utf8')),
    );
  const originalLoader = Module._extensions['.js'];
  Module._extensions['.js'] = (module, filename) => {
    const patched = patches.get(filename) ?? patches.get(fs.realpathSync(filename));
    if (patched !== undefined) return module._compile(patched, filename);
    return originalLoader(module, filename);
  };
  globalThis.__mespRouterContext = new AsyncLocalStorage();
  const contexts = new Map();
  const origin = process.env.BASE_URL;
  const service = createRouterOverviewService({
    origin,
    autoSupported: true,
    headers: () => routerLocalAuthHeaders(process.env.DATA_DIR),
    priority,
    verification: () => verification,
    blockedModels: () =>
      new Set(
        health
          .snapshot()
          .map(([id]) => id)
          .filter((id) => !id.endsWith(':*')),
      ),
  });
  let lastRoute = null;
  const healthFile = path.join(process.env.DATA_DIR, 'runtime', 'mesp-auto-health.json');
  let savedHealth = [];
  try {
    savedHealth = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
  } catch {
    /* First run or interrupted cache write. */
  }
  const health = createRouterHealth(savedHealth);
  const recordFailure = (choice, status, retryAfter = null) => {
    health.failed(choice, status, retryAfter);
    try {
      fs.mkdirSync(path.dirname(healthFile), { recursive: true });
      fs.writeFileSync(healthFile, JSON.stringify(health.snapshot()));
    } catch {
      /* A read-only cache must not prevent a response. */
    }
  };
  const inFlight = new Map();

  let verifyStatus = { running: false, total: 0, done: 0, ok: 0, failed: 0, finishedAt: null };
  const probe = async (account, model, authorization) => {
    const routingId = randomUUID();
    contexts.set(routingId, {
      filterAvailable: (list) => list.filter((entry) => entry.id === account.id),
      chooseAccount: (provider, excluded) => {
        const exclude = excluded instanceof Set ? excluded : new Set(excluded ? [excluded] : []);
        return !exclude.has(account.id) &&
          (account.provider === provider || account.prefix === provider)
          ? account.id
          : null;
      },
    });
    try {
      const response = await fetch(`${origin}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mesp-route-id': routingId,
          ...(authorization ? { authorization } : {}),
        },
        body: JSON.stringify({
          model: model.replace(/^9router\//, ''),
          stream: false,
          messages: [{ role: 'user', content: 'Responda apenas: OK' }],
        }),
        signal: AbortSignal.timeout(120000),
      });
      const text = await response.text();
      if (response.ok) {
        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch {
          /* Not a JSON completion. */
        }
        if (parseRouterConversation(payload) || payload?.choices?.length) {
          markVerified(account.id, model, true, response.status);
          return 'ok';
        }
        return 'transient';
      }
      if (definitiveFailure(response.status, text)) {
        markVerified(account.id, model, false, response.status);
        return [401, 403].includes(response.status) && !/NOT_FOUND|\[404\]/.test(text)
          ? 'auth'
          : 'failed';
      }
      return 'transient';
    } catch {
      return 'transient';
    } finally {
      contexts.delete(routingId);
    }
  };
  const runVerification = async (force, authorization) => {
    verifyStatus = { running: true, total: 0, done: 0, ok: 0, failed: 0, finishedAt: null };
    const overview = await service.models(true);
    const queues = [];
    for (const account of overview.accounts) {
      // Never spend an exhausted or currently refused account just to test it.
      if (
        !account.active ||
        ['auth', 'disabled', 'error'].includes(account.health) ||
        account.limitReached ||
        account.rateLimited ||
        account.lastFailure === 'permission' ||
        account.quotas.some(
          (quota) => !quota.unlimited && (quota.remaining === 0 || quota.usedPercent >= 100),
        )
      )
        continue;
      const models = overview.models
        .filter(
          (model) =>
            isChatModel(model.id) &&
            (model.ownerIds || model.accountIds).includes(account.id) &&
            (force || verificationState(verification, account.id, model.id) === 'untested'),
        )
        .map((model) => model.id);
      if (models.length) queues.push({ account, models });
    }
    verifyStatus.total = queues.reduce((sum, queue) => sum + queue.models.length, 0);
    // Accounts run in parallel; each account tests its models one at a time.
    await Promise.all(
      queues.map(async ({ account, models }) => {
        let authFailures = 0;
        for (const model of models) {
          if (authFailures >= 3) {
            // The account itself is refusing access; do not spend requests on the rest.
            markVerified(account.id, model, false, 401);
            verifyStatus.failed += 1;
          } else {
            const result = await probe(account, model, authorization);
            if (result === 'ok') {
              verifyStatus.ok += 1;
              authFailures = 0;
            } else if (result === 'auth') {
              verifyStatus.failed += 1;
              authFailures += 1;
            } else if (result === 'failed') verifyStatus.failed += 1;
          }
          verifyStatus.done += 1;
        }
      }),
    );
    verifyStatus = { ...verifyStatus, running: false, finishedAt: Date.now() };
  };

  const json = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  const autoRequest = async (req, res, body) => {
    const startedAt = Date.now();
    const request = classifyRouterRequest(body, req.headers['x-mesp-purpose']);
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const order = priority();
      // After the first full test, re-check new or expired pairs at most every ten minutes.
      if (
        !verifyStatus.running &&
        verifyStatus.finishedAt &&
        Date.now() - verifyStatus.finishedAt > 10 * 60 * 1000
      )
        void runVerification(false, req.headers.authorization).catch(() => {
          verifyStatus = { ...verifyStatus, running: false, finishedAt: Date.now() };
        });
      let overview = await service.routing();
      let choices = autoRouterCandidates(
        overview.accounts,
        overview.models,
        Date.now(),
        request,
        order,
      );
      if (!choices.length) {
        overview = await service.routing(true);
        choices = autoRouterCandidates(
          overview.accounts,
          overview.models,
          Date.now(),
          request,
          order,
        );
      }
      if (!choices.length)
        return json(res, 503, {
          error: {
            message: 'Nenhuma conta com modelo e cota disponível para o Auto.',
            type: 'quota_unavailable',
          },
        });
      // Exhaust distinct available choices, rather than an arbitrary count or task clock.
      const tried = new Set();
      let lastStatus = 503;
      let selectedAt = null;
      while (!controller.signal.aborted) {
        if (controller.signal.aborted) return;
        const available = choices.filter(
          (candidate) =>
            !tried.has(`${candidate.accountId}:${candidate.model}`) && health.available(candidate),
        );
        // Spread simultaneous MESP tasks across equally suitable, funded accounts.
        available.sort(
          (a, b) =>
            providerRank(order, a.provider) - providerRank(order, b.provider) ||
            (order.length && request.level >= 2 ? b.premium - a.premium || b.level - a.level : 0) ||
            a.fit - b.fit ||
            a.funding - b.funding ||
            (inFlight.get(a.accountId) || 0) - (inFlight.get(b.accountId) || 0),
        );
        const choice = available[0];
        if (!choice) break;
        selectedAt ??= Date.now();
        tried.add(`${choice.accountId}:${choice.model}`);
        const routingId = randomUUID();
        const context = {
          filterAvailable(available) {
            return available.filter((account) => account.id === choice.accountId);
          },
          chooseAccount(provider, excluded) {
            const exclude =
              excluded instanceof Set ? excluded : new Set(excluded ? [excluded] : []);
            return !exclude.has(choice.accountId) &&
              (choice.provider === provider ||
                overview.accounts.find((account) => account.id === choice.accountId)?.prefix ===
                  provider)
              ? choice.accountId
              : null;
          },
        };
        contexts.set(routingId, context);
        inFlight.set(choice.accountId, (inFlight.get(choice.accountId) || 0) + 1);
        const headers = { 'content-type': 'application/json', 'x-mesp-route-id': routingId };
        for (const name of [
          'authorization',
          'x-api-key',
          'anthropic-version',
          'anthropic-beta',
          'user-agent',
          'x-session-id',
          'x-session-affinity',
        ]) {
          if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
        }
        const attemptController = new AbortController();
        const configuredTimeout = Number(process.env.MESP_AUTO_TIMEOUT_MS);
        // An explicit diagnostic override is used by isolated offline-account tests only.
        const timer =
          process.env.MESP_DOCK_TEST_HIDDEN === '1' && configuredTimeout >= 250
            ? setTimeout(() => attemptController.abort(), configuredTimeout)
            : null;
        try {
          const response = await fetch(`${origin}${req.url}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...body, model: choice.model.replace(/^9router\//, '') }),
            signal: AbortSignal.any([controller.signal, attemptController.signal]),
          });
          lastStatus = response.status;
          const errorPayload = !response.ok ? await response.json().catch(() => ({})) : null;
          // 9Router wraps an upstream 404 (model not offered to this account) in a 503 with a
          // short lock; that is about the model, not the account, so only the model cools down.
          const modelUnavailable =
            [404, 406].includes(response.status) ||
            ([400, 403, 429, 503].includes(response.status) &&
              /model_not_supported|model_not_found|unsupported model|model.*not.*(?:supported|available)|not.*enabled.*model|\[404\]|NOT_FOUND|Requested entity was not found/i.test(
                JSON.stringify(errorPayload),
              ));
          const retryable =
            modelUnavailable ||
            [401, 402, 403, 408, 429, 500, 502, 503, 504].includes(response.status);
          if (retryable) {
            if (modelUnavailable)
              markVerified(choice.accountId, choice.model, false, response.status);
            recordFailure(
              choice,
              modelUnavailable ? 'model' : response.status,
              response.headers.get('retry-after'),
            );
            continue;
          }
          if (!response.ok)
            return json(res, response.status, {
              error: {
                message:
                  'O provedor recusou este pedido. Tente ajustar a mensagem ou escolher outro modelo.',
                type: 'invalid_request',
              },
            });
          let payload = null;
          if (body.stream !== true) {
            try {
              payload = await response.json();
            } catch (error) {
              if (controller.signal.aborted || attemptController.signal.aborted) throw error;
            }
            const toolReply =
              (Array.isArray(payload?.choices) &&
                payload.choices.some((choice) => choice.message?.tool_calls?.length)) ||
              (Array.isArray(payload?.output) &&
                payload.output.some((item) => item.type === 'function_call')) ||
              (Array.isArray(payload?.content) &&
                payload.content.some((item) => item.type === 'tool_use'));
            if (!toolReply && !parseRouterConversation(payload)) {
              lastStatus = 502;
              recordFailure(choice, 'empty');
              continue;
            }
          }
          // Once a response starts, never change accounts or replay a task.
          clearTimeout(timer);
          markVerified(choice.accountId, choice.model, true, response.status);
          lastRoute = { ...choice, complexity: request.complexity, at: Date.now() };
          const session = req.headers['x-session-id'] || req.headers['x-session-affinity'];
          if (typeof session === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(session)) {
            process.stdout.write(
              `MESP_MODEL ${JSON.stringify({
                session,
                startedAt,
                model: choice.model.replace(/^9router\//, ''),
              })}\n`,
            );
          }
          res.writeHead(response.status, {
            'content-type': response.headers.get('content-type') || 'application/json',
            'cache-control': 'no-store',
            'x-mesp-model': choice.model.replace(/^9router\//, ''),
            'x-mesp-account': choice.accountId,
            'x-mesp-complexity': request.complexity,
            'x-mesp-routing-ms': String(Math.max(0, selectedAt - startedAt)),
          });
          if (payload) res.end(JSON.stringify(payload));
          else if (response.body) await pipeline(Readable.fromWeb(response.body), res);
          else res.end();
          return;
        } catch {
          if (controller.signal.aborted) return;
          if (res.headersSent) {
            if (!res.writableEnded) res.end();
            return;
          }
          lastStatus = attemptController.signal.aborted ? 504 : 502;
          recordFailure(choice, lastStatus);
        } finally {
          clearTimeout(timer);
          contexts.delete(routingId);
          const count = (inFlight.get(choice.accountId) || 1) - 1;
          if (count) inFlight.set(choice.accountId, count);
          else inFlight.delete(choice.accountId);
        }
      }
      if (!controller.signal.aborted)
        json(res, lastStatus >= 400 ? lastStatus : 503, {
          error: {
            message:
              'As contas disponíveis não responderam. Confira cotas e acessos nas Configurações.',
            type: 'accounts_unavailable',
          },
        });
    } catch {
      if (!res.headersSent && !controller.signal.aborted)
        json(res, 503, {
          error: {
            message:
              'Não foi possível selecionar ou consultar as contas do Auto. Atualize as conexões.',
            type: 'routing_error',
          },
        });
      else if (!res.writableEnded) res.end();
    }
  };
  const originalCreateServer = http.createServer.bind(http);
  http.createServer = (...args) => {
    const handlerIndex = args.findIndex((arg) => typeof arg === 'function');
    if (handlerIndex < 0) return originalCreateServer(...args);
    const handler = args[handlerIndex];
    args[handlerIndex] = (req, res) => {
      if (req.method === 'GET' && req.url === '/api/mesp/capabilities')
        return json(res, 200, {
          auto: true,
          strategy: 'complexity-quota-reset',
          version: routerVersion,
          source: process.env.MESP_ROUTER_PROFILE_SOURCE === '9router' ? '9router' : 'mesp',
        });
      if (req.url === '/api/mesp/verify' && req.method === 'GET')
        return json(res, 200, verifyStatus);
      if (req.url === '/api/mesp/verify' && req.method === 'POST') {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          let force = false;
          try {
            force = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').force === true;
          } catch {
            /* Default to testing only what is still unknown. */
          }
          if (!verifyStatus.running)
            void runVerification(force, req.headers.authorization).catch(() => {
              verifyStatus = { ...verifyStatus, running: false, finishedAt: Date.now() };
            });
          json(res, 202, verifyStatus);
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/api/mesp/last-route')
        return json(res, 200, lastRoute);
      if (req.method === 'GET' && req.url === '/api/mesp/warmup') {
        void service.routing().catch(() => {});
        return json(res, 202, { warming: true });
      }
      const context = contexts.get(req.headers['x-mesp-route-id']);
      delete req.headers['x-mesp-route-id'];
      if (context) return globalThis.__mespRouterContext.run(context, () => handler(req, res));
      if (
        req.method !== 'POST' ||
        !/^\/(?:api\/)?v1\/(?:chat\/completions|responses|messages)(?:\?|$)/.test(req.url || '')
      )
        return handler(req, res);
      // Preserve normal requests as real IncomingMessages. Peek via a buffering proxy,
      // then forward unchanged to the native router unless this is MESP Auto.
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) {
          json(res, 413, { error: { message: 'Pedido muito grande.' } });
          req.destroy();
        } else chunks.push(chunk);
      });
      req.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      req.on('end', () => {
        if (res.headersSent) return;
        const bytes = Buffer.concat(chunks);
        let body;
        try {
          body = JSON.parse(bytes.toString('utf8'));
        } catch {
          return json(res, 400, { error: { message: 'JSON inválido.' } });
        }
        if (body?.model === 'mesp-auto' || body?.model === '9router/mesp-auto')
          return void autoRequest(req, res, body);
        // Forward once through the same server with a private context marker, so the
        // native Next handler receives its original unmodified request stream.
        const id = randomUUID();
        contexts.set(id, {});
        const controller = new AbortController();
        res.on('close', () => {
          if (!res.writableFinished) controller.abort();
        });
        const headers = { ...req.headers, 'x-mesp-route-id': id };
        delete headers.host;
        delete headers['content-length'];
        delete headers['transfer-encoding'];
        void fetch(`${origin}${req.url}`, {
          method: 'POST',
          headers,
          body: bytes,
          signal: controller.signal,
        })
          .then(async (response) => {
            const outputHeaders = Object.fromEntries(response.headers);
            for (const key of [
              'content-length',
              'transfer-encoding',
              'content-encoding',
              'connection',
            ])
              delete outputHeaders[key];
            res.writeHead(response.status, outputHeaders);
            if (response.body) await pipeline(Readable.fromWeb(response.body), res);
            else res.end();
          })
          .catch(() => {
            if (!res.headersSent)
              json(res, 502, { error: { message: 'O 9Router encerrou a conexão.' } });
            else res.end();
          })
          .finally(() => contexts.delete(id));
      });
    };
    return originalCreateServer(...args);
  };
  require(serverPath);
  // Newer releases only start the server when custom-server.js is the main module;
  // load its standalone server explicitly after the wrapper above is installed.
  const standalone = path.join(path.dirname(serverPath), 'server.js');
  if (
    path.basename(serverPath) === 'custom-server.js' &&
    fs.existsSync(standalone) &&
    /require\.main\s*===\s*module/.test(fs.readFileSync(serverPath, 'utf8'))
  )
    require(standalone);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
