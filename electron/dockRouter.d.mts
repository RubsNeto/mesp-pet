export interface RouterConnectionSummary {
  provider: string;
  accounts: number;
  active: number;
}
export function routerPage(page: unknown): string;
export function routerConnectionSummary(payload: unknown): RouterConnectionSummary[] | null;
