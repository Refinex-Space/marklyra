export type StartupMode = 0 | 1 | 2 | 3;
export interface StartupPreferences {
  revision: number;
  restoreWhenLaunch: StartupMode;
  pinFolder: string | null;
}
export type StartupPreferenceAction =
  | { kind: 'set-mode'; mode: StartupMode }
  | { kind: 'choose-folder' };

export function startupMode(value: unknown): StartupMode {
  if (value !== 0 && value !== 1 && value !== 2 && value !== 3) throw new Error('启动模式无效。');
  return value;
}

/** Only this original select emits numeric strings. Native actions remain strictly typed. */
export function startupControlMode(value: unknown): StartupMode {
  return startupMode(
    typeof value === 'string' && ['0', '1', '2', '3'].includes(value) ? Number(value) : value,
  );
}

function pinFolder(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
    throw new Error('启动目录显示信息无效。');
  return value;
}

export function startupPreferencesSnapshot(value: unknown): StartupPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('启动设置响应无效。');
  const input = value as Record<string, unknown>;
  if (
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0
  )
    throw new Error('启动设置版本无效。');
  return {
    revision: input.revision,
    restoreWhenLaunch: startupMode(input.restoreWhenLaunch),
    pinFolder: pinFolder(input.pinFolder),
  };
}

export function startupPreferenceAction(value: unknown): StartupPreferenceAction {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('启动设置操作无效。');
  const input = value as Record<string, unknown>;
  if (!Object.hasOwn(input, 'kind')) throw new Error('启动设置操作无效。');
  const keys = Object.keys(input);
  if (input.kind === 'choose-folder' && keys.length === 1) return { kind: 'choose-folder' };
  if (input.kind === 'set-mode' && keys.length === 2 && Object.hasOwn(input, 'mode'))
    return { kind: 'set-mode', mode: startupMode(input.mode) };
  throw new Error('启动设置操作无效。');
}

/** pinFolder is read-only display metadata, never an action argument. */
export function initialStartupOptions(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    marklyraStartupActions: input.marklyraStartupActions === true,
    restoreWhenLaunch:
      input.restoreWhenLaunch === undefined ? 0 : startupMode(input.restoreWhenLaunch),
    pinFolder: input.pinFolder === undefined ? null : pinFolder(input.pinFolder),
  };
}

export function startupPreferencesOptions(value: StartupPreferences): Record<string, unknown> {
  const snapshot = startupPreferencesSnapshot(value);
  return initialStartupOptions({ ...snapshot, marklyraStartupActions: true });
}
