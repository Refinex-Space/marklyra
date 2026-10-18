import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editorWindows } from '../src/services/windows.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }));

describe('native tab owner IPC boundary', () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it('keeps new document, independent window, tab and Open intents distinct', async () => {
    for (const kind of ['document', 'window', 'tab', 'open'] as const) {
      vi.mocked(invoke).mockResolvedValueOnce(`editor-${kind}`);
      expect(await editorWindows.create(kind)).toBe(`editor-${kind}`);
      expect(invoke).toHaveBeenLastCalledWith('create_editor_window', { kind });
    }
  });

  it('routes tab actions through the invoking native owner without renderer target capabilities', async () => {
    for (const action of ['next', 'previous', 'detach', 'merge', 'toggle'] as const) {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await editorWindows.tab(action);
      expect(invoke).toHaveBeenLastCalledWith('native_tab_action', { action });
    }
    expect(vi.mocked(invoke).mock.calls).toHaveLength(5);
  });

  it('propagates unavailable native actions and failed tab creation without optimistic success', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Native tabs unavailable'));
    await expect(editorWindows.tab('merge')).rejects.toThrow('Native tabs unavailable');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('window capacity reached'));
    await expect(editorWindows.create('tab')).rejects.toThrow('window capacity reached');
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
