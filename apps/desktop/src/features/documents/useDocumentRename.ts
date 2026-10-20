import { useCallback, useEffect, useRef, useState } from 'react';
import { documents } from '../../services/documents.js';
import { checkFileName } from './rename-model.js';

/** Viewport rectangle the popover hangs from: the title, or where the native title sits. */
export interface TitleAnchor {
  left: number;
  right: number;
  bottom: number;
}
export interface RenameState {
  anchor: TitleAnchor;
  name: string;
  busy: boolean;
  error: string;
}
interface Options {
  /** The open document and where it is saved; null for an untitled or trashed document. */
  file: { id: string; path: string } | null;
  /** Another document operation owns the window right now. */
  disabled: boolean;
  windows: boolean;
  /** Settle the editor (flush pending input) before the file moves; throws when it cannot. */
  prepare(): Promise<void>;
  onRenamed(warnings: string[]): void;
  onCancelled(): void;
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}
function reason(error: unknown): string {
  return String(error instanceof Error ? error.message : error).replace(/^Error:\s*/, '');
}

/** Renaming the open document's file from its title; the host does the actual move. */
export function useDocumentRename(options: Options) {
  const [state, setState] = useState<RenameState | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<string | null>(null);
  const canRename = options.file !== null && !options.disabled;

  const close = useCallback(() => {
    active.current = null;
    setState(null);
  }, []);

  // Switching to another document ends a rename that was still being typed.
  const documentId = options.file?.id ?? null;
  useEffect(() => {
    if (active.current !== null && active.current !== documentId) close();
  }, [documentId, close]);

  const begin = useCallback((anchor: TitleAnchor) => {
    const { file, disabled } = latest.current;
    if (!file || disabled || active.current) return false;
    active.current = file.id;
    setState({ anchor, name: fileNameOf(file.path), busy: false, error: '' });
    return true;
  }, []);

  const cancel = useCallback(() => {
    if (!active.current) return;
    close();
    latest.current.onCancelled();
  }, [close]);

  const commit = useCallback(
    async (value: string) => {
      const { file, windows } = latest.current;
      const target = active.current;
      if (!file || file.id !== target) return;
      const current = fileNameOf(file.path);
      const checked = checkFileName(value, current, windows);
      if ('error' in checked) {
        setState((previous) => previous && { ...previous, error: checked.error });
        return;
      }
      if (checked.name === current) {
        cancel();
        return;
      }
      setState((previous) => previous && { ...previous, busy: true, error: '' });
      try {
        await latest.current.prepare();
        const receipt = await documents.renameFile(file.id, checked.name, crypto.randomUUID());
        if (active.current !== target) return;
        close();
        latest.current.onRenamed(receipt.warnings);
      } catch (failure) {
        if (active.current !== target) return;
        setState((previous) => previous && { ...previous, busy: false, error: reason(failure) });
      }
    },
    [cancel, close],
  );

  const clearError = useCallback(
    () => setState((previous) => (previous?.error ? { ...previous, error: '' } : previous)),
    [],
  );

  return { state, canRename, begin, commit, cancel, clearError };
}
