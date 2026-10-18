import { describe, expect, it } from 'vitest';
import { VIRTUAL_DOCUMENT_PATH } from '../src/images/contracts.js';
import type { LegacyFile } from '../src/runtime/legacy-types.js';
import { originalSuggestedName } from '../src/runtime/suggested-name.js';

describe('original suggested-name virtual metadata adapter', () => {
  it.each([false, true])(
    'restores the exact filename descriptor after an original read (throws=%s)',
    (throws) => {
      const bundle = { filePath: VIRTUAL_DOCUMENT_PATH, fileName: 'document.md' },
        before = Object.getOwnPropertyDescriptor(bundle, 'fileName');
      const file = {
        bundle,
        getSuggestedFileName() {
          expect(bundle.fileName).toBe('');
          if (throws) throw Error('original failure');
          return 'Actual Title';
        },
      } as unknown as LegacyFile;
      if (throws) expect(() => originalSuggestedName(file)).toThrow('original failure');
      else expect(originalSuggestedName(file)).toBe('Actual Title');
      expect(file.bundle).toBe(bundle);
      expect(Object.getOwnPropertyDescriptor(bundle, 'fileName')).toEqual(before);
      expect(bundle.filePath).toBe(VIRTUAL_DOCUMENT_PATH);
    },
  );
  it('does not shadow genuine host-provided filename metadata', () => {
    const bundle = { filePath: '/host/Actual.md', fileName: 'Actual.md' };
    expect(
      originalSuggestedName({
        bundle,
        getSuggestedFileName() {
          expect(bundle.fileName).toBe('Actual.md');
          return 'Actual';
        },
      } as unknown as LegacyFile),
    ).toBe('Actual');
  });
  it('rejects unknown virtual descriptors before invoking the original reader', () => {
    const bundle = { filePath: VIRTUAL_DOCUMENT_PATH };
    let calls = 0;
    Object.defineProperty(bundle, 'fileName', { get: () => 'document.md' });
    expect(() =>
      originalSuggestedName({
        bundle,
        getSuggestedFileName() {
          calls++;
          return 'Wrong';
        },
      } as unknown as LegacyFile),
    ).toThrow('虚拟文件名');
    expect(calls).toBe(0);
  });
  it('does not send a split trailing surrogate to a native filename dialog', () => {
    const name = 'a'.repeat(119) + '\ud83d';
    expect(
      originalSuggestedName({
        bundle: {},
        getSuggestedFileName: () => name,
      } as unknown as LegacyFile),
    ).toBe('a'.repeat(119));
  });
});
