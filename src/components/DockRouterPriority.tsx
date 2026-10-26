import { useEffect, useState } from 'react';
import type { RouterAccount } from '../../electron/dockRouter.mjs';

/** Ordered provider list for Auto: the first is tried first, the rest are fallbacks. */
export function DockRouterPriority({ accounts }: { accounts: RouterAccount[] }) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void window.mesp
      ?.getRouterPriority?.()
      .then((value) => alive && setSaved(value))
      .catch(() => alive && setSaved([]));
    return () => {
      alive = false;
    };
  }, []);

  const names = new Map(accounts.map((account) => [account.provider, account.providerName]));
  const connected = [...names.keys()];
  if (!saved || connected.length < 2) return null;
  // Saved order first; newly connected providers join at the end.
  const order = [
    ...saved.filter((id) => names.has(id)),
    ...connected.filter((id) => !saved.includes(id)),
  ];
  const ready = (provider: string) =>
    accounts.some(
      (account) =>
        account.provider === provider &&
        account.active &&
        account.health !== 'auth' &&
        account.health !== 'error' &&
        account.lastFailure !== 'permission',
    );
  const move = async (index: number, delta: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setSaved(next);
    const stored = await window.mesp?.setRouterPriority?.(next).catch(() => null);
    if (stored) {
      setSaved(stored);
      setError('');
    } else setError('Não foi possível salvar a ordem.');
  };

  return (
    <section className="dock-priority" aria-label="Ordem do Auto">
      <div className="dock-settings-section-heading">
        <h3>Ordem do Auto</h3>
        <small>O primeiro é usado; os seguintes são fallback</small>
      </div>
      <ol className="dock-priority-list">
        {order.map((provider, index) => (
          <li key={provider}>
            <span className="dock-priority-index">{index + 1}</span>
            <span className="dock-priority-name">
              <strong>{names.get(provider) || provider}</strong>
              {!ready(provider) && <small>Indisponível agora · pulado até voltar</small>}
            </span>
            <button
              type="button"
              aria-label={`Subir ${names.get(provider) || provider}`}
              disabled={index === 0}
              onClick={() => void move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Descer ${names.get(provider) || provider}`}
              disabled={index === order.length - 1}
              onClick={() => void move(index, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      {error && (
        <p className="dock-settings-hint" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
