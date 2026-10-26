import test from 'node:test';
import assert from 'node:assert/strict';
import { loginItemIdentity } from '../electron/dockLoginItem.mjs';

test('packaged app registers only its own executable', () => {
  assert.deepEqual(
    loginItemIdentity({
      packaged: true,
      execPath: 'C:\\Apps\\MESP\\MESP Top Dock.exe',
      appPath: 'C:\\Apps\\MESP\\resources\\app.asar',
    }),
    { path: 'C:\\Apps\\MESP\\MESP Top Dock.exe', args: [] },
  );
});

test('unpackaged app passes the application folder to the Electron binary', () => {
  assert.deepEqual(
    loginItemIdentity({
      packaged: false,
      execPath: 'C:\\repo\\node_modules\\electron\\dist\\electron.exe',
      appPath: 'C:\\repo',
    }),
    { path: 'C:\\repo\\node_modules\\electron\\dist\\electron.exe', args: ['C:\\repo'] },
  );
});

test('application folders are passed verbatim; Electron quotes registry arguments', () => {
  assert.deepEqual(
    loginItemIdentity({
      packaged: false,
      execPath: 'C:\\e.exe',
      appPath: 'C:\\Meus Projetos\\mesp',
    }).args,
    ['C:\\Meus Projetos\\mesp'],
  );
});
