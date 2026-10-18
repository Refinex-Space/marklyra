import { type EditorOptions, EditorView } from '@marklyra/editor-view';
import { useEffect, useRef } from 'react';
export interface MarkdownEditorProps extends EditorOptions {
  onReady?: (editor: EditorView) => void;
  className?: string;
}
/** Uncontrolled initial Markdown; use the exposed EditorView to load subsequent files. */
export function MarkdownEditor(props: MarkdownEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!container.current) return;
    const editor = new EditorView(container.current, {
      markdown: latest.current.markdown ?? '',
      ariaLabel: latest.current.ariaLabel ?? 'Markdown 编辑器',
      onChange: (text) => latest.current.onChange?.(text),
      onSelectionChange: (selection) => latest.current.onSelectionChange?.(selection),
    });
    latest.current.onReady?.(editor);
    return () => editor.destroy();
  }, []);
  return <div ref={container} className={props.className} />;
}
export { MarkLyraMarkdownEditor, type MarkLyraMarkdownEditorProps } from './runtime.js';
