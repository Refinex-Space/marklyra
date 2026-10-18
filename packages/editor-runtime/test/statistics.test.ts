import { describe, expect, it, vi } from 'vitest';
import type { RuntimeState } from '../src/protocol.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeStatistics } from '../src/runtime/statistics.js';
import { statisticsSpeed } from '../src/statistics.js';

describe('statistics contract', () => {
  it('uses the runtime default and accepts bounded integer speeds', () => {
    expect(statisticsSpeed()).toBe(382);
    for (const n of [1, 120, 240, 382, 999]) expect(statisticsSpeed({ wordsPerMinute: n })).toBe(n);
  });
  it.each([0, -1, 1.5, 1000, NaN, Infinity])('rejects invalid speed %s', (wordsPerMinute) => {
    expect(() => statisticsSpeed({ wordsPerMinute })).toThrow(RangeError);
  });
  it('shadows WORD without mutating the installed delimiter or invoking a setter', async () => {
    const counter = {
      delimiter: 3,
      getWordCount() {
        expect(this.delimiter).toBe(0);
        return 7;
      },
      getWordCountInSelection: () => 2,
      getCharCountInSelection: () => 4,
    };
    const state = { sourceMode: false } as RuntimeState;
    const read = vi.fn(() => state);
    const statistics = new RuntimeStatistics({
      runtime: {
        editor: {
          wordCount: counter,
          sourceView: { inSourceMode: false },
          writingArea: { childElementCount: 1 },
        },
      } as unknown as LegacyGlobals,
      state: read,
      available: () => true,
      invalidated: vi.fn(),
    });
    expect(await statistics.read(false)).toEqual({
      state,
      words: 7,
      renderEpoch: 0,
      selection: { words: 2, characters: 4 },
    });
    expect(counter.delimiter).toBe(3);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('never reads stale WYS counts in source mode and preserves whitespace selections', async () => {
    const count = vi.fn();
    const statistics = new RuntimeStatistics({
      runtime: {
        editor: {
          sourceView: { inSourceMode: true },
          writingArea: { childElementCount: 1 },
          wordCount: {
            delimiter: 0,
            getWordCount: count,
            getWordCountInSelection: () => 0,
            getCharCountInSelection: () => 3,
          },
        },
      } as unknown as LegacyGlobals,
      state: () => ({ sourceMode: true }) as RuntimeState,
      available: () => true,
      invalidated: vi.fn(),
    });
    expect((await statistics.read(false)).selection).toEqual({ words: 0, characters: 3 });
    expect(count).not.toHaveBeenCalled();
  });
  it('reuses whole words only for the same canonical, sequence and render epoch, while reading current selection', async () => {
    const counter = {
      delimiter: 0,
      getWordCount: vi.fn(() => 3),
      getWordCountInSelection: vi.fn(() => 1),
      getCharCountInSelection: vi.fn(() => 5),
    };
    let state = { sourceMode: false, canonical: 'Alpha beta gamma', sequence: 1 } as RuntimeState;
    const statistics = new RuntimeStatistics({
      runtime: {
        editor: {
          wordCount: counter,
          sourceView: { inSourceMode: false },
          writingArea: { childElementCount: 1 },
        },
      } as unknown as LegacyGlobals,
      state: () => state,
      available: () => true,
      invalidated: vi.fn(),
    });
    await statistics.read(false);
    await statistics.read(false);
    expect(counter.getWordCount).toHaveBeenCalledTimes(1);
    expect(counter.getCharCountInSelection).toHaveBeenCalledTimes(2);
    state = { ...state, sequence: 2 };
    await statistics.read(false);
    expect(counter.getWordCount).toHaveBeenCalledTimes(2);
    state = { ...state, canonical: 'New source' };
    await statistics.read(false);
    expect(counter.getWordCount).toHaveBeenCalledTimes(3);
  });
  it('rejects unavailable reads and invalidates disposed snapshots', async () => {
    const statistics = new RuntimeStatistics({
      runtime: {} as LegacyGlobals,
      state: vi.fn(),
      available: () => false,
      invalidated: vi.fn(),
    });
    await expect(statistics.read(false)).rejects.toThrow();
    expect(statistics.current(0, 0, 0)).toBe(false);
    statistics.destroy();
    expect(statistics.current(0, 0, 0)).toBe(false);
  });
});
