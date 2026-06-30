// src/services/runLog.d.ts
import type { CostInfo } from "./costParse";

export type RunStatus = "running" | "success" | "error" | "done";

export interface RunRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: RunStatus;
  durationMs: number | null;
  cost?: CostInfo;
}

export function activeRun(runs: RunRecord[] | null | undefined): RunRecord | null;
export function applyTransition(runs: RunRecord[], state: string, now?: number): RunRecord[];
export function attachCost(runs: RunRecord[], cost: CostInfo): RunRecord[];
export function trimRuns(runs: RunRecord[], max?: number): RunRecord[];
export interface RunSummary {
  total: number;
  success: number;
  error: number;
  done: number;
  running: number;
  totalMs: number;
  cost: import("./costParse").CostInfo;
}
export function summarizeRuns(runs: RunRecord[]): RunSummary;