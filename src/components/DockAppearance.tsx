import { useEffect, useRef, useState } from 'react';
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
  const [section, setSection] = useState<'colors' | 'items'>('colors');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  const accessories = resolveAccessories(traits);
  const selectAccessory = (choices: readonly Accessory[], value: Accessory) => {
    const next = [
      ...accessories.filter((item) => !choices.includes(item)),
      ...(value === 'none' ? [] : [value]),
    ];
    setTraits((current) => ({ ...current, accessories: next, accessory: next[0] || 'none' }));
  };
  return (
    <div
      ref={panel}
      className="dock-appearance dock-project-overlay"
      role="dialog"
      aria-label="Personalizar este MESP"
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select'),
        ];
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
      <div className="dock-appearance-preview">
        <DockMascot traits={traits} state="idle" emote="happy" reaction={0} />
        <div>
          <strong>{title}</strong>
          <p>Seu formato clássico e o olho único continuam aqui.</p>
        </div>
      </div>
      <div
        className="dock-appearance-tabs"
        role="tablist"
        aria-label="Personalização"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
          const next =
            event.key === 'Home' ? 0 : event.key === 'End' ? 1 : section === 'colors' ? 1 : 0;
          tabs[next]?.click();
          tabs[next]?.focus();
        }}
      >
        <button
          role="tab"
          aria-selected={section === 'colors'}
          tabIndex={section === 'colors' ? 0 : -1}
          onClick={() => setSection('colors')}
        >
          Cores
        </button>
        <button
          role="tab"
          aria-selected={section === 'items'}
          tabIndex={section === 'items' ? 0 : -1}
          onClick={() => setSection('items')}
        >
          Acessórios
        </button>
      </div>
      <div
        className="dock-appearance-options"
        role="tabpanel"
        aria-label={section === 'colors' ? 'Cores do MESP' : 'Acessórios do MESP'}
      >
        {section === 'colors' ? (
          <div className="dock-color-grid">
            {FAMILIES.map((family) => (
              <button
                key={family.name}
                aria-label={`Cor ${label(FAMILY_LABELS[family.name] || family.name)}`}
                aria-pressed={traits.family === family.name}
                onClick={() =>
                  setTraits((current) =>
                    classicDockTraits({
                      ...current,
                      family: family.name,
                      palette: buildPaletteFromFamily(family.name),
                    }),
                  )
                }
              >
                <span style={{ background: family.mid }}>
                  {traits.family === family.name ? '✓' : ''}
                </span>
                <small>{label(FAMILY_LABELS[family.name] || family.name)}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="dock-accessory-grid">
            <label>
              Cabeça
              <select
                aria-label="Cabeça"
                value={accessories.find((item) => HEAD_ACCESSORIES.includes(item)) || 'none'}
                onChange={(event) =>
                  selectAccessory(HEAD_ACCESSORIES, event.target.value as Accessory)
                }
              >
                {HEAD_ACCESSORIES.map((item) => (
                  <option key={item} value={item}>
                    {label(ACCESSORY_LABELS[item])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rosto
              <select
                aria-label="Rosto"
                value={accessories.find((item) => FACE_ACCESSORIES.includes(item)) || 'none'}
                onChange={(event) =>
                  selectAccessory(FACE_ACCESSORIES, event.target.value as Accessory)
                }
              >
                {FACE_ACCESSORIES.map((item) => (
                  <option key={item} value={item}>
                    {label(ACCESSORY_LABELS[item])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pescoço
              <select
                aria-label="Pescoço"
                value={traits.neck || 'none'}
                onChange={(event) =>
                  setTraits((current) => ({
                    ...current,
                    neck: event.target.value as MespTraits['neck'],
                  }))
                }
              >
                {NECK_STYLES.map((item) => (
                  <option key={item} value={item}>
                    {NECK_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Costas
              <select
                aria-label="Costas"
                value={traits.back || 'none'}
                onChange={(event) =>
                  setTraits((current) => ({
                    ...current,
                    back: event.target.value as MespTraits['back'],
                  }))
                }
              >
                {BACK_STYLES.map((item) => (
                  <option key={item} value={item}>
                    {BACK_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Na mão
              <select
                aria-label="Na mão"
                value={traits.held || 'none'}
                onChange={(event) =>
                  setTraits((current) => ({
                    ...current,
                    held: event.target.value as MespTraits['held'],
                  }))
                }
              >
                {HELD_ITEMS.map((item) => (
                  <option key={item} value={item}>
                    {label(HELD_LABELS[item])}
                  </option>
                ))}
              </select>
            </label>
            <p>Acessórios aparecem somente quando você escolhe e salva.</p>
          </div>
        )}
      </div>
      <div className="dock-appearance-actions">
        <button onClick={onClose}>Cancelar</button>
        <button onClick={() => setTraits(simplifyDockTraits(traits))}>Sem acessórios</button>
        <button className="dock-appearance-save" onClick={() => onSave(classicDockTraits(traits))}>
          Salvar neste MESP
        </button>
      </div>
    </div>
  );
}
