import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordImageEpoch } from '../src/services/image-epochs.js';
import { documentImages, fenceImageSave } from '../src/services/images.js';
import {
  importNativeInput,
  initialiseNativeInput,
  nativeDropIntent,
  nativeFileDrop,
} from '../src/services/native-input.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }));
const ticket = '00000000-0000-4000-8000-000000000018';
const payload = () => ({
  ticket,
  entries: [{ name: 'image.png', kind: 'image' as const }],
  position: { x: 100, y: 100 },
  viewport: { width: 800, height: 600 },
});
const preferences = {
  revision: 0,
  defaultExtension: 'md',
  noRecentFiles: false,
  saveFileOnSwitch: false,
  alwaysConfirmsChanges: true,
};
describe('native input Shell boundary', () => {
  beforeEach(() => vi.mocked(invoke).mockReset().mockResolvedValue(undefined));
  it('keeps the editor usable when a Native hook is unavailable and only enables an acknowledged hook', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Unsupported Wry method'));
    expect(await initialiseNativeInput()).toContain('Unsupported Wry method');
    expect(documentImages.nativeDrop).toBe(false);
    vi.mocked(invoke).mockResolvedValueOnce(true);
    expect(await initialiseNativeInput()).toBeUndefined();
    expect(documentImages.nativeDrop).toBe(true);
    vi.mocked(invoke).mockResolvedValueOnce(false);
    await initialiseNativeInput();
    expect(documentImages.nativeDrop).toBe(false);
  });
  it('validates native envelopes before using coordinates or choosing an action', () => {
    expect(nativeFileDrop(payload()).ticket).toBe(ticket);
    for (const value of [
      null,
      {},
      { ...payload(), entries: [] },
      { ...payload(), position: { x: NaN, y: 1 } },
      { ...payload(), viewport: { width: 0, height: 600 } },
      { ...payload(), entries: [{ name: 'x', kind: 'shell' }] },
    ])
      expect(() => nativeFileDrop(value)).toThrow();
  });
  it('routes file/folder preferences without treating modifiers as permission', () => {
    expect(nativeDropIntent(payload(), preferences)).toBe('images');
    for (const [name, kind, action] of [
      ['a.md', 'file', 'document'],
      ['a', 'directory', 'directory'],
      ['a.docx', 'file', 'unsupported-import'],
      ['a.zip', 'file', 'references'],
    ] as const) {
      const drop = { ...payload(), entries: [{ name, kind }] };
      expect(nativeDropIntent(drop, preferences)).toBe(action);
      expect(
        nativeDropIntent(drop, {
          ...preferences,
          actionWhenDropFile: 'link',
          actionWhenDropFolder: 'link',
          actionWhenDropImport: 'link',
        }),
      ).toBe('references');
    }
  });
  it('sends a receipt and captured Native owner revision, never a renderer path', async () => {
    recordImageEpoch('owner', 12);
    vi.mocked(invoke).mockResolvedValueOnce([{ kind: 'link', name: 'a.md', source: '../a.md' }]);
    await importNativeInput(
      ticket,
      'paste',
    )({ documentContext: 'owner', referenceRoot: '', signal: new AbortController().signal });
    const call = vi.mocked(invoke).mock.calls[0];
    expect(call?.[0]).toBe('import_native_input_images');
    expect(call?.[1]).toMatchObject({
      request: { ticket, id: 'owner', mode: 'paste', expectedMetadataRevision: 12 },
    });
    expect(call?.[1]).not.toHaveProperty('path');
  });
  it('rejects a late completed import after a Save fence has already ended', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const work = importNativeInput(ticket)({
      documentContext: 'fence',
      referenceRoot: '',
      signal: new AbortController().signal,
    });
    const rejected = expect(work).rejects.toThrow('保存');
    fenceImageSave('fence')();
    finish([]);
    await rejected;
  });
  it('cancels the exact pending receipt on abort and refuses the late response', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const abort = new AbortController();
    const work = importNativeInput(ticket)({
      documentContext: 'abort',
      referenceRoot: '',
      signal: abort.signal,
    });
    const rejected = expect(work).rejects.toThrow();
    abort.abort();
    expect(invoke).toHaveBeenCalledWith('cancel_native_input', { ticket });
    finish([]);
    await rejected;
  });
});
