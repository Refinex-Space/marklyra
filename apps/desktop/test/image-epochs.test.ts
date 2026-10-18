import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetImageEpoch, imageEpoch, recordImageEpoch } from '../src/services/image-epochs.js';

const calls = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: calls.invoke }));

import { documents } from '../src/services/documents.js';
import { documentImages, fenceImageSave } from '../src/services/images.js';

afterEach(() => {
  calls.invoke.mockReset();
  for (let at = 0; at < 140; at++) forgetImageEpoch(`doc-${at}`);
  forgetImageEpoch('current');
});
describe('native image epochs', () => {
  it('rejects an import held across a completed Save and allows only a fresh request afterward', async () => {
    let finish!: (value: { source: string; url: string }) => void;
    calls.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = {
      documentContext: 'save-fenced',
      name: 'image.png',
      bytes: new Uint8Array([1]),
      type: 'image/png',
      referenceRoot: '',
      signal: new AbortController().signal,
    };
    const old = documentImages.import?.(request);
    const release = fenceImageSave('save-fenced');
    await expect(documentImages.import?.(request)).rejects.toThrow('保存期间');
    expect(calls.invoke).toHaveBeenCalledTimes(1);
    release();
    finish({ source: 'file:///owned/image.png', url: 'marklyra://runtime/image' });
    await expect(old).rejects.toThrow('保存期间');
    calls.invoke.mockResolvedValue({ source: 'assets/new.png', url: 'marklyra://runtime/new' });
    await expect(documentImages.import?.(request)).resolves.toMatchObject({
      source: 'assets/new.png',
    });
  });
  it('keeps monotonic bounded metadata and clears successful closes', async () => {
    for (let at = 0; at < 140; at++) recordImageEpoch(`doc-${at}`, at);
    expect(imageEpoch('doc-0')).toBeUndefined();
    expect(imageEpoch('doc-139')).toBe(139);
    recordImageEpoch('current', 5);
    recordImageEpoch('current', 2);
    expect(imageEpoch('current')).toBe(5);
    calls.invoke.mockResolvedValue(undefined);
    await documents.close('current');
    expect(imageEpoch('current')).toBeUndefined();
  });
  it('captures epoch at invocation and an aborted old generation cannot adopt a new epoch', async () => {
    const controller = new AbortController();
    recordImageEpoch('current', 3);
    let finish!: (value: { source: string; url: string }) => void;
    calls.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const operation = documentImages.import?.({
      documentContext: 'current',
      name: 'image.png',
      bytes: new Uint8Array([1]),
      type: 'image/png',
      referenceRoot: '',
      signal: controller.signal,
    });
    expect(calls.invoke.mock.calls[0]?.[1]).toMatchObject({ expectedMetadataRevision: 3 });
    controller.abort();
    recordImageEpoch('current', 4);
    finish({ source: 'assets/image.png', url: 'marklyra://runtime/image' });
    await expect(operation).rejects.toThrow();
    await expect(
      documentImages.resolve({
        source: 'image.png',
        reference: 'image.png',
        documentContext: 'current',
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(calls.invoke).toHaveBeenCalledTimes(1);
  });
});
