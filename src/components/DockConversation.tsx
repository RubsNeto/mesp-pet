import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PetState } from '../types';
import { dockModelLabel } from './DockModelPicker';

export interface DockMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
}

export function DockCopyButton({ text, label }: { text: string; label: 'resposta' | 'código' }) {
  const [feedback, setFeedback] = useState<'copied' | 'error' | null>(null);
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const title =
    feedback === 'copied'
      ? 'Copiado'
      : feedback === 'error'
        ? 'Não foi possível copiar. Tente novamente.'
        : `Copiar ${label}`;
  return (
    <button
      type="button"
      className={`dock-copy-button${feedback === 'copied' ? ' is-copied' : ''}`}
      aria-label={`Copiar ${label}`}
      title={title}
      disabled={copying}
      onClick={async () => {
        setCopying(true);
        setFeedback(null);
        try {
          if (window.mesp?.clipboardWriteText) {
            if (!(await window.mesp.clipboardWriteText(text)))
              throw new Error('Clipboard unavailable');
          } else await navigator.clipboard.writeText(text);
          setFeedback('copied');
        } catch {
          setFeedback('error');
        } finally {
          setCopying(false);
        }
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {feedback === 'copied' ? (
          <path d="m5 12 4 4L19 6" />
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V4H4v12h4" />
          </>
        )}
      </svg>
      {feedback === 'error' && <span className="dock-copy-error">Tentar novamente</span>}
      <span className="dock-copy-feedback" role="status">
        {feedback === 'copied'
          ? `${label === 'resposta' ? 'Resposta copiada' : 'Código copiado'}.`
          : feedback === 'error'
            ? title
            : ''}
      </span>
    </button>
  );
}
export function DockReplyText({ content }: { content: string }) {
  const pieces = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {pieces.map((part, index) => {
        if (part.startsWith('```')) {
          const code = part.replace(/^```[^\n]*\n?/, '').replace(/(?:\r?\n)?```$/, '');
          return (
            <div className="dock-code-block" key={index}>
              <DockCopyButton text={code} label="código" />
              <pre>
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        let text = part;
        if (pieces[index - 1]?.startsWith('```')) text = text.replace(/^(?:\r?\n)+/, '');
        if (pieces[index + 1]?.startsWith('```')) text = text.replace(/(?:\r?\n)+$/, '');
        return <span key={index}>{text}</span>;
      })}
    </>
  );
}

export function DockConversation({
  messages,
  state,
  consoleText,
  project,
  agent,
  previousSessionLastId,
  general = false,
  children,
}: {
  messages: DockMessage[];
  state: PetState;
  consoleText: string;
  project: string;
  agent: string;
  previousSessionLastId?: string;
  general?: boolean;
  children?: ReactNode;
}) {
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const busy = state === 'thinking' || state === 'working';
  const lastReply = messages[messages.length - 1];
  const lastSeen = useRef(lastReply);
  useLayoutEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    else if (
      lastReply?.id !== lastSeen.current?.id ||
      lastReply?.content !== lastSeen.current?.content
    )
      setHasNewMessages(true);
    lastSeen.current = lastReply;
  }, [messages, consoleText, busy, lastReply]);
  return (
    <div className="dock-conversation">
      <div className="dock-context-chip" title={project}>
        <span className="dock-project-dot" />
        {project}
        <span className="dock-context-agent">{agent}</span>
      </div>
      <div
        ref={log}
        className="dock-chat-log"
        role="log"
        aria-label={`Conversa de ${project}`}
        aria-live="off"
        onScroll={() => {
          const el = log.current;
          if (el) {
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            setShowLatest(!following.current);
            if (following.current) setHasNewMessages(false);
          }
        }}
      >
        {!messages.length && (
          <div className="dock-chat-intro">
            <strong>O que vamos fazer neste projeto?</strong>
            <p>Peça uma tarefa aqui ou crie outro MESP para trabalhar em paralelo.</p>
          </div>
        )}
        {!messages.length && consoleText && (
          <details className="dock-cli-welcome">
            <summary>Mensagem do agente</summary>
            <pre>{consoleText.slice(-8000)}</pre>
          </details>
        )}
        {messages
          .filter((m) => m.content)
          .map((m) => (
            <Fragment key={m.id}>
              <div className={`dock-chat-row ${m.role}`}>
                <div
                  className={
                    m.role === 'user' ? 'dock-chat-bubble' : 'dock-chat-reply dock-response-row'
                  }
                >
                  <div className="dock-message-text">
                    {m.role === 'assistant' && m.modelUsed && (
                      <small className="dock-response-model" title={m.modelUsed}>
                        Auto · {dockModelLabel(m.modelUsed)}
                      </small>
                    )}
                    <DockReplyText content={m.content} />
                  </div>
                  {m.role === 'assistant' && <DockCopyButton text={m.content} label="resposta" />}
                </div>
              </div>
              {m.id === previousSessionLastId && (
                <div className="dock-session-boundary">
                  Histórico anterior preservado · nova sessão do agente
                </div>
              )}
            </Fragment>
          ))}
        {busy && !lastReply?.content && (
          <div className="dock-typing" aria-label="Agente trabalhando">
            <i />
            <i />
            <i />
          </div>
        )}
        {state === 'waiting' && (
          <div className="dock-chat-guidance">
            O agente precisa de uma resposta. Se houver opções de teclado ou login, abra o Terminal.
          </div>
        )}
        {state === 'error' && (
          <div className="dock-chat-guidance">
            {general
              ? 'Confira a conexão do agente nas Configurações e tente novamente.'
              : 'Confira a mensagem do agente ou abra o Terminal para continuar.'}
          </div>
        )}
      </div>
      {children}
      {showLatest && (
        <button
          className="dock-latest-message"
          onClick={() => {
            following.current = true;
            if (log.current) log.current.scrollTop = log.current.scrollHeight;
            setShowLatest(false);
            setHasNewMessages(false);
          }}
        >
          {hasNewMessages ? 'Novas mensagens' : 'Ir para o fim'}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v16m-6-6 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
