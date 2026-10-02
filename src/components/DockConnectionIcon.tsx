export function DockConnectionIcon({ provider }: { provider: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {provider === 'codex' ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="4" />
          <path d="m7 9 3 3-3 3m6 0h4" />
        </>
      ) : provider === 'claude' ? (
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" />
      ) : provider === 'gemini-cli' || provider === 'antigravity' ? (
        <path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z" />
      ) : provider === 'auto' ? (
        <>
          <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
          <path d="M20 2v4m-2-2h4" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      )}
    </svg>
  );
}
