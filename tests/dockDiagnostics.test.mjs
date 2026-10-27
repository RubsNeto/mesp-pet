import test from 'node:test';
import assert from 'node:assert/strict';
import { redactLogText, formatLogLine, diagnosticsReport } from '../electron/dockDiagnostics.mjs';

test('credentials never reach logs or reports', () => {
  const raw =
    'Authorization: Bearer abc.def-123456789 key sk-ant-api03-abcdefghijklmnop ' +
    '{"access_token":"ya29.zzzz","apiKey":"x"} https://x.test/cb?code=4/abc&state=1 ghp_' +
    'a'.repeat(30);
  const clean = redactLogText(raw);
  assert.doesNotMatch(clean, /abc\.def|sk-ant|ya29\.zzzz|"x"|4\/abc|ghp_a/);
  assert.match(clean, /Bearer \[oculto\]/);
  assert.match(clean, /state=1/);
});

test('the home folder is replaced by ~ in every slash style', () => {
  const home = 'C:\\Users\\ana';
  assert.equal(
    redactLogText('C:\\Users\\ana\\x C:/Users/ana/y C:\\\\Users\\\\ana\\\\z', { home }),
    '~\\x ~/y ~\\\\z',
  );
});

test('log lines stay on one line', () => {
  const line = formatLogLine('warn', 'a\nb', new Date('2026-10-27T10:00:00Z'));
  assert.equal(line, '2026-10-27T10:00:00.000Z WARN  a ⏎ b\n');
});

test('diagnostics report is redacted', () => {
  const text = diagnosticsReport(
    {
      version: '1.0.0',
      channel: 'auto',
      os: 'Windows 10.0.26200',
      arch: 'x64',
      electron: '42',
      chrome: '140',
      node: '22',
      locale: 'pt-BR',
      runtimes: { node: 'bundled', opencode: 'bundled', router: 'running' },
      accounts: '2',
    },
    ['token sk-proj-1234567890abcdef in /home/ana/app'],
    { home: '/home/ana' },
  );
  assert.match(text, /MESP 1\.0\.0 \(auto\)/);
  assert.doesNotMatch(text, /sk-proj|\/home\/ana/);
});
