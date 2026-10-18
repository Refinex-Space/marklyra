import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAutoSavePreference } from '../src/features/settings/auto-save-preference.js';
import { initialPreferencesOptions } from '../src/features/settings/runtime-preferences/policy.js';

afterEach(() => vi.unstubAllGlobals());

describe('editing auto-save defaults', () => {
  it.each([null, 'true', 'false'])(
    'preserves the stored choice %s with default enabled',
    (stored) => {
      vi.stubGlobal('localStorage', { getItem: () => stored });
      expect(readAutoSavePreference()).toBe(stored !== 'false');
    },
  );

  it('keeps the product default when local storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage blocked');
      },
    });
    expect(readAutoSavePreference()).toBe(true);
  });

  it('initializes the isolated settings page as enabled without overriding explicit false', () => {
    expect(initialPreferencesOptions({}).enableAutoSave).toBe(true);
    expect(initialPreferencesOptions({ enableAutoSave: false }).enableAutoSave).toBe(false);
  });
});
