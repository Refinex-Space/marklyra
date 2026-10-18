import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useDocumentSession } from '../useDocumentSession.js';

/** Real document hook with deliberately replaceable editor owners. No SDK DOM
 * or native IO is represented by these narrow editor doubles. */
class EditorOwner {
  raw = '';
  context: string | null = null;
  references: string[] = [];
  patches = 0;
  unproven = false;
  failContext = false;
  failMarkSaved = false;
  revision = 0;
  isComposing = false;
  hasPendingChanges = false;
  hold = false;
  release: (() => void) | undefined;
  holdLoad = false;
  failLoad = false;
  releaseLoad: (() => void) | undefined;
  flush(): Promise<string> {
    const value = this.raw;
    if (!this.hold) return Promise.resolve(value);
    this.hold = false;
    return new Promise((resolve) => {
      this.release = () => {
        this.release = undefined;
        resolve(value);
      };
    });
  }
  getMarkdown() {
    return this.raw;
  }
  async load(text: string, options?: { documentContext?: string | null }) {
    if (this.holdLoad) {
      this.holdLoad = false;
      await new Promise<void>((resolve) => {
        this.releaseLoad = () => {
          this.releaseLoad = undefined;
          resolve();
        };
      });
    }
    if (this.failLoad) {
      this.failLoad = false;
      throw new Error('controlled load failure');
    }
    this.raw = text;
    this.context = options?.documentContext ?? null;
    this.revision++;
  }
  async setDocumentContext(id: string | null) {
    if (this.failContext) {
      this.failContext = false;
      throw new Error('controlled context failure');
    }
    this.context = id;
  }
  async getImageReferences() {
    if (this.unproven) throw new Error('unproven image grammar');
    return this.references;
  }
  async getImageStorageContext() {
    return { referenceRoot: '', sourceMode: false };
  }
  async updateImageReferences(mappings: { source: string; target: string }[]) {
    for (const mapping of mappings) this.raw = this.raw.replace(mapping.source, mapping.target);
    this.patches++;
    this.revision++;
    session?.change(this.raw);
  }
  async markSaved(text: string) {
    if (this.failMarkSaved) {
      this.failMarkSaved = false;
      throw new Error('controlled saved marker failure');
    }
    return this.raw === text;
  }
  async getSuggestedFileName() {
    return 'Owner.md';
  }
}
type Session = ReturnType<typeof useDocumentSession>;
const first = new EditorOwner(),
  second = new EditorOwner();
second.raw = 'Beta';
const editor = { current: first as unknown as MarkLyraEditor | null };
let session: Session | undefined;
let outcome: boolean | undefined;
let automaticOutcome: string | undefined;
let checkedOwner: object | undefined;
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing test root');
const root = createRoot(rootElement);
function Probe() {
  const current = useDocumentSession(editor, async () => {}, 'ownership-test');
  useLayoutEffect(() => {
    session = current;
  });
  return <output data-ready="true">{current.working ? 'working' : 'idle'}</output>;
}
const fixture = {
  first,
  second,
  get outcome() {
    return outcome;
  },
  get automaticOutcome() {
    return automaticOutcome;
  },
  autoSave() {
    void session?.autoSave().then((value) => {
      automaticOutcome = value;
    });
  },
  async initialize() {
    if (!session) throw new Error('Hook not mounted');
    await session.initialize(
      { id: 'doc-a', path: '/mock/A.md', text: 'Alpha', encoding: 'UTF-8' },
      first.revision,
    );
  },
  edit(text: string) {
    first.raw = text;
    first.revision++;
    session?.change(text);
  },
  async initializeImages() {
    if (!session) throw new Error('Hook not mounted');
    if (!editor.current) throw new Error('Editor not mounted');
    await session.initializeImageContext(editor.current);
  },
  get dirty() {
    return session?.dirty;
  },
  get file() {
    return session?.getFile();
  },
  get message() {
    return session?.message;
  },
  save(as = false) {
    if (!session) throw new Error('Hook not mounted');
    void session.save(as).then((result) => {
      outcome = result;
    });
  },
  replace() {
    editor.current = second as unknown as MarkLyraEditor;
  },
  unmount() {
    root.unmount();
  },
  checkpointOwner() {
    checkedOwner = session?.getOwner();
  },
  sameOwner: () => session?.getOwner() === checkedOwner,
  acceptsEditorCommands: () => session?.acceptsEditorCommands(),
  newDocument: () => session?.request({ kind: 'new' }),
};
Object.assign(window, { __saveOwnershipFixture: fixture });
root.render(<Probe />);
export type SaveOwnershipWindow = Window & {
  __saveOwnershipFixture: typeof fixture;
};
