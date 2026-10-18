/** Numeric statistics include rendered content and auxiliary DOM text. */
export interface MarkLyraStatistics {
  algorithm: 'marklyra-rendered-v1';
  wordBasis: 'legacy-rendered';
  characterUnit: 'utf16-code-unit';
  sourceBasis: 'canonical-markdown';
  mode: 'wysiwyg' | 'source';
  revision: number;
  renderEpoch: number;
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
  wordsPerMinute: number;
  selection: { words: number; characters: number } | null;
}
export interface StatisticsOptions {
  wordsPerMinute?: number;
}
export function statisticsSpeed(options: StatisticsOptions = {}): number {
  const speed = options.wordsPerMinute ?? 382;
  if (!Number.isInteger(speed) || speed < 1 || speed > 999)
    throw new RangeError('wordsPerMinute must be an integer from 1 to 999');
  return speed;
}
