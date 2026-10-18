import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import {
  commandContext,
  commandFence,
  nativeEditorCommands,
} from '../src/services/native-editor-commands.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const context = 'a9997ff9-4e4c-4a9c-8a42-8076ef340a8f';
describe('Native editor command IPC schema', () => {
  it('accepts a canonical context and exact same-context safe sequence', () => {
    expect(commandContext(context)).toBe(context);
    expect(commandFence({ context, issued: 0 }, context)).toEqual({ context, issued: 0 });
    expect(commandFence({ context, issued: Number.MAX_SAFE_INTEGER }, context).issued).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    for (const value of [null, '', context.toUpperCase(), context.replaceAll('-', ''), '../window'])
      expect(() => commandContext(value)).toThrow();
    for (const value of [
      null,
      [],
      { context, issued: -1 },
      { context, issued: 1.5 },
      { context, issued: Number.MAX_SAFE_INTEGER + 1 },
      { context, issued: '1' },
      { context: crypto.randomUUID(), issued: 1 },
      { context, issued: 0, label: 'another' },
    ])
      expect(() => commandFence(value, context)).toThrow();
  });
  it('sends no target window/path capability and rejects malformed responses', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValueOnce({ context, issued: 3 });
    expect(await nativeEditorCommands.register(context)).toEqual({ context, issued: 3 });
    expect(invoke).toHaveBeenLastCalledWith('register_editor_command_context', { context });
    vi.mocked(invoke).mockResolvedValueOnce({ context, issued: 4 });
    expect(await nativeEditorCommands.fence(context)).toEqual({ context, issued: 4 });
    expect(invoke).toHaveBeenLastCalledWith('editor_command_fence', { context });
    vi.mocked(invoke).mockResolvedValueOnce({ context, issued: 4, label: 'main' });
    await expect(nativeEditorCommands.fence(context)).rejects.toThrow('身份或序号');
    const calls = vi.mocked(invoke).mock.calls.length;
    await expect(nativeEditorCommands.fence('/another')).rejects.toThrow('身份');
    expect(invoke).toHaveBeenCalledTimes(calls);
    vi.mocked(invoke).mockRejectedValueOnce(Error('native owner retired'));
    await expect(nativeEditorCommands.register(context)).rejects.toThrow('native owner retired');
  });
});
