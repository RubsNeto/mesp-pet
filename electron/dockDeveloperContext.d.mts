import type { DeveloperProfile, DeveloperCheck } from './dockDeveloper.mjs';
export interface DeveloperContext {
  repository: null | {
    root: string;
    branch: string;
    head: string;
    status: string;
    parentRepository: boolean;
  };
  packages: Array<{
    directory: string;
    name: string;
    scripts: Record<string, string>;
    manager?: string;
    dependencies: Record<string, string>;
  }>;
  packageFiles: string[];
  nestedInstructions: Array<{ file: string; text: string }>;
  documents: Array<{ file: string; text: string }>;
  environment: string[];
  dependenciesInstalled: boolean;
  pythonTestFramework: 'pytest' | 'unittest' | null;
  manifests: string[];
}
export function inspectDeveloperContext(root: string, files: string[]): Promise<DeveloperContext>;
export function additionalDeveloperChecks(profile: DeveloperProfile): DeveloperCheck[];
