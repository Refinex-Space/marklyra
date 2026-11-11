import { MarkLyraEditor, type MarkLyraEditorOptions } from '@marklyra/editor-runtime';
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';
import { type DescriptionTarget, descriptionTarget } from './description-target.js';

/** What the window lends the task page to run a description in the same editor as notes. */
export type DescriptionEditorSetup = Pick<
  MarkLyraEditorOptions,
  'runtimeUrl' | 'preferences' | 'markdownPreferences' | 'host'
> & { configuration: NonNullable<MarkLyraEditorOptions['configuration']> };

/** One edit session: the task and the text it started from, so a late save goes to the right file. */
export interface DescriptionSession {
  taskId: string;
  revision: string;
  original: string;
  /** Height the rendered description had, in px; the editor opens at about that size. */
  height?: number;
}

const idle = (work: () => void) => {
  if ('requestIdleCallback' in window) {
    const handle = window.requestIdleCallback(work, { timeout: 500 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(work, 60);
  return () => clearTimeout(handle);
};

/**
 * The task description in the note editor: the same editing surface as notes, with its
 * selection menu, slash commands, input methods and history. One instance is created once the
 * page has painted and kept, undisplayed, for as long as the workbench keeps the page (across
 * tasks and back to the list), so starting an edit only loads text into it. Leaving the frame
 * (or ⌘S, routed by the window) saves.
 */
export function DescriptionEditor({
  setup,
  session,
  onSave,
  onClose,
  onUnavailable,
}: {
  setup: DescriptionEditorSetup;
  /** Set while editing; `null` keeps the warm instance hidden. */
  session: DescriptionSession | null;
  onSave(session: DescriptionSession, text: string): Promise<boolean>;
  onClose(): void;
  /** The runtime could not start; the page falls back to plain text editing. */
  onUnavailable(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<MarkLyraEditor | null>(null);
  const [shown, setShown] = useState(false);
  /** The text's own height and caret as the runtime reports them; the frame follows the height. */
  const [metrics, setMetrics] = useState<{
    height: number;
    caret: { top: number; bottom: number } | null;
  }>({ height: 0, caret: null });
  const contentHeight = metrics.height;
  // The frame never scrolls, so the page around it keeps the caret in view while typing.
  useLayoutEffect(() => {
    const caret = metrics.caret;
    const frame = box.current;
    const scroller = frame?.closest<HTMLElement>('.task-page');
    if (!caret || !frame || !scroller || !editor || document.activeElement !== editor.element)
      return;
    const top = frame.getBoundingClientRect().top + 1;
    const view = scroller.getBoundingClientRect();
    const margin = 32;
    if (top + caret.bottom > view.bottom - margin)
      scroller.scrollTop += top + caret.bottom - (view.bottom - margin);
    else if (top + caret.top < view.top + margin)
      scroller.scrollTop -= view.top + margin - (top + caret.top);
  }, [metrics, editor]);
  /** A save still reading the frame; the frame is destroyed only after it. */
  const flushing = useRef<Promise<unknown> | null>(null);
  const latest = useRef({ onSave, onClose, onUnavailable, session });
  latest.current = { onSave, onClose, onUnavailable, session };
  const theme = setup.configuration.theme;

  // An edit session loads the text, takes focus and registers for ⌘S and the format commands.
  useEffect(() => {
    if (!editor || !session) {
      setShown(false);
      return;
    }
    let alive = true;
    let closing = false;
    const finish = async (close: boolean) => {
      if (closing) return;
      const text = await editor.flush();
      const saved = await latest.current.onSave(session, text);
      if (close && saved && alive) {
        closing = true;
        latest.current.onClose();
      }
    };
    const target: DescriptionTarget = { editor, save: () => finish(false) };
    void (async () => {
      // Laid out while undisplayed, the text is loaded again now that the frame has a size.
      await editor.load(session.original);
      if (!alive) return;
      setShown(true);
      descriptionTarget.set(target);
      await editor.focus();
    })();
    // Focus back in this window means the person left the description.
    const left = () =>
      setTimeout(() => {
        if (alive && document.hasFocus() && document.activeElement !== editor.element)
          void finish(true);
      });
    window.addEventListener('focus', left);
    document.addEventListener('focusin', left);
    return () => {
      alive = false;
      window.removeEventListener('focus', left);
      document.removeEventListener('focusin', left);
      descriptionTarget.release(target);
      // Switching task or page mid-edit still keeps what was typed.
      if (!closing)
        flushing.current = editor
          .flush()
          .then((text) => {
            if (text !== session.original) void latest.current.onSave(session, text);
          })
          .catch(() => {});
    };
  }, [editor, session]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new base theme or runtime needs a new frame; the rest are read when it starts.
  useEffect(() => {
    let alive = true;
    let instance: MarkLyraEditor | null = null;
    const cancel = idle(() => {
      if (!alive || !box.current) return;
      try {
        instance = new MarkLyraEditor(box.current, {
          ...setup,
          markdown: latest.current.session?.original ?? '',
          onError: () => {},
          onContentHeightChange: (height, caret) => alive && setMetrics({ height, caret }),
        });
        instance.element.title = '任务描述';
        // The window's rules for the document frame (full-width, stacking) are not for this one.
        instance.element.className = 'task-desc-iframe';
      } catch {
        latest.current.onUnavailable();
        return;
      }
      instance.ready.then(
        () => alive && setEditor(instance),
        () => alive && latest.current.onUnavailable(),
      );
    });
    return () => {
      alive = false;
      cancel();
      const frame = instance;
      if (flushing.current) void flushing.current.finally(() => frame?.destroy());
      else frame?.destroy();
      setEditor(null);
    };
  }, [setup.runtimeUrl, theme]);

  const waiting = session !== null && !shown;
  // Until the runtime measures the text at its real width, keep the preview's height.
  const height = Math.max(72, shown && contentHeight ? contentHeight : (session?.height ?? 0) + 30);
  return (
    <div
      className={session ? 'task-desc-editor editing' : 'task-desc-editor'}
      data-shown={shown}
      style={{ '--task-desc-height': `${height}px` } as CSSProperties}
    >
      {waiting && (
        <Skeleton className="task-desc-skeleton" label="正在打开描述编辑器">
          <SkeletonBar width="72%" height={12} />
          <SkeletonBar width="48%" height={12} />
        </Skeleton>
      )}
      <div ref={box} className="task-desc-frame" aria-hidden={!shown} />
    </div>
  );
}
