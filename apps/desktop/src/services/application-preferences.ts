import { invoke } from '@tauri-apps/api/core';
import {
  type ApplicationPreferenceKey,
  type ApplicationPreferenceValue,
  applicationPreferenceChange,
  applicationPreferencesSnapshot,
} from '../features/settings/runtime-preferences/application-preferences.js';
export const applicationPreferences = {
  resetWarnings: () => invoke<void>('reset_dialog_warnings'),
  systemDark: () => invoke<boolean>('system_appearance_dark'),
  stepZoom: (direction: 'in' | 'out') =>
    invoke<unknown>('step_application_zoom', { direction }).then(applicationPreferencesSnapshot),
  async putFromEditor(
    key: 'darkTheme' | 'can_collapse_outline_panel',
    value: string | boolean,
    expected?: import('../features/settings/runtime-preferences/application-preferences.js').ApplicationPreferencesSnapshot,
  ) {
    const before = expected ?? (await this.get());
    const change = applicationPreferenceChange(key, value);
    let result: ReturnType<typeof applicationPreferencesSnapshot>;
    try {
      result = applicationPreferencesSnapshot(
        await invoke<unknown>('put_editor_appearance_preference', {
          expectedRevision: before.revision,
          change,
        }),
      );
    } catch (error) {
      throw Error(`外观偏好保存结果未确认，请重新读取设置：${String(error)}`);
    }
    if (result.revision !== before.revision + 1 || result.values[key] !== value)
      throw Error('外观偏好保存结果未确认。');
    return result;
  },
  applyZoom: () => invoke<void>('apply_application_zoom'),
  async get() {
    return applicationPreferencesSnapshot(await invoke<unknown>('get_application_preferences'));
  },
  async put(
    expectedRevision: number,
    key: ApplicationPreferenceKey,
    value: ApplicationPreferenceValue,
  ) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw Error('应用偏好版本无效。');
    const change = applicationPreferenceChange(key, value);
    let result: ReturnType<typeof applicationPreferencesSnapshot>;
    try {
      result = applicationPreferencesSnapshot(
        await invoke<unknown>('put_application_preferences', { expectedRevision, change }),
      );
    } catch (error) {
      // The call may have committed before its reply was lost. Never replay it.
      throw Error(`应用偏好保存结果未确认，请重新打开设置核对：${String(error)}`);
    }
    if (result.revision !== expectedRevision + 1 || result.values[change.key] !== change.value)
      throw Error('应用偏好保存结果未确认，请重新打开设置。');
    if (
      (key === 'wordsPerMinute' && result.values.customWordsPerMinute !== true) ||
      (key === 'customWordsPerMinute' && value === false && result.values.wordsPerMinute !== 382)
    )
      throw Error('阅读速度保存结果未确认。');
    return result;
  },
};
