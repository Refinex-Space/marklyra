import type { MarkLyraCommand, MarkLyraMenuState } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';

export interface NativeMenuPresentation {
  ready: boolean;
  blocked: boolean;
  editor: MarkLyraMenuState | null;
  sidebar: boolean;
  sidebarTab: 'files' | 'outline' | 'search';
  outlinePanelOpen?: boolean;
  fileView: 'tree' | 'articles';
  fullscreen: boolean;
  statisticsOpen: boolean;
  availableFormats?: readonly string[];
  canImport?: boolean;
  /** The open document is saved on disk and its file can be renamed. */
  canRename?: boolean;
  textInputFocused?: boolean;
}
/** Same state rules as the original menus and Rust; a stale native check is no authority. */
export function nativeMenuCommandAllowed(
  state: MarkLyraMenuState | null,
  command: MarkLyraCommand,
  textInputFocused = false,
): boolean {
  if (!state || state.modalOpen) return false;
  if (textInputFocused && command.type !== 'find') return false;
  switch (command.type) {
    case 'undo':
      return !state.locked && state.canUndo;
    case 'redo':
      return !state.locked && state.canRedo;
    case 'toggleSource':
      return !state.locked;
    case 'toggleFocus':
    case 'toggleTypewriter':
    case 'find':
      return true;
    case 'format':
      return !state.locked && !state.sourceMode && state.inlineAllowed;
    case 'heading':
    case 'insertTable':
    case 'horizontalRule':
      return !state.locked && !state.sourceMode && state.blockAllowed;
    case 'list':
    case 'codeBlock':
    case 'mathBlock':
    case 'indent':
    case 'outdent':
      return (
        !state.locked &&
        !state.sourceMode &&
        (!state.blockStyles.includes('meta_block') || state.blockAllowed)
      );
    default:
      return true;
  }
}

/** Serial belongs to the registered native command context, never a document path. */
export class NativeMenuPublisher {
  private serial = 0;
  private disposed = false;
  constructor(
    private readonly context: () => Promise<string>,
    private readonly report: (error: unknown) => void,
    private readonly send: (
      snapshot: NativeMenuPresentation & { context: string; serial: number },
    ) => Promise<void> = (snapshot) => invoke('sync_editor_menu_state', { snapshot }),
  ) {}
  publish(value: NativeMenuPresentation): void {
    const serial = ++this.serial;
    const snapshot = {
      ...value,
      availableFormats: [...(value.availableFormats ?? [])],
      canImport: value.canImport === true,
      canRename: value.canRename === true,
      editor: value.editor
        ? {
            ...value.editor,
            inlineStyles: [...value.editor.inlineStyles],
            blockStyles: [...value.editor.blockStyles],
          }
        : null,
    };
    void this.context()
      .then(async (context) => {
        if (!this.disposed) await this.send({ ...snapshot, context, serial });
      })
      .catch((error: unknown) => {
        if (!this.disposed) this.report(error);
      });
  }
  dispose(): void {
    this.disposed = true;
  }
}
