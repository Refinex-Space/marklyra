/** Whether shortcuts read ⌘ (macOS) or Ctrl (Windows, Linux). */
export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as the platform writes it: `⌘V` on macOS, `Ctrl+V` elsewhere. */
export const shortcut = (key: string): string => (isMac() ? `⌘${key}` : `Ctrl+${key}`);
