export interface ProjectPreview {
  ok: boolean;
  url?: string;
  cwd?: string;
  unavailable?: boolean;
  error?: string;
}
export function createDockProjectService(options: {
  directory: string;
  nodeBinary?: string;
  ownedDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  stopProcess?: (child: import('node:child_process').ChildProcessWithoutNullStreams) => unknown;
  stopProcessOnShutdown?: (
    child: import('node:child_process').ChildProcessWithoutNullStreams,
  ) => unknown;
}): {
  create(options: { petId: string; title: string }): Promise<{ cwd: string }>;
  preview(cwd: string): Promise<ProjectPreview>;
  dispose(shutdown?: boolean): Promise<void>;
};
