import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
export function spawnOwnedTask(
  binary: string,
  args: string[],
  options: SpawnOptionsWithoutStdio & { directory: string; cwd: string },
): ChildProcessWithoutNullStreams;

export function isOwnedTask(child: object): boolean;
