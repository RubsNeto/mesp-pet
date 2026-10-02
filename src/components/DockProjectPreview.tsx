import { useEffect, useState } from 'react';

export function DockProjectPreview({ cwd }: { cwd: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void window.mesp
      ?.previewDockProject(cwd)
      .then((result) => {
        if (!active) return;
        if (result.ok && result.url) setUrl(result.url);
        else if (!result.unavailable) setError(result.error || 'Não foi possível abrir a prévia.');
      })
      .catch(() => {
        if (active) setError('Não foi possível abrir a prévia.');
      });
    return () => {
      active = false;
    };
  }, [cwd]);
  if (!url)
    return error ? (
      <p className="dock-preview-error" role="status">
        {error}
      </p>
    ) : null;
  return (
    <div className="dock-project-preview" aria-label="Resultado do projeto">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          event.preventDefault();
          void window.mesp?.openExternal(url).then((ok) => {
            if (!ok) setError('Não foi possível abrir o navegador. Você pode copiar o link.');
          });
        }}
      >
        Abrir site
      </a>
      <button title={cwd} onClick={() => void window.mesp?.openProjectFolder(cwd)}>
        Abrir pasta
      </button>
      <small>Prévia local · disponível enquanto o MESP estiver aberto</small>
      <input
        aria-label="Link do site"
        value={url}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      {error && <span role="status">{error}</span>}
    </div>
  );
}
