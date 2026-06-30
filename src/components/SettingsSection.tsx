// src/components/SettingsSection.tsx
//
// Configuracoes do app (notificacoes, orcamento, aparencia, comportamento).
// Persiste via settingsStore (emite evento de mudanca).

import { useState } from 'react';
import { loadSettings, saveSettings } from '../services/settingsStore';
import type { AppSettings } from '../services/settingsStore';

export function SettingsSection() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const update = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const n = settings.notifications;
  const a = settings.appearance;
  const b = settings.behavior;

  return (
    <div className="settings-section">
      <h4>Notificacoes</h4>
      <label className="row-check">
        <input type="checkbox" checked={n.waiting} onChange={(e) => update({ ...settings, notifications: { ...n, waiting: e.target.checked } })} />
        <span>Avisar quando o agente aguardar voce</span>
      </label>
      <label className="row-check">
        <input type="checkbox" checked={n.success} onChange={(e) => update({ ...settings, notifications: { ...n, success: e.target.checked } })} />
        <span>Avisar ao concluir com sucesso</span>
      </label>
      <label className="row-check">
        <input type="checkbox" checked={n.error} onChange={(e) => update({ ...settings, notifications: { ...n, error: e.target.checked } })} />
        <span>Avisar em caso de erro</span>
      </label>
      <label className="row-range">
        <span>Notificar so tarefas acima de {Math.round(n.minDurationMs / 1000)}s</span>
        <input type="range" min={0} max={120} step={5} value={Math.round(n.minDurationMs / 1000)}
          onChange={(e) => update({ ...settings, notifications: { ...n, minDurationMs: Number(e.target.value) * 1000 } })} />
      </label>
      <label className="row-range">
        <span>Alerta de "travado" apos {n.stuckAlertMin === 0 ? 'desligado' : `${n.stuckAlertMin} min`}</span>
        <input type="range" min={0} max={30} step={1} value={n.stuckAlertMin}
          onChange={(e) => update({ ...settings, notifications: { ...n, stuckAlertMin: Number(e.target.value) } })} />
      </label>
      <label className="row-range">
        <span>Orcamento de custo: {n.costBudgetUsd === 0 ? 'desligado' : `$${n.costBudgetUsd.toFixed(2)}`}</span>
        <input type="range" min={0} max={20} step={0.5} value={n.costBudgetUsd}
          onChange={(e) => update({ ...settings, notifications: { ...n, costBudgetUsd: Number(e.target.value) } })} />
      </label>

      <h4>Aparencia</h4>
      <label className="row-range">
        <span>Fonte do terminal: {a.terminalFontSize}px</span>
        <input type="range" min={8} max={24} step={1} value={a.terminalFontSize}
          onChange={(e) => update({ ...settings, appearance: { ...a, terminalFontSize: Number(e.target.value) } })} />
      </label>
      <label className="row-check">
        <input type="checkbox" checked={a.showHud} onChange={(e) => update({ ...settings, appearance: { ...a, showHud: e.target.checked } })} />
        <span>Mostrar HUD (status/tempo) sobre o pet</span>
      </label>
      <label className="row-check">
        <input type="checkbox" checked={a.theme === 'light'} onChange={(e) => update({ ...settings, appearance: { ...a, theme: e.target.checked ? 'light' : 'dark' } })} />
        <span>Tema claro</span>
      </label>

      <h4>Comportamento</h4>
      <label className="row-check">
        <input type="checkbox" checked={b.autoPrimer} onChange={(e) => update({ ...settings, behavior: { ...b, autoPrimer: e.target.checked } })} />
        <span>Auto-primer: injetar contexto do projeto ao conectar</span>
      </label>
    </div>
  );
}