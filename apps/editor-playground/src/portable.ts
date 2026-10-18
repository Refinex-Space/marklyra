import { markdownInsertions } from '@marklyra/editor-extensions';
import { EditorView } from '@marklyra/editor-view';
import '@marklyra/editor-themes/paper.css';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app root');
root.innerHTML = `<header><div><span class="eyebrow">MarkLyra · PORTABLE SDK</span><h1>把注意力留给文字。</h1></div><a href="/portable-react.html">React 示例 ↗</a></header><nav aria-label="编辑命令"><button data-action="bold"><b>B</b></button><button data-action="italic"><i>I</i></button><button data-action="heading">H1</button><button data-action="undo">撤销</button><button data-action="redo">重做</button><span></span><button data-action="load">载入 Markdown</button><button data-action="save">保存 Markdown</button><label class="source-toggle"><input type="checkbox" id="show-source">显示源码</label></nav><main><article id="editor"></article><aside hidden><h2>Markdown source</h2><pre id="source"></pre></aside></main><footer><span id="status">准备就绪</span><span>独立浏览器 SDK · 开发预览</span></footer><input id="file" type="file" accept=".md,.markdown,.txt" hidden>`;
const container = document.querySelector<HTMLElement>('#editor');
if (!container) throw new Error('Missing editor');
const initial =
  '# 把注意力留给文字\n\n这是一个可独立运行的 Markdown 编辑器。光标进入段落时，语法标记会显示。\n\n## 从原文开始\n\n用 **粗体**、*斜体* 与 `code` 组织想法。每次编辑都作用于原始 Markdown 的局部范围。\n\n- 保留原文中的空白与换行\n- 在浏览器中运行，不需要桌面宿主\n- 用撤销和重做恢复内容与选区\n\n> 简单的界面，严格的文档边界。\n\n```typescript\nconst editor = new EditorView(container);\neditor.load(markdown);\n```\n';
const source = document.querySelector<HTMLPreElement>('#source');
const status = document.querySelector<HTMLElement>('#status');
const update = (text: string) => {
  if (source) source.textContent = text;
  if (status) status.textContent = `${text.length} 字符 · ${text.split(/\r\n|\r|\n/).length} 行`;
};
const editor = new EditorView(container, { markdown: initial, onChange: update });
editor.registerExtension(markdownInsertions);
update(initial);
// Deliberate playground-only test/API handle; desktop does not expose a global instance.
Object.assign(window, { playgroundEditor: editor });
document.querySelector('nav')?.addEventListener('mousedown', (event) => {
  if ((event.target as HTMLElement).closest('button')) event.preventDefault();
});
document.querySelector('nav')?.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest('button')?.dataset.action;
  if (action === 'bold') editor.execute({ type: 'toggleMark', marker: '**' });
  if (action === 'italic') editor.execute({ type: 'toggleMark', marker: '*' });
  if (action === 'heading') editor.execute({ type: 'heading', level: 1 });
  if (action === 'undo' || action === 'redo') editor.execute({ type: action });
  if (action === 'load') document.querySelector<HTMLInputElement>('#file')?.click();
  if (action === 'save') {
    const url = URL.createObjectURL(
      new Blob([editor.getMarkdown()], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
document.querySelector<HTMLInputElement>('#show-source')?.addEventListener('change', (event) => {
  const panel = document.querySelector('aside');
  if (panel) panel.hidden = !(event.target as HTMLInputElement).checked;
});
document.querySelector<HTMLInputElement>('#file')?.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    try {
      const bytes = await file.arrayBuffer();
      editor.load(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    } catch {
      if (status) status.textContent = '浏览器示例仅支持 UTF-8；请用桌面版打开 UTF-16 文档。';
    }
  }
  input.value = '';
});
