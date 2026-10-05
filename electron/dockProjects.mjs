import { mkdir, realpath, stat, writeFile, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, join, relative, isAbsolute, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readPreviewRuntime, startPreviewRuntime } from './dockPreviewRuntime.mjs';
import { listenPreviewServer } from './dockPreviewAddress.mjs';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};
const inside = (root, target) => {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
};
const hidden = (path) =>
  path.split(/[\\/]/).some((part) => part.startsWith('.') || part === 'node_modules');

export function createDockProjectService({
  directory,
  nodeBinary,
  ownedDirectory,
  environment,
  stopProcess,
  stopProcessOnShutdown,
}) {
  const previews = new Map();
  const starting = new Map();
  let disposed = false;
  return {
    async create({ petId, title }) {
      if (disposed || !/^mesp-[\w-]{1,100}$/.test(petId)) throw new Error('MESP inválido.');
      await mkdir(directory, { recursive: true });
      const cwd = join(await realpath(directory), petId);
      await mkdir(cwd, { recursive: true });
      if (!inside(await realpath(directory), await realpath(cwd)))
        throw new Error('Pasta inválida.');
      const marker = join(cwd, '.mesp-project.json');
      try {
        await writeFile(
          marker,
          JSON.stringify({ petId, title: String(title).slice(0, 120), createdAt: Date.now() }),
          { flag: 'wx' },
        );
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      return { cwd };
    },
    async preview(cwd) {
      if (disposed) throw new Error('O MESP está fechando.');
      const project = await realpath(cwd);
      if (!(await stat(project)).isDirectory()) throw new Error('Pasta inválida.');
      if (starting.has(project)) return starting.get(project);
      const launch = (async () => {
        const runtime = await readPreviewRuntime(project);
        const existing = previews.get(project);
        if (runtime) {
          if (
            existing?.runtime === runtime.fingerprint &&
            existing.child?.exitCode === null &&
            existing.child?.signalCode === null
          )
            return { ok: true, url: existing.url, cwd: project };
          await existing?.stop();
          previews.delete(project);
          const preview = await startPreviewRuntime({
            project,
            config: runtime,
            nodeBinary,
            ownedDirectory,
            environment,
            stopProcess,
            stopProcessOnShutdown,
          });
          if (disposed) {
            await preview.stop();
            throw new Error('O MESP está fechando.');
          }
          previews.set(project, preview);
          return { ok: true, url: preview.url, cwd: project };
        }
        let root;
        for (const folder of ['dist', 'build', '']) {
          try {
            const candidate = await realpath(join(project, folder));
            const entry = await realpath(join(candidate, 'index.html'));
            if (
              inside(project, candidate) &&
              inside(candidate, entry) &&
              (await stat(entry)).isFile()
            ) {
              root = candidate;
              break;
            }
          } catch {
            /* Try the next supported web output. */
          }
        }
        if (!root)
          return {
            ok: false,
            unavailable: true,
            error: 'Ainda não existe index.html nem um build web pronto nesta pasta.',
          };
        const entryPath = join(root, 'index.html');
        if ((await stat(entryPath)).size > 4_000_000)
          return { ok: false, error: 'O index.html excede o tamanho permitido para a prévia.' };
        const html = await readFile(entryPath, 'utf8');
        for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
          if (
            /^<link/i.test(tag) &&
            !/\brel\s*=\s*(?:["'][^"']*\bstylesheet\b[^"']*["']|stylesheet\b)/i.test(tag)
          )
            continue;
          const attribute = tag.match(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          const resource = attribute && (attribute[1] ?? attribute[2] ?? attribute[3]);
          if (!resource || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(resource)) continue;
          try {
            const pathname = decodeURIComponent(
              new globalThis.URL(resource, 'http://local/').pathname,
            ).slice(1);
            const target = await realpath(resolve(root, pathname));
            if (hidden(pathname) || !inside(root, target) || !(await stat(target)).isFile())
              throw new Error();
          } catch {
            return {
              ok: false,
              error: `A prévia ainda depende de um arquivo ausente ou inválido: ${resource.slice(0, 160)}`,
            };
          }
        }
        const previous = previews.get(project);
        if (previous && !previous.runtime) {
          previous.updateRoot(root);
          return { ok: true, url: previous.url, cwd: project };
        }
        if (previous) {
          await previous.stop();
          previews.delete(project);
        }
        const token = randomBytes(18).toString('hex');
        const cookieName = `mesp_preview_${token.slice(0, 12)}`;
        const server = createServer(async (req, res) => {
          const deny = (code) => {
            res.writeHead(code);
            res.end();
          };
          if (!['GET', 'HEAD'].includes(req.method)) return deny(405);
          let pathname, url;
          try {
            url = new globalThis.URL(req.url, 'http://localhost');
            pathname = decodeURIComponent(url.pathname);
          } catch {
            return deny(400);
          }
          const authenticated =
            url.searchParams.get('mesp_preview') === token ||
            String(req.headers.cookie || '')
              .split(';')
              .some((item) => item.trim() === `${cookieName}=${token}`);
          if (!authenticated) return deny(404);
          const requested = pathname.slice(1) || 'index.html';
          if (
            hidden(requested) ||
            requested.includes('\0') ||
            (!types[extname(requested).toLowerCase()] &&
              (extname(requested) || !req.headers.accept?.includes('text/html')))
          )
            return deny(404);
          try {
            let target;
            try {
              target = await realpath(resolve(root, requested));
            } catch (error) {
              // Browser routes from a compiled SPA return its entry; missing assets remain 404.
              if (
                error.code !== 'ENOENT' ||
                extname(requested) ||
                !req.headers.accept?.includes('text/html')
              )
                throw error;
              target = await realpath(join(root, 'index.html'));
            }
            if (!inside(root, target) || hidden(relative(root, target))) return deny(404);
            const info = await stat(target);
            if (!info.isFile()) return deny(404);
            res.writeHead(200, {
              'content-type': types[extname(target).toLowerCase()],
              'content-length': info.size,
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
              'referrer-policy': 'no-referrer',
              'set-cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,
            });
            if (req.method === 'HEAD') return res.end();
            const file = createReadStream(target);
            file.on('error', () => res.destroy());
            file.pipe(res);
          } catch {
            deny(404);
          }
        });
        await listenPreviewServer(server, project);
        if (disposed) {
          server.close();
          throw new Error('O MESP está fechando.');
        }
        const url = `http://127.0.0.1:${server.address().port}/?mesp_preview=${token}`;
        previews.set(project, {
          server,
          root,
          url,
          updateRoot(nextRoot) {
            root = nextRoot;
            this.root = nextRoot;
          },
          stop() {
            server.closeAllConnections();
            return new Promise((resolve) => server.close(resolve));
          },
        });
        return { ok: true, url, cwd: project };
      })();
      starting.set(project, launch);
      try {
        return await launch;
      } finally {
        starting.delete(project);
      }
    },
    dispose(shutdown = false) {
      disposed = true;
      const stopping = [...previews.values()].map((preview) => preview.stop(shutdown));
      previews.clear();
      return Promise.all(stopping).then(() => undefined);
    },
  };
}
