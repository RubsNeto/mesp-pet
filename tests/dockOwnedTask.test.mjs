import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnOwnedTask } from '../electron/dockOwnedTask.mjs';

for (const cancel of [false, true]) {
  test(
    `owned Windows job ${cancel ? 'cancellation' : 'completion'} removes detached descendants with an exited parent`,
    { skip: process.platform !== 'win32', timeout: 30000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'mesp-task-job-'));
      const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      const orphanSource =
        "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});child.unref();require('node:fs').writeFileSync('orphan.json',JSON.stringify({pid:child.pid,parent:process.pid}));";
      const source = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(orphanSource)}],{windowsHide:true,stdio:'ignore'});console.log(JSON.stringify(process.argv.slice(1)));console.error('verificação íntegra');${cancel ? 'setInterval(()=>{},1000);' : "child.on('exit',()=>setTimeout(()=>process.exit(0),100));"}`;
      const argument = 'nome com espaços "e aspas" C:\\pasta\\';
      const child = spawnOwnedTask(process.execPath, ['-e', source, '--', argument], {
        directory: join(directory, 'runtime'),
        cwd: directory,
        env: process.env,
      });
      let output = '',
        error = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        error += chunk;
      });
      child.stdin.end();
      const closed = once(child, 'close');
      let orphan;
      try {
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          try {
            orphan = JSON.parse(await readFile(join(directory, 'orphan.json'), 'utf8'));
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        assert.ok(orphan, error);
        if (cancel) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          assert.throws(
            () => process.kill(orphan.parent, 0),
            'The intermediate parent already exited',
          );
          assert.doesNotThrow(
            () => process.kill(orphan.pid, 0),
            'Its detached child remains in the job until cancelled',
          );
          child.kill();
        }
        const [code] = await closed;
        if (!cancel) assert.equal(code, 0, error);
        assert.deepEqual(JSON.parse(output.trim()), [argument]);
        assert.match(error, /verificação íntegra/);
        const deadline2 = Date.now() + 3000;
        let alive = true;
        while (alive && Date.now() < deadline2) {
          try {
            process.kill(orphan.pid, 0);
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch {
            alive = false;
          }
        }
        assert.equal(alive, false, 'The job also ends descendants absent from the process tree');
        assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill();
        if (orphan?.pid) {
          try {
            process.kill(orphan.pid);
          } catch {
            /*already stopped*/
          }
        }
        unrelated.kill();
        assert.ok(directory.startsWith(join(tmpdir(), 'mesp-task-job-')));
        await rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
      }
    },
  );
}
