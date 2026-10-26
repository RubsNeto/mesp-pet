export function providerPriorityFile(dataDir: string): string;
export function readProviderPriority(dataDir: string | null | undefined): string[];
export function writeProviderPriority(dataDir: string, value: unknown): string[];
export function modelVerificationFile(dataDir: string): string;
export function readModelVerification(
  dataDir: string | null | undefined,
): import('./dockModelVerification.mjs').VerificationStore;
export function writeModelVerification(
  dataDir: string,
  value: unknown,
): import('./dockModelVerification.mjs').VerificationStore;
