import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { AUTO_ROUTER_MODEL, type RouterOverview } from '../../electron/dockRouter.mjs';
import { dockModelLabel } from './DockModelPicker';

export const isDockModelCommand = (value: string) =>
  /^\/(?:model|models|modelos)(?:\s|$)/i.test(value.trimStart());
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
let snapshot: { data: RouterOverview | null; loading: boolean; error: string } = {
  data: null,
  loading: false,
  error: '',
};
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(next: typeof snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
async function refresh(force = false) {
  if (!window.mesp) return;
  if (pending) return pending;
  if (!force && snapshot.data && Date.now() - snapshot.data.updatedAt < 15000) return;
  publish({ ...snapshot, loading: true, error: '' });
  pending = (async () => {
    try {
      const data = await window.mesp!.get9RouterModels(force);
      publish({ data, loading: false, error: '' });
    } catch {
      publish({
        data: null,
        loading: false,
        error: 'Não foi possível consultar os modelos. Tente atualizar.',
      });
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export function useDockInlineModels({
  value,
  enabled,
  currentModel,
  canChange,
  onChoose,
  onClose,
}: {
  value: string;
  enabled: boolean;
  currentModel?: string | null;
  canChange: boolean;
  onChoose: (model: string) => void;
  onClose: () => void;
}) {
  const state = useSyncExternalStore(subscribe, () => snapshot);
  const [selection, setSelection] = useState({ value: '', index: 0 });
  const listId = useId();
  const open = enabled && isDockModelCommand(value);
  const query = value.trimStart().replace(/^\/(?:modelos|models|model)\b\s*/i, '');
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const models = (state.data?.models || []).filter(
    (model) =>
      model.source === 'live' &&
      words.every((word) =>
        normalize(`${model.name} ${model.id} ${model.providerName}`).includes(word),
      ),
  );
  const autoVisible =
    state.data?.auto.supported &&
    state.data.models.length > 0 &&
    words.every((word) => normalize('auto automatico reset').includes(word));
  const choices = [
    ...(autoVisible
      ? [
          {
            id: AUTO_ROUTER_MODEL,
            name: 'Auto',
            detail: 'Reset mais próximo',
            disabled: !state.data?.auto.available,
          },
        ]
      : []),
    ...models.map((model) => ({
      id: model.id,
      name: dockModelLabel(model.name),
      detail: model.providerName,
      disabled: false,
    })),
  ];
  const currentIndex = choices.findIndex((choice) => choice.id === currentModel);
  const index = Math.max(
    0,
    Math.min(
      selection.value === value ? selection.index : Math.max(0, currentIndex),
      choices.length - 1,
    ),
  );
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled]);
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  const choose = (next = index) => {
    const choice = choices[next];
    if (!choice || choice.disabled || !canChange) return;
    onChoose(choice.id);
  };
  const close = () => {
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing || event.shiftKey) return false;
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (choices.length)
        setSelection({
          value,
          index: (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length,
        });
    } else if (!event.repeat) choose();
    return true;
  };
  return {
    open,
    choices,
    index,
    currentModel,
    canChange,
    state,
    listId,
    choose,
    close,
    onKeyDown,
    refresh: () => refresh(true),
    inputProps: open
      ? {
          'aria-autocomplete': 'list' as const,
          'aria-haspopup': 'listbox' as const,
          'aria-controls': listId,
          'aria-activedescendant': choices.length ? `${listId}-${index}` : undefined,
        }
      : {},
  };
}

export function DockInlineModels({
  menu,
  onConnect,
}: {
  menu: ReturnType<typeof useDockInlineModels>;
  onConnect: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(180);
  useLayoutEffect(() => {
    if (!menu.open || !panel.current) return;
    const node = panel.current,
      form = node.closest('form'),
      dock = node.closest('.top-dock'),
      header = dock?.querySelector('.dock-header');
    if (!form || !dock || !header) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setHeight(
        Math.max(
          60,
          Math.min(
            340,
            Math.floor(
              form.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 12,
            ),
          ),
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(form);
    observer.observe(dock);
    observer.observe(header);
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
    };
  }, [menu.open]);
  useEffect(() => {
    panel.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [menu.open, menu.index, menu.choices.length]);
  if (!menu.open) return null;
  return (
    <div
      className="dock-inline-model-popover"
      ref={panel}
      style={{ maxHeight: height }}
      aria-label="Escolher modelo na conversa"
    >
      <div className="dock-inline-model-heading">
        <strong>Modelos</strong>
        <span>{menu.state.loading ? 'Atualizando…' : `${menu.choices.length} disponíveis`}</span>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void menu.refresh()}
          aria-label="Atualizar modelos"
          disabled={menu.state.loading}
        >
          ↻
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={menu.close}
          aria-label="Fechar modelos"
        >
          ×
        </button>
      </div>
      {!menu.canChange && (
        <p className="dock-inline-model-note">Conclua ou pare a tarefa para trocar.</p>
      )}
      <div
        className="dock-inline-model-list"
        role="listbox"
        id={menu.listId}
        aria-label="Modelos disponíveis"
      >
        {menu.choices.map((choice, index) => (
          <button
            type="button"
            role="option"
            id={`${menu.listId}-${index}`}
            key={choice.id}
            data-model={choice.id}
            data-highlighted={menu.index === index}
            aria-selected={menu.currentModel === choice.id}
            disabled={choice.disabled || !menu.canChange}
            tabIndex={-1}
            title={
              choice.id === AUTO_ROUTER_MODEL
                ? 'Escolhe modelo e conta pelo reset mais próximo'
                : choice.id.replace(/^9router\//, '')
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => menu.choose(index)}
          >
            <strong>{choice.name}</strong>
            <small>{choice.detail}</small>
            <span aria-hidden="true">{menu.currentModel === choice.id ? '✓' : ''}</span>
          </button>
        ))}
        {!menu.choices.length && (
          <div className="dock-inline-model-empty" role="status">
            {menu.state.loading
              ? 'Consultando modelos das suas contas…'
              : menu.state.error ||
                (menu.state.data?.models.length
                  ? 'Nenhum modelo com esse nome.'
                  : 'Nenhum modelo confirmado disponível.')}{' '}
            {!menu.state.loading && !menu.state.data?.models.length && (
              <button type="button" onClick={onConnect}>
                Ver conexões
              </button>
            )}
          </div>
        )}
      </div>
      <small className="dock-inline-model-help">↑ ↓ escolher · Enter usar · Esc fechar</small>
    </div>
  );
}
