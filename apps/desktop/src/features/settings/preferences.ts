import {
  defaultMarkLyraEditorPreferences,
  type MarkLyraEditorPreferences,
  marklyraEditorPreferences,
} from '@marklyra/editor-runtime';
import {
  type DailyPreferences,
  defaultDailyPreferences,
  normalizeDailyPreferences,
} from '../daily/daily-preferences.js';
import {
  defaultFileSidebarPreferences,
  type FileSidebarPreferences,
  normalizeFileSidebarPreferences,
} from '../file-explorer/file-preferences.js';
import {
  defaultGitPreferences,
  type GitPreferences,
  normalizeGitPreferences,
} from '../git/git-preferences.js';
import { defaultImageStorageFolder, normalizeImageStorageFolder } from './image-storage.js';

export type StatisticsUnit = 'words' | 'characters' | 'lines' | 'readingMinutes';
export interface Preferences {
  sidebarWidth: number;
  formatToolbar: boolean;
  statisticsUnit: StatisticsUnit;
  wordsPerMinute: number;
  imageStorageFolder: string;
  customImageStorageFolder: string;
  imageMoveForLocal: boolean;
  imageMoveForWeb: boolean;
  useRelativeImagePath: boolean;
  relativeImagePathWithDot: boolean;
  alwaysShowWordCount: boolean;
  customWordsPerMinute: boolean;
  editorPreferences: MarkLyraEditorPreferences;
  fileSidebar: FileSidebarPreferences;
  daily: DailyPreferences;
  git: GitPreferences;
}
export const defaultPreferences: Preferences = {
  sidebarWidth: 270,
  formatToolbar: false,
  statisticsUnit: 'words',
  wordsPerMinute: 382,
  imageStorageFolder: defaultImageStorageFolder,
  customImageStorageFolder: defaultImageStorageFolder,
  imageMoveForLocal: true,
  imageMoveForWeb: false,
  useRelativeImagePath: true,
  relativeImagePathWithDot: false,
  alwaysShowWordCount: true,
  customWordsPerMinute: false,
  editorPreferences: { ...defaultMarkLyraEditorPreferences },
  fileSidebar: { ...defaultFileSidebarPreferences },
  daily: { ...defaultDailyPreferences },
  git: { ...defaultGitPreferences },
};
export const preferencesKey = 'marklyra-preferences-v1';
export function normalizePreferences(value: unknown): Preferences {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  let editorPreferences: MarkLyraEditorPreferences;
  try {
    editorPreferences = marklyraEditorPreferences(input.editorPreferences ?? {});
  } catch {
    editorPreferences = { ...defaultMarkLyraEditorPreferences };
  }
  return {
    fileSidebar: normalizeFileSidebarPreferences(input.fileSidebar),
    daily: normalizeDailyPreferences(input.daily),
    git: normalizeGitPreferences(input.git),
    editorPreferences,
    imageStorageFolder: normalizeImageStorageFolder(input.imageStorageFolder),
    customImageStorageFolder: normalizeImageStorageFolder(
      input.customImageStorageFolder ?? input.imageStorageFolder,
    ),
    imageMoveForLocal:
      typeof input.imageMoveForLocal === 'boolean' ? input.imageMoveForLocal : true,
    imageMoveForWeb: input.imageMoveForWeb === true,
    useRelativeImagePath:
      typeof input.useRelativeImagePath === 'boolean' ? input.useRelativeImagePath : true,
    relativeImagePathWithDot: input.relativeImagePathWithDot === true,
    sidebarWidth:
      typeof input.sidebarWidth === 'number' && Number.isFinite(input.sidebarWidth)
        ? Math.max(160, Math.round(input.sidebarWidth))
        : defaultPreferences.sidebarWidth,
    formatToolbar:
      typeof input.formatToolbar === 'boolean'
        ? input.formatToolbar
        : defaultPreferences.formatToolbar,
    statisticsUnit: ['words', 'characters', 'lines', 'readingMinutes'].includes(
      String(input.statisticsUnit),
    )
      ? (input.statisticsUnit as StatisticsUnit)
      : 'words',
    wordsPerMinute:
      typeof input.wordsPerMinute === 'number' &&
      Number.isInteger(input.wordsPerMinute) &&
      input.wordsPerMinute >= 1 &&
      input.wordsPerMinute <= 999
        ? input.wordsPerMinute
        : 382,
    alwaysShowWordCount:
      typeof input.alwaysShowWordCount === 'boolean' ? input.alwaysShowWordCount : true,
    customWordsPerMinute:
      typeof input.customWordsPerMinute === 'boolean' ? input.customWordsPerMinute : false,
  };
}
export function readPreferences(): Preferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(preferencesKey) ?? 'null'));
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(value: Preferences): boolean {
  try {
    const serialized = JSON.stringify(normalizePreferences(value));
    localStorage.setItem(preferencesKey, serialized);
    if (localStorage.getItem(preferencesKey) !== serialized) return false;
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event('marklyra-preferences-changed'));
    return true;
  } catch {
    // The current session remains usable when storage is unavailable.
    return false;
  }
}
