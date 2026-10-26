export function normalizeProviderPriority(value: unknown): string[];
export function providerRank(
  priority: readonly string[] | null | undefined,
  provider: string,
): number;
