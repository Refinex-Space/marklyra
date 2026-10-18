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
  beforeEach(() => vi.mocked(invoke).mockReset());

  it('uses the accepted Source view even while the last successful count is WYSIWYG', () => {
    editorChrome.update('doc', false, statistics, 'words', true, false, false, 'source');
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: true, statisticsLabel: '1 词' }),
    });
  });

  it('keeps an explicit mode when statistics are absent and ignores stale count modes', () => {
    editorChrome.update('next', false, null, 'words', true, false, false, 'source');
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: true }),
    });
    editorChrome.update(
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

  it('omits unobserved mode for existing callers so Native preserves its last accepted state', () => {
    editorChrome.update(null, false, statistics, 'words', true, false, false);
    expect(invoke).toHaveBeenLastCalledWith('update_editor_chrome', {
      payload: expect.objectContaining({ sourceMode: undefined }),
    });
  });
});
