import { describe, expect, it, vi } from 'vitest';
import { extensionEditorCommand, extensionImageName } from '../src/extensions/commands.js';
import type {
  MarkLyraExtension,
  MarkLyraExtensionCommandContext,
  MarkLyraExtensionContext,
  MarkLyraExtensionEditorCommand,
  MarkLyraExtensionError,
} from '../src/extensions/contracts.js';
import { MarkLyraExtensionRegistry } from '../src/extensions/registry.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(ready = Promise.resolve()) {
  let document = new AbortController();
  const changes = new Set<(source: string) => void>();
  const reports: MarkLyraExtensionError[] = [];
  const selection = { bookmark: { id: 'n1', start: 2 }, text: 'Alpha' };
  const execute = vi.fn(async (_command: MarkLyraExtensionEditorCommand, guard: () => void) => {
    await Promise.resolve();
    guard();
  });
  const insertImage = vi.fn(async () => {});
  const registry = new MarkLyraExtensionRegistry({
    ready,
    getMarkdown: () => 'Alpha',
    getSelection: () => selection,
    isComposing: () => false,
    documentSignal: () => document.signal,
    onChange: (listener) => {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
    execute,
    insertImage,
    report: (error) => reports.push(error),
  });
  const extension: MarkLyraExtension = {
    id: 'blocks',
    commands: { 'blocks.code': (context) => context.execute({ type: 'codeBlock' }) },
  };
  return {
    registry,
    extension,
    execute,
    insertImage,
    changes,
    reports,
    selection,
    switchDocument: () => {
      document.abort();
      document = new AbortController();
    },
  };
}

describe('active SDK extension registry (host doubles, not runtime/native acceptance)', () => {
  it('reserves ownership atomically, snapshots definitions, and releases only the old registration', async () => {
    const f = fixture();
    const commands = { ...f.extension.commands };
    const first = f.registry.register({ ...f.extension, commands });
    commands['blocks.code'] = () => {
      throw new Error('mutated');
    };
    await first.ready;
    expect(() => f.registry.register(f.extension)).toThrow('already registered');
    expect(() =>
      f.registry.register({
        id: 'other',
        commands: {
          'new.command': () => {},
          'blocks.code': () => {},
        },
      }),
    ).toThrow('command conflict');
    expect(f.registry.ids()).toEqual(['blocks']);
    await f.registry.execute('blocks', 'blocks.code');
    expect(f.execute).toHaveBeenCalledWith({ type: 'codeBlock' }, expect.any(Function));
    first.dispose();
    const second = f.registry.register(f.extension);
    first.dispose();
    await second.ready;
    expect(f.registry.ids()).toEqual(['blocks']);
    expect(f.registry.unregister('missing')).toBe(false);
    await expect(f.registry.execute('missing', 'blocks.code')).rejects.toThrow('Unknown extension');
    await expect(f.registry.execute('blocks', 'native.eval')).rejects.toThrow(
      'Unknown extension command',
    );
  });

  it('does not run setup before ready, cancels ready promptly, and never starts disposed setup', async () => {
    const gate = deferred<void>();
    const f = fixture(gate.promise);
    const setup = vi.fn();
    const registration = f.registry.register({ ...f.extension, setup });
    registration.dispose();
    await expect(registration.ready).rejects.toThrow('disposed');
    gate.resolve();
    await Promise.resolve();
    expect(setup).not.toHaveBeenCalled();
    expect(f.registry.ids()).toEqual([]);
  });

  it('runs late async setup cleanup once without reviving the registration', async () => {
    const gate = deferred<() => void>();
    const f = fixture();
    const cleanup = vi.fn();
    const setup = vi.fn(() => gate.promise);
    const registration = f.registry.register({ ...f.extension, setup });
    await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce());
    registration.dispose();
    await expect(registration.ready).rejects.toThrow('disposed');
    gate.resolve(cleanup);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    registration.dispose();
    expect(f.registry.ids()).toEqual([]);
    expect(f.reports).toEqual([]);
  });

  it('rolls back failed setup subscriptions and ownership, retaining a usable registry', async () => {
    const f = fixture();
    const registration = f.registry.register({
      ...f.extension,
      setup: (context) => {
        context.onChange(() => {});
        throw new Error('setup failed');
      },
    });
    await expect(registration.ready).rejects.toThrow('setup failed');
    expect(f.changes.size).toBe(0);
    expect(f.registry.ids()).toEqual([]);
    expect(f.reports.map((x) => x.phase)).toEqual(['setup']);
    await f.registry.register(f.extension).ready;
    await f.registry.execute('blocks', 'blocks.code');
  });

  it('isolates synchronous/async observers and cleanup, detaches selection, and revokes retained contexts', async () => {
    const f = fixture();
    let captured!: MarkLyraExtensionContext;
    const registration = f.registry.register({
      ...f.extension,
      setup: (context) => {
        captured = context;
        context.onChange(() => {
          throw new Error('sync observer');
        });
        context.onChange(async () => {
          throw new Error('async observer');
        });
        return () => {
          throw new Error('cleanup failed');
        };
      },
    });
    await registration.ready;
    const snapshot = captured.getSelection();
    if (!snapshot.bookmark) throw new Error('Missing fixture bookmark');
    snapshot.bookmark.start = 999;
    expect(f.selection.bookmark.start).toBe(2);
    for (const callback of f.changes) expect(() => callback('Beta')).not.toThrow();
    await vi.waitFor(() => expect(f.reports.filter((x) => x.phase === 'change')).toHaveLength(2));
    registration.dispose();
    expect(f.changes.size).toBe(0);
    expect(() => captured.getMarkdown()).toThrow('disposed');
    expect(f.reports.map((x) => x.phase)).toContain('dispose');
    expect(f.registry.ids()).toEqual([]);
  });

  it.each(['dispose', 'document', 'destroy'] as const)(
    'revokes async command work on %s',
    async (change) => {
      const f = fixture();
      const gate = deferred<void>();
      const entered = deferred<void>();
      let retained!: MarkLyraExtensionCommandContext;
      const registration = f.registry.register({
        id: 'slow',
        commands: {
          'slow.insert': async (context) => {
            retained = context;
            entered.resolve();
            await gate.promise;
            await context.execute({ type: 'insertText', text: 'late' });
          },
        },
      });
      await registration.ready;
      const running = f.registry.execute('slow', 'slow.insert');
      await entered.promise;
      if (change === 'dispose') registration.dispose();
      else if (change === 'document') f.switchDocument();
      else f.registry.destroy();
      await expect(running).rejects.toThrow('cancelled');
      gate.resolve();
      await expect(retained.execute({ type: 'codeBlock' })).rejects.toThrow('cancelled');
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.reports).toEqual([]);
    },
  );

  it('waits for issued editor commands even if a handler forgets to return their promise', async () => {
    const f = fixture();
    const gate = deferred<void>();
    f.execute.mockImplementation(async (_command, guard) => {
      await gate.promise;
      guard();
    });
    await f.registry.register({
      id: 'floating',
      commands: {
        'floating.insert': (context) => {
          void context.execute({ type: 'insertText', text: 'X' });
        },
      },
    }).ready;
    let settled = false;
    const running = f.registry.execute('floating', 'floating.insert').then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    gate.resolve();
    await running;
    expect(settled).toBe(true);
  });

  it('copies primitive command arguments before asynchronous work and rejects ABI/path escape hatches', async () => {
    const f = fixture();
    const command: MarkLyraExtensionEditorCommand = { type: 'insertText', text: 'before' };
    await f.registry.register({
      id: 'copy',
      commands: {
        'copy.insert': (context) => {
          const work = context.execute(command);
          command.text = 'after';
          return work;
        },
      },
    }).ready;
    await f.registry.execute('copy', 'copy.insert');
    expect(f.execute.mock.calls[0]?.[0]).toEqual({ type: 'insertText', text: 'before' });
    for (const value of [
      { type: 'native.eval', path: '/tmp/file' },
      { type: 'restoreSelection', bookmark: { type: 'remove' } },
      { type: 'setTheme', theme: 'marklyra-dark' },
      { type: 'insertText', text: 'x', path: '/tmp/file' },
      { type: 'heading', level: 9 },
      { type: 'format', style: 'unknown' },
    ])
      expect(() => extensionEditorCommand(value)).toThrow();
  });

  it('accepts image basenames and rejects paths before an extension can reach the host', async () => {
    const f = fixture();
    expect(extensionImageName('图 像.png')).toBe('图 像.png');
    for (const name of [
      '/private/a.png',
      '../a.png',
      'a/b.png',
      'a\\b.png',
      'C:a.png',
      'a\u0000.png',
    ])
      expect(() => extensionImageName(name)).toThrow('basename');
    await f.registry.register({
      id: 'images',
      commands: {
        'images.insert': (context) =>
          context.insertImage(new Blob(['fixture'], { type: 'image/png' }), '../a.png'),
      },
    }).ready;
    await expect(f.registry.execute('images', 'images.insert')).rejects.toThrow('basename');
    expect(f.insertImage).not.toHaveBeenCalled();
  });

  it('does not let a diagnostic callback break removal or error propagation', async () => {
    const f = fixture();
    const registry = new MarkLyraExtensionRegistry({
      ready: Promise.resolve(),
      getMarkdown: () => '',
      getSelection: () => ({ bookmark: null, text: '' }),
      isComposing: () => false,
      documentSignal: () => new AbortController().signal,
      execute: f.execute,
      insertImage: f.insertImage,
      onChange: () => () => {},
      report: () => {
        throw new Error('consumer error');
      },
    });
    await registry.register({
      id: 'bad',
      commands: {
        'bad.run': async () => {
          throw new Error('command failed');
        },
      },
    }).ready;
    await expect(registry.execute('bad', 'bad.run')).rejects.toThrow('command failed');
    expect(() => registry.destroy()).not.toThrow();
    expect(() => registry.ids()).toThrow('destroyed');
  });
});
