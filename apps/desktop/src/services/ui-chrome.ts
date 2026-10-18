import type { MarkLyraStatistics, MarkLyraViewMode } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import type { StatisticsUnit } from '../features/settings/preferences.js';
import { desktopAvailable } from './documents.js';

export interface EditorChrome {
  native: boolean;
  preferencesWindow: boolean;
}
export const editorChrome = {
  async initialize(): Promise<EditorChrome> {
    if (!desktopAvailable) return { native: false, preferencesWindow: false };
    const result = await invoke<EditorChrome | null>('initialise_editor_chrome');
    // Browser tests/older hosts do not provide AppKit. Only confirmed native
    // installation may replace the fallback HTML controls.
    return {
      native: result?.native === true,
      preferencesWindow: result?.preferencesWindow === true,
    };
  },
  update(
    documentId: string | null,
    dirty: boolean,
    statistics: MarkLyraStatistics | null,
    unit: StatisticsUnit,
    alwaysShowWordCount: boolean,
    dark: boolean,
    outlinePanelOpen: boolean,
    viewMode?: MarkLyraViewMode,
  ) {
    const values = statistics ?? { words: 0, characters: 0, lines: 0, readingMinutes: 0 };
    const labels = { words: '词', characters: '字符', lines: '行', readingMinutes: '分钟' };
    return invoke<void>('update_editor_chrome', {
      payload: {
        documentId,
        dirty,
        alwaysShowWordCount,
        dark,
        outlinePanelOpen,
        sourceMode: viewMode === undefined ? undefined : viewMode === 'source',
        statisticsLabel: `${values[unit].toLocaleString()} ${labels[unit]}`,
        statistics: {
          words: values.words,
          characters: values.characters,
          lines: values.lines,
          readingMinutes: values.readingMinutes,
          unit,
        },
      },
    });
  },
  openPreferences: () => invoke<void>('open_preferences_window'),
  closePreferences: () => invoke<void>('close_preferences_window'),
  preferencesChanged: () => invoke<void>('preferences_changed'),
};
