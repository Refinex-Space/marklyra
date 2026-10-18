import { invoke } from '@tauri-apps/api/core';
import {
  type MarkdownPreferenceChange,
  type MarkdownPreferencesSnapshot,
  markdownPreferenceChange,
  markdownPreferencesSnapshot,
} from '../features/settings/runtime-preferences/markdown-preferences.js';

export * from '../features/settings/runtime-preferences/markdown-preferences.js';

function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Markdown偏好版本无效。');
  return value;
}
/** Native authority and scoped opener requests; no local mirror or document/history payload. */
export const markdownPreferences = {
  async request(
    expectedRevision: number,
    change: MarkdownPreferenceChange,
  ): Promise<MarkdownPreferencesSnapshot> {
    const expected = revision(expectedRevision),
      checked = markdownPreferenceChange(change);
    const saved = markdownPreferencesSnapshot(
      await invoke<unknown>('request_preference_markdown', {
        expectedRevision: expected,
        change: checked,
      }),
    );
    if (
      saved.revision !== expected + 1 ||
      Object.entries(checked).some(
        ([key, value]) => saved[key as keyof MarkdownPreferenceChange] !== value,
      )
    )
      throw new Error('Markdown策略未收到匹配的持久化确认。');
    return saved;
  },
  async complete(token: string, error: string | null): Promise<MarkdownPreferencesSnapshot | null> {
    if (
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(token) ||
      (error !== null && typeof error !== 'string')
    )
      throw new Error('Markdown策略回执无效。');
    const result = await invoke<unknown>('complete_preference_markdown', { token, error });
    return result === null ? null : markdownPreferencesSnapshot(result);
  },
  async get(): Promise<MarkdownPreferencesSnapshot> {
    return markdownPreferencesSnapshot(await invoke<unknown>('get_markdown_preferences'));
  },
  async put(
    expectedRevision: number,
    change: MarkdownPreferenceChange,
  ): Promise<MarkdownPreferencesSnapshot> {
    return markdownPreferencesSnapshot(
      await invoke<unknown>('put_markdown_preferences', {
        expectedRevision: revision(expectedRevision),
        change: markdownPreferenceChange(change),
      }),
    );
  },
};
