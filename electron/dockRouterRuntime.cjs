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
  const { createRouterOverviewService, autoRouterCandidates, patchRouterAccountSelection } =
    await import('./dockRouter.mjs');
  const { routerLocalAuthHeaders } = await import('./dockRouterLocalAuth.mjs');
  const serverPath = process.env.MESP_ROUTER_SERVER;
  if (!serverPath || !fs.existsSync(serverPath)) throw new Error('Runtime do 9Router ausente.');
  const authPath = fs.realpathSync(
    path.join(path.dirname(serverPath), '.next-cli-build/server/chunks/4664.js'),
  );
  const patchedAuth = patchRouterAccountSelection(fs.readFileSync(authPath, 'utf8'));
  const originalLoader = Module._extensions['.js'];
  Module._extensions['.js'] = (module, filename) => {
    if (fs.realpathSync(filename) === authPath) return module._compile(patchedAuth, filename);
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

  const json = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  const autoRequest = async (req, res, body) => {
    const startedAt = Date.now();
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    let routingId;
    try {
      let overview = await service.overview('today');
      let choices = autoRouterCandidates(overview.accounts, overview.models);
      if (!choices.length) {
        overview = await service.overview('today', true);
        choices = autoRouterCandidates(overview.accounts, overview.models);
      }
      if (!choices.length)
        return json(res, 503, {
          error: {
            message: 'Nenhuma conta com modelo e cota disponível para o Auto.',
            type: 'quota_unavailable',
          },
        });
      // One request per account/model; retries never run after response bytes are sent.
      const tried = new Set(),
        excludedAccounts = new Set();
      for (const choice of choices) {
        if (controller.signal.aborted) return;
        const choiceKey = `${choice.accountId}:${choice.model}`;
        if (tried.has(choiceKey) || excludedAccounts.has(choice.accountId)) continue;
        tried.add(choiceKey);
        routingId = randomUUID();
        const sameModel = choices.filter(
          (candidate) =>
            candidate.model === choice.model && !excludedAccounts.has(candidate.accountId),
        );
        let requestRoute = choice;
        const context = {
          filterAvailable(available) {
            const byId = new Map(available.map((account) => [account.id, account]));
            return sameModel
              .filter((candidate) => byId.has(candidate.accountId))
              .map((candidate) => byId.get(candidate.accountId));
          },
          chooseAccount(provider, excluded) {
            const exclude =
              excluded instanceof Set ? excluded : new Set(excluded ? [excluded] : []);
            const next = sameModel.find(
              (candidate) =>
                !exclude.has(candidate.accountId) &&
                (candidate.provider === provider ||
                  overview.accounts.find((a) => a.id === candidate.accountId)?.prefix === provider),
            );
            if (next) {
              requestRoute = next;
              lastRoute = { ...next, at: Date.now() };
            }
            return next?.accountId || null;
          },
        };
        contexts.set(routingId, context);
        lastRoute = { ...choice, at: Date.now() };
        const headers = { 'content-type': 'application/json', 'x-mesp-route-id': routingId };
        for (const name of [
          'authorization',
          'x-api-key',
          'anthropic-version',
          'anthropic-beta',
          'user-agent',
        ]) {
          if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
        }
        const response = await fetch(`${origin}${req.url}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, model: choice.model.replace(/^9router\//, '') }),
          signal: controller.signal,
        });
        const modelUnavailable =
          [404, 406].includes(response.status) ||
          (response.status === 400 &&
            /model_not_supported|model_not_found|unsupported model|model.*not.*supported/i.test(
              JSON.stringify(
                await response
                  .clone()
                  .json()
                  .catch(() => ({})),
              ),
            ));
        tried.add(`${requestRoute.accountId}:${choice.model}`);
        if ([401, 402, 403, 429, 500, 502, 503, 504].includes(response.status)) {
          excludedAccounts.add(choice.accountId);
          excludedAccounts.add(requestRoute.accountId);
        }
        const canRetry = choices.some(
          (candidate) =>
            !excludedAccounts.has(candidate.accountId) &&
            !tried.has(`${candidate.accountId}:${candidate.model}`),
        );
        if ((modelUnavailable || excludedAccounts.has(choice.accountId)) && canRetry) {
          await response.body?.cancel();
          contexts.delete(routingId);
          continue;
        }
        const session = req.headers['x-session-id'] || req.headers['x-session-affinity'];
        if (response.ok && typeof session === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(session)) {
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
          'x-mesp-account': requestRoute.accountId,
        });
        if (response.body) await pipeline(Readable.fromWeb(response.body), res);
        else res.end();
        return;
      }
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
    } finally {
      if (routingId) contexts.delete(routingId);
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
          strategy: 'reset-first',
          version: '0.5.40',
          source: process.env.MESP_ROUTER_PROFILE_SOURCE === '9router' ? '9router' : 'mesp',
        });
      if (req.method === 'GET' && req.url === '/api/mesp/last-route')
        return json(res, 200, lastRoute);
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
