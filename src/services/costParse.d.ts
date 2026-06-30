// src/services/costParse.d.ts
export interface CostInfo {
  credits?: number;
  tokens?: number;
  usd?: number;
  timeSec?: number;
}
export function parseCostLine(line: string): CostInfo | null;
export function mergeCost(base: CostInfo | null | undefined, next: CostInfo | null | undefined): CostInfo;
export function formatCost(cost: CostInfo | null | undefined): string;
export function aggregateCost(runs: Array<{ cost?: CostInfo }>): CostInfo;