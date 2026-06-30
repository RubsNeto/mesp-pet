// src/components/ContextTab.tsx
//
// Aba "Contexto" do cockpit: memoria de projeto por pasta de trabalho.
//   - Regras do agente (AGENTS.md / CLAUDE.md / .cursorrules / ...).
//   - Notas do projeto (persistidas em localStorage por workDir).
//   - Arquivos fixados (@path) que voce insere no terminal com 1 clique.
//   - Biblioteca de prompts reutilizaveis (global).

import { useCallback, useEffect, useState } from 'react';
import {
  loadContext,
  saveContext,
  loadPrompts,
  savePrompts,
  makePromptId,
} from '../services/contextStore';
import type { ProjectContext, PromptItem } from '../services/contextStore';

export interface ContextTabProps {
  workDir: string | null;
  onInsert: (text: string) => void;
}

interface RuleFile {
  name: string;
  content: string;
}

const KNOWN_RULES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'GEMINI.md'];

export function ContextTab({ workDir, onInsert }: ContextTabProps) {
  const [ctx, setCtx] = useState<ProjectContext>(() => loadContext(workDir));
  const [prompts, setPrompts] = useState<PromptItem[]>(() => loadPrompts());
  const [rules, setRules] = useState<RuleFile[]>([]);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptBody, setNewPromptBody] = useState('');
  const [savedFlash, setSavedFlash] = useState('');

  useEffect(() => {
    setCtx(loadContext(workDir));
    if (workDir && window.mesp?.readProjectRules) {
      void window.mesp.readProjectRules(workDir).then((r) => setRules(r ?? []));
    } else {
      setRules([]);
    }
  }, [workDir]);

  const persistCtx = useCallback(
    (next: ProjectContext) => {
      setCtx(next);
      saveContext(workDir, next);
    },
    [workDir],
  );

  const persistPrompts = useCallback((next: PromptItem[]) => {
    setPrompts(next);
    savePrompts(next);
  }, []);

  const flash = useCallback((msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(() => setSavedFlash(''), 1800);
  }, []);

  const openRule = (r: RuleFile) => {
    setEditingRule(r.name);
    setRuleDraft(r.content);
  };

  const saveRule = useCallback(async () => {
    if (!workDir || !editingRule || !window.mesp?.writeProjectRules) return;
    const ok = await window.mesp.writeProjectRules({ workDir, name: editingRule, content: ruleDraft });
    if (ok) {
      setRules((prev) => {
        const exists = prev.some((x) => x.name === editingRule);
        return exists
          ? prev.map((x) => (x.name === editingRule ? { ...x, content: ruleDraft } : x))
          : [...prev, { name: editingRule, content: ruleDraft }];
      });
      flash('Regras salvas');
      setEditingRule(null);
    } else {
      flash('Falha ao salvar');
    }
  }, [workDir, editingRule, ruleDraft, flash]);

  const presentNames = new Set(rules.map((r) => r.name));

  return (
    <div className="cockpit-pane">
      <section className="cockpit-section">
        <h4>Regras do projeto</h4>
        {!workDir && <p className="muted small">Defina uma pasta de trabalho (menu do pet) para ler/editar as regras.</p>}
        {workDir && (
          <>
            <div className="chip-row">
              {KNOWN_RULES.map((name) => (
                <button
                  key={name}
                  className={`chip${presentNames.has(name) ? ' chip-on' : ''}`}
                  onClick={() => openRule(rules.find((r) => r.name === name) ?? { name, content: '' })}
                  title={presentNames.has(name) ? 'Editar' : 'Criar'}
                >
                  {name}
                </button>
              ))}
            </div>
            {editingRule && (
              <div className="rule-editor">
                <div className="muted small">Editando {editingRule}</div>
                <textarea
                  value={ruleDraft}
                  onChange={(e) => setRuleDraft(e.target.value)}
                  spellCheck={false}
                  rows={8}
                />
                <div className="cockpit-actions">
                  <button className="btn" onClick={() => setEditingRule(null)}>Cancelar</button>
                  <button className="btn primary" onClick={() => void saveRule()}>Salvar</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="cockpit-section">
        <h4>Notas do projeto</h4>
        <textarea
          className="notes-area"
          value={ctx.notes}
          placeholder="Anotacoes deste projeto (persistem por pasta)..."
          onChange={(e) => persistCtx({ ...ctx, notes: e.target.value })}
          spellCheck={false}
          rows={5}
        />
        <div className="cockpit-actions">
          <button className="btn" disabled={!ctx.notes} onClick={() => onInsert(ctx.notes)}>Inserir no terminal</button>
        </div>
      </section>

      <section className="cockpit-section">
        <h4>Arquivos fixados</h4>
        <div className="pin-add">
          <input
            type="text"
            value={newPin}
            placeholder="caminho/para/arquivo.ts"
            spellCheck={false}
            onChange={(e) => setNewPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPin.trim()) {
                persistCtx({ ...ctx, pinnedFiles: [...ctx.pinnedFiles, newPin.trim()] });
                setNewPin('');
              }
            }}
          />
          <button
            className="btn"
            disabled={!newPin.trim()}
            onClick={() => {
              persistCtx({ ...ctx, pinnedFiles: [...ctx.pinnedFiles, newPin.trim()] });
              setNewPin('');
            }}
          >
            Fixar
          </button>
        </div>
        <ul className="pin-list">
          {ctx.pinnedFiles.map((f, i) => (
            <li key={`${f}-${i}`}>
              <button className="link" onClick={() => onInsert(`@${f}`)} title="Inserir @arquivo no terminal">@{f}</button>
              <button
                className="btn-icon small"
                title="Remover"
                onClick={() => persistCtx({ ...ctx, pinnedFiles: ctx.pinnedFiles.filter((_, j) => j !== i) })}
              >
                x
              </button>
            </li>
          ))}
          {ctx.pinnedFiles.length === 0 && <li className="muted small">Nenhum arquivo fixado.</li>}
        </ul>
      </section>

      <section className="cockpit-section">
        <h4>Biblioteca de prompts</h4>
        <ul className="prompt-list">
          {prompts.map((p) => (
            <li key={p.id}>
              <div className="prompt-head">
                <strong>{p.title || '(sem titulo)'}</strong>
                <span>
                  <button className="btn-icon small" title="Inserir no terminal" onClick={() => onInsert(p.body)}>&gt;&gt;</button>
                  <button
                    className="btn-icon small"
                    title="Remover"
                    onClick={() => persistPrompts(prompts.filter((x) => x.id !== p.id))}
                  >
                    x
                  </button>
                </span>
              </div>
              <div className="muted small prompt-body">{p.body}</div>
            </li>
          ))}
        </ul>
        <div className="prompt-add">
          <input
            type="text"
            value={newPromptTitle}
            placeholder="Titulo"
            onChange={(e) => setNewPromptTitle(e.target.value)}
          />
          <textarea
            value={newPromptBody}
            placeholder="Texto do prompt"
            rows={2}
            spellCheck={false}
            onChange={(e) => setNewPromptBody(e.target.value)}
          />
          <button
            className="btn"
            disabled={!newPromptTitle.trim() && !newPromptBody.trim()}
            onClick={() => {
              persistPrompts([...prompts, { id: makePromptId(), title: newPromptTitle.trim(), body: newPromptBody.trim() }]);
              setNewPromptTitle('');
              setNewPromptBody('');
            }}
          >
            Adicionar prompt
          </button>
        </div>
      </section>

      {savedFlash && <div className="cockpit-flash">{savedFlash}</div>}
    </div>
  );
}