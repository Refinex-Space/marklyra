import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import {
  directoryHistory,
  directoryHistoryCatalog,
  directoryHistoryTarget,
} from '../src/services/directory-history.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const target = { kind: 'history' as const, id: 'directory-opaque-1' };
const catalog = () => ({
  revision: 7,
  noRecentFiles: false,
  entries: [
    {
      target,
      name: '<script>中文</script>',
      path: '/native/中文',
      pinned: true,
      current: false,
      reopenable: true,
    },
  ],
});
describe('directory history Native authority service', () => {
  it('keeps display strings literal and copies exact opaque targets without granting paths', () => {
    expect(directoryHistoryCatalog(catalog())).toEqual(catalog());
    expect(directoryHistoryTarget(target)).not.toBe(target);
    expect(directoryHistoryTarget({ kind: 'workspace', workspaceId: 'workspace-current' })).toEqual(
      { kind: 'workspace', workspaceId: 'workspace-current' },
    );
    for (const value of [
      { ...target, path: '/outside' },
      { kind: 'path', path: '/outside' },
      { kind: 'workspace', workspaceId: '../outside' },
      { ...target, bookmark: {} },
      { kind: 'workspace', workspaceId: '' },
      null,
    ])
      expect(() => directoryHistoryTarget(value)).toThrow();
  });
  it('rejects malformed catalog revisions, flags, extra capabilities and duplicate identities', () => {
    for (const value of [
      { ...catalog(), revision: -1 },
      { ...catalog(), revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...catalog(), noRecentFiles: 1 },
      { ...catalog(), entries: [catalog().entries[0], catalog().entries[0]] },
      { ...catalog(), entries: [{ ...catalog().entries[0], bookmark: {} }] },
      { ...catalog(), entries: [{ ...catalog().entries[0], reopenable: 'true' }] },
      { ...catalog(), source: 'document' },
      { ...catalog(), entries: Array.from({ length: 34 }, () => catalog().entries[0]) },
    ])
      expect(() => directoryHistoryCatalog(value)).toThrow();
  });
  it('uses exact list/pin/remove CAS signatures without a local preference mirror', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce(catalog());
    expect(await directoryHistory.list('workspace-current')).toEqual(catalog());
    expect(invoke).toHaveBeenLastCalledWith('list_directory_history', {
      currentWorkspaceId: 'workspace-current',
    });
    vi.mocked(invoke).mockResolvedValueOnce({ revision: 8 });
    expect(await directoryHistory.pin(7, target, true)).toEqual({ revision: 8 });
    expect(invoke).toHaveBeenLastCalledWith('pin_directory_history', {
      expectedRevision: 7,
      target,
      pinned: true,
    });
    vi.mocked(invoke).mockResolvedValueOnce({ revision: 9 });
    expect(await directoryHistory.remove(8, target)).toEqual({ revision: 9 });
    expect(invoke).toHaveBeenLastCalledWith('remove_directory_history', {
      expectedRevision: 8,
      target,
    });
  });
  it('reopens and creates windows only from opaque history or current workspace targets', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 'new-workspace',
      name: '中文',
      path: '/native/中文',
    });
    expect(await directoryHistory.open(7, target)).toMatchObject({ id: 'new-workspace' });
    expect(invoke).toHaveBeenLastCalledWith('open_directory_history', {
      expectedRevision: 7,
      target,
    });
    const current = { kind: 'workspace' as const, workspaceId: 'current-workspace' };
    vi.mocked(invoke).mockResolvedValueOnce('editor-new-window');
    expect(await directoryHistory.openNewWindow(7, current)).toBe('editor-new-window');
    expect(invoke).toHaveBeenLastCalledWith('open_directory_history_window', {
      expectedRevision: 7,
      target: current,
    });
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await directoryHistory.reveal('current-workspace');
    expect(invoke).toHaveBeenLastCalledWith('reveal_workspace_directory', {
      workspaceId: 'current-workspace',
    });
    expect(
      vi.mocked(invoke).mock.calls.every(([, args]) => !args || !Object.hasOwn(args, 'path')),
    ).toBe(true);
  });
  it('retains the native mount metadata revision and rejects invalid revisions or extra fields', async () => {
    vi.mocked(invoke).mockReset();
    const workspace = { id: 'new-workspace', name: 'Moved', path: '/native/Moved' };
    vi.mocked(invoke).mockResolvedValueOnce({ ...workspace, metadataRevision: 4 });
    expect(await directoryHistory.open(7, target)).toEqual({ ...workspace, metadataRevision: 4 });
    for (const metadataRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null]) {
      vi.mocked(invoke).mockResolvedValueOnce({ ...workspace, metadataRevision });
      await expect(directoryHistory.open(7, target)).rejects.toThrow('目录历史版本无效');
    }
    vi.mocked(invoke).mockResolvedValueOnce({ ...workspace, metadataRevision: 4, extra: true });
    await expect(directoryHistory.open(7, target)).rejects.toThrow('目录历史字段无效');
  });
  it('propagates revision, identity and storage errors instead of optimistic success', async () => {
    vi.mocked(invoke).mockReset();
    for (const work of [
      () => directoryHistory.pin(7, target, true),
      () => directoryHistory.remove(7, target),
      () => directoryHistory.open(7, target),
      () => directoryHistory.openNewWindow(7, target),
    ]) {
      vi.mocked(invoke).mockRejectedValueOnce(Error('revision or identity changed'));
      await expect(work()).rejects.toThrow('revision or identity changed');
    }
    const calls = vi.mocked(invoke).mock.calls.length;
    await expect(directoryHistory.pin(-1, target, true)).rejects.toThrow();
    await expect(directoryHistory.reveal('/outside')).rejects.toThrow();
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
    vi.mocked(invoke).mockResolvedValueOnce({ revision: 7 });
    await expect(directoryHistory.pin(7, target, true)).rejects.toThrow('匹配');
  });
});
