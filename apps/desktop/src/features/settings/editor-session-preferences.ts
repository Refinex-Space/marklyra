import type { MarkLyraEditorPreferences } from '@marklyra/editor-runtime';

/** These original controls persist for the next WebView. Other settings retain
 * their proven immediate/global or next-CodeMirror lifecycle in the SDK. */
export function editorSessionPreferences(
  current: MarkLyraEditorPreferences,
  startup: MarkLyraEditorPreferences,
): MarkLyraEditorPreferences {
  if (
    current.showLineNumbersForFence === startup.showLineNumbersForFence &&
    current.noLineWrapping === startup.noLineWrapping
  )
    return current;
  return {
    ...current,
    showLineNumbersForFence: startup.showLineNumbersForFence,
    noLineWrapping: startup.noLineWrapping,
  };
}
