// Tenta carregar node-pty pra confirmar que o binário casa com a ABI atual.
try {
  const pty = require('@homebridge/node-pty-prebuilt-multiarch');
  console.log('OK: node-pty loaded');
  console.log('  spawn function exists:', typeof pty.spawn === 'function');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
