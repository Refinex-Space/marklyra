import { invoke } from '@tauri-apps/api/core';
import { desktopAvailable } from './documents.js';
import { initialiseNativeInput } from './native-input.js';
export interface EditorRuntime {
  url: string;
  platform: 'macos' | 'windows' | 'browser';
  nativeMenus: boolean;
  nativeInputWarning?: string;
}
export async function editorRuntime(): Promise<EditorRuntime> {
  if (!desktopAvailable)
    return { url: 'http://127.0.0.1:4174/index.html', platform: 'browser', nativeMenus: false };
  const [url, platform] = await Promise.all([
    invoke<string>('editor_runtime_url'),
    invoke<'macos' | 'windows'>('host_platform'),
  ]);
  const nativeInputWarning = await initialiseNativeInput();
  return {
    url,
    platform,
    nativeMenus: true,
    ...(nativeInputWarning ? { nativeInputWarning } : {}),
  };
}
