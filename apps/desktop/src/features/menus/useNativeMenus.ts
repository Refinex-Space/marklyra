import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { useEffect, useRef, useState } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import { type NativeMenuPresentation, NativeMenuPublisher } from './native-menu-state.js';

export function hostTextInputFocused(editor: MarkLyraEditor | null): boolean {
  const target = document.activeElement;
  return (
    target instanceof HTMLElement &&
    target !== editor?.element &&
    target.matches('input,textarea,select,[contenteditable="true"],[contenteditable=""]')
  );
}

export function useNativeMenus(
  editor: MarkLyraEditor | null,
  snapshot: NativeMenuPresentation,
  context: () => Promise<string>,
  report: (message: string) => void,
): void {
  const latest = useRef({ context, report });
  latest.current = { context, report };
  const publisher = useRef<NativeMenuPublisher | null>(null);
  const [version, setVersion] = useState(0);
  const [textInputFocused, setTextInputFocused] = useState(() => hostTextInputFocused(editor));
  useEffect(() => {
    if (!desktopAvailable) return;
    const current = new NativeMenuPublisher(
      () => latest.current.context(),
      (error) => latest.current.report(`菜单状态未同步：${String(error)}`),
    );
    publisher.current = current;
    return () => {
      current.dispose();
      publisher.current = null;
    };
  }, []);
  useEffect(() => {
    if (!editor) return;
    let alive = true;
    const stop = editor.onMenuStateChange(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [editor]);
  useEffect(() => {
    let alive = true;
    const changed = () =>
      queueMicrotask(() => {
        if (alive) setTextInputFocused(hostTextInputFocused(editor));
      });
    document.addEventListener('focusin', changed);
    document.addEventListener('focusout', changed);
    changed();
    return () => {
      alive = false;
      document.removeEventListener('focusin', changed);
      document.removeEventListener('focusout', changed);
    };
  }, [editor]);
  const signature = JSON.stringify({ ...snapshot, textInputFocused });
  // A serialized presentation suppresses unrelated Shell/statistics renders.
  // Composition deliberately increments version even when style facts match.
  // biome-ignore lint/correctness/useExhaustiveDependencies: composition eligibility must publish even when the style snapshot is unchanged.
  useEffect(() => {
    publisher.current?.publish(JSON.parse(signature) as NativeMenuPresentation);
  }, [signature, version]);
}
