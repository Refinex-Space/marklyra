import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { describe, expect, it } from 'vitest';
import {
  deliverOsOpen,
  type OsOpenContext,
} from '../src/features/os-integration/os-open-delivery.js';
import {
  type OsOpenResult,
  osOpenSnapshot,
} from '../src/features/os-integration/os-open-service.js';

const file = {
  id: 'os-doc',
  path: '/fixture/中文.md',
  text: '\ufeff# title\r\nkeep  \n',
  encoding: 'UTF-8 BOM',
};
function fixture() {
  const state = {
    source: '',
    revision: 0,
    composing: false,
    pending: false,
    available: true,
    reuse: true,
    owner: {},
    taken: [] as boolean[],
    completed: [] as [string, boolean][],
    initialized: 0,
    tracked: 0,
    flushed: 0,
    messages: [] as string[],
    duringTake: () => {},
    duringLoad: () => {},
  };
  const editor = {
    get revision() {
      return state.revision;
    },
    get isComposing() {
      return state.composing;
    },
    get hasPendingChanges() {
      return state.pending;
    },
    getMarkdown: () => state.source,
    flush: async () => {
      state.flushed++;
    },
  } as unknown as MarkLyraEditor;
  const context: OsOpenContext = {
    editor: () => editor,
    owner: () => state.owner,
    available: () => state.available,
    mayInitialize: () => state.available,
    canReuse: () => state.reuse,
    initialize: async (document, revision, guard) => {
      state.duringLoad();
      if (revision !== state.revision || !guard()) return false;
      state.source = document.text;
      state.owner = {};
      state.reuse = false;
      state.revision++;
      state.initialized++;
      return true;
    },
    settleSession: async () => {
      state.tracked++;
    },
    report: (message) => state.messages.push(message),
  };
  const service = {
    take: async (reuse: boolean): Promise<OsOpenResult | null> => {
      state.taken.push(reuse);
      state.duringTake();
      return { kind: 'document', token: 'owned-token', document: file };
    },
    complete: async (token: string, accepted: boolean) => {
      state.completed.push([token, accepted]);
    },
  };
  return { state, context, service };
}
describe('OS-owned opening delivery', () => {
  it('initializes a clean blank editor and ACKs the intentional new owner', async () => {
    const { state, context, service } = fixture();
    expect(await deliverOsOpen(context, service)).toBe(true);
    expect(state.taken).toEqual([true]);
    expect(state.completed).toEqual([['owned-token', true]]);
    expect(state.source).toBe(file.text);
    expect(state.initialized).toBe(1);
    expect(state.tracked).toBe(1);
  });
  it.each(['dirty', 'named'] as const)(
    'sends %s windows to Native routing without replacing their text',
    async () => {
      const { state, context, service } = fixture();
      state.reuse = false;
      state.source = '保留当前稿';
      service.take = async (reuse) => {
        state.taken.push(reuse);
        return { kind: 'handled' };
      };
      expect(await deliverOsOpen(context, service)).toBe(true);
      expect(state.taken).toEqual([false]);
      expect(state.source).toBe('保留当前稿');
      expect(state.initialized).toBe(0);
    },
  );
  it.each(['source', 'revision', 'owner', 'modal', 'composition', 'pending'] as const)(
    'late %s changes return the candidate to a separate Native window',
    async (change) => {
      const { state, context, service } = fixture();
      state.duringTake = () => {
        if (change === 'source') state.source = 'new input';
        if (change === 'revision') state.revision++;
        if (change === 'owner') state.owner = {};
        if (change === 'modal') state.available = false;
        if (change === 'composition') state.composing = true;
        if (change === 'pending') state.pending = true;
      };
      expect(await deliverOsOpen(context, service)).toBe(true);
      expect(state.completed).toEqual([['owned-token', false]]);
      expect(state.initialized).toBe(0);
    },
  );
  it('initialization rechecks the source immediately before accepting', async () => {
    const { state, context, service } = fixture();
    state.duringLoad = () => {
      state.source = 'input during load';
    };
    await deliverOsOpen(context, service);
    expect(state.completed).toEqual([['owned-token', false]]);
    expect(state.source).toBe('input during load');
  });
  it('own initialization busy state does not reject its guarded source load', async () => {
    const { state, context, service } = fixture();
    context.mayInitialize = () => true;
    state.duringLoad = () => {
      state.available = false;
    };
    expect(await deliverOsOpen(context, service)).toBe(true);
    expect(state.completed).toEqual([['owned-token', true]]);
    expect(state.initialized).toBe(1);
  });
  it('initialization failure still completes Native fallback', async () => {
    const { state, context, service } = fixture();
    context.initialize = async () => {
      throw Error('load rejected');
    };
    await expect(deliverOsOpen(context, service)).rejects.toThrow('load rejected');
    expect(state.completed).toEqual([['owned-token', false]]);
  });
  it('defers IME and modal sessions before requesting an event', async () => {
    const { state, context, service } = fixture();
    state.composing = true;
    expect(await deliverOsOpen(context, service)).toBe(false);
    state.composing = false;
    state.available = false;
    expect(await deliverOsOpen(context, service)).toBe(false);
    expect(state.taken).toEqual([]);
  });
  it('does not track an empty session before the startup target has loaded', async () => {
    const { state, context, service } = fixture();
    service.take = async () => null;
    expect(await deliverOsOpen(context, service)).toBe(false);
    expect(state.tracked).toBe(0);
    expect(state.flushed).toBe(0);
  });
  it('reports Native warnings without changing the document', async () => {
    const { state, context, service } = fixture();
    service.take = async () => ({ kind: 'warning', message: '格式不支持' });
    expect(await deliverOsOpen(context, service)).toBe(true);
    expect(state.messages).toEqual(['格式不支持']);
    expect(state.completed).toEqual([]);
  });
});
describe('OS open response boundary', () => {
  it('preserves source strings, requires owner token, and rejects paths passed as a response', () => {
    expect(osOpenSnapshot(null)).toBe(null);
    expect(osOpenSnapshot({ kind: 'document', token: 'owned-token', document: file })).toEqual({
      kind: 'document',
      token: 'owned-token',
      document: file,
    });
    for (const value of [
      [],
      '/tmp/a.md',
      {},
      { kind: 'document', token: '', document: file },
      { kind: 'document', token: 'token', document: { ...file, id: '' } },
      { kind: 'warning', message: 1 },
    ])
      expect(() => osOpenSnapshot(value)).toThrow();
  });
});
