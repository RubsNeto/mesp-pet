import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KiroChatPanel } from './KiroChatPanel';
import { DockAppearance } from './DockAppearance';
import { DockMespRail } from './DockMespRail';
import { DockConversation, type DockMessage } from './DockConversation';
import { DockSettings } from './DockSettings';
import { Tracked } from '../coucou/anim';
import { IslandStateMachine, type FsmState } from '../coucou/fsm';
import type { BotEmoteName } from '../coucou/layout';
import { useDockHitTest } from '../hooks/useDockHitTest';
import { DEFAULT_TRAITS, deserializeTraits, type MespTraits } from '../procedural/traits';
import {
  classicDockTraits,
  generateDockTraits,
  simplifyDockTraits,
} from '../procedural/dockTraits.mjs';
import {
  MAX_DOCK_PROJECTS,
  normalizeDockProjects,
  projectName,
  agentCanChange,
  parseDockRequest,
  findDockProject,
  taskTitle,
  shouldPromoteProject,
  terminalReply,
  readDockDrafts,
  serializeDockDrafts,
  readDockConversations,
  serializeDockConversations,
} from '../services/dockCore.mjs';
import { getPresetById } from '../services/aiPresets';
import type { PetEntity, PetState } from '../types';

const STORAGE = 'mesp-top-projects-v1';
const DRAFT_STORAGE = 'mesp-top-drafts-v1';
const CONVERSATION_STORAGE = 'mesp-top-conversations-v1';
const SELECTION_STORAGE = 'mesp-top-selection-v1';
const HELP_ACTIONS = [
  { command: 'Abrir projeto', detail: 'Escolha a pasta em que vamos trabalhar.' },
  { command: 'Meus projetos', detail: 'Veja as tarefas e troque de MESP.' },
  { command: 'Modelos', detail: 'Escolha a IA ou use o modelo Auto.' },
  { command: 'Gerenciar contas', detail: 'Conecte provedores pelo 9Router.' },
  { command: 'Ver consumo', detail: 'Confira o histórico de uso das contas.' },
  { command: 'Configurar ferramentas', detail: 'Ajuste os agentes e CLIs no painel.' },
];
const LABELS: Record<PetState, string> = {
  idle: 'Pronto',
  walking: 'Buscando',
  thinking: 'Pensando',
  working: 'Trabalhando',
  waiting: 'Precisa de você',
  success: 'Concluído',
  error: 'Atenção',
  sleeping: 'Descansando',
  sitting: 'Pronto',
};

function makeProject(
  id: string,
  name: string,
  folder: string | null,
  agent = 'codex',
  traits: MespTraits = id === 'mesp-primary'
    ? simplifyDockTraits(DEFAULT_TRAITS)
    : generateDockTraits(),
): PetEntity {
  return {
    id,
    projectName: name,
    workDir: folder,
    agentPresetId: agent,
    position: { x: 0, y: 0 },
    facing: 'left',
    state: 'idle',
    traits: classicDockTraits(traits),
    task: null,
    history: [],
    showBubble: false,
    manualSleep: false,
    lastActivityAt: Date.now(),
  };
}
function restoreProjects(): PetEntity[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    const saved = normalizeDockProjects(raw);
    if (saved.length)
      return saved.map((p) => {
        const original = raw.find((r: { id: string }) => r.id === p.id);
        const restoredTraits = deserializeTraits(original?.traits) ?? DEFAULT_TRAITS;
        const appearanceCustomized = original?.appearanceCustomized === true;
        const traits =
          p.id === 'mesp-primary' && !appearanceCustomized
            ? { ...restoredTraits, family: DEFAULT_TRAITS.family, palette: DEFAULT_TRAITS.palette }
            : restoredTraits;
        return {
          ...makeProject(
            p.id,
            p.name,
            p.workDir,
            p.agent,
            appearanceCustomized ? traits : simplifyDockTraits(traits),
          ),
          appearanceCustomized,
          taskTitle: p.taskTitle,
          titlePinned: p.titlePinned,
          routerModel: p.routerModel,
        };
      });
  } catch {
    /* Invalid saves fall back to a usable empty project. */
  }
  return [makeProject('mesp-primary', 'Meu primeiro projeto', null)];
}

function restoreSelection(projects: PetEntity[]) {
  const fallback = projects[0].id;
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTION_STORAGE) || '{}');
    return {
      selectedId: projects.some((project) => project.id === saved.selectedId)
        ? (saved.selectedId as string)
        : fallback,
      primaryId: projects.some((project) => project.id === saved.primaryId)
        ? (saved.primaryId as string)
        : fallback,
    };
  } catch {
    return { selectedId: fallback, primaryId: fallback };
  }
}

function Icon({
  name,
}: {
  name: 'plus' | 'close' | 'chevron' | 'folder' | 'pin' | 'spark' | 'power';
}) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
    chevron: 'm6 9 6 6 6-6',
    folder: 'M3 7h6l2 2h10v11H3zM3 7V4h6l2 3h10v2',
    pin: 'm8 3 8 0-1 7 4 4H5l4-4-1-7M12 14v7',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    power: 'M12 3v8M6 5a9 9 0 1 0 12 0',
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function TopDock() {
  const [projects, setProjects] = useState<PetEntity[]>(restoreProjects);
  const [initialSelection] = useState(() => restoreSelection(projects));
  const [selectedId, setSelectedId] = useState(initialSelection.selectedId);
  const [primaryId, setPrimaryId] = useState(initialSelection.primaryId);
  const [view, setView] = useState<'chat' | 'terminal' | 'settings'>('chat');
  const [routerPanelOpen, setRouterPanelOpen] = useState(false);
  const [routerRequest, setRouterRequest] = useState<{ page: string; nonce: number }>();
  const [renaming, setRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [initialConversations] = useState(() => {
    try {
      return readDockConversations(
        localStorage.getItem(CONVERSATION_STORAGE),
        projects.map((p) => p.id),
      );
    } catch {
      return {} as Record<string, DockMessage[]>;
    }
  });
  const [messages, setMessages] = useState<Record<string, DockMessage[]>>(initialConversations);
  const previousSessionLastIds = useRef(
    Object.fromEntries(
      Object.entries(initialConversations).map(([id, saved]) => [id, saved[saved.length - 1]?.id]),
    ),
  );
  const [consoleText, setConsoleText] = useState<Record<string, string>>({});
  const snapshots = useRef(new Map<string, string>());
  const replies = useRef(
    new Map<string, { baseline: string; prompt: string; id: string; finished?: boolean }>(),
  );
  const [opened, setOpened] = useState<Set<string>>(
    () =>
      new Set(
        projects.find((project) => project.id === initialSelection.selectedId)?.workDir
          ? [initialSelection.selectedId]
          : [],
      ),
  );
  const [mode, setMode] = useState<FsmState>('petit');
  const [pinned, setPinned] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const quitPanel = useRef<HTMLDivElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [notice, setNotice] = useState('');
  const [initialDrafts] = useState(() => {
    try {
      return readDockDrafts(
        localStorage.getItem(DRAFT_STORAGE),
        projects.map((p) => p.id),
      );
    } catch {
      return new Map<string, string>();
    }
  });
  const drafts = useRef(initialDrafts);
  const [input, setInput] = useState(() => initialDrafts.get(selectedId) || '');
  const inputRef = useRef(input);
  inputRef.current = input;
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [showProjects, setShowProjects] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const helpPanel = useRef<HTMLDivElement>(null);
  const [externalPrompts, setExternalPrompts] = useState<
    Record<string, { id: string; text: string }>
  >({});
  const connected = useRef(new Set<string>());
  const pending = useRef(new Map<string, string>());
  const [reaction, setReaction] = useState(0);
  const [emote, setEmote] = useState<BotEmoteName | 'slap' | 'greet' | 'squash'>('greet');
  const shell = useRef<HTMLDivElement>(null);
  const expandedPanel = useRef<HTMLDivElement>(null);
  const fsm = useRef<IslandStateMachine | null>(null);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const commitProjects = useCallback((updater: (current: PetEntity[]) => PetEntity[]) => {
    const next = updater(projectsRef.current);
    projectsRef.current = next;
    setProjects(next);
  }, []);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const expanded = mode === 'home';
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];
  const primary = projects.find((p) => p.id === primaryId) ?? selected;
  const minisColumns = Math.ceil((projects.length - 1) / 2);
  const selectedTitle = selected.taskTitle || selected.projectName || 'O que vamos criar?';
  const activeCount = projects.filter((p) => !agentCanChange(p.state)).length;
  const workingCount = projects.filter((p) => p.hasActiveTask || !agentCanChange(p.state)).length;
  const reducedRef = useRef(false);
  useDockHitTest();
  useEffect(() => {
    void window.mesp?.setDockActivity(workingCount).catch(() => undefined);
  }, [workingCount]);
  useEffect(
    () =>
      window.mesp?.onDockQuitRequested(() => {
        setCustomizing(false);
        setShowProjects(false);
        setShowHelp(false);
        setView('chat');
        setConfirmQuit(true);
        fsm.current?.forceHome();
      }),
    [],
  );
  useEffect(() => {
    if (confirmQuit) quitPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [confirmQuit]);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_STORAGE, JSON.stringify({ selectedId, primaryId }));
    } catch {
      setNotice('Não foi possível salvar o MESP selecionado neste dispositivo.');
    }
  }, [selectedId, primaryId]);
  useLayoutEffect(() => {
    shell.current
      ?.querySelectorAll<HTMLElement>(
        '.dock-header, .dock-composer, .dock-chat-footer, .dock-mesp-rail, .dock-conversation, .dock-terminal',
      )
      .forEach((element) => {
        element.inert = customizing || confirmQuit;
      });
  }, [customizing, confirmQuit]);

  useEffect(() => {
    const machine = new IslandStateMachine();
    fsm.current = machine;
    machine.onTransition = (_from, to) => {
      setMode(to);
      if (to !== 'home') void window.mesp?.focusDock(false);
    };
    machine.launch();
    const timer = window.setTimeout(() => machine.greetComplete(), 2100);
    return () => {
      clearTimeout(timer);
      machine.cancelTimers();
      fsm.current = null;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify(
          projects.map((p) => ({
            id: p.id,
            name: p.projectName,
            workDir: p.workDir,
            agent: p.agentPresetId,
            traits: p.traits,
            appearanceCustomized: p.appearanceCustomized,
            taskTitle: p.taskTitle,
            titlePinned: p.titlePinned,
            routerModel: p.routerModel,
          })),
        ),
      );
    } catch {
      setNotice('Não foi possível salvar os projetos neste dispositivo.');
    }
  }, [projects]);
  useEffect(() => {
    drafts.current.set(selectedId, input);
    try {
      localStorage.setItem(
        DRAFT_STORAGE,
        serializeDockDrafts(
          drafts.current,
          projects.map((p) => p.id),
        ),
      );
    } catch {
      setNotice('Não foi possível salvar o rascunho neste dispositivo.');
    }
  }, [input, selectedId, projects]);
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(
          CONVERSATION_STORAGE,
          serializeDockConversations(
            messages,
            projects.map((p) => p.id),
          ),
        );
      } catch {
        setNotice('Não foi possível salvar o histórico da conversa neste dispositivo.');
      }
    };
    const timer = window.setTimeout(save, 250);
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', save);
      window.removeEventListener('pagehide', save);
    };
  }, [messages, projects]);
  useLayoutEffect(() => {
    if (expandedPanel.current) expandedPanel.current.inert = !expanded;
  }, [expanded]);
  useEffect(() => window.mesp?.onDockReveal(() => fsm.current?.forcePetit()), []);
  useEffect(
    () =>
      window.mesp?.on9RouterRequested(({ page }) => {
        setShowHelp(false);
        setRouterRequest({ page, nonce: Date.now() });
        setView('settings');
        fsm.current?.forceHome();
        void window.mesp?.focusDock(true);
      }),
    [],
  );

  // The opening spring and 340 ms closing curve are the actual Coucou motion helpers.
  const dimensions = useRef({
    width: new Tracked(288),
    height: new Tracked(32),
    radius: new Tracked(14),
  });
  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const paint = () => {
      const w = window.innerWidth,
        h = window.innerHeight;
      const desiredWidth =
        mode === 'home'
          ? Math.min(view === 'terminal' && selected.workDir ? 1040 : 680, w - 24)
          : mode === 'coucou'
            ? Math.min(640, w - 24)
            : mode === 'hidden'
              ? 184
              : 314 + minisColumns * 24;
      const width = Math.max(160, Math.min(desiredWidth, w - 24));
      const height =
        mode === 'home'
          ? Math.max(
              220,
              Math.min(
                view === 'terminal' && selected.workDir
                  ? 640
                  : view === 'settings' ||
                      customizing ||
                      confirmQuit ||
                      showHelp ||
                      (view === 'chat' &&
                        selected.workDir &&
                        selected.agentPresetId === 'mesp-code')
                    ? w <= 600 && view === 'chat' && selected.agentPresetId === 'mesp-code'
                      ? 620
                      : 580
                    : selected.workDir || showProjects
                      ? 460
                      : w <= 600
                        ? 400
                        : 340,
                h - 24,
              ),
            )
          : mode === 'coucou'
            ? 150
            : mode === 'hidden'
              ? 0
              : 44;
      reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      Object.entries({ width, height, radius: mode === 'home' ? 22 : 14 }).forEach(
        ([key, target]) => {
          const tracked = dimensions.current[key as keyof typeof dimensions.current];
          if (reducedRef.current) tracked.jump(target);
          else if (target > tracked.value) tracked.springTo(target);
          else tracked.curveTowards(target);
        },
      );
    };
    paint();
    let raf = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      const d = dimensions.current;
      Object.values(d).forEach((t) => t.step(dt, now));
      el.style.width = `${Math.min(d.width.value, window.innerWidth - 24)}px`;
      el.style.height = `${Math.max(0, d.height.value)}px`;
      el.style.borderRadius = `0 0 ${d.radius.value}px ${d.radius.value}px`;
      if (Object.values(d).some((t) => t.animating)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const resize = () => {
      cancelAnimationFrame(raf);
      paint();
      previous = performance.now();
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('resize', resize);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      motion.removeEventListener('change', resize);
    };
  }, [
    mode,
    selected.workDir,
    selected.agentPresetId,
    showProjects,
    showHelp,
    customizing,
    view,
    minisColumns,
    confirmQuit,
  ]);

  const collapse = useCallback(() => {
    fsm.current?.forcePetit();
  }, []);
  useEffect(() => window.mesp?.on9RouterEscape(collapse), [collapse]);
  const revealChat = useCallback(() => {
    setView('chat');
    setShowProjects(false);
    setShowHelp(false);
    setFocusRequest((value) => value + 1);
    fsm.current?.forceHome();
    void window.mesp?.focusDock(true);
  }, []);
  useEffect(() => window.mesp?.onDockChatRequested(revealChat), [revealChat]);
  useEffect(() => {
    if (!focusRequest || !expanded || view !== 'chat') return;
    composerInput.current?.focus();
  }, [focusRequest, expanded, view]);
  useLayoutEffect(() => {
    const field = composerInput.current;
    if (!field) return;
    const fit = () => {
      field.style.height = 'auto';
      field.style.height = `${Math.min(112, Math.max(24, field.scrollHeight))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [input, view, expanded]);
  useEffect(() => {
    if (expanded && showHelp) helpPanel.current?.querySelector('button')?.focus();
  }, [expanded, showHelp]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && showHelp) {
        e.preventDefault();
        setShowHelp(false);
        setFocusRequest((value) => value + 1);
        return;
      }
      if (e.key === 'Escape' && showProjects) {
        e.preventDefault();
        setShowProjects(false);
        setFocusRequest((value) => value + 1);
        return;
      }
      if (
        e.key === 'Escape' &&
        !customizing &&
        !confirmQuit &&
        !renaming &&
        !document.activeElement?.closest('.xterm, .mesp-access-dialog')
      ) {
        e.preventDefault();
        collapse();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        revealChat();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [collapse, customizing, confirmQuit, renaming, revealChat, showHelp, showProjects]);
  useEffect(() => {
    if (fsm.current)
      fsm.current.pinned =
        pinned ||
        customizing ||
        confirmQuit ||
        choosing ||
        renaming ||
        routerPanelOpen ||
        showHelp ||
        !!shell.current?.contains(document.activeElement);
  }, [pinned, customizing, confirmQuit, choosing, renaming, routerPanelOpen, showHelp]);

  const react = useCallback((name: BotEmoteName | 'slap' | 'greet' | 'squash') => {
    setEmote(name);
    setReaction((n) => n + 1);
  }, []);
  const selectProject = useCallback((id: string) => {
    drafts.current.set(selectedRef.current, inputRef.current);
    const draft = drafts.current.get(id) || '';
    inputRef.current = draft;
    setInput(draft);
    selectedRef.current = id;
    setSelectedId(id);
    setPrimaryId(id);
    setShowProjects(false);
    setShowHelp(false);
    setView('chat');
    setRenaming(false);
    setFocusRequest((value) => value + 1);
    const p = projectsRef.current.find((p) => p.id === id);
    if (p?.workDir) setOpened((prev) => new Set(prev).add(id));
    fsm.current?.forceHome();
    void window.mesp?.focusDock(true);
  }, []);
  const chooseProject = useCallback(
    async (newProject = false) => {
      if (choosing) return;
      if (!window.mesp?.selectFolder) {
        setNotice('Abra esta versão pelo aplicativo para escolher uma pasta.');
        return;
      }
      if (newProject && projectsRef.current.length >= MAX_DOCK_PROJECTS) {
        setNotice('Você pode manter até 10 projetos.');
        return;
      }
      if (!newProject) {
        const target = projectsRef.current.find((p) => p.id === selectedRef.current);
        if (target && !agentCanChange(target.state)) {
          setNotice('Termine ou cancele a tarefa antes de trocar a pasta.');
          return;
        }
      }
      setChoosing(true);
      if (fsm.current) fsm.current.pinned = true;
      try {
        const folder = await window.mesp.selectFolder();
        if (!folder) return;
        const id = newProject ? `mesp-${crypto.randomUUID()}` : selectedRef.current;
        if (newProject)
          commitProjects((prev) => [
            ...prev,
            makeProject(
              id,
              projectName(folder),
              folder,
              'codex',
              generateDockTraits(prev.map((p) => p.traits)),
            ),
          ]);
        else
          commitProjects((prev) =>
            prev.map((p) =>
              p.id === id
                ? { ...p, workDir: folder, projectName: projectName(folder), state: 'idle' }
                : p,
            ),
          );
        setNotice('');
        selectProject(id);
        return id;
      } catch {
        setNotice('Não foi possível abrir o seletor de pastas.');
      } finally {
        setChoosing(false);
        if (fsm.current) fsm.current.pinned = pinned;
      }
    },
    [choosing, pinned, commitProjects, selectProject],
  );

  const updateState = useCallback(
    (id: string, next: PetState) => {
      const old = projectsRef.current.find((p) => p.id === id);
      if (!old || old.state === next) return;
      // Output pauses, tool timers and terminal redraws do not finish an active turn.
      if (
        old.hasActiveTask &&
        old.agentPresetId !== 'mesp-code' &&
        ['idle', 'walking', 'sitting', 'sleeping'].includes(next)
      )
        return;
      const promote = shouldPromoteProject(old, next);
      commitProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                state: next,
                lastActivityAt: Date.now(),
                ...(promote ? { hasActiveTask: false, completedAt: Date.now() } : {}),
                ...(next === 'error' ? { hasActiveTask: false } : {}),
                ...(old.agentPresetId === 'mesp-code' && next === 'idle'
                  ? { hasActiveTask: false }
                  : {}),
              }
            : p,
        ),
      );
      if (promote) {
        setPrimaryId(id);
        // A finished background MESP becomes the lead without stealing the draft or chat.
        react('proud');
      }
      if (next === 'waiting' || next === 'error' || promote) {
        fsm.current?.reveal();
        const title =
          next === 'waiting'
            ? 'O agente precisa de você'
            : next === 'success'
              ? 'Tarefa concluída'
              : 'O agente reportou um erro';
        void window.mesp?.notify({
          title,
          body: `${old.taskTitle || old.projectName} · ${getPresetById(old.agentPresetId || '')?.name || 'Agente'}`,
        });
      }
    },
    [commitProjects, react],
  );
  const onTranscript = useCallback((id: string, text: string) => {
    snapshots.current.set(id, text);
    setConsoleText((prev) => ({ ...prev, [id]: text }));
    const reply = replies.current.get(id);
    if (!reply || reply.finished) return;
    const content = terminalReply(reply.baseline, text, reply.prompt);
    setMessages((prev) => ({
      ...prev,
      [id]: (prev[id] || []).map((m) => (m.id === reply.id ? { ...m, content } : m)),
    }));
  }, []);
  const titleRequests = useRef(new Map<string, symbol>());
  useEffect(() => () => titleRequests.current.clear(), []);
  const analyzeTitle = useCallback(
    (id: string, prompt: string, agent: string) => {
      if (projectsRef.current.find((p) => p.id === id)?.titlePinned) return;
      const requestId = Symbol(id);
      titleRequests.current.set(id, requestId);
      void window.mesp
        ?.generateDockTitle(prompt, agent)
        .then((title) => {
          if (!title || titleRequests.current.get(id) !== requestId) return;
          commitProjects((prev) =>
            prev.map((p) => (p.id === id && !p.titlePinned ? { ...p, taskTitle: title } : p)),
          );
        })
        .catch(() => {
          /* A title failure never interrupts the coding task. */
        });
    },
    [commitProjects],
  );
  const nativeTaskStarted = useCallback(
    (id: string, prompt: string) => {
      const p = projectsRef.current.find((p) => p.id === id);
      if (!p || p.hasActiveTask) return;
      const replyId = crypto.randomUUID();
      replies.current.set(id, { baseline: snapshots.current.get(id) || '', prompt, id: replyId });
      setMessages((prev) => ({
        ...prev,
        [id]: [
          ...(prev[id] || []),
          { id: crypto.randomUUID(), role: 'user', content: prompt },
          { id: replyId, role: 'assistant', content: '' },
        ].slice(-100) as DockMessage[],
      }));
      commitProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                taskTitle: p.titlePinned ? p.taskTitle : taskTitle(prompt),
                hasActiveTask: true,
                state: 'thinking',
                completedAt: undefined,
              }
            : p,
        ),
      );
      analyzeTitle(id, prompt, p.agentPresetId || 'codex');
    },
    [commitProjects, analyzeTitle],
  );
  const addMesp = useCallback(() => {
    if (projectsRef.current.length >= MAX_DOCK_PROJECTS) {
      setNotice('Você já tem 10 MESP.');
      return;
    }
    const current = projectsRef.current.find((p) => p.id === selectedRef.current);
    const id = `mesp-${crypto.randomUUID()}`;
    commitProjects((prev) => [
      ...prev,
      {
        ...makeProject(
          id,
          current?.projectName || 'Novo MESP',
          current?.workDir || null,
          current?.agentPresetId || 'codex',
          generateDockTraits(prev.map((p) => p.traits)),
        ),
        taskTitle: 'Novo MESP',
      },
    ]);
    setNotice('');
    setView('chat');
    selectProject(id);
    react('greet');
  }, [commitProjects, selectProject, react]);
  useEffect(
    () =>
      window.mesp?.onDockAgentEvent((event) => {
        const project = projectsRef.current.find((p) => p.id === event.petId);
        if (!project) return;
        if (event.prompt) nativeTaskStarted(event.petId, event.prompt);
        if (event.state === 'success' && project.hasActiveTask) {
          const reply = replies.current.get(event.petId);
          if (reply && event.content) {
            reply.finished = true;
            setMessages((prev) => ({
              ...prev,
              [event.petId]: (prev[event.petId] || []).map((m) =>
                m.id === reply.id ? { ...m, content: event.content! } : m,
              ),
            }));
          }
        }
        updateState(event.petId, event.state);
      }),
    [nativeTaskStarted, updateState],
  );
  const saveTitle = () => {
    if (titleInput.trim())
      commitProjects((prev) =>
        prev.map((p) =>
          p.id === selected.id ? { ...p, taskTitle: taskTitle(titleInput), titlePinned: true } : p,
        ),
      );
    setRenaming(false);
  };
  const writePrompt = useCallback(async (id: string, prompt: string) => {
    const pasted = prompt.includes('\n') ? `\x1b[200~${prompt}\x1b[201~\r` : `${prompt}\r`;
    try {
      if (!(await window.mesp?.terminalWrite(id, pasted)))
        setNotice(
          'O agente ainda não está conectado. Veja a mensagem do terminal e tente reconectar.',
        );
    } catch {
      setNotice('Não foi possível enviar o pedido ao agente.');
    }
  }, []);
  const onConnection = useCallback(
    (id: string, ready: boolean) => {
      if (!ready) {
        connected.current.delete(id);
        return;
      }
      connected.current.add(id);
      const prompt = pending.current.get(id);
      if (prompt) {
        pending.current.delete(id);
        setNotice('');
        void writePrompt(id, prompt);
      }
    },
    [writePrompt],
  );
  const sendPrompt = useCallback(
    (id: string, prompt: string, agent: string) => {
      const target = projectsRef.current.find((p) => p.id === id);
      if (target?.hasActiveTask && target.state !== 'waiting') {
        setNotice('Este MESP está trabalhando. Você pode abrir outro pelo botão +.');
        setInput(prompt);
        return;
      }
      const replyId = crypto.randomUUID();
      replies.current.set(id, { baseline: snapshots.current.get(id) || '', prompt, id: replyId });
      setMessages((prev) => ({
        ...prev,
        [id]: [
          ...(prev[id] || []),
          { id: crypto.randomUUID(), role: 'user', content: prompt },
          { id: replyId, role: 'assistant', content: '' },
        ].slice(-100) as DockMessage[],
      }));
      commitProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                taskTitle: p.titlePinned ? p.taskTitle : taskTitle(prompt),
                hasActiveTask: true,
                completedAt: undefined,
                state: 'thinking',
              }
            : p,
        ),
      );
      analyzeTitle(id, prompt, agent);
      if (agent === 'mesp-code') {
        setExternalPrompts((prev) => ({
          ...prev,
          [id]: { id: crypto.randomUUID(), text: prompt },
        }));
        return;
      }
      if (connected.current.has(id)) void writePrompt(id, prompt);
      else {
        pending.current.set(id, [pending.current.get(id), prompt].filter(Boolean).join('\n\n'));
        setNotice('Abrindo o agente para receber seu pedido…');
      }
    },
    [writePrompt, commitProjects, analyzeTitle],
  );
  const request = async (text: string, preserveDraft = false) => {
    if (!text.trim() || choosing) return;
    try {
      const action = parseDockRequest(text);
      if (!preserveDraft) {
        setInput('');
        inputRef.current = '';
        drafts.current.delete(selectedRef.current);
      }
      setNotice('');
      setShowHelp(false);
      react('happy');
      if (action.kind === 'help') {
        setView('chat');
        setShowProjects(false);
        setShowHelp(true);
        fsm.current?.forceHome();
        return;
      }
      if (action.kind === 'settings') {
        setShowProjects(false);
        setRouterRequest({ page: action.page, nonce: Date.now() });
        setView('settings');
        fsm.current?.forceHome();
        return;
      }
      if (action.kind === 'projects') {
        setShowProjects(true);
        fsm.current?.forceHome();
        return;
      }
      if (action.kind === 'collapse') {
        collapse();
        return;
      }
      if (action.kind === 'customize') {
        setShowProjects(false);
        setView('chat');
        setCustomizing(true);
        return;
      }
      if (action.kind === 'new-mesp') {
        addMesp();
        return;
      }
      if (action.kind === 'new-project') {
        setShowProjects(false);
        await chooseProject(Boolean(selected.workDir));
        return;
      }
      if (action.kind === 'select-project') {
        const id = findDockProject(
          projects.map((p) => ({
            id: p.id,
            name: p.projectName || '',
            taskTitle: p.taskTitle,
            workDir: p.workDir,
            agent: p.agentPresetId || 'codex',
          })),
          action.name,
        );
        if (id) {
          selectProject(id);
          setShowProjects(false);
        } else {
          setShowProjects(true);
          setNotice('Escolha um dos seus projetos abaixo ou peça “novo projeto”.');
        }
        return;
      }
      let target = selected;
      if (action.kind === 'agent' || action.kind === 'delegate') {
        const agent = action.agent;
        const preset = getPresetById(agent);
        const existing = projects.find(
          (p) => p.agentPresetId === agent && p.workDir === selected.workDir,
        );
        if (
          agent !== 'mesp-code' &&
          !(existing && connected.current.has(existing.id)) &&
          preset &&
          window.mesp?.checkCommand &&
          !(await window.mesp.checkCommand(preset.command))
        ) {
          setNotice(
            `${preset.name} não está instalado ou não está disponível na PATH deste computador.`,
          );
          return;
        }
        if (existing) target = existing;
        else if (!selected.workDir) {
          target = { ...selected, agentPresetId: agent };
          commitProjects((prev) => prev.map((p) => (p.id === selected.id ? target : p)));
        } else {
          if (projects.length >= MAX_DOCK_PROJECTS) {
            setNotice('O limite é de 10 projetos. Escolha um MESP já aberto.');
            setShowProjects(true);
            return;
          }
          target = makeProject(
            `mesp-${crypto.randomUUID()}`,
            `${projectName(selected.workDir)} · ${preset?.name}`,
            selected.workDir,
            agent,
            generateDockTraits(projectsRef.current.map((p) => p.traits)),
          );
          commitProjects((prev) => [...prev, target]);
        }
        selectProject(target.id);
        if (action.kind === 'agent') {
          if (!target.workDir) await chooseProject();
          return;
        }
      }
      if (action.kind !== 'send' && action.kind !== 'delegate') return;
      if (!target.workDir) {
        const id = await chooseProject();
        if (id) sendPrompt(id, action.prompt, target.agentPresetId || 'codex');
        else setInput(text);
      } else {
        setOpened((prev) => new Set(prev).add(target.id));
        sendPrompt(target.id, action.prompt, target.agentPresetId || 'codex');
      }
    } catch {
      setNotice('Não foi possível concluir o pedido. Tente novamente.');
    }
  };
  const changeDraft = useCallback((id: string, value: string) => {
    drafts.current.set(id, value);
    if (selectedRef.current === id) {
      inputRef.current = value;
      setInput(value);
    }
  }, []);
  const callbacks = useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [p.id, (state: PetState) => updateState(p.id, state)]),
      ),
    [projects, updateState],
  );
  const connectionCallbacks = useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [p.id, (ready: boolean) => onConnection(p.id, ready)]),
      ),
    [projects, onConnection],
  );
  const transcriptCallbacks = useMemo(
    () =>
      Object.fromEntries(projects.map((p) => [p.id, (text: string) => onTranscript(p.id, text)])),
    [projects, onTranscript],
  );
  const routerModelCallbacks = useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [
          p.id,
          (model: string) => {
            commitProjects((prev) =>
              prev.some((item) => item.id === p.id && item.routerModel !== model)
                ? prev.map((item) => (item.id === p.id ? { ...item, routerModel: model } : item))
                : prev,
            );
          },
        ]),
      ),
    [projects, commitProjects],
  );
  const taskCallbacks = useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [p.id, (text: string) => nativeTaskStarted(p.id, text)]),
      ),
    [projects, nativeTaskStarted],
  );

  return (
    <>
      <div
        className="dock-wake interactive"
        onMouseEnter={() => fsm.current?.mouseEntered()}
        aria-hidden="true"
      />
      <div
        ref={shell}
        className={`top-dock interactive mode-${mode} view-${view}${customizing ? ' is-customizing' : ''}`}
        style={{ '--mini-columns': minisColumns } as React.CSSProperties}
        onMouseEnter={() => fsm.current?.mouseEntered()}
        onMouseLeave={() => fsm.current?.mouseLeft()}
        onFocusCapture={() => {
          if (fsm.current) {
            fsm.current.cancelTimers();
            fsm.current.pinned = true;
          }
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null) && fsm.current) {
            fsm.current.pinned =
              pinned ||
              customizing ||
              confirmQuit ||
              choosing ||
              renaming ||
              routerPanelOpen ||
              showHelp;
            fsm.current.mouseLeft();
          }
        }}
      >
        <div className="dock-clip">
          <button
            className="dock-compact"
            aria-label={`Abrir projetos MESP, ${activeCount} em atividade`}
            onClick={() => {
              react('squash');
              selectProject(primary.id);
            }}
            tabIndex={expanded ? -1 : 0}
          >
            <span className="dock-compact-title">
              {primary.taskTitle || primary.projectName || 'MESP'}
            </span>
            <span className="dock-compact-meta">
              <i className={`dock-status state-${primary.state}`} />
              {primary.completedAt ? 'Concluído' : LABELS[primary.state]}
            </span>
          </button>
          <div className="dock-greeting">
            <span>Olá! Vamos criar algo?</span>
            <small>Seus projetos, sempre por perto.</small>
          </div>
          <div ref={expandedPanel} className="dock-expanded">
            <header className="dock-header">
              <div className="dock-title">
                {renaming ? (
                  <input
                    className="dock-task-title-input"
                    aria-label="Título da tarefa"
                    maxLength={120}
                    value={titleInput}
                    autoFocus
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveTitle();
                      }
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setRenaming(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    className="dock-task-title"
                    title="Editar título da tarefa"
                    aria-label={`Editar título: ${selectedTitle}`}
                    onClick={() => {
                      setTitleInput(selectedTitle);
                      setRenaming(true);
                    }}
                  >
                    <strong>{selectedTitle}</strong>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path d="m16 3 5 5L8 21H3v-5zM14 5l5 5" />
                    </svg>
                  </button>
                )}
                <small>
                  <span className={`dock-status state-${selected.state}`} />
                  {getPresetById(selected.agentPresetId || 'codex')?.name} ·{' '}
                  {LABELS[selected.state]}
                </small>
              </div>
              <div className="dock-actions">
                <button
                  title="Personalizar MESP"
                  aria-label="Personalizar MESP"
                  onClick={() => {
                    setShowHelp(false);
                    setShowProjects(false);
                    setView('chat');
                    setCustomizing(true);
                  }}
                >
                  <Icon name="spark" />
                </button>
                <button
                  title={pinned ? 'Desafixar painel' : 'Manter painel aberto'}
                  aria-label="Manter painel aberto"
                  aria-pressed={pinned}
                  onClick={() => setPinned((p) => !p)}
                >
                  <Icon name="pin" />
                </button>
                <button title="Recolher · Esc" aria-label="Recolher painel" onClick={collapse}>
                  <Icon name="chevron" />
                </button>
              </div>
            </header>
            <div className="dock-body dock-chat-only">
              <section className="dock-workspace" aria-label={`Projeto ${selected.projectName}`}>
                {selected.workDir && selected.agentPresetId !== 'mesp-code' && view === 'chat' && (
                  <DockConversation
                    key={selected.id}
                    messages={messages[selected.id] || []}
                    previousSessionLastId={previousSessionLastIds.current[selected.id]}
                    state={selected.state}
                    consoleText={consoleText[selected.id] || ''}
                    project={selected.projectName || 'Projeto'}
                    agent={getPresetById(selected.agentPresetId || '')?.name || 'Agente'}
                  />
                )}
                {!selected.workDir && view !== 'settings' && !showHelp && !showProjects && (
                  <div className="dock-welcome">
                    <h2>Pode me pedir.</h2>
                    <p>
                      Abra um projeto, chame o Codex ou peça ajuda ao Claude.
                      <br />
                      Cada projeto pode ter seu próprio MESP.
                    </p>
                    <div className="dock-suggestions">
                      {[
                        'Abrir projeto',
                        'Chame o Claude',
                        'Meus projetos',
                        'O que posso pedir?',
                      ].map((text) => (
                        <button key={text} onClick={() => void request(text, true)}>
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {projects
                  .filter((p) => opened.has(p.id) && p.workDir)
                  .map((p) => (
                    <KiroChatPanel
                      key={p.id}
                      docked
                      dockChat={view !== 'terminal'}
                      pet={p}
                      visible={
                        expanded &&
                        p.id === selected.id &&
                        !showProjects &&
                        !showHelp &&
                        !customizing &&
                        view !== 'settings'
                      }
                      onClose={collapse}
                      onPetStateChange={callbacks[p.id]}
                      onConnectionChange={connectionCallbacks[p.id]}
                      onTranscriptChange={transcriptCallbacks[p.id]}
                      onTaskStarted={taskCallbacks[p.id]}
                      onRouterModelChange={routerModelCallbacks[p.id]}
                      externalPrompt={externalPrompts[p.id]}
                      dockComposer={
                        p.agentPresetId === 'mesp-code'
                          ? {
                              value: p.id === selectedId ? input : drafts.current.get(p.id) || '',
                              onChange: (value) => changeDraft(p.id, value),
                              onCommand: (text) => {
                                if (parseDockRequest(text).kind === 'send') return false;
                                void request(text);
                                return true;
                              },
                              focusRequest: p.id === selectedId ? focusRequest : 0,
                            }
                          : undefined
                      }
                    />
                  ))}
                {view === 'settings' && (
                  <DockSettings
                    key={selected.id}
                    project={selected.projectName || 'Seu projeto'}
                    active={
                      expanded &&
                      !customizing &&
                      !choosing &&
                      !showProjects &&
                      !showHelp &&
                      !renaming
                    }
                    requestedPage={routerRequest}
                    onPanelOpenChange={setRouterPanelOpen}
                    currentModel={selected.routerModel}
                    canChange={!selected.hasActiveTask && agentCanChange(selected.state)}
                    onApply={(model) => {
                      if (selected.hasActiveTask || !agentCanChange(selected.state)) return;
                      commitProjects((prev) =>
                        prev.map((p) =>
                          p.id === selected.id
                            ? {
                                ...p,
                                agentPresetId: 'mesp-code',
                                routerModel: model,
                                state: 'idle',
                              }
                            : p,
                        ),
                      );
                      setNotice('Modelo salvo neste MESP.');
                      setView('chat');
                    }}
                  />
                )}
                {showHelp && (
                  <div
                    ref={helpPanel}
                    className="dock-project-overlay dock-help-overlay"
                    role="dialog"
                    aria-label="Ajuda do MESP"
                  >
                    <div className="dock-overlay-heading">
                      <strong>Pode conversar comigo.</strong>
                      <button
                        aria-label="Fechar ajuda"
                        onClick={() => {
                          setShowHelp(false);
                          setFocusRequest((value) => value + 1);
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <p>Digite um destes pedidos ou clique para abrir.</p>
                    <div className="dock-help-grid">
                      {HELP_ACTIONS.map((action) => (
                        <button
                          key={action.command}
                          aria-label={action.command}
                          onClick={() => void request(action.command, true)}
                        >
                          <strong>{action.command}</strong>
                          <small>{action.detail}</small>
                        </button>
                      ))}
                    </div>
                    <p>
                      Para trabalhar: “Peça ao Codex para revisar o código” ou escreva a tarefa
                      diretamente. O botão + cria outro MESP para trabalhar em paralelo. Para
                      trocar, peça “Abrir MESP nome da tarefa”.
                    </p>
                    <small className="dock-help-keys">
                      Enter envia · Shift+Enter quebra a linha · Ctrl+K conversa · Esc volta
                    </small>
                  </div>
                )}
                {showProjects && (
                  <div className="dock-project-overlay">
                    <div className="dock-overlay-heading">
                      <strong>Seus MESP</strong>
                      <button aria-label="Voltar à conversa" onClick={() => setShowProjects(false)}>
                        <Icon name="close" />
                      </button>
                    </div>
                    <div className="dock-project-grid">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          className={`dock-project ${p.id === selected.id ? 'selected' : ''}`}
                          onClick={() => {
                            selectProject(p.id);
                            setShowProjects(false);
                          }}
                        >
                          <span className={`dock-project-dot state-${p.state}`} />
                          <span className="dock-project-copy">
                            <strong>{p.taskTitle || p.projectName}</strong>
                            <small>
                              {p.projectName} · {getPresetById(p.agentPresetId || '')?.name} ·{' '}
                              {LABELS[p.state]}
                            </small>
                          </span>
                          {!agentCanChange(p.state) && <span className="dock-working" />}
                        </button>
                      ))}
                    </div>
                    <button
                      className="dock-inline-new"
                      disabled={choosing || projects.length >= MAX_DOCK_PROJECTS}
                      onClick={addMesp}
                    >
                      <Icon name="plus" />
                      Novo MESP
                    </button>
                  </div>
                )}
                {customizing && (
                  <DockAppearance
                    key={selected.id}
                    initialTraits={selected.traits}
                    title={selectedTitle}
                    onClose={() => {
                      setCustomizing(false);
                      setFocusRequest((value) => value + 1);
                    }}
                    onSave={(traits) => {
                      commitProjects((prev) =>
                        prev.map((project) =>
                          project.id === selected.id
                            ? {
                                ...project,
                                traits: classicDockTraits(traits),
                                appearanceCustomized: true,
                              }
                            : project,
                        ),
                      );
                      setCustomizing(false);
                      setNotice('Aparência salva neste MESP.');
                      setFocusRequest((value) => value + 1);
                    }}
                  />
                )}
                {confirmQuit && (
                  <div
                    ref={quitPanel}
                    className="dock-quit-confirm dock-project-overlay"
                    role="dialog"
                    aria-label="Sair com tarefas ativas"
                    aria-modal="true"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setConfirmQuit(false);
                        setFocusRequest((value) => value + 1);
                      }
                      if (event.key === 'Tab') {
                        const controls = [
                          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                        ];
                        if (event.shiftKey && document.activeElement === controls[0]) {
                          event.preventDefault();
                          controls[1]?.focus();
                        } else if (!event.shiftKey && document.activeElement === controls[1]) {
                          event.preventDefault();
                          controls[0]?.focus();
                        }
                      }
                    }}
                  >
                    <strong>Há trabalho em andamento</strong>
                    <p>
                      Sair encerra os agentes e as verificações ativas. Para continuar trabalhando
                      em segundo plano, recolha a ilha.
                    </p>
                    <div className="dock-appearance-actions">
                      <button
                        onClick={() => {
                          setConfirmQuit(false);
                          setFocusRequest((value) => value + 1);
                        }}
                      >
                        Continuar trabalhando
                      </button>
                      <button onClick={() => void window.mesp?.quit(true)}>Encerrar e sair</button>
                    </div>
                  </div>
                )}
              </section>
            </div>
            {primary.id !== selected.id && primary.completedAt && (
              <button className="dock-completed-banner" onClick={() => selectProject(primary.id)}>
                <span>✓ {primary.taskTitle || primary.projectName}</span>
                <span>Ver resultado ↗</span>
              </button>
            )}
            {notice && (
              <div className="dock-chat-feedback" role="status">
                {notice}
                <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
                  <Icon name="close" />
                </button>
              </div>
            )}
            {view !== 'settings' &&
              !(selected.workDir && selected.agentPresetId === 'mesp-code') &&
              !customizing && (
                <form
                  className="dock-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void request(input);
                  }}
                >
                  <textarea
                    aria-label="Pedir ao MESP"
                    ref={composerInput}
                    rows={1}
                    title="Enter envia · Shift+Enter quebra a linha"
                    value={input}
                    onChange={(e) => {
                      inputRef.current = e.target.value;
                      setInput(e.target.value);
                    }}
                    placeholder={
                      choosing ? 'Escolha a pasta do projeto…' : 'Peça ao MESP ou a outro agente…'
                    }
                    disabled={choosing}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        if (!event.repeat) event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Enviar pedido"
                    disabled={!input.trim() || choosing}
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M12 19V5m-6 6 6-6 6 6" />
                    </svg>
                  </button>
                </form>
              )}
            <footer className="dock-chat-footer">
              <div
                className="dock-chat-tabs"
                role="tablist"
                aria-label="Modo de conversa"
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const tabs = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      'button:not(:disabled)',
                    ),
                  ];
                  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                          tabs.length;
                  tabs[next]?.focus();
                  tabs[next]?.click();
                }}
              >
                <button
                  role="tab"
                  title="Conversar · Ctrl+K"
                  aria-selected={view === 'chat'}
                  onClick={() => {
                    setShowHelp(false);
                    setView('chat');
                  }}
                >
                  Chat
                </button>
                <button
                  role="tab"
                  aria-selected={view === 'terminal'}
                  onClick={() => {
                    setShowHelp(false);
                    setView('terminal');
                  }}
                  disabled={!selected.workDir}
                >
                  Terminal
                </button>
                <button
                  id="dock-settings-tab"
                  role="tab"
                  aria-selected={view === 'settings'}
                  aria-controls="dock-settings-panel"
                  onClick={() => {
                    setShowHelp(false);
                    setShowProjects(false);
                    setView('settings');
                  }}
                >
                  Configurações
                </button>
              </div>
              <span>
                {projects.length} MESP · {activeCount} em atividade
              </span>
              <button
                className="dock-more-projects"
                aria-label="Ver todos os MESP"
                onClick={() => {
                  setShowHelp(false);
                  setView('chat');
                  setShowProjects(true);
                }}
              >
                Meus MESP
              </button>
              <button
                title="Sair e encerrar sessões"
                aria-label="Sair do MESP"
                onClick={() => void window.mesp?.quit()}
              >
                <Icon name="power" />
              </button>
            </footer>
          </div>
        </div>
        <DockMespRail
          projects={projects}
          primaryId={primary.id}
          selectedId={selected.id}
          mode={mode}
          labels={LABELS}
          emote={emote}
          reaction={reaction}
          onSelect={(id) => {
            react('squash');
            selectProject(id);
          }}
          onAdd={addMesp}
          addingDisabled={choosing || projects.length >= MAX_DOCK_PROJECTS}
        />
      </div>
    </>
  );
}
