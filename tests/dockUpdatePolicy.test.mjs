import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMode, isNewerVersion } from '../electron/dockUpdatePolicy.mjs';

test('only installs that can replace themselves update automatically', () => {
  assert.equal(updateMode({ packaged: false, platform: 'win32' }), 'off');
  assert.equal(updateMode({ packaged: true, platform: 'win32' }), 'auto');
  assert.equal(
    updateMode({ packaged: true, platform: 'linux', appImage: '/x/MESP.AppImage' }),
    'auto',
  );
  assert.equal(updateMode({ packaged: true, platform: 'linux' }), 'manual');
  assert.equal(updateMode({ packaged: true, platform: 'darwin' }), 'manual');
});

test('version comparison follows semver order', () => {
  assert.equal(isNewerVersion('1.0.0', 'v1.0.1'), true);
  assert.equal(isNewerVersion('1.0.0', '1.0.0'), false);
  assert.equal(isNewerVersion('1.2.0', '1.10.0'), true);
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), false);
  assert.equal(isNewerVersion('1.0.0-beta.2', '1.0.0'), true);
  assert.equal(isNewerVersion('1.0.0', '1.0.0-beta.9'), false);
  assert.equal(isNewerVersion('1.0.0-beta.2', '1.0.0-beta.10'), true);
  assert.equal(isNewerVersion('1.0.0', 'latest'), false);
});
