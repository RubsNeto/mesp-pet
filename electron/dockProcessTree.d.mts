export function windowsProcessTreeCommand(
  rootPid: number,
  now?: number,
): { binary: string; args: string[] };
export function stopWindowsProcessTree(rootPid: number): Promise<void>;
export function stopWindowsProcessTreeSync(rootPid: number): void;
