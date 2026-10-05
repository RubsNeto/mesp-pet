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
    classifyRouterRequest,
    createRouterHealth,
  } = await import('./dockRouter.mjs');
  const { parseRouterConversation } = await import('./dockChatResponse.mjs');
  const { routerLocalAuthHeaders } = await import('./dockRouterLocalAuth.mjs');
  const serverPath = process.env.MESP_ROUTER_SERVER;
  if (!serverPath || !fs.existsSync(serverPath)) throw new Error('Runtime do 9Router ausente.');
  const authPath = fs.realpathSync(
    path.join(path.dirname(serverPath), '.next-cli-build/server/chunks/4664.js'),
  );
  const patchedAuth = patchRouterAccountSelection(fs.readFileSync(authPath, 'utf8'));
  const copilotPath = fs.realpathSync(
    path.join(path.dirname(serverPath), '.next-cli-build/server/chunks/318.js'),
  );
  const patchedCopilot = patchRouterCopilotResponses(fs.readFileSync(copilotPath, 'utf8'));
  const originalLoader = Module._extensions['.js'];
  Module._extensions['.js'] = (module, filename) => {
    if (/[\\/](?:4664|318)\.js$/.test(filename)) {
      const resolved = fs.realpathSync(filename);
      if (resolved === authPath) return module._compile(patchedAuth, filename);
      if (resolved === copilotPath) return module._compile(patchedCopilot, filename);
    }
    return originalLoader(module, filename);
  };
  globalThis.__mespRouterContext = new AsyncLocalStorage();
  const contexts = new Map();
  const origin = process.env.BASE_URL;
  const service = createRouterOverviewService({
    origin,
    autoSupported: true,
    headers: () => routerLocalAuthHeaders(process.env.DATA_DIR),
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
      let overview = await service.routing();
      let choices = autoRouterCandidates(overview.accounts, overview.models, Date.now(), request);
      if (!choices.length) {
        overview = await service.routing(true);
        choices = autoRouterCandidates(overview.accounts, overview.models, Date.now(), request);
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
          const modelUnavailable =
            [404, 406].includes(response.status) ||
            ([400, 403].includes(response.status) &&
              /model_not_supported|model_not_found|unsupported model|model.*not.*(?:supported|available)|not.*enabled.*model/i.test(
                JSON.stringify(errorPayload),
              ));
          const retryable =
            modelUnavailable ||
            [401, 402, 403, 408, 429, 500, 502, 503, 504].includes(response.status);
          if (retryable) {
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
          version: '0.5.40',
          source: process.env.MESP_ROUTER_PROFILE_SOURCE === '9router' ? '9router' : 'mesp',
        });
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
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
