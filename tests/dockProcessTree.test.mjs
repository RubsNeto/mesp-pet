import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stopWindowsProcessTree,
  stopWindowsProcessTreeSync,
  windowsProcessTreeCommand,
} from '../electron/dockProcessTree.mjs';

test('process cancellation rejects arbitrary or invalid process identities', () => {
  for (const id of [0, -1, NaN, 2.5, '123; Stop-Process'])
    assert.throws(() => windowsProcessTreeCommand(id));
});

for (const synchronous of [false, true]) {
  test(
    `Windows ${synchronous ? 'shutdown' : 'cancel'} ends owned descendants and preserves an unrelated process`,
    { skip: process.platform !== 'win32', timeout: 30000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'mesp-owned-process-'));
      const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      const source = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});require('node:fs').writeFileSync('owned.json',JSON.stringify({root:process.pid,child:child.pid}));setInterval(()=>{},1000);`;
      const root = spawn(process.execPath, ['-e', source], {
        cwd: directory,
        windowsHide: true,
        stdio: 'ignore',
      });
      let owned;
      try {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          try {
            owned = JSON.parse(await readFile(join(directory, 'owned.json'), 'utf8'));
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        assert.ok(owned);
        assert.equal(owned.root, root.pid);
        if (synchronous) stopWindowsProcessTreeSync(root.pid);
        else await stopWindowsProcessTree(root.pid);
        assert.throws(() => process.kill(owned.child, 0));
        assert.throws(() => process.kill(owned.root, 0));
        assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
      } finally {
        // Only our recorded fixture processes are eligible for cleanup.
        if (root.exitCode === null && root.signalCode === null) root.kill();
        if (owned?.child) {
          try {
            process.kill(owned.child);
          } catch {
            /* Already stopped. */
          }
        }
        unrelated.kill();
        assert.ok(directory.startsWith(join(tmpdir(), 'mesp-owned-process-')));
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
