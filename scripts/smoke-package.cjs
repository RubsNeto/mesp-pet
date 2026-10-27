// Starts the unpacked build in release/ with --mesp-smoke and fails unless every bundled
// runtime (Node, npm, OpenCode, node-pty, 9Router) works. Used by CI before publishing.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const release = path.join(__dirname, '..', 'release');
const product = require('../package.json').build.productName;

function executable() {
  if (process.platform === 'win32') return path.join(release, 'win-unpacked', `${product}.exe`);
  if (process.platform === 'darwin') {
    const folder = fs.readdirSync(release).find((name) => /^mac/.test(name));
    if (!folder) return null;
    return path.join(release, folder, `${product}.app`, 'Contents', 'MacOS', product);
  }
  return path.join(release, 'linux-unpacked', 'mesp');
}

const binary = executable();
if (!binary || !fs.existsSync(binary)) {
  console.error(`Build não encontrado: ${binary}`);
  process.exit(1);
}
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mesp-smoke-')), 'report.json');
const args = ['--mesp-smoke', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])];
const result = spawnSync(binary, args, {
  env: { ...process.env, MESP_SMOKE_OUT: out, ELECTRON_ENABLE_LOGGING: '1' },
  encoding: 'utf8',
  timeout: 240_000,
});
if (!fs.existsSync(out)) {
  console.error(`O app não gerou o relatório (status ${result.status}).`);
  console.error(result.stdout?.slice(-2000), result.stderr?.slice(-4000));
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(out, 'utf8'));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok && result.status === 0 ? 0 : 1);
