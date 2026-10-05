import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// A job retains descendants even after their shell exits or detaches them.
// No breakaway flags: closing this task's handle ends only its owned processes.
const ownerScript = String.raw`param([Parameter(Mandatory=$true)][string]$SpecFile)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$spec = Get-Content -LiteralPath $SpecFile -Raw -Encoding UTF8 | ConvertFrom-Json
Remove-Item -LiteralPath $SpecFile
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public sealed class MespTaskJob : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr MinWorkingSet, MaxWorkingSet;
    public uint ActiveProcesses;
    public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic;
    public IoCounters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateJobObject(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  IntPtr handle;
  public MespTaskJob() {
    handle = CreateJobObject(IntPtr.Zero, null);
    if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    ExtendedLimits limits = new ExtendedLimits();
    limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) {
      int error = Marshal.GetLastWin32Error(); Dispose(); throw new Win32Exception(error);
    }
  }
  public void Attach(IntPtr process) {
    if (!AssignProcessToJobObject(handle, process)) throw new Win32Exception(Marshal.GetLastWin32Error());
  }
  public void Dispose() {
    if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; }
  }
}
'@
$job = New-Object MespTaskJob
$child = New-Object System.Diagnostics.Process
$child.StartInfo.FileName = $spec.binary
$child.StartInfo.Arguments = $spec.arguments
$child.StartInfo.WorkingDirectory = $spec.cwd
$child.StartInfo.UseShellExecute = $false
$child.StartInfo.CreateNoWindow = $true
$child.StartInfo.RedirectStandardInput = $true
$child.StartInfo.RedirectStandardOutput = $true
$child.StartInfo.RedirectStandardError = $true
$exitCode = 1
try {
  $null = $child.Start()
  try { $job.Attach($child.Handle) }
  catch { if (-not $child.HasExited) { $child.Kill() }; throw }
  $child.StandardInput.Close()
  $stdout = $child.StandardOutput.BaseStream.CopyToAsync([Console]::OpenStandardOutput())
  $stderr = $child.StandardError.BaseStream.CopyToAsync([Console]::OpenStandardError())
  $child.WaitForExit()
  $exitCode = $child.ExitCode
  $job.Dispose()
  [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]@($stdout, $stderr))
} finally { $job.Dispose(); $child.Dispose() }
exit $exitCode
`;

const ownedTasks = new WeakSet();
export function isOwnedTask(child) {
  return ownedTasks.has(child);
}

function quoteArgument(value) {
  return (
    '"' +
    String(value)
      .replace(/(\\*)"/g, '$1$1\\"')
      .replace(/(\\+)$/g, '$1$1') +
    '"'
  );
}

export function spawnOwnedTask(binary, args, { directory, ...options }) {
  if (process.platform !== 'win32')
    return spawn(binary, args, { ...options, shell: false, windowsHide: true, stdio: 'pipe' });
  fs.mkdirSync(directory, { recursive: true });
  const script = path.join(
    directory,
    `owner-${createHash('sha256').update(ownerScript).digest('hex').slice(0, 12)}.ps1`,
  );
  if (!fs.existsSync(script))
    fs.writeFileSync(script, ownerScript, { encoding: 'utf8', mode: 0o600 });
  const spec = path.join(directory, `task-${randomUUID()}.json`);
  fs.writeFileSync(
    spec,
    JSON.stringify({ binary, arguments: args.map(quoteArgument).join(' '), cwd: options.cwd }),
    { encoding: 'utf8', mode: 0o600 },
  );
  const remove = () => {
    try {
      fs.unlinkSync(spec);
    } catch {
      /* The owner already consumed it. */
    }
  };
  try {
    const child = spawn(
      path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-SpecFile',
        spec,
      ],
      { ...options, shell: false, windowsHide: true, stdio: 'pipe' },
    );
    ownedTasks.add(child);
    child.once('close', remove);
    child.once('error', remove);
    return child;
  } catch (error) {
    remove();
    throw error;
  }
}
