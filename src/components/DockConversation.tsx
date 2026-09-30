import { useEffect, useRef } from 'react';
import type { PetState } from '../types';

export interface DockMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function ReplyText({ content }: { content: string }) {
  const pieces = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {pieces.map((part, index) =>
        part.startsWith('```') ? (
          <pre key={index}>
            <code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code>
          </pre>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function DockConversation({
  messages,
  state,
  consoleText,
  project,
  agent,
}: {
  messages: DockMessage[];
  state: PetState;
  consoleText: string;
  project: string;
  agent: string;
}) {
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const busy = state === 'thinking' || state === 'working';
  const lastReply = messages[messages.length - 1];
  useEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, consoleText, busy]);
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
          if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
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
            <div key={m.id} className={`dock-chat-row ${m.role}`}>
              <div className={m.role === 'user' ? 'dock-chat-bubble' : 'dock-chat-reply'}>
                <ReplyText content={m.content} />
              </div>
            </div>
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
            Confira a mensagem do agente ou abra o Terminal para continuar.
          </div>
        )}
      </div>
    </div>
  );
}
