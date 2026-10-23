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
interface ChromeRequest {
  payload: Record<string, unknown>;
  resolve(): void;
  reject(error: unknown): void;
}
let pendingChrome: ChromeRequest | undefined;
let updatingChrome = false;

function updateChrome(payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    // A queued snapshot replaced by a newer one needs no native work.
    pendingChrome?.resolve();
    pendingChrome = { payload, resolve, reject };
    if (updatingChrome) return;
    updatingChrome = true;
    void (async () => {
      try {
        while (pendingChrome) {
          const current = pendingChrome;
          pendingChrome = undefined;
          try {
            // Native completion order must match publication order, including Save
            // and document switches. Statistics can replace queued snapshots.
            await invoke<void>('update_editor_chrome', { payload: current.payload });
            current.resolve();
          } catch (error) {
            current.reject(error);
          }
        }
      } finally {
        updatingChrome = false;
      }
    })();
  });
}

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
    canCloseDocument = false,
    /** Title for a document without a file yet. */
    untitledName?: string,
  ) {
    const values = statistics ?? { words: 0, characters: 0, lines: 0, readingMinutes: 0 };
    const labels = { words: '词', characters: '字符', lines: '行', readingMinutes: '分钟' };
    return updateChrome({
      documentId,
      dirty,
      alwaysShowWordCount,
      dark,
      outlinePanelOpen,
      aiPanelOpen,
      canCloseDocument,
      ...(untitledName ? { untitledName } : {}),
      sourceMode: viewMode === undefined ? undefined : viewMode === 'source',
      statisticsLabel: `${values[unit].toLocaleString()} ${labels[unit]}`,
      statistics: {
        words: values.words,
        characters: values.characters,
        lines: values.lines,
        readingMinutes: values.readingMinutes,
        unit,
      },
    });
  },
  openPreferences: () => invoke<boolean>('open_preferences_window'),
  closePreferences: () => invoke<void>('close_preferences_window'),
  preferencesChanged: () => invoke<void>('preferences_changed'),
};
