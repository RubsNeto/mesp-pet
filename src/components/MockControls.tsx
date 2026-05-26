// src/components/MockControls.tsx
//
// Painel fixo no canto inferior direito com os botões de simulação.
// Permite testar todos os estados do pet sem depender da Kiro CLI.

import { useState } from 'react';
import type { PetEntity } from '../types';

export type MockKind =
  | 'thinking'
  | 'working'
  | 'success'
  | 'error'
  | 'longResponse';

export interface MockControlsProps {
  pets: PetEntity[];
  mockMode: boolean;
  onMockModeChange: (mock: boolean) => void;
  kiroCommand: string;
  onKiroCommandChange: (cmd: string) => void;
  onAddPet: () => void;
  onSimulate: (petId: string, kind: MockKind) => void;
  onRunCommand: (petId: string, command: string, args: string[]) => void;
}

export function MockControls({
  pets,
  mockMode,
  onMockModeChange,
  kiroCommand,
  onKiroCommandChange,
  onAddPet,
  onSimulate,
  onRunCommand,
}: MockControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<string>(pets[0]?.id ?? '');
  const [commandText, setCommandText] = useState<string>('echo "olá do MESP"');

  // Garante que o pet selecionado ainda existe.
  const targetId = pets.find((p) => p.id === selectedPetId)?.id ?? pets[0]?.id ?? '';

  if (collapsed) {
    return (
      <div className="mock-panel interactive" style={{ width: 'auto' }}>
        <button
          className="small-btn"
          onClick={() => setCollapsed(false)}
          aria-label="Expandir controles"
        >
          🐾 MESP controls
        </button>
      </div>
    );
  }

  return (
    <div className="mock-panel interactive">
      <header>
        <span>MESP controls</span>
        <button
          className="small-btn"
          onClick={() => setCollapsed(true)}
          aria-label="Recolher"
          title="Recolher"
        >
          –
        </button>
      </header>

      <div className="pet-count">
        {pets.length} pet(s) ativo(s)
      </div>

      <div className="row">
        <button className="small-btn primary" onClick={onAddPet}>
          + Novo MESP
        </button>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={mockMode}
          onChange={(e) => onMockModeChange(e.target.checked)}
        />
        Modo mock (não chama a Kiro)
      </label>

      <div className="row">
        <select
          className="small-btn"
          value={targetId}
          onChange={(e) => setSelectedPetId(e.target.value)}
          style={{ flex: 1 }}
          aria-label="Pet alvo"
        >
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <button className="small-btn" onClick={() => onSimulate(targetId, 'thinking')}>
          thinking
        </button>
        <button className="small-btn" onClick={() => onSimulate(targetId, 'working')}>
          working
        </button>
      </div>
      <div className="row">
        <button className="small-btn" onClick={() => onSimulate(targetId, 'success')}>
          success
        </button>
        <button className="small-btn" onClick={() => onSimulate(targetId, 'error')}>
          error
        </button>
        <button className="small-btn" onClick={() => onSimulate(targetId, 'longResponse')}>
          texto longo
        </button>
      </div>

      <hr style={{ width: '100%', borderColor: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

      <div style={{ fontSize: 10, opacity: 0.65 }}>Bridge real (modo Kiro)</div>
      <input
        type="text"
        value={kiroCommand}
        onChange={(e) => onKiroCommandChange(e.target.value)}
        placeholder="kiro"
        aria-label="Comando da Kiro"
      />
      <input
        type="text"
        value={commandText}
        onChange={(e) => setCommandText(e.target.value)}
        placeholder='args, ex: chat "olá"'
        aria-label="Argumentos do comando"
      />
      <div className="row">
        <button
          className="small-btn primary"
          onClick={() => {
            const args = parseArgs(commandText);
            onRunCommand(targetId, kiroCommand, args);
          }}
        >
          Executar
        </button>
        <button
          className="small-btn"
          onClick={() => {
            // Atalho útil: comandos universais.
            onRunCommand(targetId, 'node', ['-v']);
          }}
          title="Roda 'node -v' como teste seguro"
        >
          node -v
        </button>
      </div>
    </div>
  );
}

/** Parser simples de argumentos respeitando aspas duplas. */
function parseArgs(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === ' ' && !inQuote) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
