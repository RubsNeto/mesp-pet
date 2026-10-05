import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute } from 'node:path';
import process from 'node:process';

const execute = promisify(execFile);
async function git(cwd, args) {
  try {
    const result = await execute('git', ['-C', cwd, ...args], {
      windowsHide: true,
      maxBuffer: 256_000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    });
    return result.stdout.trim();
  } catch {
    return '';
  }
}
async function safeRead(root, name, maximum = 16_000) {
  try {
    const target = await realpath(join(root, name));
    const part = relative(root, target);
    if (isAbsolute(part) || part.startsWith('..') || (await stat(target)).size > maximum) return '';
    return await readFile(target, 'utf8');
  } catch {
    return '';
  }
}

// Read-only context. Never installs, stages, resets, stashes or commits customer files.
export async function inspectDeveloperContext(root, files) {
  const gitRoot = await git(root, ['rev-parse', '--show-toplevel']);
  const repository = gitRoot
    ? {
        root: gitRoot,
        branch: await git(root, ['branch', '--show-current']),
        head: await git(root, ['rev-parse', 'HEAD']),
        status: await git(root, ['status', '--porcelain=v1', '--untracked-files=normal']),
        parentRepository: relative(root, gitRoot) !== '',
      }
    : null;
  const packages = [];
  let rootPackage = {};
  try {
    rootPackage = JSON.parse((await safeRead(root, 'package.json')).replace(/^\uFEFF/, ''));
  } catch {
    /* Invalid JSON is checked independently. */
  }
  if (!rootPackage || typeof rootPackage !== 'object' || Array.isArray(rootPackage))
    rootPackage = {};
  const declaredWorkspaces = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : rootPackage.workspaces?.packages;
  const workspaces = Array.isArray(declaredWorkspaces) ? declaredWorkspaces : [];
  const pnpmWorkspace = await safeRead(root, 'pnpm-workspace.yaml');
  const patterns = [
    ...workspaces,
    ...[...pnpmWorkspace.matchAll(/^\s*-\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/gm)].map(
      (match) => match[1],
    ),
  ].filter((value) => typeof value === 'string');
  const matches = (name, glob) => {
    const escaped = glob
      .replace(/\/$/, '')
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '__DOUBLE_STAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/__DOUBLE_STAR__/g, '.*');
    return new RegExp('^' + escaped + '/package\\.json$').test(name);
  };
  const packageFiles = files
    .filter(
      (file) =>
        file.endsWith('/package.json') &&
        !/(?:^|\/)(?:tests?|fixtures?|examples?)\//i.test(file) &&
        (patterns.length
          ? patterns.some((glob) => !glob.startsWith('!') && matches(file, glob)) &&
            !patterns.some((glob) => glob.startsWith('!') && matches(file, glob.slice(1)))
          : /^(?:(?:packages|apps|services|modules)\/[^/]+|frontend|backend|api|server|client|web|desktop|mobile)\/package\.json$/.test(
              file,
            )),
    )
    .slice(0, 40);
  for (const name of packageFiles) {
    try {
      const pkg = JSON.parse((await safeRead(root, name)).replace(/^\uFEFF/, ''));
      if (pkg && typeof pkg === 'object' && !Array.isArray(pkg))
        packages.push({
          directory: dirname(name).replaceAll('\\', '/'),
          name: pkg.name || '',
          scripts: pkg.scripts || {},
          manager: String(pkg.packageManager || '').match(/^(npm|pnpm|yarn|bun)@/)?.[1],
          dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
        });
    } catch {
      /* Root inspection still reports malformed package manifests independently. */
    }
  }
  const nestedInstructions = [];
  for (const name of files.filter((file) => /\/AGENTS\.md$/i.test(file)).slice(0, 30))
    nestedInstructions.push({ file: name, text: await safeRead(root, name) });
  const documents = [];
  for (const name of files
    .filter((file) => /(?:^|\/)(?:ARCHITECTURE|CONTRIBUTING|DEVELOPMENT)\.md$/i.test(file))
    .slice(0, 10))
    documents.push({ file: name, text: await safeRead(root, name) });
  const environment = [];
  for (const name of ['.env.example', '.env.sample', '.env.template']) {
    const text = await safeRead(root, name);
    for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm))
      environment.push(match[1]); // Names only, never values, even in sample files.
  }
  let dependenciesInstalled = false;
  try {
    dependenciesInstalled = (await stat(join(root, 'node_modules'))).isDirectory();
  } catch {
    /* Empty projects. */
  }
  const pythonTests = files.filter((file) => /(?:^|\/)test_[^/]+\.py$/.test(file));
  let pythonTestFramework = null;
  if (pythonTests.length) {
    pythonTestFramework = 'pytest';
    for (const name of pythonTests.slice(0, 40))
      if (/\b(?:unittest|TestCase)\b/.test(await safeRead(root, name))) {
        pythonTestFramework = 'unittest';
        break;
      }
  }
  return {
    repository,
    packages,
    packageFiles,
    nestedInstructions,
    documents,
    environment: [...new Set(environment)],
    dependenciesInstalled,
    pythonTestFramework,
    manifests: files.filter((file) =>
      /(?:^|\/)(?:pyproject\.toml|requirements[^/]*\.txt|Cargo\.toml|go\.mod|Dockerfile|compose\.ya?ml|docker-compose\.ya?ml|[^/]+\.csproj|[^/]+\.sln)$/.test(
        file,
      ),
    ),
  };
}

export function additionalDeveloperChecks(profile) {
  const checks = [],
    names = profile.files;
  if (names.includes('Cargo.toml')) {
    const locked = names.includes('Cargo.lock') ? ['--locked'] : [];
    checks.push({
      name: 'Rust: cargo check',
      kind: 'command',
      command: 'cargo',
      args: ['check', ...locked],
    });
    checks.push({
      name: 'Rust: cargo test',
      kind: 'command',
      command: 'cargo',
      args: ['test', ...locked],
    });
  }
  if (names.includes('go.mod')) {
    checks.push({ name: 'Go: go vet', kind: 'command', command: 'go', args: ['vet', './...'] });
    checks.push({ name: 'Go: go test', kind: 'command', command: 'go', args: ['test', './...'] });
  }
  const solution = names.find((file) => !file.includes('/') && /\.sln$/.test(file));
  const csproject = names.find((file) => !file.includes('/') && /\.csproj$/.test(file));
  if (solution || csproject) {
    checks.push({
      name: '.NET: build',
      kind: 'command',
      command: 'dotnet',
      args: ['build', solution || csproject, '--nologo'],
    });
    if (names.some((file) => /(?:^|\/)[^/]*tests?[^/]*\.csproj$/i.test(file)))
      checks.push({
        name: '.NET: test',
        kind: 'command',
        command: 'dotnet',
        args: ['test', solution || csproject, '--no-build', '--nologo'],
      });
  }
  if (
    names.includes('pytest.ini') ||
    names.includes('conftest.py') ||
    profile.context?.pythonTestFramework === 'pytest'
  )
    checks.push({
      name: 'Python: pytest',
      kind: 'command',
      command: 'python',
      args: ['-m', 'pytest', '-q'],
    });
  else if (names.some((file) => /(?:^|\/)test_[^/]+\.py$/.test(file)))
    checks.push({
      name: 'Python: unittest',
      kind: 'command',
      command: 'python',
      args: [
        '-m',
        'unittest',
        'discover',
        '-s',
        names.some((file) => /^tests\/test_/.test(file)) ? 'tests' : '.',
        '-v',
      ],
    });
  return checks;
}
