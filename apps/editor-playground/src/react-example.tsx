import { MarkLyraEditor } from '@marklyra/editor-runtime';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

function RuntimeExample() {
  const mount = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkLyraEditor | null>(null);
  const filesRef = useRef<BrowserDocumentController | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在初始化编辑运行时…');
  const [count, setCount] = useState(0);

  const run = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!mount.current) return;
    let active = true;
    const editor = new MarkLyraEditor(mount.current, {
      runtimeUrl,
      markdown: initialMarkdown,
      onChange: (source) => {
        if (active) setCount(Array.from(source).length);
      },
      onError: (error) => {
        if (active) setStatus(error.message);
      },
      host: {
        onAction: (action) => {
          if (action === 'open') input.current?.click();
          else if (action === 'save' || action === 'save-as')
            void run(async () => {
              await filesRef.current?.download();
              if (active) setStatus(`已提交浏览器下载：${filesRef.current?.name ?? 'document.md'}`);
            });
          else if (active) setStatus(`浏览器示例未接入 ${action}；文档内容保持不变。`);
        },
      },
    });
    const files = new BrowserDocumentController(editor, initialMarkdown);
    editorRef.current = editor;
    filesRef.current = files;
    Object.assign(window, { marklyraEditor: editor });
    void editor.ready.then(
      () => {
        if (!active) return;
        setReady(true);
        setCount(Array.from(editor.getMarkdown()).length);
        setStatus('React 生命周期示例已就绪 · document.md');
      },
      (error: unknown) => {
        if (active) setStatus(`${errorMessage(error)}；请按 README 启动本地 4174 运行资源服务。`);
      },
    );
    return () => {
      active = false;
      editor.destroy();
      if (editorRef.current === editor) editorRef.current = null;
      if (filesRef.current === files) filesRef.current = null;
      const page = window as Window & { marklyraEditor?: MarkLyraEditor };
      if (page.marklyraEditor === editor) delete page.marklyraEditor;
    };
  }, [run]);
  return (
    <>
      <header>
        <strong>MarkLyra</strong>
        <span>独立MarkLyra 编辑器 · React StrictMode</span>
        <a href="/">Vanilla 示例</a>
        <a href="/portable-react.html">Portable React</a>
      </header>
      <nav aria-label="编辑命令">
        {demoCommands.map(({ action, label, command }) => (
          <button
            key={action}
            type="button"
            disabled={!ready || busy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              void run(async () => {
                await editorRef.current?.execute(command);
                await editorRef.current?.flush();
              })
            }
          >
            {label}
          </button>
        ))}
        <select
          aria-label="主题"
          disabled={!ready || busy}
          onChange={(event) => {
            const theme = event.currentTarget.value;
            if (isTheme(theme))
              void run(async () => {
                await editorRef.current?.execute({ type: 'setTheme', theme });
              });
          }}
        >
          {themes.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </select>
        <span className="toolbar-spacer" />
        <button type="button" disabled={!ready || busy} onClick={() => input.current?.click()}>
          打开 Markdown
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            void run(async () => {
              await filesRef.current?.download();
              setStatus(`已提交浏览器下载：${filesRef.current?.name ?? 'document.md'}`);
            })
          }
        >
          下载 Markdown
        </button>
      </nav>
      <div id="editor" ref={mount} />
      <footer>
        <span id="status" role="status" aria-live="polite">
          {status}
        </span>
        <span>{count} 字符</span>
      </footer>
      <input
        id="file"
        ref={input}
        type="file"
        accept=".md,.markdown,.txt"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file)
            void run(async () => {
              await filesRef.current?.open(file);
              setStatus(`已载入：${filesRef.current?.name ?? file.name}`);
            });
        }}
      />
    </>
  );
}

const root = document.querySelector('#app');
if (!root) throw new Error('Missing app root');
createRoot(root).render(
  <StrictMode>
    <RuntimeExample />
  </StrictMode>,
);
