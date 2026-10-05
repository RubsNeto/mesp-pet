export interface AgentHistory {
  role: string;
  content?: string;
  text?: string;
}
export function isWebProjectRequest(prompt: string, history?: AgentHistory[]): boolean;
export function isProjectContinuationRequest(prompt: string): boolean;
export function isComputerTaskRequest(prompt: string, history?: AgentHistory[]): boolean;
export function shouldExecuteProjectRequest(prompt: string, history?: AgentHistory[]): boolean;
export function shouldCreateTaskWorkspace(prompt: string, history?: AgentHistory[]): boolean;
export const webProjectInstructions: string;
export const taskExecutionInstructions: string;
