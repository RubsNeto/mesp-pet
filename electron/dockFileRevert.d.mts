export function reversePatch(current: string, patch: string): string | null;
export type RevertFilePlan =
  | { action: 'write'; content: string }
  | { action: 'delete' }
  | { action: 'unchanged' }
  | { action: 'conflict' };
export function revertFilePlan(options: {
  status: string;
  patch: string;
  before?: unknown;
  after?: unknown;
  current: string;
  exists: boolean;
}): RevertFilePlan;
