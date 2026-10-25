import type { CursorBookmark } from '../protocol.js';
import { codeLanguageField } from './code-language.js';
import type { LegacyEditor } from './legacy-types.js';

type CM = NonNullable<LegacyEditor['sourceView']['cm']>;
type CMRange = ReturnType<CM['listSelections']>[number];
interface DOMPoint {
  node: Node;
  offset: number;
}
export interface ContextSelection {
  bookmark: CursorBookmark | null;
  anchor?: DOMPoint;
  head?: DOMPoint;
  cm?: CM;
  cmWrapper?: HTMLElement;
  cmDocument?: CM['doc'];
  ranges?: CMRange[];
  primary?: number;
  focusCid: string | null;
  selected: boolean;
  language?: HTMLElement;
}
export function captureContextSelection(editor: LegacyEditor, target: Element): ContextSelection {
  const owner = target.closest('.CodeMirror');
  const candidate: unknown = editor.sourceView.inSourceMode
    ? editor.sourceView.cm
    : owner && Reflect.get(owner, 'CodeMirror');
  const cm =
    candidate &&
    typeof candidate === 'object' &&
    typeof Reflect.get(candidate, 'listSelections') === 'function'
      ? (candidate as CM)
      : undefined;
  if (cm) {
    const wrapper = cm.getWrapperElement();
    if (
      wrapper !== owner ||
      !wrapper.isConnected ||
      wrapper.ownerDocument !== editor.writingArea.ownerDocument ||
      Reflect.get(wrapper, 'CodeMirror') !== cm
    )
      throw Error('无法保存代码编辑器上下文');
    const ranges = cm
      .listSelections()
      .map((range) => ({ anchor: { ...range.anchor }, head: { ...range.head } }));
    const anchor = cm.getCursor('anchor'),
      head = cm.getCursor('head');
    const primary = ranges.findIndex(
      (range) =>
        range.anchor.line === anchor.line &&
        range.anchor.ch === anchor.ch &&
        range.head.line === head.line &&
        range.head.ch === head.ch,
    );
    if (primary < 0) throw Error('无法保存代码编辑器选区');
    return {
      bookmark: null,
      cm,
      cmWrapper: wrapper,
      cmDocument: cm.doc,
      ranges,
      primary,
      focusCid: editor.focusCid,
      selected: ranges.some((r) => r.anchor.line !== r.head.line || r.anchor.ch !== r.head.ch),
    };
  }
  const selection = editor.writingArea.ownerDocument.getSelection();
  const language = codeLanguageField(editor, target);
  const bookmark = language ? null : editor.selection.buildUndo();
  const result: ContextSelection = {
    bookmark: bookmark ? structuredClone(bookmark) : null,
    focusCid: language ? null : editor.focusCid,
    selected: false,
    ...(language ? { language } : {}),
  };
  if (
    selection?.anchorNode &&
    selection.focusNode &&
    selection.rangeCount === 1 &&
    editor.writingArea.contains(selection.anchorNode) &&
    editor.writingArea.contains(selection.focusNode)
  ) {
    result.anchor = { node: selection.anchorNode, offset: selection.anchorOffset };
    result.head = { node: selection.focusNode, offset: selection.focusOffset };
    result.selected = !selection.isCollapsed;
  }
  return result;
}
/** CodeMirror redraws its view nodes without replacing the editor or document. */
export function currentContextCodeMirror(editor: LegacyEditor, saved: ContextSelection): boolean {
  const cm = saved.cm,
    wrapper = saved.cmWrapper;
  if (!cm || !wrapper || !saved.cmDocument) return false;
  return (
    wrapper.isConnected &&
    wrapper.ownerDocument === editor.writingArea.ownerDocument &&
    cm.getWrapperElement() === wrapper &&
    Reflect.get(wrapper, 'CodeMirror') === cm &&
    cm.doc === saved.cmDocument &&
    (editor.sourceView.inSourceMode
      ? editor.sourceView.cm === cm && Boolean(wrapper.closest('#marklyra-source'))
      : editor.writingArea.contains(wrapper))
  );
}
export function restoreContextSelection(editor: LegacyEditor, saved: ContextSelection): void {
  if (saved.language) {
    if (
      codeLanguageField(editor, saved.language) !== saved.language ||
      !saved.anchor ||
      !saved.head ||
      !saved.language.contains(saved.anchor.node) ||
      !saved.language.contains(saved.head.node)
    )
      throw Error('代码语言输入框上下文已改变');
    saved.language.focus();
  }
  if (saved.cm && saved.ranges && saved.primary !== undefined) {
    if (!currentContextCodeMirror(editor, saved)) throw Error('代码编辑器上下文已改变');
    saved.cm.focus();
    saved.cm.setSelections(saved.ranges, saved.primary);
    return;
  }
  if (saved.focusCid && editor.getNode(saved.focusCid)) editor.refocus(saved.focusCid);
  if (saved.bookmark) {
    const bookmark = saved.bookmark;
    // Original HTML focus receipts replay focus immediately and again after
    // 100ms. A menu action can enter and leave its CM in that interval. Restore
    // this proven preview directly, so its retired receipt cannot steal input
    // from the paragraph produced by Enter. Other receipts keep native replay.
    const blocks =
      bookmark.type === 'cursor' &&
      bookmark.focus === 'html_block' &&
      typeof bookmark.id === 'string' &&
      editor.getNode(bookmark.id)?.get('type') === 'html_block'
        ? [...editor.writingArea.querySelectorAll<HTMLElement>('.md-htmlblock[cid]')].filter(
            (block) => block.getAttribute('cid') === bookmark.id,
          )
        : [];
    const preview =
      blocks.length === 1
        ? blocks[0]?.querySelector<HTMLElement>('.md-htmlblock-container[tabindex]')
        : null;
    if (preview?.isConnected) preview.focus();
    else editor.undo.exeCommand(structuredClone(bookmark));
  }
  if (saved.anchor && saved.head) {
    if (
      !editor.writingArea.contains(saved.anchor.node) ||
      !editor.writingArea.contains(saved.head.node)
    )
      throw Error('菜单选区已失效');
    editor.writingArea.ownerDocument
      .getSelection()
      ?.setBaseAndExtent(
        saved.anchor.node,
        saved.anchor.offset,
        saved.head.node,
        saved.head.offset,
      );
  }
}
