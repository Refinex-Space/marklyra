import { MarkdownEditor } from '@marklyra/editor-react';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@marklyra/editor-themes/paper.css';
import './style.css';

function Example() {
  const [count, setCount] = useState(0);
  return (
    <>
      <header>
        <h1>React 生命周期示例</h1>
        <a href="/portable.html">Portable Vanilla 示例 ↗</a>
      </header>
      <main>
        <article>
          <MarkdownEditor
            markdown={'# React 只管理生命周期\n\n编辑状态与 DOM 由独立 EditorView 管理。\n'}
            onChange={(text) => setCount(text.length)}
          />
        </article>
      </main>
      <footer>{count} 字符 · StrictMode</footer>
    </>
  );
}
const root = document.querySelector('#app');
if (root)
  createRoot(root).render(
    <StrictMode>
      <Example />
    </StrictMode>,
  );
