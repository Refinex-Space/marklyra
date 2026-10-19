import type { MarkLyraStatistics, MarkLyraViewMode } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import type { StatisticsUnit } from '../features/settings/preferences.js';
import { desktopAvailable } from './documents.js';

/** Who draws the unified titlebar: AppKit accessories on macOS, the WebView on Windows. */
export type TitlebarHost = 'appkit' | 'web' | 'none';
export interface EditorChrome {
  native: boolean;
  titlebar: TitlebarHost;
  preferencesWindow: boolean;
}
interface TitlebarLayout {
  contentLeft: number;
  contentRight: number;
  viewportWidth: number;
}
let pendingTitleLayout: TitlebarLayout | undefined;
let titleLayoutWork: Promise<void> | undefined;

export const editorChrome = {
  updateTitleLayout(layout: TitlebarLayout): Promise<void> {
    pendingTitleLayout = layout;
    titleLayoutWork ??= (async () => {
      try {
        // Coalesce animation/drag frames and keep native updates in order.
        while (pendingTitleLayout) {
          const payload = pendingTitleLayout;
          pendingTitleLayout = undefined;
          await invoke<void>('update_editor_title_layout', { payload });
        }
      } finally {
        pendingTitleLayout = undefined;
        titleLayoutWork = undefined;
      }
    })();
    return titleLayoutWork;
  },
  async initialize(): Promise<EditorChrome> {
    if (!desktopAvailable) return { native: false, titlebar: 'none', preferencesWindow: false };
    const result = await invoke<Partial<EditorChrome> | null>('initialise_editor_chrome');
    // Browser tests/older hosts do not provide AppKit. Only confirmed native
    // installation may replace the fallback HTML controls.
    const native = result?.native === true;
    return {
      native,
      titlebar: !native ? 'none' : result?.titlebar === 'web' ? 'web' : 'appkit',
      preferencesWindow: result?.preferencesWindow === true,
    };
  },
  /** Top-level native menu titles, in order, for the WebView-hosted titlebar. */
  menuTitles: () => invoke<string[]>('list_app_menu'),
  /** Pops up a native menu below the titlebar control; no index pops the whole menu tree. */
  popupMenu: (index: number | null, x: number, y: number, viewportWidth: number) =>
    invoke<void>('popup_app_menu', { index, x, y, viewportWidth }),
  update(
    documentId: string | null,
    dirty: boolean,
    statistics: MarkLyraStatistics | null,
    unit: StatisticsUnit,
    alwaysShowWordCount: boolean,
    dark: boolean,
    outlinePanelOpen: boolean,
    viewMode?: MarkLyraViewMode,
    aiPanelOpen = false,
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
        aiPanelOpen,
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
  openPreferences: () => invoke<boolean>('open_preferences_window'),
  closePreferences: () => invoke<void>('close_preferences_window'),
  preferencesChanged: () => invoke<void>('preferences_changed'),
};
