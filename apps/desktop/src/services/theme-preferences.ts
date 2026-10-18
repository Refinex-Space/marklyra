import { invoke } from '@tauri-apps/api/core';

export function completePreferenceTheme(
  token: string,
  stylesToken: string | null,
  error: string | null,
): Promise<void> {
  return invoke('complete_preference_theme', { token, stylesToken, error });
}
