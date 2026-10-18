import { MarkLyraMarkdownEditor } from '@marklyra/editor-react';
import type { MarkLyraEditor, MarkLyraViewMode } from '@marklyra/editor-runtime';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

export interface ViewModeReactFixture {
  events: [number, MarkLyraViewMode][];
  held: MessageEvent[];
  hold: boolean;
  editor?: MarkLyraEditor;
  pending?: Promise<void>;
  unmount(): void;
}

/** Actual adapter mounted in an already served loopback document. */
export function mountViewModeReactFixture(): ViewModeReactFixture {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const root = createRoot(container);
  const f: ViewModeReactFixture = {
    events: [],
    held: [],
    hold: false,
    unmount: () => root.unmount(),
  };
  const delay = (event: MessageEvent) => {
    if (
      f.hold &&
      event.data?.kind === 'response' &&
      typeof event.data.payload?.sourceMode === 'boolean'
    ) {
      f.held.push(event);
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener('message', delay);
  f.unmount = () => {
    window.removeEventListener('message', delay);
    root.unmount();
  };
  function Harness() {
    const [version, setVersion] = useState(1);
    return (
      <div style={{ height: 650 }}>
        <button type="button" onClick={() => setVersion(2)}>
          Latest callback
        </button>
        <MarkLyraMarkdownEditor
          runtimeUrl="http://127.0.0.1:4174/index.html"
          markdown="React mode"
          onReady={(editor) => {
            f.editor = editor;
          }}
          onViewModeChange={(mode) => {
            f.events.push([version, mode]);
          }}
        />
      </div>
    );
  }
  root.render(<Harness />);
  return f;
}
