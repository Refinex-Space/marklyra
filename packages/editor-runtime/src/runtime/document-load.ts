/** Mode handoff for an ordinary replacement document, never snapshot restore.
 * File.loadFile resets the model but leaves source CodeMirror intact.
 * Use the mode transitions so its private dirty flag and CM history
 * are reset together instead of guessing that setValue is a complete reset. */
interface SourceView {
  inSourceMode: boolean;
  hide(): void;
  show(): void;
}
interface Runtime {
  editor?: { sourceView: SourceView; writingArea: { childElementCount: number } };
}
interface SourceModeLoad {
  view: SourceView;
  area: { childElementCount: number };
}

/** Call while runtime notifications are suspended, before replacing image or
 * document context. The caller's already-captured native snapshot owns rollback. */
export function beginDocumentLoad(runtime: Runtime): SourceModeLoad | undefined {
  const editor = runtime.editor;
  const view = editor?.sourceView;
  if (!editor || !view?.inSourceMode) return undefined;
  view.hide();
  return { view, area: editor.writingArea };
}

/** Call only after a successful ordinary File.loadFile, still under loading.
 * Reset queues a same-window setTimeout(0) DOM write for large Mac
 * HTML and initially leaves #write empty. Only that still-empty DOM needs a
 * later timer in the same queue; the ordinary small-document path synchronously
 * resumes source mode without introducing an extra input task. The old CM is
 * hidden during native replacement, never left as a stale typing target.
 * There is no wait in the WYSIWYG path, no global timer interception, and errors
 * propagate to the existing snapshot rollback. */
export async function finishDocumentLoad(load: SourceModeLoad): Promise<void> {
  if (!load.area.childElementCount) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!load.area.childElementCount) throw new Error('Document DOM commit did not complete');
  }
  load.view.show();
}
