import process from 'node:process';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

// Capture descendants before stopping the root, then stop the root first so it
// cannot launch replacement tools. Retain identities even if shells exit early.
export function windowsProcessTreeCommand(rootPid, now = Date.now()) {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0 || !Number.isSafeInteger(now))
    throw new Error('Invalid owned process identity');
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$rootId = ${rootPid}
$cutoff = [DateTimeOffset]::FromUnixTimeMilliseconds(${now}).UtcDateTime
$snapshot = @(Get-CimInstance Win32_Process)
$root = $snapshot | Where-Object { $_.ProcessId -eq $rootId } | Select-Object -First 1
if (-not $root -or $root.CreationDate.ToUniversalTime() -gt $cutoff) { exit 0 }
$owned = [System.Collections.Generic.List[object]]::new()
$seen = [System.Collections.Generic.HashSet[int]]::new()
function Visit-Owned($entry, $depth) {
  if (-not $seen.Add([int]$entry.ProcessId)) { return }
  $owned.Add([pscustomobject]@{ Id = [int]$entry.ProcessId; Created = $entry.CreationDate.ToUniversalTime(); Depth = $depth })
  foreach ($descendant in $snapshot) {
    if ($descendant.ParentProcessId -eq $entry.ProcessId -and $descendant.CreationDate -ge $entry.CreationDate) {
      Visit-Owned $descendant ($depth + 1)
    }
  }
}
Visit-Owned $root 0
foreach ($entry in ($owned | Sort-Object Depth)) {
  try {
    $current = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
    if ($current -and -not $current.HasExited -and [Math]::Abs(($current.StartTime.ToUniversalTime() - $entry.Created).TotalMilliseconds) -lt 10) {
      $current.Kill(); $null = $current.WaitForExit(2000)
    }
  } catch {
    $remaining = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
    if ($remaining -and -not $remaining.HasExited) { throw }
  }
}
exit 0
`;
  return {
    binary: path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
  };
}

export async function stopWindowsProcessTree(rootPid) {
  const { binary, args } = windowsProcessTreeCommand(rootPid);
  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let diagnostic = '';
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-4096);
    });
    const timer = globalThis.setTimeout(() => {
      child.kill();
      reject(new Error('Timed out stopping the owned process tree'));
    }, 15000);
    child.once('error', (error) => {
      globalThis.clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      globalThis.clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error('Could not stop the owned process tree', { cause: new Error(diagnostic) }),
        );
    });
  });
}

export function stopWindowsProcessTreeSync(rootPid) {
  const { binary, args } = windowsProcessTreeCommand(rootPid);
  const result = spawnSync(binary, args, {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error || result.status !== 0)
    throw (
      result.error ||
      new Error('Could not stop the owned process tree', { cause: new Error(result.stderr) })
    );
}
