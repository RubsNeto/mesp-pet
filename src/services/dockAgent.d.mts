export interface AgentHistory {
  role: string;
  content?: string;
  text?: string;
}
export function isWebProjectRequest(prompt: string, history?: AgentHistory[]): boolean;
export function shouldExecuteProjectRequest(prompt: string, history?: AgentHistory[]): boolean;
export const webProjectInstructions: string;
