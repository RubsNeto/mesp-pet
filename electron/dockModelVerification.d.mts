export interface VerificationEntry {
  ok: boolean;
  at: number;
  status?: number;
}
export type VerificationStore = Record<string, VerificationEntry>;
export const VERIFIED_OK_MS: number;
export const VERIFIED_FAIL_MS: number;
export function verificationKey(accountId: string, model: string): string;
export function isChatModel(id: string): boolean;
export function verificationState(
  store: VerificationStore | null | undefined,
  accountId: string,
  model: string,
  now?: number,
): 'ok' | 'failed' | 'untested';
export function normalizeVerification(value: unknown, now?: number): VerificationStore;
export function definitiveFailure(status: number, body?: unknown): boolean;
