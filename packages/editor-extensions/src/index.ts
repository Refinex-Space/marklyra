import type { EditorExtension } from '@marklyra/editor-view';
/** Concrete optional commands. Advanced table/math rendering is a separate milestone. */
export const markdownInsertions: EditorExtension = {
  id: 'markdown-insertions',
  commands: {
    'insert-task': (editor) => editor.execute({ type: 'insertText', text: '- [ ] ' }),
    'insert-table': (editor) =>
      editor.execute({
        type: 'insertText',
        text: '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n',
      }),
    'insert-code': (editor) => editor.execute({ type: 'insertText', text: '```\n\n```' }),
  },
};
