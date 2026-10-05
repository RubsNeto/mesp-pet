import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import {
  isWebProjectRequest,
  shouldExecuteProjectRequest,
  shouldCreateTaskWorkspace,
} from '../src/services/dockAgent.mjs';
import { createDockProjectService } from '../electron/dockProjects.mjs';
import { restoreMespLimits } from '../src/services/mespCodeCore.mjs';

test('tool tasks get a usable default budget without replacing saved custom limits', () => {
  const defaults = { maxDurationMs: 300000, maxTokens: 100000, maxToolCalls: 50 };
  assert.deepEqual(restoreMespLimits(null, undefined, defaults), defaults);
  const old = { ...defaults, maxTokens: 25000 };
  assert.deepEqual(restoreMespLimits(old, undefined, defaults), defaults);
  assert.deepEqual(restoreMespLimits(old, 2, defaults), old);
  const custom = { ...old, maxDurationMs: 60000 };
  assert.deepEqual(restoreMespLimits(custom, undefined, defaults), custom);
});

test('implementation intent distinguishes a real project from questions and code examples', () => {
  for (const prompt of [
    'Crie um site com HTML, CSS e JS',
    'quero uma landing page',
    'Faça meu portfólio',
    'Crie um site como referência para minha loja',
    'Crie um site de exemplo e grave os arquivos',
  ])
    assert.equal(isWebProjectRequest(prompt), true, prompt);
  for (const prompt of [
    'oi',
    'Como criar um site?',
    'Explique CSS',
    'Crie apenas o código de um site',
    'Mostre um exemplo HTML',
  ])
    assert.equal(isWebProjectRequest(prompt), false, prompt);
  assert.equal(
    isWebProjectRequest('Faça o projeto completo e mande o link', [
      { role: 'user', content: 'quero um site' },
    ]),
    true,
  );
  assert.equal(
    isWebProjectRequest('Faça o projeto completo', [{ role: 'assistant', content: 'site' }]),
    false,
  );
  assert.equal(shouldExecuteProjectRequest('Corrija o erro no botão'), true);
  assert.equal(shouldExecuteProjectRequest('Como corrijo o erro?'), false);
  assert.equal(shouldExecuteProjectRequest('Crie um script Python para organizar os CSV'), true);
  assert.equal(shouldExecuteProjectRequest('Preciso de um relatório em arquivo'), true);
  assert.equal(shouldExecuteProjectRequest('Investigue os erros deste projeto'), true);
  assert.equal(shouldCreateTaskWorkspace('Corrija os arquivos'), false);
  assert.equal(shouldCreateTaskWorkspace('Analise o projeto'), false);
  assert.equal(shouldCreateTaskWorkspace('Crie um script Python'), true);
  assert.equal(
    shouldExecuteProjectRequest('Continue', [{ role: 'user', content: 'Corrija o botão' }]),
    true,
  );
  assert.equal(
    shouldExecuteProjectRequest('Continue', [{ role: 'user', content: 'Explique uma API' }]),
    false,
  );
  assert.equal(isWebProjectRequest('Continue', [{ role: 'user', content: 'Crie um site' }]), true);
});

test('managed backend handles real POST requests, isolates preview cookies, and stops its own process', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'mesp-backend-test-'));
  const service = createDockProjectService({
    directory: base,
    nodeBinary: process.execPath,
    environment: {},
  });
  t.after(async () => {
    await service.dispose();
    if (dirname(resolve(base)) !== resolve(tmpdir())) throw new Error('Unexpected cleanup target');
    await rm(base, { recursive: true, force: true });
  });
  const { cwd } = await service.create({ petId: 'mesp-backend', title: 'Formulário' });
  await writeFile(join(cwd, '.mesp-preview.json'), JSON.stringify({ entry: 'server.cjs' }));
  await writeFile(
    join(cwd, 'server.cjs'),
    `const http=require('node:http');
http.createServer(async(req,res)=>{
if(req.method==='POST' && req.url==='/api/save') { let body='';for await(const chunk of req)body+=chunk;res.writeHead(201,{'content-type':'application/json'});res.end(JSON.stringify({saved:JSON.parse(body).name})); }
else {res.end('<title>Formulário real</title>');}
}).listen(Number(process.env.PORT),process.env.HOST);`,
  );
  const preview = await service.preview(cwd);
  assert.equal(preview.ok, true);
  const page = await fetch(preview.url);
  assert.match(await page.text(), /Formulário real/);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const endpoint = new URL('/api/save', preview.url);
  assert.equal((await fetch(endpoint, { method: 'POST', body: '{}' })).status, 404);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', origin: endpoint.origin },
    body: JSON.stringify({ name: 'MESP' }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { saved: 'MESP' });
  assert.equal(
    (
      await fetch(endpoint, {
        method: 'POST',
        headers: { cookie, origin: 'https://outside.invalid' },
        body: '{}',
      })
    ).status,
    403,
  );
  assert.equal((await service.preview(cwd)).url, preview.url);
  await service.dispose();
  await assert.rejects(fetch(preview.url));
});

test('invalid backend configuration is reported without running an arbitrary command', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'mesp-backend-config-'));
  const service = createDockProjectService({ directory: base, nodeBinary: process.execPath });
  t.after(async () => {
    await service.dispose();
    if (dirname(resolve(base)) !== resolve(tmpdir())) throw new Error('Unexpected cleanup target');
    await rm(base, { recursive: true, force: true });
  });
  const { cwd } = await service.create({ petId: 'mesp-invalid', title: 'Invalid' });
  await writeFile(join(cwd, '.mesp-preview.json'), JSON.stringify({ entry: '../outside.js' }));
  await assert.rejects(service.preview(cwd));
  await writeFile(join(cwd, '.mesp-preview.json'), JSON.stringify({ entry: 'server.cjs' }));
  await writeFile(join(cwd, 'server.cjs'), 'throw new Error("Startup failed");');
  await assert.rejects(service.preview(cwd), /encerrou/);
});

test('managed projects keep files and serve a verified local preview without exposing other files', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'mesp-agent-test-'));
  const service = createDockProjectService({ directory: join(base, 'projects') });
  t.after(async () => {
    await service.dispose();
    if (dirname(resolve(base)) !== resolve(tmpdir())) throw new Error('Unexpected cleanup target');
    await rm(base, { recursive: true, force: true });
  });
  await assert.rejects(service.create({ petId: '../escape', title: 'Unsafe' }));
  const { cwd } = await service.create({ petId: 'mesp-primary', title: 'Site' });
  assert.equal((await service.preview(cwd)).unavailable, true);
  await writeFile(join(cwd, 'index.html'), '<script src="missing.js"></script>');
  assert.equal(
    (await service.preview(cwd)).ok,
    false,
    'A missing entry script cannot produce a ready result',
  );
  await writeFile(
    join(cwd, 'index.html'),
    '<!doctype html><title>Site pronto</title><script src="app.js"></script>',
  );
  await writeFile(join(cwd, 'app.js'), 'document.body.dataset.ready="yes";');
  await writeFile(join(cwd, '.env'), 'PRIVATE=secret');
  assert.equal((await service.create({ petId: 'mesp-primary', title: 'Outro título' })).cwd, cwd);
  assert.match(await readFile(join(cwd, 'index.html'), 'utf8'), /Site pronto/);
  const [first, same] = await Promise.all([service.preview(cwd), service.preview(cwd)]);
  assert.equal(first.url, same.url);
  assert.match(await (await fetch(first.url)).text(), /Site pronto/);
  const asset = (name) => {
    const url = new URL(name, first.url);
    url.search = new URL(first.url).search;
    return url;
  };
  assert.equal(
    (await fetch(asset('app.js'))).headers.get('content-type'),
    'text/javascript; charset=utf-8',
  );
  assert.equal((await fetch(asset('.env'))).status, 404);
  assert.equal((await fetch(asset('%2e%2e%5csecret.html'))).status, 404);
  assert.equal(
    (await fetch(new URL('/app.js', first.url))).status,
    404,
    'Other origins need the preview key',
  );
  const htmlResponse = await fetch(first.url);
  const firstCookie = htmlResponse.headers.get('set-cookie').split(';')[0];
  assert.equal(
    (
      await fetch(new URL('/app.js', first.url), {
        headers: { cookie: firstCookie },
      })
    ).status,
    200,
    'Root-relative framework assets use the preview cookie',
  );
  const other = await service.create({ petId: 'mesp-another', title: 'Outro site' });
  await writeFile(join(other.cwd, 'index.html'), '<title>Outro site</title>');
  const otherPreview = await service.preview(other.cwd);
  const otherResponse = await fetch(otherPreview.url);
  const otherCookie = otherResponse.headers.get('set-cookie').split(';')[0];
  assert.notEqual(firstCookie.split('=')[0], otherCookie.split('=')[0]);
  assert.equal(
    (
      await fetch(new URL('/app.js', first.url), {
        headers: { cookie: `${firstCookie}; ${otherCookie}` },
      })
    ).status,
    200,
    'Two sites opened on localhost keep independent preview access',
  );
  const external = join(base, 'private');
  await mkdir(external);
  await writeFile(join(external, 'secret.html'), 'private');
  await symlink(external, join(cwd, 'linked'), 'junction');
  assert.equal((await fetch(asset('linked/secret.html'))).status, 404);
  const dist = join(cwd, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<title>Build pronto</title>');
  const built = await service.preview(cwd);
  assert.notEqual(built.url, first.url);
  assert.match(await (await fetch(built.url)).text(), /Build pronto/);
  await service.dispose();
  await assert.rejects(fetch(built.url));
});
