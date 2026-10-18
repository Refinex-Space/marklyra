import { type MarkLyraMenuState, menuStyles } from '../menu-state.js';
import type { LegacyGlobals } from './legacy-types.js';

interface StyleFacts {
  inline?: unknown;
  block?: unknown;
  canContainInline?: boolean;
  cannotContainInline?: boolean;
}
/** Read original mode/history/style facts without putBookmark, sync, focus or commands. */
export function readRuntimeMenuState(runtime: LegacyGlobals): MarkLyraMenuState {
  const editor = runtime.editor,
    file = runtime.File;
  if (!editor || !file) throw new Error('编辑器尚未初始化');
  const sourceMode = editor.sourceView.inSourceMode;
  const modes = file as typeof file & { isFocusMode?: boolean; isTypeWriterMode?: boolean };
  const stylize = editor.stylize as typeof editor.stylize & {
    buildBookmark?(): StyleFacts;
    isAtFootnoteDefSpan?(): unknown;
    CONST?: { NormalBlockMap?: Record<string, unknown> };
  };
  let style: StyleFacts = {};
  if (!sourceMode) {
    try {
      style = stylize.buildBookmark?.() ?? {};
    } catch {
      /* No editing range. */
    }
  }
  const inlineStyles = menuStyles(style.inline, 'inline');
  const blockStyles = menuStyles(style.block, 'block');
  const first = blockStyles[0];
  const noInline =
    !!(style.cannotContainInline ?? style.canContainInline) ||
    inlineStyles.includes('inline_math') ||
    (first === 'def_footnote' && !!stylize.isAtFootnoteDefSpan?.());
  const sourceDocument = editor.sourceView.cm?.doc as
    | { historySize?(): { undo: number; redo: number } }
    | undefined;
  const sourceHistory = sourceMode ? sourceDocument?.historySize?.() : undefined;
  return {
    sourceMode,
    focusMode: modes.isFocusMode === true,
    typewriterMode: modes.isTypeWriterMode === true,
    canUndo: sourceMode ? (sourceHistory?.undo ?? 0) > 0 : editor.undo.hasUndo(),
    canRedo: sourceMode ? (sourceHistory?.redo ?? 0) > 0 : editor.undo.hasRedo(),
    locked: file.isLocked === true,
    modalOpen: editor.writingArea.ownerDocument.body.classList.contains('modal-open'),
    inlineAllowed: !sourceMode && !file.isLocked && !noInline && blockStyles.length > 0,
    blockAllowed:
      !sourceMode &&
      !file.isLocked &&
      !!first &&
      stylize.CONST?.NormalBlockMap?.[first] !== undefined,
    inlineStyles,
    blockStyles,
  };
}
