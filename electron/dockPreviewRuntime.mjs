import { spawnOwnedTask } from './dockOwnedTask.mjs';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, isAbsolute, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { listenPreviewServer } from './dockPreviewAddress.mjs';
import { redactDeveloperText } from './dockDeveloper.mjs';

export async function readPreviewRuntime(project) {
  let source;
  try {
    const file = await realpath(join(project, '.mesp-preview.json'));
    const path = relative(project, file);
    if (isAbsolute(path) || path.startsWith('..')) throw new Error('Configuração fora do projeto.');
    if ((await stat(file)).size > 8192) throw new Error('Configuração muito grande.');
    source = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const config = JSON.parse(source);
  if (
    typeof config.entry !== 'string' ||
    isAbsolute(config.entry) ||
    config.entry
      .split(/[\\/]/)
      .some((part) => part === '..' || part.startsWith('.') || part === 'node_modules') ||
    !['.js', '.cjs', '.mjs'].includes(extname(config.entry))
  )
    throw new Error('O servidor da prévia precisa ser um arquivo Node dentro do projeto.');
  const entry = await realpath(join(project, config.entry));
  const path = relative(project, entry);
  if (isAbsolute(path) || path.startsWith('..') || !(await stat(entry)).isFile())
    throw new Error('Servidor da prévia inválido.');
  return { entry, fingerprint: source + ':' + (await stat(entry)).mtimeMs };
}

export async function startPreviewRuntime({
  project,
  config,
  nodeBinary,
  ownedDirectory,
  environment,
  stopProcess,
  stopProcessOnShutdown,
}) {
  if (!nodeBinary) throw new Error('O runtime Node não está disponível.');
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const spawnBackend = ownedDirectory ? spawnOwnedTask : spawn;
  const child = spawnBackend(nodeBinary, [config.entry], {
    ...(ownedDirectory ? { directory: ownedDirectory } : {}),
    cwd: project,
    shell: false,
    windowsHide: true,
    stdio: 'pipe',
    env: { ...environment, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'development' },
  });
  let spawnError;
  child.once('error', (error) => {
    spawnError = error;
  });
  let diagnostic = '';
  const capture = (chunk) => {
    diagnostic = (diagnostic + chunk.toString('utf8')).slice(-16_000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.stdin.on('error', () => {});
  child.stdin.end();
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    if (stopProcess) {
      await stopProcess(child);
      return;
    }
    await new Promise((resolve) => {
      const timer = globalThis.setTimeout(resolve, 5000);
      child.once('close', () => {
        globalThis.clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  };
  const backend = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null)
        throw new Error(
          'O servidor do projeto encerrou antes de abrir. ' + redactDeveloperText(diagnostic),
        );
      try {
        const result = await globalThis.fetch(backend, {
          signal: globalThis.AbortSignal.timeout(700),
          redirect: 'manual',
        });
        ready = result.ok;
        await result.body?.cancel();
        if (ready) break;
      } catch {
        /* Wait for the owned server to become ready. */
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
    }
    if (!ready)
      throw new Error(
        'O servidor não abriu a página inicial no endereço local esperado. ' +
          redactDeveloperText(diagnostic),
      );
    const token = randomBytes(18).toString('hex');
    const cookieName = `mesp_preview_${token.slice(0, 12)}`;
    const proxy = createServer((req, res) => {
      let url;
      try {
        url = new globalThis.URL(req.url, backend);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const cookies = String(req.headers.cookie || '').split(';');
      const authenticated =
        url.searchParams.get('mesp_preview') === token ||
        cookies.some((cookie) => cookie.trim() === `${cookieName}=${token}`);
      const deny = (code, message) => {
        res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(message);
      };
      if (!authenticated) return deny(404, 'Prévia indisponível.');
      if (child.exitCode !== null || child.signalCode !== null)
        return deny(502, 'O servidor do projeto encerrou. Reabra o resultado no MESP.');
      const origin = `http://127.0.0.1:${proxy.address().port}`;
      if (
        !['GET', 'HEAD'].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !== origin
      )
        return deny(403, 'Origem inválida.');
      if (Number(req.headers['content-length'] || 0) > 2_000_000)
        return deny(413, 'Envio muito grande para a prévia.');
      url.searchParams.delete('mesp_preview');
      const headers = { ...req.headers, host: `127.0.0.1:${port}` };
      delete headers.connection;
      delete headers['proxy-authorization'];
      headers.cookie = cookies
        .filter((cookie) => !cookie.trim().startsWith(cookieName + '='))
        .join(';');
      const upstream = request(
        new globalThis.URL(url.pathname + url.search, backend),
        { method: req.method, headers },
        (response) => {
          const responseHeaders = {
            ...response.headers,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          };
          delete responseHeaders.connection;
          responseHeaders['set-cookie'] = [
            ...(response.headers['set-cookie'] || []),
            `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,
          ];
          if (responseHeaders.location?.startsWith(backend))
            responseHeaders.location = responseHeaders.location.replace(backend, origin);
          res.writeHead(response.statusCode || 502, responseHeaders);
          response.on('error', () => res.destroy());
          response.pipe(res);
        },
      );
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 2_000_000) {
          upstream.destroy();
          if (!res.headersSent) deny(413, 'Envio muito grande para a prévia.');
        }
      });
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) deny(502, 'O servidor do projeto não respondeu.');
        else res.destroy();
      });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => {
        if (!res.writableFinished) upstream.destroy();
      });
      req.pipe(upstream);
    });
    await listenPreviewServer(proxy, project);
    let closed = false;
    let closing = null;
    return {
      server: proxy,
      child,
      root: project,
      runtime: config.fingerprint,
      url: `http://127.0.0.1:${proxy.address().port}/?mesp_preview=${token}`,
      stop(shutdown = false) {
        if (shutdown && stopProcessOnShutdown) {
          stopProcessOnShutdown(child);
        }
        if (closed) return closing;
        closed = true;
        proxy.closeAllConnections();
        proxy.close();
        closing = shutdown && stopProcessOnShutdown ? Promise.resolve() : stop();
        return closing;
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
