import type { MarkLyraCommand, RuntimeConfiguration } from '@marklyra/editor-runtime';

export const runtimeUrl = 'http://127.0.0.1:4174/index.html';
export const initialMarkdown =
  '# MarkLyra Markdown\n\n进入 **粗体** 或 *斜体*，查看编辑器的标记与选区行为。\n\n## 表格与列表\n\n| 能力 | 验证 |\n| :--- | ---: |\n| 表格单元格 | 逐项对照 |\n| 原始代码围栏 | 逐项对照 |\n\n- [x] 编辑 Markdown 文稿\n- [ ] 探索编辑功能\n  - 保留嵌套结构\n\n## 代码、公式与图表\n\n```typescript\nconst editor = new MarkLyraEditor(container, options);\nawait editor.ready;\n```\n\n$$\nE = mc^2\n$$\n\n```mermaid\ngraph LR\n Source --> Model --> View\n```\n\n一条脚注[^note]，以及源文件中未修改的空白。\n\n[^note]: 运行资源与可发布代码分别管理。\n';

export const demoCommands: readonly { action: string; label: string; command: MarkLyraCommand }[] =
  [
    { action: 'undo', label: '撤销', command: { type: 'undo' } },
    { action: 'redo', label: '重做', command: { type: 'redo' } },
    { action: 'bold', label: '粗体', command: { type: 'format', style: 'strong' } },
    { action: 'italic', label: '斜体', command: { type: 'format', style: 'em' } },
    { action: 'table', label: '表格', command: { type: 'insertTable' } },
    { action: 'code', label: '代码', command: { type: 'codeBlock' } },
    { action: 'math', label: '公式', command: { type: 'mathBlock' } },
    { action: 'source', label: '源码模式', command: { type: 'toggleSource' } },
  ];
export const themes: readonly RuntimeConfiguration['theme'][] = [
  'github',
  'gothic',
  'night',
  'newsprint',
  'pixyll',
  'whitey',
];
export function isTheme(value: string): value is RuntimeConfiguration['theme'] {
  return themes.some((theme) => theme === value);
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
