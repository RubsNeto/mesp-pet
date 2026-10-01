export interface RouterPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RouterPanelSection {
  id: string;
  path: string;
  label: string;
  group: string;
}
export interface RouterPanelState {
  page: string;
  loading: boolean;
  canGoBack: boolean;
  error?: string;
}
export const ROUTER_PANEL_SECTIONS: RouterPanelSection[];
export const ROUTER_COMPACT_CSS: string;
export const ROUTER_CATALOG_SCRIPT: string;
export function routerPanelSection(value: unknown): RouterPanelSection;
export function routerPanelPage(pathname: string): string;
export function routerPanelBounds(
  raw: unknown,
  size: { width: number; height: number },
): RouterPanelRect | null;
