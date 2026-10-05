import { useState } from 'react';
import type { DeveloperReport } from '../../electron/dockDeveloper.mjs';
import { developerDeliveryText } from '../services/developerDelivery.mjs';

const checkLabels = {
  passed: 'Passou',
  failed: 'Falhou',
  skipped: 'Não executado',
  cancelled: 'Interrompido',
};
const fileLabels: Record<string, string> = {
  added: 'Criado',
  modified: 'Alterado',
  deleted: 'Removido',
};

export function DockDelivery({
  report,
  requestId,
}: {
  report: DeveloperReport;
  requestId?: string;
}) {
  const [feedback, setFeedback] = useState('');
  const passed = report.checks.filter((check) => check.status === 'passed').length;
  const skipped =
    report.skipped.length + report.checks.filter((check) => check.status === 'skipped').length;
  return (
    <section className={`dock-delivery status-${report.status}`} aria-label="Entrega verificada">
      <details>
        <summary>
          <span className="dock-delivery-dot" aria-hidden="true" />
          <span>
            {report.status === 'passed'
              ? 'Entrega concluída'
              : report.status === 'failed'
                ? 'Entrega precisa de atenção'
                : 'Entrega interrompida'}
            <small>
              {report.files.length} mudanças em arquivos · {passed} verificações passaram
              {skipped ? ` · ${skipped} não executadas` : ''}
            </small>
          </span>
          <time>{Math.round(report.durationMs / 1000)}s</time>
        </summary>
        <div className="dock-delivery-body">
          <p title={report.project}>{report.project}</p>
          {report.repairs > 0 && <p>{report.repairs} correções automáticas antes desta entrega.</p>}
          {report.limited && (
            <p>A inspeção tem limites. Esta lista mostra os arquivos observados.</p>
          )}
          {report.files.length > 0 ? (
            <ul>
              {report.files.map((item) => (
                <li key={item.file}>
                  <span>{fileLabels[item.status]}</span>
                  <code>{item.file}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma mudança de arquivo foi observada nesta pasta.</p>
          )}
          {report.checks.length === 0 && (
            <p>Nenhum teste automático disponível foi executado. Confira a resposta do agente.</p>
          )}
          {report.checks.map((check, index) => (
            <details className="dock-delivery-check" key={`${check.name}-${index}`}>
              <summary>
                <span className={`dock-delivery-check-dot status-${check.status}`} />
                <span>{check.name}</span>
                <small>{checkLabels[check.status]}</small>
              </summary>
              <pre>{check.output || 'Sem saída de texto.'}</pre>
            </details>
          ))}
          {report.skipped.map((check, index) => (
            <p key={`skip-${index}`}>
              <strong>{check.name}:</strong> {check.reason}
            </p>
          ))}
          {report.error && <pre>{report.error}</pre>}
          <div className="dock-delivery-actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  const ok = await window.mesp?.clipboardWriteText(developerDeliveryText(report));
                  setFeedback(ok ? 'Entrega copiada.' : 'Não foi possível copiar.');
                } catch {
                  setFeedback('Não foi possível copiar.');
                }
              }}
            >
              Copiar entrega
            </button>
            {requestId && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await window.mesp?.exportDeveloperReport(requestId, report);
                    setFeedback(
                      result?.ok
                        ? `Relatório salvo: ${result.path}`
                        : result?.error || 'Não foi possível salvar.',
                    );
                  } catch {
                    setFeedback('Não foi possível salvar.');
                  }
                }}
              >
                Salvar relatório
              </button>
            )}
          </div>
          <p role="status">{feedback}</p>
        </div>
      </details>
    </section>
  );
}
