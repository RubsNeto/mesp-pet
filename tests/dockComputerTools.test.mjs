import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
const { copyFile } = createRequire(import.meta.url)('../electron/dockComputerTools.cjs');

test('computer copy preserves binary data and exact newlines and verifies SHA-256', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mesp-copy-test-'));
  t.after(async () => {
    assert.equal(dirname(dir), tmpdir());
    await rm(dir, { recursive: true, force: true });
  });
  const bytes = Buffer.from([0, 255, 239, 187, 191, 65, 13, 10, 66]);
  const source = join(dir, 'origem com espaços.bin');
  const destination = join(dir, 'copia.bin');
  await writeFile(source, bytes);
  const result = await copyFile({ source, destination });
  assert.equal(result.verified, true);
  assert.equal(result.bytes, bytes.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readFile(destination), bytes);
  await assert.rejects(copyFile({ source, destination }), { code: 'EEXIST' });
  assert.deepEqual(await readFile(destination), bytes);
  await writeFile(source, 'sem quebra de linha');
  await copyFile({ source, destination, overwrite: true });
  assert.equal(await readFile(destination, 'utf8'), 'sem quebra de linha');
});

test('computer copy rejects ambiguous paths and invalid overwrite flags', async () => {
  await assert.rejects(copyFile({ source: 'relative.txt', destination: 'other.txt' }), /absoluto/);
  const source = join(tmpdir(), 'same.txt');
  await assert.rejects(copyFile({ source, destination: source }), /diferentes/);
  await assert.rejects(
    copyFile({ source, destination: join(tmpdir(), 'other.txt'), overwrite: 'true' }),
    /booleano/,
  );
});
