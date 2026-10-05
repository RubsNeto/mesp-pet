import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Server } from 'node:http';
export interface PreviewRuntimeConfig {
  entry: string;
  fingerprint: string;
}
export function readPreviewRuntime(project: string): Promise<PreviewRuntimeConfig | null>;
export function startPreviewRuntime(options: {
  project: string;
  config: PreviewRuntimeConfig;
  nodeBinary?: string;
  ownedDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  stopProcess?: (child: ChildProcessWithoutNullStreams) => unknown;
  stopProcessOnShutdown?: (child: ChildProcessWithoutNullStreams) => unknown;
}): Promise<{
  server: Server;
  child: ChildProcessWithoutNullStreams;
  root: string;
  runtime: string;
  url: string;
  stop(shutdown?: boolean): Promise<void>;
}>;
