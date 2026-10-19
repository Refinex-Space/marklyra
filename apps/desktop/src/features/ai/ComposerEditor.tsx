import type { ClipboardEvent, KeyboardEvent } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { encodeDocumentPath } from './model.js';

interface Point {
  node: Node;
  offset: number;
}
interface Segment {
  text: string;
  start: Point;
  end: Point;
  literal: boolean;
  reference?: boolean;
  path?: string;
}
function segments(root: Node): Segment[] {
  const result: Segment[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      result.push({
        text,
        start: { node, offset: 0 },
        end: { node, offset: text.length },
        literal: true,
      });
      return;
    }
    if (node instanceof HTMLElement && node.dataset.reference !== undefined) {
      const parent = node.parentNode;
      if (!parent) return;
      const index = [...parent.childNodes].indexOf(node);
      result.push({
        text: `[${node.textContent ?? ''}](${encodeDocumentPath(node.dataset.reference)})`,
        start: { node: parent, offset: index },
        end: { node: parent, offset: index + 1 },
        literal: false,
        reference: true,
        path: node.dataset.reference,
      });
      return;
    }
    const children = [...node.childNodes];
    if (children.length === 1 && children[0]?.nodeName === 'BR') return;
    children.forEach((child, index) => {
      if (child.nodeName === 'BR') {
        if (index === children.length - 1 && children[index - 1]?.nodeName === 'BR') return;
        result.push({
          text: '\n',
          start: { node, offset: index },
          end: { node, offset: index + 1 },
          literal: false,
        });
      } else {
        if (index > 0 && ['DIV', 'P'].includes(child.nodeName))
          result.push({
            text: '\n',
            start: { node, offset: index },
            end: { node, offset: index },
            literal: false,
          });
        visit(child);
      }
    });
  };
  visit(root);
  return result;
}
export function composerText(root: Node) {
  return segments(root)
    .map((item) => item.text)
    .join('');
}
function pointAt(root: Node, offset: number): Point {
  let remaining = offset;
  for (const item of segments(root)) {
    if (remaining <= item.text.length)
      return item.literal
        ? { node: item.start.node, offset: Math.max(0, remaining) }
        : remaining === 0
          ? item.start
          : item.end;
    remaining -= item.text.length;
  }
  return { node: root, offset: root.childNodes.length };
}
export interface ComposerHandle {
  focus: () => void;
  insertText: (text: string) => boolean;
  insertMention: (path: string, from: number, to: number) => void;
}
export const ComposerEditor = forwardRef<
  ComposerHandle,
  {
    value: string;
    disabled: boolean;
    activeMention?: string;
    change: (value: string, caret: number, mentionBoundary: number, paths: string[]) => void;
    keyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    paste: (event: ClipboardEvent<HTMLDivElement>) => void;
    open: (path: string) => void;
  }
>(function ComposerEditor({ value, disabled, activeMention, change, keyDown, paste, open }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const saved = useRef<Range | null>(null);
  const callbacks = useRef({ change, open });
  callbacks.current = { change, open };
  const publish = () => {
    const element = root.current;
    if (!element) return;
    const selection = getSelection();
    let caret = composerText(element).length;
    let mentionBoundary = 0;
    if (selection?.rangeCount && element.contains(selection.focusNode)) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.setEnd(selection.focusNode as Node, selection.focusOffset);
      const prefix = segments(range.cloneContents());
      let offset = 0;
      for (const part of prefix) {
        offset += part.text.length;
        if (part.reference) mentionBoundary = offset;
      }
      caret = offset;
      saved.current = selection.getRangeAt(0).cloneRange();
    }
    const text = composerText(element);
    element.dataset.empty = String(!text);
    if (!composing.current)
      callbacks.current.change(text, caret, mentionBoundary, [
        ...new Set(segments(element).flatMap((part) => (part.path ? [part.path] : []))),
      ]);
  };
  const restore = () => {
    const element = root.current;
    const modal = document.querySelector('dialog[open]');
    if (
      !element ||
      disabled ||
      element.closest('[hidden], [inert]') ||
      (modal && !modal.contains(element))
    )
      return false;
    element.focus();
    const selection = getSelection();
    const range =
      saved.current && element.contains(saved.current.startContainer)
        ? saved.current
        : document.createRange();
    if (range !== saved.current) {
      range.selectNodeContents(element);
      range.collapse(false);
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.activeElement === element;
  };
  useImperativeHandle(ref, () => ({
    focus: restore,
    insertText: (text) => {
      if (disabled || composing.current || !restore()) return false;
      document.execCommand('insertText', false, text);
      publish();
      return true;
    },
    insertMention: (path, from, to) => {
      const element = root.current;
      if (!element || disabled || composing.current) return;
      const start = pointAt(element, from),
        end = pointAt(element, to);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      element.focus();
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const anchor = document.createElement('a');
      anchor.textContent = path.split('/').at(-1) ?? path;
      anchor.href = `#document:${encodeURIComponent(path)}`;
      anchor.dataset.reference = path;
      anchor.contentEditable = 'false';
      anchor.draggable = false;
      anchor.title = path;
      document.execCommand('insertHTML', false, `${anchor.outerHTML}&nbsp;`);
      publish();
    },
  }));
  useLayoutEffect(() => {
    const element = root.current;
    if (element && !composing.current && composerText(element) !== value) {
      element.textContent = value;
      element.dataset.empty = String(!value);
      saved.current = null;
      callbacks.current.change(value, value.length, 0, []);
      if (document.activeElement === element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        saved.current = range;
      }
    }
  }, [value]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: this resident listener reads the current callbacks and DOM through refs.
  useEffect(() => {
    const listener = () => {
      if (root.current?.contains(getSelection()?.focusNode ?? null)) publish();
    };
    document.addEventListener('selectionchange', listener);
    return () => document.removeEventListener('selectionchange', listener);
  }, []);
  return (
    // biome-ignore lint/a11y/useSemanticElements: document mentions require a resident rich contenteditable textbox.
    <div
      ref={root}
      className="ai-composer-editor"
      role="textbox"
      aria-label="发送给 AI 的消息"
      aria-multiline="true"
      aria-disabled={disabled}
      aria-controls={activeMention ? 'ai-mentions' : undefined}
      aria-activedescendant={activeMention}
      data-placeholder="发送消息，@ 提及文档"
      data-empty="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      tabIndex={0}
      onInput={publish}
      onPaste={paste}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        publish();
      }}
      onKeyDown={(event) => {
        if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          return;
        }
        if (event.key === 'Enter' && event.shiftKey) {
          event.preventDefault();
          document.execCommand('insertLineBreak');
          publish();
          return;
        }
        keyDown(event);
      }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLElement>('[data-reference]');
        if (anchor?.dataset.reference) {
          event.preventDefault();
          callbacks.current.open(anchor.dataset.reference);
        }
      }}
    />
  );
});
