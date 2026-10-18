import type { MarkLyraEditor, MarkLyraStatistics } from '@marklyra/editor-runtime';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/** Coalesces runtime invalidations; no React-side document traversal or focus changes. */
export function useStatistics(
  editor: RefObject<MarkLyraEditor | null>,
  ready: boolean,
  documentId: string | undefined,
  working: boolean,
  wordsPerMinute: number,
) {
  const [value, setValue] = useState<MarkLyraStatistics | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const observedDocument = useRef(documentId);
  const scheduler = useRef<() => void>(() => {});
  const invalidate = useCallback(() => scheduler.current(), []);
  // A document identity change invalidates even an equal-text statistics result.
  useEffect(() => {
    let alive = true,
      generation = 0,
      running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    if (observedDocument.current !== documentId) {
      observedDocument.current = documentId;
      setValue(null);
    }
    setPending(true);
    setError('');
    const schedule = () => {
      generation++;
      setPending(true);
      setError('');
      if (timer !== undefined) clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (!ready || working || running) return;
      timer = setTimeout(() => {
        timer = undefined;
        if ('requestIdleCallback' in window)
          idle = window.requestIdleCallback(
            () => {
              idle = undefined;
              void query();
            },
            { timeout: 1000 },
          );
        else void query();
      }, 450);
    };
    const query = async () => {
      const instance = editor.current;
      if (!alive || !instance || running || inFlight.current || instance.isComposing) {
        if (alive) schedule();
        return;
      }
      running = true;
      inFlight.current = true;
      const expected = generation;
      try {
        const next = await instance.getStatistics({ wordsPerMinute });
        if (alive && expected === generation && instance === editor.current) {
          setValue(next);
          setError('');
          setPending(false);
        }
      } catch (reason) {
        if (alive && expected === generation) {
          setError(String(reason));
          setPending(false);
        }
      } finally {
        running = false;
        inFlight.current = false;
        if (alive && expected !== generation) schedule();
      }
    };
    scheduler.current = schedule;
    schedule();
    return () => {
      alive = false;
      scheduler.current = () => {};
      if (timer !== undefined) clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [editor, ready, documentId, working, wordsPerMinute]);
  return { value, pending, error, invalidate };
}
