// src/services/aiPresets.ts
// Presets de CLIs de IA suportadas. Cada preset tem comando, args e metadata.

export interface AIPreset {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  icon: string;
  /** URL opcional para instalação. */
  installUrl?: string;
}

export const AI_PRESETS: AIPreset[] = [
  {
    id: 'mesp-code',
    name: 'MESP Code',
    description: 'OpenCode conectado ao 9Router, com modelos sincronizados automaticamente',
    command: '9code',
    args: [],
    icon: 'M',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic Claude — agente de código',
    command: 'claude',
    args: [],
    icon: '🤖',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
  },
  {
    id: 'kiro',
    name: 'Kiro CLI',
    description: 'AWS Kiro Agent',
    command: 'kiro-cli',
    args: ['chat'],
    icon: '🐾',
    installUrl: 'https://kiro.dev',
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programmer (Python)',
    command: 'aider',
    args: [],
    icon: '🛠️',
    installUrl: 'https://aider.chat',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google Gemini',
    command: 'gemini',
    args: [],
    icon: '✨',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI Codex',
    command: 'codex',
    args: [],
    icon: '🧠',
    installUrl: 'https://github.com/openai/codex',
  },
  {
    id: 'gh-copilot',
    name: 'GitHub Copilot',
    description: 'GitHub Copilot CLI',
    command: 'gh',
    args: ['copilot', 'suggest'],
    icon: '🐙',
    installUrl: 'https://github.com/cli/cli',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    description: 'Cursor CLI agent',
    command: 'cursor-agent',
    args: [],
    icon: '🖱️',
    installUrl: 'https://cursor.com',
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Configurar comando manualmente',
    command: '',
    args: [],
    icon: '⚙️',
  },
];

export function findPresetByCommand(command: string, args: string[]): AIPreset | null {
  // Procura preset cujo comando + args batem.
  for (const preset of AI_PRESETS) {
    if (preset.id === 'custom') continue;
    if (preset.command !== command) continue;
    // Args devem começar com os do preset (permite extras pelo usuário).
    if (preset.args.length === 0 && args.length === 0) return preset;
    if (preset.args.every((a, i) => args[i] === a)) return preset;
  }
  return null;
}

export function getPresetById(id: string): AIPreset | undefined {
  return AI_PRESETS.find((p) => p.id === id);
}
