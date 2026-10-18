import { invoke } from '@tauri-apps/api/core';
import { beforeEach, expect, it, vi } from 'vitest';
import { entryActions, entryReceipt, entryRequest } from '../src/services/entry-actions.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const workspace = crypto.randomUUID(),
  token = crypto.randomUUID(),
  operation = crypto.randomUUID();
const copy = {
  operationId: operation,
  entryToken: token,
  name: 'A (copy).md',
  relativePath: 'Folder/A (copy).md',
  kind: 'file',
  size: 19,
  warnings: [],
};
beforeEach(() => vi.mocked(invoke).mockReset());
it('sends only scoped capabilities and resolves lost responses without repeating an effect', async () => {
  vi.mocked(invoke).mockRejectedValueOnce(Error('lost ACK'));
  await expect(entryActions.perform(workspace, token, operation, 'duplicate')).rejects.toThrow(
    'lost ACK',
  );
  vi.mocked(invoke).mockResolvedValueOnce({ status: 'committed', receipt: copy });
  expect(await entryActions.resolve(workspace, token, operation, 'duplicate')).toEqual({
    status: 'committed',
    receipt: copy,
  });
  expect(vi.mocked(invoke).mock.calls).toEqual([
    [
      'duplicate_workspace_entry',
      { workspaceId: workspace, entryToken: token, operationId: operation },
    ],
    [
      'resolve_workspace_entry_duplicate',
      { workspaceId: workspace, entryToken: token, operationId: operation },
    ],
  ]);
});
it('rejects foreign receipts and escaping copy paths', () => {
  for (const patch of [
    { entryToken: crypto.randomUUID() },
    { operationId: crypto.randomUUID() },
    { relativePath: '../A.md' },
    { relativePath: '/A.md' },
    { relativePath: 'x//A.md' },
    { size: -1 },
    { kind: 'directory' },
  ])
    expect(() => entryReceipt({ ...copy, ...patch }, token, operation, 'duplicate')).toThrow();
  expect(() => entryRequest('/ungranted', token, operation, 'reveal')).toThrow();
});
it('validates native action kind and child-window receipts; unknown checks never dispatch', async () => {
  const receipt = {
    operationId: operation,
    entryToken: token,
    action: 'open-new',
    windowLabel: `editor-${crypto.randomUUID()}`,
  };
  vi.mocked(invoke).mockResolvedValueOnce({ status: 'committed', receipt });
  expect(await entryActions.perform(workspace, token, operation, 'open-new')).toEqual({
    status: 'committed',
    receipt,
  });
  expect(() =>
    entryReceipt({ ...receipt, action: 'info' }, token, operation, 'open-new'),
  ).toThrow();
  for (const windowLabel of [null, 'main', 'editor-' + '-'.repeat(36)])
    expect(() => entryReceipt({ ...receipt, windowLabel }, token, operation, 'open-new')).toThrow();
  vi.mocked(invoke).mockResolvedValueOnce({ status: 'mutationUncertain' });
  expect(await entryActions.resolve(workspace, token, operation, 'open-new')).toEqual({
    status: 'mutationUncertain',
  });
  expect(vi.mocked(invoke).mock.calls.at(-1)?.[0]).toBe('resolve_workspace_entry_action');
});
it('carries an ephemeral document snapshot without granting a path and accepts native blank-window reuse', async () => {
  const receipt = {
    operationId: operation,
    entryToken: token,
    action: 'open-new',
    windowLabel: 'main',
    workspace: { id: 'nested-scope', name: 'Nested', path: '/native/selected/Nested' },
  };
  vi.mocked(invoke).mockResolvedValueOnce({ status: 'committed', receipt });
  const editorSnapshot = { documentId: 'own-document', text: 'unsaved\r\n', savedText: 'disk\r\n' };
  expect(
    await entryActions.perform(workspace, token, operation, 'open-new', editorSnapshot),
  ).toEqual({ status: 'committed', receipt });
  expect(vi.mocked(invoke).mock.calls[0]?.[1]).toEqual({
    workspaceId: workspace,
    entryToken: token,
    operationId: operation,
    action: 'open-new',
    editorSnapshot,
  });
  expect(() =>
    entryReceipt({ ...receipt, action: 'move', windowLabel: null }, token, operation, 'move'),
  ).toThrow();
  expect(() =>
    entryReceipt(
      { ...receipt, workspace: { id: 'nested', path: '/bad\0path', name: 'Nested' } },
      token,
      operation,
      'open-new',
    ),
  ).toThrow();
});
