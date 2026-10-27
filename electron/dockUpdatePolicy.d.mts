export type UpdateMode = 'auto' | 'manual' | 'off';
export function updateMode(options: {
  packaged: boolean;
  platform: NodeJS.Platform;
  appImage?: string;
}): UpdateMode;
export function isNewerVersion(current: string, candidate: string): boolean;
