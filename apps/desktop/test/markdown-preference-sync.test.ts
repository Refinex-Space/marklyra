import { describe, expect, it, vi } from 'vitest';
import {
  type MarkdownEditor,
  MarkdownPreferenceSync,
} from '../src/features/settings/markdown-preference-sync.js';
import type {
  MarkdownPreferencesSnapshot,
  MarkdownPreferenceValues,
} from '../src/services/markdownPreferences.js';

const token = 'de305d54-75b4-431b-adb2-eb6b9e546014';
const base = (): MarkdownPreferencesSnapshot => ({
  schemaVersion: 1,
  revision: 0,
  indentSize: 2,
  prettyIndent: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(actual: MarkdownPreferenceValues = base()) {
  let policy = { indentSize: actual.indentSize, prettyIndent: actual.prettyIndent },
    disk = base();
  const order: string[] = [],
    reports: string[] = [],
    states: { error: string; working: boolean }[] = [];
  const editor: MarkdownEditor = {
    getMarkdownPreferences: () => ({ ...policy }),
    setMarkdownPreferences: vi.fn(async (change, options) => {
      if (options?.signal?.aborted) throw Error('aborted');
      order.push('apply');
      policy = { ...policy, ...change };
    }),
  };
  const get = vi.fn(async () => {
    order.push('get');
    return { ...disk };
  });
  const complete = vi.fn(
    async (_token: string, error: string | null): Promise<MarkdownPreferencesSnapshot | null> => {
      order.push(error === null ? 'commit' : 'reject');
      if (error !== null) return null;
      disk = { ...disk, revision: 1, indentSize: 4, prettyIndent: true };
      return { ...disk };
    },
  );
  const sync = new MarkdownPreferenceSync({
    get,
    complete,
    report: (message) => reports.push(message),
    changed: (error, working) => states.push({ error, working }),
  });
  sync.bind(editor);
  const request = () => ({ token, before: base(), change: { indentSize: 4, prettyIndent: true } });
  return {
    sync,
    editor,
    get,
    complete,
    order,
    reports,
    states,
    request,
    policy: () => policy,
    disk: () => disk,
    setDisk: (value: MarkdownPreferencesSnapshot) => {
      disk = value;
    },
  };
}

describe('per-window Markdown preference application and reconciliation', () => {
  it('rolls back all style fields when a matching revision acknowledges different styles', async () => {
    const f = fixture();
    const incoming = { ...f.request(), change: { headingStyle: 3, ulStyle: 2, olStyle: 1 } };
    f.complete.mockResolvedValueOnce({
      ...base(),
      revision: 1,
      headingStyle: 0,
      ulStyle: 2,
      olStyle: 1,
    });
    await f.sync.receive(incoming);
    expect(f.policy()).toEqual({
      indentSize: 2,
      prettyIndent: false,
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
    });
    expect(f.complete.mock.calls.at(-1)?.[1]).toContain('匹配');
  });
  it('retains a committed style after a lost reply and reconciles the exact stored target', async () => {
    const f = fixture();
    const saved = {
      ...base(),
      revision: 1,
      headingStyle: 3 as const,
      ulStyle: 2 as const,
      olStyle: 1 as const,
    };
    f.complete.mockImplementationOnce(async () => {
      f.setDisk(saved);
      throw Error('lost style reply');
    });
    f.complete.mockResolvedValueOnce(saved);
    await f.sync.receive({ ...f.request(), change: { headingStyle: 3, ulStyle: 2, olStyle: 1 } });
    expect(f.policy()).toEqual({
      indentSize: 2,
      prettyIndent: false,
      headingStyle: 3,
      ulStyle: 2,
      olStyle: 1,
    });
    expect(f.order).toEqual(['apply', 'get']);
    expect(f.states.at(-1)?.error).toBe('');
  });
  it('requires explicit SDK success before Native CAS and never applies by a storage side effect', async () => {
    const f = fixture();
    await f.sync.receive(f.request());
    expect(f.order).toEqual(['apply', 'commit']);
    expect(f.policy()).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 4,
      prettyIndent: true,
    });
    expect(f.complete).toHaveBeenCalledWith(token, null);
    expect(f.states.at(-1)).toEqual({ error: '', working: false });
  });
  it('reconciles a failed write before rolling back the actual SDK value and rejecting the UI', async () => {
    const f = fixture({ indentSize: 3, prettyIndent: false });
    f.complete.mockRejectedValueOnce(Error('write failed'));
    await f.sync.receive(f.request());
    expect(f.order).toEqual(['apply', 'get', 'apply', 'reject']);
    expect(f.policy()).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 3,
      prettyIndent: false,
    });
    expect(f.states.at(-1)?.error).toContain('尚未同步');
    expect(f.complete.mock.calls[1]?.[1]).toContain('write failed');
    await f.sync.reload();
    expect(f.policy()).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 2,
      prettyIndent: false,
    });
    expect(f.states.at(-1)?.error).toBe('');
  });
  it('keeps a confirmed post-rename target instead of blindly rolling it back after a lost receipt', async () => {
    const f = fixture();
    f.complete.mockImplementationOnce(async () => {
      f.setDisk({ ...base(), revision: 1, indentSize: 4, prettyIndent: true });
      throw Error('lost reply');
    });
    await f.sync.receive(f.request());
    expect(vi.mocked(f.editor.setMarkdownPreferences)).toHaveBeenCalledTimes(1);
    expect(f.complete).toHaveBeenCalledTimes(2);
    expect(f.complete.mock.calls.every((call) => call[1] === null)).toBe(true);
    expect(f.policy()).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 4,
      prettyIndent: true,
    });
    expect(f.states.at(-1)?.error).toBe('');
  });
  it('exposes unknown storage/rollback state instead of claiming that the old policy was restored', async () => {
    const f = fixture();
    f.complete.mockRejectedValueOnce(Error('write unknown'));
    f.get.mockRejectedValueOnce(Error('read failed'));
    await f.sync.receive(f.request());
    expect(f.policy()).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 4,
      prettyIndent: true,
    });
    expect(f.states.at(-1)?.error).toContain('无法确认或恢复底层策略');
    expect(f.complete.mock.calls.at(-1)?.[1]).toContain('read failed');
  });
  it('retains a visible sibling failure and retries applying the latest Native snapshot', async () => {
    const f = fixture();
    f.setDisk({ ...base(), revision: 1, indentSize: 4, prettyIndent: true });
    vi.mocked(f.editor.setMarkdownPreferences).mockRejectedValueOnce(Error('rebase rejected'));
    await f.sync.reload();
    expect(f.states.at(-1)?.error).toContain('可重试同步');
    expect(f.policy().indentSize).toBe(2);
    await f.sync.reload();
    expect(f.policy().indentSize).toBe(4);
    expect(f.states.at(-1)?.error).toBe('');
  });
  it('rejects a held stale Native read after a newer explicit request has been received', async () => {
    const f = fixture(),
      held = deferred<MarkdownPreferencesSnapshot>();
    f.get.mockImplementationOnce(() => held.promise);
    const reload = f.sync.reload();
    await f.sync.receive(f.request());
    held.resolve(base());
    await reload;
    expect(f.policy().indentSize).toBe(4);
    expect(vi.mocked(f.editor.setMarkdownPreferences)).toHaveBeenCalledTimes(1);
  });
  it('passes cancellation into an IME-waiting SDK operation before any Native commit', async () => {
    const f = fixture(),
      started = deferred<void>();
    vi.mocked(f.editor.setMarkdownPreferences).mockImplementationOnce(
      (_value, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(Error('cancelled')), {
            once: true,
          });
          started.resolve();
        }),
    );
    const operation = f.sync.receive(f.request());
    await started.promise;
    f.sync.cancel(token);
    await operation;
    expect(f.complete.mock.calls.some((call) => call[1] === null)).toBe(false);
    expect(f.policy().indentSize).toBe(2);
    expect(vi.mocked(f.editor.setMarkdownPreferences).mock.calls[0]?.[1]?.signal?.aborted).toBe(
      true,
    );
  });
  it('uses a fresh lifecycle signal for compensation after late cancellation of an applied candidate', async () => {
    const f = fixture(),
      held = deferred<MarkdownPreferencesSnapshot | null>();
    f.complete.mockImplementationOnce(() => held.promise);
    const operation = f.sync.receive(f.request());
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledTimes(1));
    f.sync.cancel(token);
    held.reject(Error('closed'));
    await operation;
    expect(f.policy().indentSize).toBe(2);
    expect(vi.mocked(f.editor.setMarkdownPreferences).mock.calls[1]?.[1]?.signal?.aborted).toBe(
      false,
    );
  });
  it('does not apply stale work to a replacement editor or publish after destruction', async () => {
    const f = fixture(),
      started = deferred<void>();
    vi.mocked(f.editor.setMarkdownPreferences).mockImplementationOnce(
      (_value, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(Error('destroyed')), {
            once: true,
          });
          started.resolve();
        }),
    );
    const operation = f.sync.receive(f.request());
    await started.promise;
    f.sync.destroy();
    const count = f.states.length;
    await operation;
    await f.sync.receive({ invalid: true });
    expect(f.states).toHaveLength(count);
    expect(f.policy().indentSize).toBe(2);
  });
});
