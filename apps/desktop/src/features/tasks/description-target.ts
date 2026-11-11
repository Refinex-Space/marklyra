import type { MarkLyraEditor } from '@marklyra/editor-runtime';

/**
 * The task description editor that is open for editing, if any. The window routes native
 * editing commands (format, history, save) to it while its frame has focus; otherwise they go
 * to the document, which the workbench covers and blocks.
 */
export interface DescriptionTarget {
  editor: MarkLyraEditor;
  /** Saves the description now (⌘S). */
  save(): Promise<void>;
}

let current: DescriptionTarget | null = null;
const listeners = new Set<() => void>();

export const descriptionTarget = {
  get: () => current,
  set(target: DescriptionTarget | null) {
    if (current === target) return;
    current = target;
    for (const listener of listeners) listener();
  },
  /** Clears only the given target, so a late cleanup cannot drop a newer one. */
  release(target: DescriptionTarget) {
    if (current === target) descriptionTarget.set(null);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The target whose frame holds focus right now. */
export const focusedDescription = (): DescriptionTarget | null => {
  const target = current;
  return target && document.activeElement === target.editor.element ? target : null;
};
