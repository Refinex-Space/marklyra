import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeEditorCommands, nativeEditorCommand } from '../src/app/native-editor-commands.js';
import { nativeEditorCommands } from '../src/services/native-editor-commands.js';

vi.mock('../src/services/native-editor-commands.js', () => ({
  nativeEditorCommands: { register: vi.fn(), fence: vi.fn() },
}));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
};
const clients: NativeEditorCommands[] = [];
function setup() {
  const first = {} as MarkLyraEditor;
  const documentOwner = {};
  let target = { editor: first as MarkLyraEditor | null, documentOwner, blocked: false };
  const execute = vi.fn<
    (command: unknown, editor: MarkLyraEditor | null, owner: object) => Promise<void>
  >(async () => {});
  const onError = vi.fn();
  const capture = vi.fn(() => target);
  const client = new NativeEditorCommands({ capture, execute, onError, timeoutMs: 100 });
  clients.push(client);
  return {
    client,
    first,
    documentOwner,
    execute,
    onError,
    capture,
    target: (value: Omit<typeof target, 'documentOwner'> & { documentOwner?: object }) => {
      target = { ...target, ...value };
    },
    accept(sequence: number, action = 'undo') {
      client.accept({ context: client.context, sequence, action });
    },
  };
}
beforeEach(() => {
  vi.mocked(nativeEditorCommands.register).mockReset();
  vi.mocked(nativeEditorCommands.fence).mockReset();
  vi.mocked(nativeEditorCommands.register).mockImplementation(async (context) => ({
    context,
    issued: 0,
  }));
  vi.mocked(nativeEditorCommands.fence).mockImplementation(async (context) => ({
    context,
    issued: 0,
  }));
});
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
});

describe('Native editor action mapping', () => {
  it('maps only the finite Native editing actions, preserving file and theme routes', () => {
    for (let level = 0; level <= 6; level++)
      expect(nativeEditorCommand(`heading:${level}`)).toEqual({ type: 'heading', level });
    for (const style of [
      'strong',
      'em',
      'del',
      'code',
      'underline',
      'highlight',
      'subscript',
      'superscript',
      'inline_math',
      'link',
      'image',
    ])
      expect(nativeEditorCommand(`format:${style}`)).toEqual({ type: 'format', style });
    for (const style of ['ul', 'ol', 'tasklist', 'blockquote'])
      expect(nativeEditorCommand(`list:${style}`)).toEqual({ type: 'list', style });
    expect(nativeEditorCommand('undo')).toEqual({ type: 'undo' });
    expect(nativeEditorCommand('indent')).toEqual({ type: 'indent' });
    expect(nativeEditorCommand('outdent')).toEqual({ type: 'outdent' });
    expect(nativeEditorCommand('replace')).toEqual({ type: 'find', replace: true });
    expect(nativeEditorCommand('view:source')).toEqual({ type: 'toggleSource' });
    for (const value of [
      'save',
      'save-as',
      'open',
      'new',
      'new-window',
      'close',
      'theme:marklyra-dark',
      'heading:7',
      'heading:01',
      'format:unknown',
      'list:ul:extra',
      '__proto__',
    ])
      expect(nativeEditorCommand(value)).toBeUndefined();
  });
});

describe('Native command host ownership and barrier', () => {
  it('menu readiness cannot open the native lane before listener installation', async () => {
    const { client } = setup();
    let ready = false;
    const value = client.whenReady().then((context) => {
      ready = true;
      return context;
    });
    await settle();
    expect(ready).toBe(false);
    expect(nativeEditorCommands.register).not.toHaveBeenCalled();
    await client.start();
    expect(await value).toBe(client.context);
    expect(nativeEditorCommands.register).toHaveBeenCalledTimes(1);
  });
  it('does not register or request a Native fence before listener installation', async () => {
    const { client } = setup();
    const synchronization = client.synchronize();
    await settle();
    expect(nativeEditorCommands.register).not.toHaveBeenCalled();
    expect(nativeEditorCommands.fence).not.toHaveBeenCalled();
    await client.start();
    await synchronization;
    expect(nativeEditorCommands.register).toHaveBeenCalledExactlyOnceWith(client.context);
    expect(nativeEditorCommands.fence).toHaveBeenCalledExactlyOnceWith(client.context);
  });
  it('waits for undelivered issuance and then the real executor Promise', async () => {
    const { client, accept, execute } = setup();
    const execution = deferred<void>();
    execute.mockReturnValue(execution.promise);
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 1 });
    await client.start();
    let completed = false;
    const synchronization = client.synchronize().then(() => {
      completed = true;
    });
    await settle();
    expect(execute).not.toHaveBeenCalled();
    expect(completed).toBe(false);
    accept(1);
    await settle();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(completed).toBe(false);
    execution.resolve();
    await synchronization;
    expect(completed).toBe(true);
  });
  it('binds each sequence to first receipt ownership, including out-of-order delivery', async () => {
    const { client, accept, first, documentOwner, target, execute, capture } = setup();
    await client.start();
    accept(2, 'redo');
    const second = {} as MarkLyraEditor;
    target({ editor: second, blocked: false });
    accept(2, 'redo');
    accept(1);
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 2 });
    await client.synchronize();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls).toEqual([
      [{ type: 'undo' }, second, documentOwner],
      [{ type: 'redo' }, first, documentOwner],
    ]);
  });
  it('does not replay a command received in a modal after the modal closes', async () => {
    const { client, target, first, documentOwner, accept, execute } = setup();
    target({ editor: first, blocked: true });
    accept(2, 'redo');
    target({ editor: first, blocked: false });
    accept(1);
    await client.start();
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 2 });
    await client.synchronize();
    expect(execute.mock.calls).toEqual([[{ type: 'undo' }, first, documentOwner]]);
  });
  it('ignores a retired context without capturing or executing it', async () => {
    const { client, capture, execute } = setup();
    client.accept({ context: 'retired', sequence: 1, action: 'undo' });
    await client.start();
    await client.synchronize();
    expect(capture).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it('retains a pending command document owner when the same SDK loads another document', async () => {
    const { client, first, documentOwner, target, accept, execute } = setup();
    const nextOwner = {};
    execute.mockImplementation(async (_command, _editor, owner) => {
      if (owner !== nextOwner) throw Error('document owner changed');
    });
    accept(2, 'redo');
    target({ editor: first, documentOwner: nextOwner, blocked: false });
    accept(1);
    await client.start();
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 2 });
    await expect(client.synchronize()).rejects.toThrow('document owner changed');
    expect(execute.mock.calls).toEqual([
      [{ type: 'undo' }, first, nextOwner],
      [{ type: 'redo' }, first, documentOwner],
    ]);
  });
  it('fails closed if the executor rejects a replaced owner or SDK failure', async () => {
    const { client, accept, execute, onError } = setup();
    execute.mockRejectedValue(Error('document owner changed'));
    await client.start();
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 1 });
    accept(1);
    await expect(client.synchronize()).rejects.toThrow('document owner changed');
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(client.synchronize()).rejects.toThrow('document owner changed');
  });
  it('retries lost registration with the same context without resetting issued commands', async () => {
    const { client, accept, execute } = setup();
    vi.mocked(nativeEditorCommands.register).mockRejectedValueOnce(Error('lost registration ACK'));
    await expect(client.start()).rejects.toThrow('lost registration ACK');
    accept(1);
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 1 });
    await client.synchronize();
    expect(nativeEditorCommands.register).toHaveBeenCalledTimes(2);
    expect(vi.mocked(nativeEditorCommands.register).mock.calls).toEqual([
      [client.context],
      [client.context],
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects an unknown current-context action instead of skipping it for Save', async () => {
    const { client, accept, execute } = setup();
    await client.start();
    accept(1, 'unknown');
    vi.mocked(nativeEditorCommands.fence).mockResolvedValue({ context: client.context, issued: 1 });
    await expect(client.synchronize()).rejects.toThrow('不受支持');
    expect(execute).not.toHaveBeenCalled();
  });
  it('times out the listener gate instead of leaving a save permanently busy', async () => {
    vi.useFakeTimers();
    const { client } = setup();
    const result = expect(client.synchronize()).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(nativeEditorCommands.register).not.toHaveBeenCalled();
  });
  it('bounds a missing Native fence ACK and consumes its late response', async () => {
    vi.useFakeTimers();
    const { client } = setup();
    const response = deferred<{ context: string; issued: number }>();
    vi.mocked(nativeEditorCommands.fence).mockReturnValue(response.promise);
    await client.start();
    const result = expect(client.synchronize()).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(100);
    await result;
    response.resolve({ context: client.context, issued: 0 });
    await settle();
  });
  it('cancels both pre-listener and in-flight Native fence reads on disposal', async () => {
    const pending = setup();
    const before = expect(pending.client.synchronize()).rejects.toThrow('已关闭');
    pending.client.dispose();
    await before;
    const active = setup();
    await active.client.start();
    const response = deferred<{ context: string; issued: number }>();
    vi.mocked(nativeEditorCommands.fence).mockReturnValue(response.promise);
    const after = expect(active.client.synchronize()).rejects.toThrow('已关闭');
    await settle();
    active.client.dispose();
    response.resolve({ context: active.client.context, issued: 0 });
    await after;
  });
});
