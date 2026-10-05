export function normalizeDeveloperReport(value) {
  if (
    !value ||
    value.version !== 1 ||
    !['passed', 'failed', 'cancelled'].includes(value.status) ||
    typeof value.project !== 'string'
  )
    return undefined;
  const list = (key) => (Array.isArray(value[key]) ? value[key].slice(0, 100) : []);
  return {
    version: 1,
    project: value.project.slice(0, 4096),
    status: value.status,
    repairs: Number.isInteger(value.repairs) ? Math.max(0, Math.min(2, value.repairs)) : 0,
    durationMs: Number.isFinite(value.durationMs) ? Math.max(0, value.durationMs) : 0,
    limited: value.limited === true,
    files: list('files')
      .filter(
        (file) =>
          typeof file.file === 'string' && ['added', 'modified', 'deleted'].includes(file.status),
      )
      .map((file) => ({ file: file.file.slice(0, 4096), status: file.status })),
    checks: list('checks')
      .filter(
        (check) =>
          typeof check.name === 'string' &&
          ['passed', 'failed', 'cancelled', 'skipped'].includes(check.status),
      )
      .map((check) => ({
        name: check.name.slice(0, 256),
        status: check.status,
        code: Number.isInteger(check.code) ? check.code : null,
        durationMs: Number.isFinite(check.durationMs) ? Math.max(0, check.durationMs) : 0,
        output: typeof check.output === 'string' ? check.output.slice(-12000) : '',
      })),
    skipped: list('skipped')
      .filter((check) => typeof check.name === 'string' && typeof check.reason === 'string')
      .map((check) => ({ name: check.name.slice(0, 256), reason: check.reason.slice(0, 2000) })),
    ...(typeof value.error === 'string' ? { error: value.error.slice(-16000) } : {}),
  };
}

export function developerDeliveryText(report) {
  return [
    `Entrega: ${report.status === 'passed' ? 'concluída' : report.status === 'cancelled' ? 'interrompida' : 'precisa de atenção'}`,
    `Projeto: ${report.project}`,
    `Correções automáticas: ${report.repairs}`,
    ...report.files.map((item) => `${item.status}: ${item.file}`),
    ...report.checks.map((item) => `${item.name}: ${item.status}`),
    ...report.skipped.map((item) => `${item.name}: ${item.reason}`),
    ...(report.limited ? ['Inspeção limitada; nem todos os arquivos foram examinados.'] : []),
    ...(report.error ? [report.error] : []),
  ].join('\n');
}
