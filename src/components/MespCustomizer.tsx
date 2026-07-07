// src/components/MespCustomizer.tsx
//
// Popup de customizacao COMPLETO do MESP (estilo hero da landing). Editar todas
// as caracteristicas visuais, presets nomeados, import/export, undo/redo,
// comparar antes/depois, preview multi-estado com parallax e aura, e salvar
// como "MESP principal".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MespTraits, Accessory, SpotPattern, EyeStyle, TuftStyle, MouthStyle,
  BodyShape, BrowStyle, NeckStyle, BackStyle, HeldItem, MaterialStyle,
  FaceMark, OutlineMode, GradientDir, AuraStyle, AnimStyle,
} from '../procedural/traits';
import type { PetState } from '../types';
import {
  FAMILIES, SPOT_COLORS, HEAD_ACCESSORIES, FACE_ACCESSORIES, SPOT_PATTERNS,
  EYE_STYLES, TUFT_STYLES, MOUTH_STYLES, BODY_SHAPES, BROW_STYLES, NECK_STYLES,
  BACK_STYLES, HELD_ITEMS, MATERIALS, FACE_MARKS, OUTLINE_MODES, GRADIENT_DIRS,
  AURAS, ANIM_STYLES,
  ACCESSORY_LABELS, SPOT_LABELS, EYE_LABELS, TUFT_LABELS, MOUTH_LABELS,
  BODY_SHAPE_LABELS, BROW_LABELS, NECK_LABELS, BACK_LABELS, HELD_LABELS,
  MATERIAL_LABELS, MARK_LABELS, OUTLINE_LABELS, GRADIENT_DIR_LABELS, AURA_LABELS,
  ANIM_LABELS, FAMILY_LABELS, THEME_PRESETS, DEFAULT_BLUSH_COLOR,
  buildPaletteFromFamily, applyPaletteOverride, generateTraits, makeTraits,
  clampScale, resolveAccessories, encodeTraits, decodeTraits,
  DEFAULT_TRAITS, deserializeTraits,
} from '../procedural/traits';
import type { MespPalette } from '../procedural/palette';
import { usePetAnimation } from '../hooks/usePetAnimation';
import { getSpritesForTraits } from '../assets/sprites';
import { loadLibrary, saveLibrary } from '../services/presetsStore';
import type { MespPreset } from '../services/presetsStore';
import { addPreset, removePreset } from '../services/presetsCore';

export interface MespCustomizerProps {
  open: boolean;
  initialTraits: MespTraits;
  onClose: () => void;
  onSave: (traits: MespTraits) => void;
}

const ACCESSORY_EMOJI: Record<Accessory, string> = {
  none: '∅', ears: '🐰', horns: '😈', antenna: '📡', bow: '🎀', flower: '🌸',
  star: '⭐', halo: '😇', glasses: '👓', sunglasses: '🕶️', cap: '🧢',
  tophat: '🎩', crown: '👑', headphones: '🎧', monocle: '🧐', eyepatch: '🏴',
  glasses_square: '🤓', glasses_heart: '😍', beanie: '🧶', witchhat: '🧙',
  beret: '🎨', chefhat: '👨‍🍳',
};
const SPOT_EMOJI: Record<SpotPattern, string> = {
  none: '∅', belly: '🥚', patches: '🐄', stripe: '🦓', heart: '❤️',
  polka: '🔴', checker: '🏁', waves: '🌊', stars: '✨', camo: '🥷', circuit: '🔌',
};
const EYE_EMOJI: Record<EyeStyle, string> = { round: '⚪', cat: '🐱', heart: '😍', star: '🤩', happy: '😊', sleepy: '😴' };
const TUFT_EMOJI: Record<TuftStyle, string> = { drop: '💧', flat: '➖', spiky: '⚡', fringe: '💇', swirl: '🌀', bald: '🥚' };
const MOUTH_EMOJI: Record<MouthStyle, string> = { none: '∅', smile: '🙂', open: '😮', cat: '😺', tongue: '😝', serious: '😐' };
const SHAPE_EMOJI: Record<BodyShape, string> = { squircle: '⬛', round: '⚪', tall: '🥚', flat: '🥞', star: '⭐' };
const BROW_EMOJI: Record<BrowStyle, string> = { none: '∅', flat: '➖', arched: '︶', angry: '😠' };
const NECK_EMOJI: Record<NeckStyle, string> = { none: '∅', scarf: '🧣', tie: '👔', bowtie: '🎀' };
const BACK_EMOJI: Record<BackStyle, string> = { none: '∅', backpack: '🎒', cape: '🦸', wings: '🪽' };
const HELD_EMOJI: Record<HeldItem, string> = { none: '∅', coffee: '☕', laptop: '💻', balloon: '🎈', lollipop: '🍭' };
const MATERIAL_EMOJI: Record<MaterialStyle, string> = { matte: '🎨', metallic: '✨', ghost: '👻', jelly: '🍮' };
const MARK_EMOJI: Record<FaceMark, string> = { none: '∅', freckles: '🟤', dots: '⚫', scar: '🩹', heartcheek: '💗' };
const OUTLINE_EMOJI: Record<OutlineMode, string> = { dark: '⬛', family: '🎨', none: '🚫', white: '⬜' };
const GDIR_EMOJI: Record<GradientDir, string> = { vertical: '↕', horizontal: '↔', diagonal: '⤢', radial: '⊙' };
const AURA_EMOJI: Record<AuraStyle, string> = { none: '∅', sparkles: '✨', hearts: '💖', flames: '🔥', snow: '❄️', leaves: '🍃' };
const ANIM_EMOJI: Record<AnimStyle, string> = { breathe: '🫧', bouncy: '⬆', float: '🎈', jitter: '〰' };
const AURA_PARTICLES: Record<string, string[]> = {
  sparkles: ['✨', '⭐', '✨', '💫'], hearts: ['💖', '💕', '❤️', '💗'],
  flames: ['🔥', '🔥', '✨', '🔥'], snow: ['❄️', '✦', '❄️', '❄️'], leaves: ['🍃', '🍂', '🌿', '🍃'],
};

const COLOR_FIELDS: Array<{ key: keyof MespPalette; label: string }> = [
  { key: 'bodyHi', label: 'Corpo (luz)' },
  { key: 'bodyMid', label: 'Corpo' },
  { key: 'bodyLo', label: 'Corpo (sombra)' },
  { key: 'belly', label: 'Barriga' },
  { key: 'feetHi', label: 'Pés (luz)' },
  { key: 'feetLo', label: 'Pés (sombra)' },
  { key: 'eyeWhite', label: 'Olho' },
  { key: 'pupil', label: 'Pupila' },
  { key: 'outline', label: 'Contorno' },
];

const PREVIEW_STATES: Array<{ state: PetState; label: string }> = [
  { state: 'idle', label: 'Parado' },
  { state: 'walking', label: 'Andando' },
  { state: 'thinking', label: 'Pensando' },
  { state: 'success', label: 'Feliz' },
  { state: 'sleeping', label: 'Dormindo' },
];

type LockKey = 'family' | 'colors' | 'accessories' | 'spots' | 'eyeStyle' | 'tuft' | 'mouth' | 'extras';
const LOCK_LABELS: Record<LockKey, string> = {
  family: 'Família', colors: 'Cores', accessories: 'Acessórios', spots: 'Padrão',
  eyeStyle: 'Olho', tuft: 'Tufo', mouth: 'Boca', extras: 'Extras',
};

function MespPreview({
  traits, state = 'idle', size = 200, tilt = { x: 0, y: 0 }, aura,
}: {
  traits: MespTraits; state?: PetState; size?: number; tilt?: { x: number; y: number }; aura?: boolean;
}) {
  const { frame } = usePetAnimation(state, traits);
  const spriteSet = getSpritesForTraits(traits);
  const eyeConfig = spriteSet.eye[frame] ?? null;
  const scale = size / 96;
  const auraStyle = traits.aura && traits.aura !== 'none' ? traits.aura : null;
  return (
    <div
      className="mesp-cz-sprite"
      style={{ width: size, height: size, transform: `perspective(600px) rotateY(${tilt.x * 10}deg) rotateX(${-tilt.y * 10}deg)` }}
    >
      {aura && auraStyle && AURA_PARTICLES[auraStyle] && (
        <div className={`mesp-cz-aura aura-${auraStyle}`} aria-hidden>
          {AURA_PARTICLES[auraStyle]!.map((c, i) => <span key={i} className={`ap ap${i}`}>{c}</span>)}
        </div>
      )}
      <img src={frame} alt="Prévia do seu MESP" className="pixelated" draggable={false} style={{ width: size, height: size }} />
      {eyeConfig?.slots.map((slot, i) => {
        const s = eyeConfig.size * scale;
        return (
          <div key={i} className="mesp-cz-pupil" aria-hidden
            style={{
              width: s, height: s,
              left: slot.cx * scale - s / 2 + tilt.x * 6,
              top: slot.cy * scale - s / 2 + tilt.y * 6,
              background: traits.palette.pupil,
            }} />
        );
      })}
    </div>
  );
}

export function MespCustomizer({ open, initialTraits, onClose, onSave }: MespCustomizerProps) {
  const [traits, setTraitsRaw] = useState<MespTraits>(initialTraits);
  const [past, setPast] = useState<MespTraits[]>([]);
  const [future, setFuture] = useState<MespTraits[]>([]);
  const [tab, setTab] = useState<'look' | 'items' | 'style' | 'colors' | 'presets'>('look');
  const [previewState, setPreviewState] = useState<PetState>('idle');
  const [compare, setCompare] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [locks, setLocks] = useState<Record<LockKey, boolean>>({
    family: false, colors: false, accessories: false, spots: false,
    eyeStyle: false, tuft: false, mouth: false, extras: false,
  });
  const [library, setLibrary] = useState<{ presets: MespPreset[]; primaryId: string | null }>({ presets: [], primaryId: null });
  const [presetName, setPresetName] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const cardRef = useRef<HTMLDivElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTraitsRaw(initialTraits);
      setPast([]); setFuture([]); setSaved(false); setConfetti(false);
      setTab('look'); setPreviewState('idle'); setLibrary(loadLibrary());
      setImportText(''); setImportError('');
    }
  }, [open, initialTraits]);

  useEffect(() => {
    if (open) { const t = setTimeout(() => cardRef.current?.focus(), 30); return () => clearTimeout(t); }
  }, [open]);
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  const commit = useCallback((next: MespTraits | ((t: MespTraits) => MespTraits)) => {
    setTraitsRaw((cur) => {
      const value = typeof next === 'function' ? (next as (t: MespTraits) => MespTraits)(cur) : next;
      setPast((p) => [...p.slice(-49), cur]);
      setFuture([]);
      return value;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1]!;
      setTraitsRaw((cur) => { setFuture((f) => [cur, ...f]); return prev; });
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const nextT = f[0]!;
      setTraitsRaw((cur) => { setPast((p) => [...p, cur]); return nextT; });
      return f.slice(1);
    });
  }, []);

  const patch = useCallback((p: Partial<MespTraits>) => commit((t) => ({ ...t, ...p })), [commit]);
  const setColor = useCallback((key: keyof MespPalette, value: string) => {
    commit((t) => ({ ...t, palette: applyPaletteOverride(t.palette, { [key]: value }) }));
  }, [commit]);

  const chooseFamily = useCallback((familyName: string) => {
    commit((t) => ({ ...t, family: familyName, palette: applyPaletteOverride(buildPaletteFromFamily(familyName), { pupil: t.palette.pupil }) }));
  }, [commit]);

  const headAcc = useMemo<Accessory>(() => {
    const list = resolveAccessories(traits);
    return (list.find((a) => (HEAD_ACCESSORIES as readonly string[]).includes(a)) as Accessory) ?? 'none';
  }, [traits]);
  const faceAcc = useMemo<Accessory>(() => {
    const list = resolveAccessories(traits);
    return (list.find((a) => (FACE_ACCESSORIES as readonly string[]).includes(a)) as Accessory) ?? 'none';
  }, [traits]);

  const setSlot = useCallback((slot: 'head' | 'face', acc: Accessory) => {
    commit((t) => {
      const cur = resolveAccessories(t);
      const head = slot === 'head' ? acc : ((cur.find((a) => (HEAD_ACCESSORIES as readonly string[]).includes(a)) as Accessory) ?? 'none');
      const face = slot === 'face' ? acc : ((cur.find((a) => (FACE_ACCESSORIES as readonly string[]).includes(a)) as Accessory) ?? 'none');
      const accessories = [head, face].filter((a) => a !== 'none');
      return { ...t, accessories, accessory: accessories[0] ?? 'none' };
    });
  }, [commit]);

  const randomize = useCallback(() => {
    commit((t) => {
      const r = generateTraits();
      const next: MespTraits = { ...r, name: t.name };
      if (locks.family) { next.family = t.family; next.palette = buildPaletteFromFamily(t.family); }
      if (locks.colors) next.palette = t.palette;
      if (locks.accessories) { next.accessories = t.accessories; next.accessory = t.accessory; }
      if (locks.spots) { next.spots = t.spots; next.spotColor = t.spotColor; }
      if (locks.eyeStyle) { next.eyeStyle = t.eyeStyle; next.eyeCount = t.eyeCount; }
      if (locks.tuft) next.tuft = t.tuft;
      if (locks.mouth) next.mouth = t.mouth;
      if (locks.extras) {
        next.blush = t.blush; next.blushColor = t.blushColor; next.gradient = t.gradient;
        next.material = t.material; next.aura = t.aura; next.animStyle = t.animStyle;
      }
      next.scale = t.scale;
      return next;
    });
  }, [commit, locks]);

  const resetFamilyColors = useCallback(() => commit((t) => ({ ...t, palette: buildPaletteFromFamily(t.family) })), [commit]);
  const restoreDefault = useCallback(() => commit({ ...DEFAULT_TRAITS, name: '' }), [commit]);

  const applyTheme = useCallback((themePatch: Partial<MespTraits>) => {
    commit((t) => makeTraits({
      family: themePatch.family ?? t.family,
      accessories: themePatch.accessories ?? t.accessories,
      spots: themePatch.spots ?? t.spots,
      spotColor: themePatch.spotColor ?? t.spotColor,
      eyeStyle: themePatch.eyeStyle ?? t.eyeStyle,
      tuft: themePatch.tuft ?? t.tuft,
      mouth: themePatch.mouth ?? t.mouth,
      blush: themePatch.blush ?? t.blush,
      gradient: themePatch.gradient ?? t.gradient,
      scale: t.scale, name: t.name,
      bodyShape: t.bodyShape, eyeCount: t.eyeCount, brows: t.brows,
      neck: t.neck, back: t.back, held: t.held, material: t.material,
      marks: t.marks, outlineMode: t.outlineMode, aura: t.aura, animStyle: t.animStyle,
    }));
  }, [commit]);

  const persistLibrary = useCallback((presets: MespPreset[], primaryId: string | null) => {
    saveLibrary(presets, primaryId); setLibrary({ presets, primaryId });
  }, []);
  const savePreset = useCallback(() => {
    const list = addPreset(library.presets, presetName || `MESP ${library.presets.length + 1}`, traits);
    persistLibrary(list, library.primaryId); setPresetName('');
  }, [library, presetName, traits, persistLibrary]);
  const loadPreset = useCallback((p: MespPreset) => { commit(p.traits); setTab('look'); }, [commit]);
  const deletePreset = useCallback((id: string) => {
    persistLibrary(removePreset(library.presets, id), library.primaryId === id ? null : library.primaryId);
  }, [library, persistLibrary]);

  const triggerSaved = useCallback(() => {
    setSaved(true); setConfetti(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setConfetti(false), 1200);
  }, []);
  const setPresetPrimary = useCallback((p: MespPreset) => {
    onSave(p.traits); persistLibrary(library.presets, p.id); triggerSaved();
  }, [library, onSave, persistLibrary, triggerSaved]);

  const exportCode = useMemo(() => encodeTraits(traits), [traits]);
  const copyExport = useCallback(() => { try { void navigator.clipboard?.writeText(exportCode); } catch { /* noop */ } }, [exportCode]);
  const doImport = useCallback(() => {
    const raw = decodeTraits(importText.trim());
    const t = raw ? deserializeTraits(raw) : null;
    if (!t) { setImportError('Código inválido'); return; }
    setImportError(''); commit(t); setImportText(''); setTab('look');
  }, [importText, commit]);

  const handleSave = useCallback(() => {
    onSave(traits); triggerSaved();
    setTimeout(() => { setSaved(false); onClose(); }, 1000);
  }, [traits, onSave, onClose, triggerSaved]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.key === 'Tab') {
      const card = cardRef.current; if (!card) return;
      const f = card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (f.length === 0) return;
      const first = f[0]!; const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose, undo, redo]);

  const onStageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({
      x: Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)),
      y: Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5)),
    });
  }, []);
  const onStageLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  const showSpotColor = traits.spots !== 'none';
  const familyVars = useMemo(() => ({
    '--cz-c1': traits.palette.bodyMid, '--cz-c2': traits.palette.bodyHi, '--cz-c3': traits.palette.bodyLo,
  }) as React.CSSProperties, [traits.palette]);

  if (!open) return null;

  return (
    <div className="mesp-cz-overlay interactive" role="dialog" aria-modal="true" aria-label="Customizar MESP"
      onKeyDown={onKeyDown} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mesp-cz-backdrop" aria-hidden style={familyVars}>
        <div className="mesp-cz-grid" />
        <div className="mesp-cz-blob mesp-cz-blob-a" />
        <div className="mesp-cz-blob mesp-cz-blob-b" />
        <div className="mesp-cz-blob mesp-cz-blob-c" />
      </div>

      <div className="mesp-cz-card" ref={cardRef} tabIndex={-1} style={familyVars}>
        <button className="mesp-cz-close" onClick={onClose} aria-label="Fechar customizador">✕</button>

        <div className="mesp-cz-layout">
          <div className="mesp-cz-stage" onMouseMove={onStageMouseMove} onMouseLeave={onStageLeave}>
            <div className="mesp-cz-stage-glow" aria-hidden />
            {compare ? (
              <div className="mesp-cz-compare">
                <div className="mesp-cz-compare-col"><MespPreview traits={initialTraits} state={previewState} size={130} /><span>Antes</span></div>
                <div className="mesp-cz-compare-col"><MespPreview traits={traits} state={previewState} size={130} tilt={tilt} aura /><span>Depois</span></div>
              </div>
            ) : (
              <div className="mesp-cz-float"><MespPreview traits={traits} state={previewState} size={200} tilt={tilt} aura /></div>
            )}
            <div className="mesp-cz-stage-shadow" aria-hidden />
            <h2 className="mesp-cz-title">{traits.name?.trim() ? traits.name : <>Seu <span className="mesp-cz-grad">MESP</span></>}</h2>
            <div className="mesp-cz-states">
              {PREVIEW_STATES.map((s) => (
                <button key={s.state} className={`mesp-cz-state-btn${previewState === s.state ? ' active' : ''}`} onClick={() => setPreviewState(s.state)}>{s.label}</button>
              ))}
            </div>
            <div className="mesp-cz-quick">
              <button className="mesp-cz-chip" onClick={randomize} title="Aleatório (respeita travas)">🎲 Aleatório</button>
              <button className="mesp-cz-chip" onClick={undo} disabled={past.length === 0} title="Desfazer (Ctrl+Z)">↶</button>
              <button className="mesp-cz-chip" onClick={redo} disabled={future.length === 0} title="Refazer (Ctrl+Y)">↷</button>
              <button className={`mesp-cz-chip${compare ? ' active' : ''}`} onClick={() => setCompare((c) => !c)}>⇄ Comparar</button>
            </div>
            <div className="mesp-cz-themes">
              {THEME_PRESETS.map((th) => (
                <button key={th.id} className="mesp-cz-theme" onClick={() => applyTheme(th.patch)} title={th.label}><span>{th.emoji}</span> {th.label}</button>
              ))}
            </div>
          </div>

          <div className="mesp-cz-controls">
            <label className="mesp-cz-name">
              <span>Nome</span>
              <input type="text" value={traits.name ?? ''} maxLength={24} placeholder="Dê um nome ao seu MESP" onChange={(e) => patch({ name: e.target.value })} />
            </label>

            <div className="mesp-cz-tabs">
              {([['look', 'Aparência'], ['items', 'Itens'], ['style', 'Estilo'], ['colors', 'Cores'], ['presets', 'Presets']] as const).map(([id, lbl]) => (
                <button key={id} className={`mesp-cz-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
              ))}
            </div>

            {tab === 'look' && (
              <>
                <Section title="Família de cor">
                  <div className="mesp-cz-swatches">
                    {FAMILIES.map((f) => (
                      <button key={f.name} className={`mesp-cz-swatch${traits.family === f.name ? ' active' : ''}`} onClick={() => chooseFamily(f.name)}
                        title={FAMILY_LABELS[f.name] ?? f.name} aria-pressed={traits.family === f.name}
                        style={{ background: `linear-gradient(135deg, ${f.hi} 0%, ${f.mid} 55%, ${f.lo} 100%)` }}>
                        <span className="mesp-cz-swatch-name">{FAMILY_LABELS[f.name] ?? f.name}</span>
                      </button>
                    ))}
                  </div>
                </Section>
                <Section title="Formato do corpo">
                  <OptGrid values={BODY_SHAPES} active={traits.bodyShape ?? 'squircle'} emoji={SHAPE_EMOJI} labels={BODY_SHAPE_LABELS} onPick={(v) => patch({ bodyShape: v })} />
                </Section>
                <Section title="Quantidade de olhos">
                  <div className="mesp-cz-seg">
                    {[1, 2, 3].map((n) => (
                      <button key={n} className={`mesp-cz-seg-btn${(traits.eyeCount ?? 1) === n ? ' active' : ''}`} onClick={() => patch({ eyeCount: n })}>{n}</button>
                    ))}
                  </div>
                </Section>
                {(traits.eyeCount ?? 1) === 1 && (
                  <Section title="Estilo do olho">
                    <OptGrid values={EYE_STYLES} active={traits.eyeStyle ?? 'round'} emoji={EYE_EMOJI} labels={EYE_LABELS} onPick={(v) => patch({ eyeStyle: v })} />
                  </Section>
                )}
                <Section title="Sobrancelhas">
                  <OptGrid values={BROW_STYLES} active={traits.brows ?? 'none'} emoji={BROW_EMOJI} labels={BROW_LABELS} onPick={(v) => patch({ brows: v })} />
                </Section>
                <Section title="Tufo">
                  <OptGrid values={TUFT_STYLES} active={traits.tuft ?? 'drop'} emoji={TUFT_EMOJI} labels={TUFT_LABELS} onPick={(v) => patch({ tuft: v })} />
                </Section>
                <Section title="Boca">
                  <OptGrid values={MOUTH_STYLES} active={traits.mouth ?? 'none'} emoji={MOUTH_EMOJI} labels={MOUTH_LABELS} onPick={(v) => patch({ mouth: v })} />
                </Section>
                <Section title="Marcas faciais">
                  <OptGrid values={FACE_MARKS} active={traits.marks ?? 'none'} emoji={MARK_EMOJI} labels={MARK_LABELS} onPick={(v) => patch({ marks: v })} />
                </Section>
              </>
            )}

            {tab === 'items' && (
              <>
                <Section title="Acessório de cabeça">
                  <OptGrid values={HEAD_ACCESSORIES as readonly Accessory[]} active={headAcc} emoji={ACCESSORY_EMOJI} labels={ACCESSORY_LABELS} onPick={(a) => setSlot('head', a)} />
                </Section>
                <Section title="Acessório de rosto">
                  <OptGrid values={FACE_ACCESSORIES as readonly Accessory[]} active={faceAcc} emoji={ACCESSORY_EMOJI} labels={ACCESSORY_LABELS} onPick={(a) => setSlot('face', a)} />
                </Section>
                <Section title="Pescoço">
                  <OptGrid values={NECK_STYLES} active={traits.neck ?? 'none'} emoji={NECK_EMOJI} labels={NECK_LABELS} onPick={(v) => patch({ neck: v })} />
                </Section>
                <Section title="Costas">
                  <OptGrid values={BACK_STYLES} active={traits.back ?? 'none'} emoji={BACK_EMOJI} labels={BACK_LABELS} onPick={(v) => patch({ back: v })} />
                </Section>
                <Section title="Segurando">
                  <OptGrid values={HELD_ITEMS} active={traits.held ?? 'none'} emoji={HELD_EMOJI} labels={HELD_LABELS} onPick={(v) => patch({ held: v })} />
                </Section>
              </>
            )}

            {tab === 'style' && (
              <>
                <Section title="Padrão">
                  <OptGrid values={SPOT_PATTERNS} active={traits.spots} emoji={SPOT_EMOJI} labels={SPOT_LABELS} onPick={(v) => patch({ spots: v })} />
                </Section>
                <Section title={`Cor da mancha${showSpotColor ? '' : ' (escolha um padrão)'}`}>
                  <div className={`mesp-cz-swatches mesp-cz-swatches-sm${showSpotColor ? '' : ' mesp-cz-disabled'}`}>
                    {SPOT_COLORS.map((c) => (
                      <button key={c} className={`mesp-cz-swatch mesp-cz-swatch-solid${traits.spotColor === c ? ' active' : ''}`} onClick={() => patch({ spotColor: c })} disabled={!showSpotColor} style={{ background: c }} aria-label={`Cor ${c}`} />
                    ))}
                    <label className="mesp-cz-color-custom"><input type="color" value={traits.spotColor} disabled={!showSpotColor} onChange={(e) => patch({ spotColor: e.target.value })} aria-label="Cor personalizada" /><span>+</span></label>
                  </div>
                </Section>
                <Section title="Material">
                  <OptGrid values={MATERIALS} active={traits.material ?? 'matte'} emoji={MATERIAL_EMOJI} labels={MATERIAL_LABELS} onPick={(v) => patch({ material: v })} />
                </Section>
                <Section title="Contorno">
                  <OptGrid values={OUTLINE_MODES} active={traits.outlineMode ?? 'dark'} emoji={OUTLINE_EMOJI} labels={OUTLINE_LABELS} onPick={(v) => patch({ outlineMode: v })} />
                </Section>
                <Section title="Aura">
                  <OptGrid values={AURAS} active={traits.aura ?? 'none'} emoji={AURA_EMOJI} labels={AURA_LABELS} onPick={(v) => patch({ aura: v })} />
                </Section>
                <Section title="Animação">
                  <OptGrid values={ANIM_STYLES} active={traits.animStyle ?? 'breathe'} emoji={ANIM_EMOJI} labels={ANIM_LABELS} onPick={(v) => patch({ animStyle: v })} />
                </Section>
                <Section title="Extras">
                  <div className="mesp-cz-toggles">
                    <label className="mesp-cz-toggle"><input type="checkbox" checked={!!traits.blush} onChange={(e) => patch({ blush: e.target.checked })} /><span>Bochechas</span></label>
                    {traits.blush && <input type="color" className="mesp-cz-mini-color" value={traits.blushColor ?? DEFAULT_BLUSH_COLOR} onChange={(e) => patch({ blushColor: e.target.value })} aria-label="Cor do blush" />}
                    <label className="mesp-cz-toggle"><input type="checkbox" checked={!!traits.gradient} onChange={(e) => patch({ gradient: e.target.checked })} /><span>Gradiente</span></label>
                  </div>
                  {traits.gradient && (
                    <div className="mesp-cz-subrow">
                      <OptGrid values={GRADIENT_DIRS} active={traits.gradientDir ?? 'vertical'} emoji={GDIR_EMOJI} labels={GRADIENT_DIR_LABELS} onPick={(v) => patch({ gradientDir: v })} />
                    </div>
                  )}
                </Section>
                <Section title={`Tamanho — ${Math.round((traits.scale ?? 1) * 100)}%`}>
                  <input type="range" min={0.6} max={1.6} step={0.05} value={traits.scale ?? 1} onChange={(e) => patch({ scale: clampScale(Number(e.target.value)) })} className="mesp-cz-range" />
                </Section>
              </>
            )}

            {tab === 'colors' && (
              <>
                <Section title="Cores finas">
                  <div className="mesp-cz-colors">
                    {COLOR_FIELDS.map((field) => (
                      <label key={field.key} className="mesp-cz-color-row">
                        <input type="color" value={traits.palette[field.key]} onChange={(e) => setColor(field.key, e.target.value)} aria-label={field.label} />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                  <button className="mesp-cz-chip" onClick={resetFamilyColors}>↺ Cores da família</button>
                </Section>
                <Section title="Aleatório — travar o que manter">
                  <div className="mesp-cz-locks">
                    {(Object.keys(LOCK_LABELS) as LockKey[]).map((k) => (
                      <button key={k} className={`mesp-cz-lock${locks[k] ? ' active' : ''}`} onClick={() => setLocks((l) => ({ ...l, [k]: !l[k] }))} aria-pressed={locks[k]}>{locks[k] ? '🔒' : '🔓'} {LOCK_LABELS[k]}</button>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {tab === 'presets' && (
              <>
                <Section title="Salvar preset atual">
                  <div className="mesp-cz-preset-save">
                    <input type="text" value={presetName} placeholder="Nome do preset" maxLength={40} onChange={(e) => setPresetName(e.target.value)} />
                    <button className="mesp-cz-chip" onClick={savePreset}>💾 Salvar</button>
                  </div>
                </Section>
                <Section title="Meus presets">
                  {library.presets.length === 0 ? <p className="mesp-cz-empty">Nenhum preset salvo ainda.</p> : (
                    <div className="mesp-cz-preset-list">
                      {library.presets.map((p) => (
                        <div key={p.id} className={`mesp-cz-preset-row${library.primaryId === p.id ? ' primary' : ''}`}>
                          <div className="mesp-cz-preset-thumb"><MespPreview traits={p.traits} size={44} /></div>
                          <span className="mesp-cz-preset-name">{p.name}{library.primaryId === p.id && ' ⭐'}</span>
                          <button className="mesp-cz-mini-btn" onClick={() => loadPreset(p)}>Editar</button>
                          <button className="mesp-cz-mini-btn" onClick={() => setPresetPrimary(p)} title="Definir como principal">⭐</button>
                          <button className="mesp-cz-mini-btn danger" onClick={() => deletePreset(p.id)} title="Excluir">🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Compartilhar (exportar)">
                  <div className="mesp-cz-share"><textarea readOnly value={exportCode} rows={2} /><button className="mesp-cz-chip" onClick={copyExport}>📋 Copiar código</button></div>
                </Section>
                <Section title="Importar código">
                  <div className="mesp-cz-share">
                    <textarea value={importText} rows={2} placeholder="Cole um código de MESP aqui" onChange={(e) => setImportText(e.target.value)} />
                    {importError && <span className="mesp-cz-err">{importError}</span>}
                    <button className="mesp-cz-chip" onClick={doImport} disabled={!importText.trim()}>📥 Importar</button>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>

        <div className="mesp-cz-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={restoreDefault}>Restaurar padrão</button>
          <button className="btn primary mesp-cz-save" onClick={handleSave}>⭐ Salvar como principal</button>
        </div>

        {confetti && (
          <div className="mesp-cz-confetti" aria-hidden>
            {['🎉', '✨', '⭐', '💖', '🎊', '🌟', '💫', '🎉', '✨', '💖'].map((c, i) => (
              <span key={i} style={{ left: `${8 + i * 9}%`, animationDelay: `${i * 40}ms` }}>{c}</span>
            ))}
          </div>
        )}
        {saved && <div className="mesp-cz-toast" role="status"><span className="mesp-cz-toast-check">✔</span> MESP principal salvo!</div>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mesp-cz-section">
      <h3 className="mesp-cz-heading">{title}</h3>
      {children}
    </section>
  );
}

function OptGrid<T extends string>({
  values, active, emoji, labels, onPick,
}: {
  values: readonly T[]; active: T; emoji: Record<T, string>; labels: Record<T, string>; onPick: (v: T) => void;
}) {
  return (
    <div className="mesp-cz-grid-opts">
      {values.map((v) => (
        <button key={v} className={`mesp-cz-opt${active === v ? ' active' : ''}`} onClick={() => onPick(v)} aria-pressed={active === v}>
          <span className="mesp-cz-opt-emoji">{emoji[v]}</span>
          <span className="mesp-cz-opt-label">{labels[v]}</span>
        </button>
      ))}
    </div>
  );
}
