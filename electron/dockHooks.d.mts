export interface DockAgentEvent {
  petId: string;
  state: 'thinking' | 'working' | 'waiting' | 'success' | 'error';
  content?: string;
  prompt?: string;
}
export interface DockHookBridge {
  prepare(petId: string, agent: string, nodeBinary: string): string[];
  remove(petId: string): void;
  close(): void;
}
export function dockHookEvent(payload: unknown): Omit<DockAgentEvent, 'petId'> | null;
export function createDockHooks(
  directory: string,
  send: (event: DockAgentEvent) => void,
): Promise<DockHookBridge>;
export function encodedAgentCommand(command: string, args: string[]): string;
