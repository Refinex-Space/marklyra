import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopAvailable } from './documents.js';

export function editorWindowIdentity() {
  const label = desktopAvailable ? getCurrentWindow().label : 'main';
  return {
    label,
    primary: label === 'main',
    draftKey: label === 'main' ? 'marklyra-draft' : `marklyra-draft:${label}`,
  };
}

export const editorWindows = {
  isFocused: () =>
    desktopAvailable
      ? invoke<boolean>('editor_window_focused')
      : Promise.resolve(document.hasFocus()),
  ready: () => invoke<void>('editor_window_ready'),
  create: (kind: 'document' | 'window' | 'tab' | 'open' = 'window') =>
    invoke<string>('create_editor_window', { kind }),
  tab: (action: 'next' | 'previous' | 'detach' | 'merge' | 'toggle') =>
    invoke<void>('native_tab_action', { action }),
  backup: (quitToken: string | null = null) => invoke<void>('backup_editor_session', { quitToken }),
  close: (quitToken: string | null) => invoke<void>('close_editor_window', { quitToken }),
  cancelQuit: (token: string) => invoke<void>('cancel_application_quit', { token }),
};
