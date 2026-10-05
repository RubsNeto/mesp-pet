import { createHash } from 'node:crypto';
import process from 'node:process';

// A stable browser origin preserves localStorage/IndexedDB when MESP restarts.
export async function listenPreviewServer(server, project) {
  const identity = process.platform === 'win32' ? project.toLowerCase() : project;
  const first = 20000 + (createHash('sha256').update(identity).digest().readUInt32BE(0) % 20000);
  for (let port = first; port <= 65535; port++) {
    const error = await new Promise((resolve) => {
      const failed = (error) => {
        server.removeListener('listening', ready);
        resolve(error);
      };
      const ready = () => {
        server.removeListener('error', failed);
        resolve(null);
      };
      server.once('error', failed);
      server.once('listening', ready);
      server.listen(port, '127.0.0.1');
    });
    if (!error) return;
    if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') throw error;
  }
  throw new Error('Nenhuma porta local disponível para a prévia.');
}
