export function chooseRouterDataDirectory(options: {
  ownDirectory: string;
  appData: string;
  isolated?: boolean;
}): { directory: string; source: 'mesp' | '9router' };
