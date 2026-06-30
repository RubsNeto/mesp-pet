// src/services/stateDetect.d.ts
// Tipos para o módulo puro stateDetect.mjs.

export type DetectedState = 'thinking' | 'working' | 'waiting' | 'success' | 'error';

export interface StateMarkers {
  thinking: RegExp[];
  working: RegExp[];
  waiting: RegExp[];
  success: RegExp[];
  error: RegExp[];
}

export function stripAnsi(input: string): string;
export function matchesAny(text: string, patterns: RegExp[] | undefined): boolean;

export const GENERIC_MARKERS: StateMarkers;
export const PRESET_MARKERS: Record<string, Partial<StateMarkers>>;

export function mergeMarkers(presetMarkers?: Partial<StateMarkers>): StateMarkers;
export function presetIdForCommand(command: string): string | null;
export function getMarkersForCommand(command: string): StateMarkers;
export function matchState(text: string, markers: StateMarkers): DetectedState | null;
export function matchThinking(cleaned: string, markers: StateMarkers): 'thinking' | null;
