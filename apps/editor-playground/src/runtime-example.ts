import { MarkLyraEditor } from '@marklyra/editor-runtime';
import { BrowserDocumentController } from './browser-document.js';
import {
  demoCommands,
  errorMessage,
  initialMarkdown,
  isTheme,
  runtimeUrl,
  themes,
} from './runtime-demo.js';
import './runtime.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing app root');
root.innerHTML = `<header><strong>MarkLyra</strong><span>独立MarkLyra 编辑器 · Vanilla</span><a href="/portable.html">Portable 实验内核</a><a href="/react.html">React 示例</a></header><nav aria-label="编辑命令">${demoCommands.map(({ action, label }) => `<button type="button" data-action="${action}">${label}</button>`).join('')}<select aria-label="主题">${themes.map((theme) => `<option value="${theme}">${theme}</option>`).join('')}</select><span class="toolbar-spacer"></span><button type="button" data-action="open">打开 Markdown</button><button type="button" data-action="save">下载 Markdown</button></nav><div id="editor"></div><footer><span id="status" role="status" aria-live="polite">正在初始化编辑运行时…</span><span id="count"></span></footer><input id="file" type="file" accept=".md,.markdown,.txt" hidden>`;
const mount = document.querySelector<HTMLElement>('#editor');
const input = document.querySelector<HTMLInputElement>('#file');
const status = document.querySelector<HTMLElement>('#status');
const count = document.querySelector<HTMLElement>('#count');
if (!mount || !input || !status || !count) throw new Error('Missing playground controls');
const controls = [...root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select')];
let ready = false;
const setBusy = (busy: boolean) => {
  for (const control of controls) control.disabled = busy || !ready;
};
const setStatus = (message: string) => {
  status.textContent = message;
};
const update = (source: string) => {
  count.textContent = `${Array.from(source).length} 字符`;
};
setBusy(true);
const editor = new MarkLyraEditor(mount, {
  runtimeUrl,
  markdown: initialMarkdown,
  onChange: update,
  onError: (error) => setStatus(error.message),
  host: {
    onAction: (action) => {
      if (action === 'open') input.click();
      else if (action === 'save' || action === 'save-as') void run(download);
      else setStatus(`浏览器示例未接入 ${action}；文档内容保持不变。`);
    },
  },
});
const files = new BrowserDocumentController(editor, initialMarkdown);
// Deliberate browser-example handle for API inspection and integration tests.
Object.assign(window, { marklyraEditor: editor });

async function run(operation: () => Promise<void>): Promise<void> {
  setBusy(true);
  try {
    await operation();
  } catch (error) {
    setStatus(errorMessage(error));
  } finally {
    setBusy(false);
  }
}
async function download(): Promise<void> {
  await files.download();
  setStatus(`已提交浏览器下载：${files.name}`);
}
void editor.ready.then(
  () => {
    ready = true;
    update(editor.getMarkdown());
    setStatus('编辑运行时已就绪 · document.md');
    setBusy(false);
  },
  (error: unknown) => setStatus(`${errorMessage(error)}；请按 README 启动本地 4174 运行资源服务。`),
);

root.querySelector('nav')?.addEventListener('mousedown', (event) => {
  if ((event.target as HTMLElement).closest('button')) event.preventDefault();
});
root.querySelector('nav')?.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest('button')?.dataset.action;
  if (action === 'open') {
    input.click();
    return;
  }
  if (action === 'save') {
    void run(download);
    return;
  }
  const command = demoCommands.find((entry) => entry.action === action)?.command;
  if (command)
    void run(async () => {
      await editor.execute(command);
      await editor.flush();
    });
});
root.querySelector('select')?.addEventListener('change', (event) => {
  const theme = (event.target as HTMLSelectElement).value;
  if (isTheme(theme))
    void run(async () => {
      await editor.execute({ type: 'setTheme', theme });
    });
});
input.addEventListener('change', () => {
  const file = input.files?.[0];
  input.value = '';
  if (file)
    void run(async () => {
      await files.open(file);
      setStatus(`已载入：${files.name}`);
    });
});
window.addEventListener('pagehide', () => editor.destroy(), { once: true });
