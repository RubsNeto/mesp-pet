export interface DockChatReply {
  ok: boolean;
  answer?: string;
  needsProject?: boolean;
  error?: string;
  cancelled?: boolean;
}
export interface DockChatRequest {
  petId: string;
  agent: string;
  prompt: string;
  model?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}
export const conversationInstructions: string;
export const conversationSchema: Record<string, unknown>;
export function conversationPrompt(prompt: string, history?: DockChatRequest['history']): string;
export function parseConversation(value: unknown): { answer: string; needsProject: boolean } | null;
export function conversationArgs(agent: string, schemaPath: string): string[];
export interface DockChatService {
  readonly activeCount: number;
  reply(request: DockChatRequest): Promise<DockChatReply>;
  cancel(petId: string): boolean;
  dispose(): void;
}
export function createDockChatService(options: {
  directory: string;
  resolveCommand: (command: string) => string | null;
  timeoutMs?: number;
}): DockChatService;
