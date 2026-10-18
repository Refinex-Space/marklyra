import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: ipc.invoke }));

import { exportPreferences } from '../src/services/export-preferences.js';

describe('export preference receipts', () => {
  beforeEach(() => {
    ipc.invoke.mockReset();
  });
  it('requires the exact complete changed object and next revision', async () => {
    const snapshot = { schemaVersion: 1, revision: 4, html: { exportTheme: 'night' }, pdf: {} };
    ipc.invoke.mockResolvedValue(snapshot);
    await expect(
      exportPreferences.put(3, { key: 'export.html', value: { exportTheme: 'night' } }),
    ).resolves.toEqual(snapshot);
    expect(ipc.invoke).toHaveBeenCalledWith('put_export_preferences', {
      expectedRevision: 3,
      change: { key: 'export.html', value: { exportTheme: 'night' } },
    });
  });
  it('does not retry ambiguous, stale or mismatching committed receipts', async () => {
    for (const receipt of [
      { schemaVersion: 1, revision: 3, html: { exportTheme: 'night' }, pdf: {} },
      { schemaVersion: 1, revision: 4, html: { exportTheme: 'github' }, pdf: {} },
      { schemaVersion: 1, revision: 4, html: {}, pdf: {} },
    ]) {
      ipc.invoke.mockReset().mockResolvedValue(receipt);
      await expect(
        exportPreferences.put(3, { key: 'export.html', value: { exportTheme: 'night' } }),
      ).rejects.toThrow('不得重放');
      expect(ipc.invoke).toHaveBeenCalledTimes(1);
    }
    ipc.invoke.mockReset().mockRejectedValue(Error('receipt lost'));
    await expect(
      exportPreferences.put(3, { key: 'export.pdf', value: { paper: 'A5' } }),
    ).rejects.toThrow('receipt lost');
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });
  it('fails closed on unreadable or corrupt settings', async () => {
    ipc.invoke.mockRejectedValueOnce(Error('corrupt settings'));
    await expect(exportPreferences.get()).rejects.toThrow('corrupt settings');
    ipc.invoke.mockResolvedValueOnce({
      schemaVersion: 1,
      revision: 0,
      html: {},
      pdf: { header: 'unsupported' },
    });
    await expect(exportPreferences.get()).rejects.toThrow();
  });
});
