export interface ProjectPreview {
  ok: boolean;
  url?: string;
  cwd?: string;
  unavailable?: boolean;
  error?: string;
}
export function createDockProjectService(options: { directory: string }): {
  create(options: { petId: string; title: string }): Promise<{ cwd: string }>;
  preview(cwd: string): Promise<ProjectPreview>;
  dispose(): void;
};
