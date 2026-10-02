import { useId, useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react';

const COMMANDS = [
  {
    command: '/model',
    name: 'Modelos',
    detail: 'Escolher a IA ou Auto',
    search: 'modelo modelos model models ia auto',
  },
  {
    command: '/accounts',
    name: 'Conexões',
    detail: 'Conectar e gerenciar contas',
    search: 'contas conexoes provedores login',
  },
  {
    command: '/usage',
    name: 'Consumo',
    detail: 'Uso geral e por conta',
    search: 'consumo tokens custo uso',
  },
  {
    command: '/quota',
    name: 'Cotas e resets',
    detail: 'Ver limites e próxima renovação',
    search: 'cotas reset limites',
  },
  {
    command: '/project',
    name: 'Abrir projeto',
    detail: 'Escolher uma pasta',
    search: 'abrir projeto pasta',
  },
  {
    command: '/new',
    name: 'Novo MESP',
    detail: 'Criar outro personagem',
    search: 'novo criar adicionar mesp',
  },
  {
    command: '/projects',
    name: 'Meus MESP',
    detail: 'Ver projetos e resultados',
    search: 'projetos mesps tarefas resultados',
  },
  {
    command: '/appearance',
    name: 'Personalizar',
    detail: 'Aparência deste personagem',
    search: 'aparencia personalizar cor acessorios',
  },
  {
    command: '/help',
    name: 'Ajuda',
    detail: 'Exemplos do que você pode pedir',
    search: 'ajuda comandos',
  },
  {
    command: '/minimize',
    name: 'Recolher',
    detail: 'Liberar espaço na tela',
    search: 'recolher minimizar fechar',
  },
] as const;

export function useDockCommands(value: string, onChange: (value: string) => void, enabled = true) {
  const listId = useId();
  const [selected, setSelected] = useState({ value: '', index: 0 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const items = useMemo(() => {
    if (!enabled || !/^\/[^\s]*$/.test(value)) return [];
    const query = value
      .slice(1)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return COMMANDS.filter((item) =>
      `${item.command.slice(1)} ${item.search}`.split(/\s+/).some((word) => word.startsWith(query)),
    );
  }, [value, enabled]);
  const open = items.length > 0 && dismissed !== value;
  const index = Math.min(selected.value === value ? selected.index : 0, items.length - 1);
  const choose = (next: number) => {
    const item = items[next];
    if (!item) return;
    setDismissed(item.command);
    onChange(item.command);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing) return false;
    const completeCommand =
      value === items[index]?.command ||
      (items[index]?.command === '/model' && /^\/(?:models|modelos)$/i.test(value));
    if (event.key === 'Enter' && !event.shiftKey && completeCommand) {
      setDismissed(value);
      return false;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key) || event.shiftKey)
      return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') setDismissed(value);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      setSelected({
        value,
        index: (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length,
      });
    else choose(index);
    return true;
  };
  return {
    items,
    index,
    open,
    listId,
    choose,
    onKeyDown,
    onInput: (next: string) => {
      setDismissed(null);
      onChange(next);
    },
    inputProps: enabled
      ? {
          'aria-autocomplete': 'list' as const,
          'aria-haspopup': 'listbox' as const,
          'aria-controls': open ? listId : undefined,
          'aria-activedescendant': open ? `${listId}-${index}` : undefined,
        }
      : {},
  };
}

export function DockCommands({ menu }: { menu: ReturnType<typeof useDockCommands> }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [menu.index, menu.open]);
  if (!menu.open) return null;
  return (
    <div className="dock-command-popover">
      <div className="dock-command-heading">
        <span>Comandos</span>
        <small>↑ ↓ selecionar · Enter inserir</small>
      </div>
      <div
        className="dock-command-list"
        ref={list}
        id={menu.listId}
        role="listbox"
        aria-label="Comandos disponíveis"
      >
        {menu.items.map((item, index) => (
          <button
            key={item.command}
            type="button"
            role="option"
            id={`${menu.listId}-${index}`}
            aria-selected={menu.index === index}
            tabIndex={-1}
            className={menu.index === index ? 'selected' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => menu.choose(index)}
          >
            <span className="dock-command-name">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <code>{item.command}</code>
          </button>
        ))}
      </div>
    </div>
  );
}
