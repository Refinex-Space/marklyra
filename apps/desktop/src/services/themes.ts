import type { ThemeStyles } from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import {
  type BuiltinTheme,
  builtinTheme,
  defaultThemeCatalog,
  themeCatalog,
} from '../features/themes/model.js';
import { desktopAvailable } from './documents.js';

export interface PreparedTheme {
  token: string;
  theme: BuiltinTheme;
  styles: ThemeStyles;
}

export const themeFiles = {
  async syncMenu(): Promise<void> {
    if (desktopAvailable) await invoke('sync_theme_menu');
  },
  async catalog() {
    return desktopAvailable
      ? themeCatalog(await invoke('list_theme_catalog'))
      : defaultThemeCatalog;
  },
  async prepare(themeId: string, requestId: number): Promise<PreparedTheme> {
    return desktopAvailable
      ? invoke('load_theme_styles', { themeId, requestId })
      : {
          token: '',
          theme: builtinTheme(themeId),
          styles: { theme: null, baseUser: null, themeUser: null },
        };
  },
  async accept(token: string): Promise<void> {
    if (desktopAvailable) await invoke('accept_theme_styles', { token });
  },
  async requestPreference(themeId: string, target: 'normal' | 'dark' = 'normal'): Promise<void> {
    if (!desktopAvailable) throw new Error('切换偏好设置主题需要桌面程序');
    await invoke<void>('request_preference_theme', { themeId, target });
  },
  async openFolder(): Promise<void> {
    if (!desktopAvailable) throw new Error('打开主题文件夹需要桌面程序');
    await invoke('open_theme_folder');
  },
  async openGallery(): Promise<void> {
    if (!desktopAvailable) throw new Error('打开主题网站需要桌面程序');
    await invoke('open_theme_gallery');
  },
};
