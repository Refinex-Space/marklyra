import type { MarkLyraStatistics } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editorChrome } from '../src/services/ui-chrome.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../src/services/documents.js', () => ({ desktopAvailable: true }));

const statistics = {
  words: 1,
  characters: 5,
  lines: 1,
  readingMinutes: 0,
  mode: 'wysiwyg',
} as MarkLyraStatistics;

describe('accepted view mode is independent of statistics', () => {
  beforeEach(() => vi.mocked(invoke).mockReset().mockResolvedValue(undefined));

  it('uses the accepted Source view even while the last successful count is WYSIWYG', async () => {
    await editorChrome.update('doc', false, statistics, 'words', true, false, false, 'source');
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: true, statisticsLabel: '1 词' }),
    });
  });

  it('keeps an explicit mode when statistics are absent and ignores stale count modes', async () => {
    await editorChrome.update('next', false, null, 'words', true, false, false, 'source');
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: true }),
    });
    await editorChrome.update(
      'next',
      false,
      { ...statistics, mode: 'source' },
      'words',
      true,
      false,
      false,
      'wysiwyg',
    );
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: false }),
    });
  });

  it('omits unobserved mode for existing callers so Native preserves its last accepted state', async () => {
    await editorChrome.update(null, false, statistics, 'words', true, false, false);
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: undefined }),
    });
  });
});

describe('native titlebar update ordering', () => {
  beforeEach(() => vi.mocked(invoke).mockReset());
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }

  it('serializes native work and coalesces queued snapshots to the latest document state', async () => {
    const first = deferred(),
      last = deferred();
    vi.mocked(invoke).mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const a = editorChrome.update('old', true, statistics, 'words', true, false, false);
    const b = editorChrome.update('old', false, statistics, 'words', true, false, false);
    const c = editorChrome.update(
      'new',
      false,
      { ...statistics, words: 9 },
      'words',
      true,
      false,
      false,
    );
    const initialCalls = vi.mocked(invoke).mock.calls.length;
    first.resolve();
    await a;
    await Promise.resolve();
    last.resolve();
    await Promise.all([b, c]);
    expect(initialCalls).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({
        documentId: 'new',
        dirty: false,
        statisticsLabel: '9 词',
      }),
    });
  });

  it('continues with current state after an old rejection and exposes a current rejection', async () => {
    const first = deferred(),
      next = deferred();
    vi.mocked(invoke).mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    const old = editorChrome
      .update('closed', true, statistics, 'words', true, false, false)
      .catch((error: unknown) => error);
    const current = editorChrome
      .update('current', false, null, 'words', true, false, false)
      .catch((error: unknown) => error);
    const initialCalls = vi.mocked(invoke).mock.calls.length;
    first.reject(new Error('unknown document'));
    expect(await old).toEqual(new Error('unknown document'));
    await Promise.resolve();
    next.reject(new Error('current native failure'));
    expect(await current).toEqual(new Error('current native failure'));
    expect(initialCalls).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await editorChrome.update('recovered', false, null, 'words', true, false, false);
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});
