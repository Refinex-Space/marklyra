import { invoke } from '@tauri-apps/api/core';

export interface NativeEditorCommandFence {
  context: string;
  issued: number;
}
export function commandContext(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  )
    throw new Error('编辑窗口命令身份无效');
  return value;
}
export function commandFence(value: unknown, context: string): NativeEditorCommandFence {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('编辑命令屏障响应无效');
  const fields = value as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 2 ||
    fields.context !== context ||
    typeof fields.issued !== 'number' ||
    !Number.isSafeInteger(fields.issued) ||
    fields.issued < 0
  )
    throw new Error('编辑命令屏障身份或序号无效');
  return { context, issued: fields.issued };
}
export const nativeEditorCommands = {
  async register(context: string): Promise<NativeEditorCommandFence> {
    return commandFence(
      await invoke<unknown>('register_editor_command_context', {
        context: commandContext(context),
      }),
      context,
    );
  },
  async fence(context: string): Promise<NativeEditorCommandFence> {
    return commandFence(
      await invoke<unknown>('editor_command_fence', { context: commandContext(context) }),
      context,
    );
  },
};
