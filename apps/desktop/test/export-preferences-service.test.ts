import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: ipc.invoke }));

import { defaultExportPreferences } from '../src/features/export/preferences.js';
import { exportPreferences, sameValue } from '../src/services/export-preferences.js';

const snapshot = (revision: number, extra: Record<string, unknown> = {}) => ({
  ...defaultExportPreferences(),
  revision,
  ...extra,
});

describe('export preference receipts', () => {
  beforeEach(() => {
    ipc.invoke.mockReset();
  });
  it('requires the exact complete changed object and next revision', async () => {
    const receipt = snapshot(4, { html: { exportTheme: 'marklyra-dark' } });
    ipc.invoke.mockResolvedValue(receipt);
    await expect(
      exportPreferences.put(3, { key: 'export.html', value: { exportTheme: 'marklyra-dark' } }),
    ).resolves.toEqual(receipt);
    expect(ipc.invoke).toHaveBeenCalledWith('put_export_preferences', {
      expectedRevision: 3,
      change: { key: 'export.html', value: { exportTheme: 'marklyra-dark' } },
    });
  });
  it('confirms every group, whatever the key order of the host reply', async () => {
    ipc.invoke
      .mockReset()
      .mockResolvedValue(snapshot(1, { general: { folderMode: 'document', openFile: true } }));
    await expect(
      exportPreferences.put(0, {
        key: 'export.general',
        value: { openFile: true, folderMode: 'document' },
      }),
    ).resolves.toBeTruthy();
    ipc.invoke
      .mockReset()
      .mockResolvedValue(snapshot(1, { pdf: { paper: 'A5', landscape: true } }));
    await expect(
      exportPreferences.put(0, { key: 'export.pdf', value: { landscape: true, paper: 'A5' } }),
    ).resolves.toBeTruthy();
    ipc.invoke
      .mockReset()
      .mockResolvedValue(snapshot(1, { formats: { docx: { tocDepth: 2, toc: true } } }));
    await expect(
      exportPreferences.put(0, {
        key: 'export.formats',
        value: { docx: { toc: true, tocDepth: 2 } },
      }),
    ).resolves.toBeTruthy();
    ipc.invoke.mockReset().mockResolvedValue(snapshot(1, { pandocPath: '' }));
    await expect(exportPreferences.put(0, { key: 'pandocPath', value: '' })).resolves.toBeTruthy();
  });
  it('does not retry ambiguous, stale or mismatching committed receipts', async () => {
    for (const receipt of [
      snapshot(3, { html: { exportTheme: 'marklyra-dark' } }),
      snapshot(4, { html: { exportTheme: 'marklyra-light' } }),
      snapshot(4),
    ]) {
      ipc.invoke.mockReset().mockResolvedValue(receipt);
      await expect(
        exportPreferences.put(3, { key: 'export.html', value: { exportTheme: 'marklyra-dark' } }),
      ).rejects.toThrow('不得重放');
      expect(ipc.invoke).toHaveBeenCalledTimes(1);
    }
    ipc.invoke.mockReset().mockRejectedValue(Error('receipt lost'));
    await expect(
      exportPreferences.put(3, { key: 'export.pdf', value: { paper: 'A5' } }),
    ).rejects.toThrow('receipt lost');
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });
  it('never sends a value the host would refuse', async () => {
    await expect(
      exportPreferences.put(0, { key: 'export.pdf', value: { paper: 'B5' } } as never),
    ).rejects.toThrow();
    await expect(exportPreferences.put(-1, { key: 'pandocPath', value: '' })).rejects.toThrow();
    expect(ipc.invoke).not.toHaveBeenCalled();
  });
  it('fails closed on unreadable or corrupt settings', async () => {
    ipc.invoke.mockRejectedValueOnce(Error('corrupt settings'));
    await expect(exportPreferences.get()).rejects.toThrow('corrupt settings');
    ipc.invoke.mockResolvedValueOnce({ ...snapshot(0), pdf: { header: 'x'.repeat(300) } });
    await expect(exportPreferences.get()).rejects.toThrow();
  });
  it('compares structure without regard to key order', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(
      true,
    );
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue('', '')).toBe(true);
    expect(sameValue({}, [])).toBe(false);
  });
});
