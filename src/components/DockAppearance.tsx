import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DockMascot } from './DockMascot';
import {
  FAMILIES,
  FAMILY_LABELS,
  HEAD_ACCESSORIES,
  FACE_ACCESSORIES,
  ACCESSORY_LABELS,
  NECK_STYLES,
  NECK_LABELS,
  BACK_STYLES,
  BACK_LABELS,
  HELD_ITEMS,
  HELD_LABELS,
  buildPaletteFromFamily,
  resolveAccessories,
  type Accessory,
  type MespTraits,
} from '../procedural/traits';
import { composeMesp, MESP_ANATOMY } from '../procedural/composer';
import { renderGridToDataUrl } from '../procedural/render';
import { classicDockTraits, simplifyDockTraits } from '../procedural/dockTraits.mjs';

const LABELS: Record<string, string> = {
  Ceu: 'Céu',
  Limao: 'Limão',
  Lilas: 'Lilás',
  Pessego: 'Pêssego',
  Agua: 'Água',
  Salvia: 'Sálvia',
  Onix: 'Ônix',
  'Arco-iris': 'Arco-íris',
  Galaxia: 'Galáxia',
  Aureola: 'Auréola',
  Bone: 'Boné',
  'Chapeu de bruxa': 'Chapéu de bruxa',
  'Chapeu de chef': 'Chapéu de chef',
  Oculos: 'Óculos',
  'Oculos escuro': 'Óculos escuros',
  Monoculo: 'Monóculo',
  'Oculos quadrado': 'Óculos quadrados',
  'Oculos coracao': 'Óculos de coração',
  Cafe: 'Café',
  Balao: 'Balão',
};
const label = (value: string) => LABELS[value] || value;
const familyLabel = (name: string) =>
  label(FAMILY_LABELS[name as keyof typeof FAMILY_LABELS] || name);

type CategoryId = 'color' | 'head' | 'face' | 'neck' | 'back' | 'held';
interface Category {
  id: CategoryId;
  label: string;
  /** Items in display order; the first one is always the "nothing" option for accessories. */
  items: { value: string; label: string }[];
  current: (traits: MespTraits) => string;
  apply: (traits: MespTraits, value: string) => MespTraits;
}

// Head and face pieces share the `accessories` list; swapping one keeps the other.
const swapAccessory = (traits: MespTraits, group: readonly Accessory[], value: string) => {
  const kept = resolveAccessories(traits).filter((item) => !group.includes(item));
  const next = value === 'none' ? kept : [...kept, value as Accessory];
  return { ...traits, accessories: next, accessory: next[0] || 'none' };
};
const accessoryCategory = (
  id: CategoryId,
  name: string,
  group: readonly Accessory[],
): Category => ({
  id,
  label: name,
  items: group.map((item) => ({ value: item, label: label(ACCESSORY_LABELS[item]) })),
  current: (traits) => resolveAccessories(traits).find((item) => group.includes(item)) || 'none',
  apply: (traits, value) => swapAccessory(traits, group, value),
});

const CATEGORIES: Category[] = [
  {
    id: 'color',
    label: 'Cor',
    items: FAMILIES.map((family) => ({ value: family.name, label: familyLabel(family.name) })),
    current: (traits) => traits.family,
    apply: (traits, value) =>
      classicDockTraits({ ...traits, family: value, palette: buildPaletteFromFamily(value) }),
  },
  accessoryCategory('head', 'Cabeça', HEAD_ACCESSORIES),
  accessoryCategory('face', 'Rosto', FACE_ACCESSORIES),
  {
    id: 'neck',
    label: 'Pescoço',
    items: NECK_STYLES.map((item) => ({ value: item, label: NECK_LABELS[item] })),
    current: (traits) => traits.neck || 'none',
    apply: (traits, value) => ({ ...traits, neck: value as MespTraits['neck'] }),
  },
  {
    id: 'back',
    label: 'Costas',
    items: BACK_STYLES.map((item) => ({ value: item, label: BACK_LABELS[item] })),
    current: (traits) => traits.back || 'none',
    apply: (traits, value) => ({ ...traits, back: value as MespTraits['back'] }),
  },
  {
    id: 'held',
    label: 'Na mão',
    items: HELD_ITEMS.map((item) => ({ value: item, label: label(HELD_LABELS[item]) })),
    current: (traits) => traits.held || 'none',
    apply: (traits, value) => ({ ...traits, held: value as MespTraits['held'] }),
  },
];

// Static thumbnails: the MESP drawn with one item swapped. The live mascot draws its
// pupil on a canvas, so the still frame gets one painted over the eye white.
const THUMBNAIL_SCALE = 4;
const thumbnailCache = new Map<string, string>();
function thumbnail(traits: MespTraits): string {
  const key = JSON.stringify(traits);
  const cached = thumbnailCache.get(key);
  if (cached) return cached;
  const grid = composeMesp({ traits, eye: 'open', feet: 'normal' });
  const { eyeCx, eyeCy } = MESP_ANATOMY;
  // A rounded 4x4 pupil with a glint, matching the live mascot's look.
  for (let y = eyeCy - 2; y <= eyeCy + 1; y += 1) {
    for (let x = eyeCx - 2; x <= eyeCx + 1; x += 1) {
      const corner = (x === eyeCx - 2 || x === eyeCx + 1) && (y === eyeCy - 2 || y === eyeCy + 1);
      if (!corner && grid[y]?.[x] === traits.palette.eyeWhite) grid[y]![x] = traits.palette.pupil;
    }
  }
  if (grid[eyeCy - 1]?.[eyeCx - 1] === traits.palette.pupil) {
    grid[eyeCy - 1]![eyeCx - 1] = traits.palette.eyeWhite;
  }
  const url = renderGridToDataUrl(grid, THUMBNAIL_SCALE);
  if (thumbnailCache.size >= 240) thumbnailCache.delete(thumbnailCache.keys().next().value!);
  thumbnailCache.set(key, url);
  return url;
}

// Everything the MESP is wearing, for the summary under its name.
function wornItems(traits: MespTraits): string[] {
  return CATEGORIES.slice(1)
    .map((category) => {
      const value = category.current(traits);
      return value === 'none'
        ? ''
        : category.items.find((item) => item.value === value)?.label || '';
    })
    .filter(Boolean);
}

export function DockAppearance({
  initialTraits,
  title,
  onClose,
  onSave,
}: {
  initialTraits: MespTraits;
  title: string;
  onClose: () => void;
  onSave: (traits: MespTraits) => void;
}) {
  const [traits, setTraits] = useState(() => classicDockTraits(initialTraits));
  const [categoryId, setCategoryId] = useState<CategoryId>('color');
  // Each pick makes the mascot react; the counter feeds the mascot's reaction prop.
  const [picks, setPicks] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: true });
  const panel = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  const category = CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0];
  const current = category.current(traits);
  const cards = useMemo(
    () =>
      category.items.map((item) => ({
        ...item,
        image: thumbnail(classicDockTraits(category.apply(traits, item.value))),
      })),
    [category, traits],
  );
  const worn = wornItems(traits);
  const family = FAMILIES.find((item) => item.name === traits.family) || FAMILIES[0];

  const pick = (value: string) => {
    if (value === current) return;
    setTraits((prev) => category.apply(prev, value));
    setPicks((count) => count + 1);
  };

  // Keep the chosen card in view and track whether the strip can scroll either way.
  const measure = () => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  };
  const reveal = (value: string, behavior: ScrollBehavior) => {
    const el = track.current;
    const card = el?.querySelector<HTMLElement>(`[data-value="${value}"]`);
    if (!el || !card) return;
    const left = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior });
  };
  useLayoutEffect(() => {
    reveal(current, 'auto');
    measure();
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // The strip is remounted per category, so measuring once per category is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const scrollBy = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  const step = (direction: -1 | 1) => {
    const index = category.items.findIndex((item) => item.value === current);
    const next =
      category.items[Math.min(category.items.length - 1, Math.max(0, index + direction))];
    if (!next || next.value === current) return;
    pick(next.value);
    requestAnimationFrame(() => {
      reveal(next.value, 'smooth');
      track.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
    });
  };

  return (
    <div
      ref={panel}
      className="dock-appearance dock-project-overlay"
      role="dialog"
      aria-label="Personalizar este MESP"
      aria-modal="true"
      style={
        {
          '--mesp-hi': family.hi,
          '--mesp-mid': family.mid,
          '--mesp-lo': family.lo,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'),
        ].filter((control) => control.tabIndex !== -1);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="dock-overlay-heading">
        <strong>Personalizar este MESP</strong>
        <button aria-label="Fechar personalização" onClick={onClose}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </div>

      <div className="dock-appearance-hero">
        <div className="dock-appearance-stage">
          <span className="dock-appearance-glow" aria-hidden="true" />
          <span className="dock-appearance-floor" aria-hidden="true" />
          <DockMascot traits={traits} state="idle" emote="happy" reaction={picks} />
        </div>
        <div className="dock-appearance-summary">
          <strong>{title}</strong>
          <span className="dock-appearance-family">
            <i style={{ background: family.mid }} aria-hidden="true" />
            {familyLabel(family.name)}
          </span>
          <ul className="dock-appearance-worn" aria-label="Itens escolhidos">
            {worn.length ? (
              worn.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li className="is-empty">Sem acessórios por enquanto</li>
            )}
          </ul>
          <p>Toque em um item para experimentar. Nada muda até você salvar.</p>
        </div>
      </div>

      <div
        className="dock-appearance-chips"
        role="tablist"
        aria-label="Partes do MESP"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = CATEGORIES.findIndex((item) => item.id === categoryId);
          const nextIndex =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? CATEGORIES.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) %
                  CATEGORIES.length;
          setCategoryId(CATEGORIES[nextIndex].id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus();
        }}
      >
        {CATEGORIES.map((item) => {
          const value = item.current(traits);
          const equipped = item.id !== 'color' && value !== 'none';
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={item.id === categoryId}
              tabIndex={item.id === categoryId ? 0 : -1}
              className={equipped ? 'is-equipped' : undefined}
              onClick={() => setCategoryId(item.id)}
            >
              {item.label}
              {equipped && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div
        className={`dock-appearance-carousel${edges.start ? ' at-start' : ''}${edges.end ? ' at-end' : ''}`}
      >
        <button
          type="button"
          className="dock-appearance-arrow"
          aria-label="Itens anteriores"
          tabIndex={-1}
          disabled={edges.start}
          onClick={() => scrollBy(-1)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div
          key={category.id}
          ref={track}
          className="dock-appearance-track"
          role="listbox"
          aria-label={category.label}
          onScroll={measure}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              event.stopPropagation();
              step(event.key === 'ArrowRight' ? 1 : -1);
            }
          }}
        >
          {cards.map((card, index) => {
            const selected = card.value === current;
            return (
              <button
                key={card.value}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={card.label}
                data-value={card.value}
                tabIndex={selected ? 0 : -1}
                className={`dock-appearance-card${card.value === 'none' ? ' is-none' : ''}`}
                style={{ '--i': index } as CSSProperties}
                onClick={() => pick(card.value)}
              >
                <span className="dock-appearance-card-art">
                  <img src={card.image} alt="" draggable={false} />
                </span>
                <small>{card.label}</small>
                {selected && (
                  <span className="dock-appearance-card-check" aria-hidden="true">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                    >
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="dock-appearance-arrow"
          aria-label="Próximos itens"
          tabIndex={-1}
          disabled={edges.end}
          onClick={() => scrollBy(1)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="dock-appearance-actions">
        <button onClick={onClose}>Cancelar</button>
        <button
          onClick={() => {
            setTraits(simplifyDockTraits(traits));
            setPicks((count) => count + 1);
          }}
          disabled={!worn.length}
        >
          Sem acessórios
        </button>
        <button className="dock-appearance-save" onClick={() => onSave(classicDockTraits(traits))}>
          Salvar neste MESP
        </button>
      </div>
    </div>
  );
}
