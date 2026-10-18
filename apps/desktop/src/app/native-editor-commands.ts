import type { MarkLyraCommand, MarkLyraEditor } from '@marklyra/editor-runtime';
import { nativeEditorCommands } from '../services/native-editor-commands.js';
import { NativeCommandLane } from './native-command-lane.js';

const simple: Readonly<Record<string, MarkLyraCommand>> = {
  undo: { type: 'undo' },
  redo: { type: 'redo' },
  'code-block': { type: 'codeBlock' },
  'math-block': { type: 'mathBlock' },
  'insert-table': { type: 'insertTable' },
  hr: { type: 'horizontalRule' },
  indent: { type: 'indent' },
  outdent: { type: 'outdent' },
  find: { type: 'find' },
  replace: { type: 'find', replace: true },
  'view:source': { type: 'toggleSource' },
  'view:focus': { type: 'toggleFocus' },
  'view:typewriter': { type: 'toggleTypewriter' },
};
/** The same finite set as Native's issued editor actions; file actions are not commands. */
export function nativeEditorCommand(action: string): MarkLyraCommand | undefined {
  if (Object.hasOwn(simple, action)) return simple[action];
  if (/^heading:[0-6]$/.test(action))
    return { type: 'heading', level: Number(action.at(-1)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  const [name, argument, extra] = action.split(':');
  if (extra !== undefined || !argument) return;
  if (
    name === 'format' &&
    [
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
    ].includes(argument)
  )
    return {
      type: 'format',
      style: argument as Extract<MarkLyraCommand, { type: 'format' }>['style'],
    };
  if (name === 'list' && ['ul', 'ol', 'tasklist', 'blockquote'].includes(argument))
    return { type: 'list', style: argument as 'ul' | 'ol' | 'tasklist' | 'blockquote' };
  return;
}
interface Options {
  capture(action: string): {
    editor: MarkLyraEditor | null;
    documentOwner: object;
    blocked: boolean;
  };
  execute(
    command: MarkLyraCommand,
    editor: MarkLyraEditor | null,
    documentOwner: object,
  ): Promise<void>;
  onError(error: Error): void;
  timeoutMs?: number;
}
/** One parent WebView lifetime. Native listener installation precedes start(). */
export class NativeEditorCommands {
  readonly context = crypto.randomUUID();
  private readonly lane: NativeCommandLane;
  private readonly targets = new Map<
    number,
    { editor: MarkLyraEditor | null; documentOwner: object; blocked: boolean }
  >();
  private readonly listening: Promise<void>;
  private listeningResolve!: () => void;
  private listeningReject!: (error: Error) => void;
  private registration: Promise<void> | undefined;
  private disposed = false;
  private readonly cancellations = new Set<(error: Error) => void>();
  constructor(private readonly options: Options) {
    this.lane = new NativeCommandLane({
      context: this.context,
      execute: async (action, sequence) => {
        const target = this.targets.get(sequence);
        try {
          if (!target) throw new Error('编辑命令所属窗口状态已失效');
          if (target.blocked) return;
          const command = nativeEditorCommand(action);
          if (!command) throw new Error('原生编辑命令不受支持');
          await options.execute(command, target.editor, target.documentOwner);
        } finally {
          this.targets.delete(sequence);
        }
      },
      onError: (error) => {
        if (!this.disposed) options.onError(error);
      },
      timeoutMs: options.timeoutMs ?? 30_000,
    });
    this.listening = new Promise((resolve, reject) => {
      this.listeningResolve = resolve;
      this.listeningReject = reject;
    });
    void this.listening.catch(() => {});
  }
  private guarded<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const finish = (result: { value: T } | { error: Error }) => {
        if (!this.cancellations.delete(cancel)) return;
        clearTimeout(timer);
        if ('error' in result) reject(result.error);
        else resolve(result.value);
      };
      const cancel = (error: Error) => finish({ error });
      const timer = setTimeout(
        () => cancel(new Error('编辑命令同步超时，文件尚未保存')),
        this.options.timeoutMs ?? 30_000,
      );
      this.cancellations.add(cancel);
      void work.then(
        (value) => finish({ value }),
        (error: unknown) => cancel(error instanceof Error ? error : new Error(String(error))),
      );
      if (this.disposed) cancel(new Error('编辑窗口命令通道已关闭'));
    });
  }
  private register(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('编辑窗口命令通道已关闭'));
    if (!this.registration) {
      const work = this.guarded(nativeEditorCommands.register(this.context)).then(() => {});
      this.registration = work;
      void work.catch((error: unknown) => {
        if (this.registration === work) this.registration = undefined;
        if (!this.disposed)
          this.options.onError(error instanceof Error ? error : new Error(String(error)));
      });
    }
    return this.registration;
  }
  start(): Promise<void> {
    this.listeningResolve();
    return this.register();
  }
  /** Menu presentation waits for the real listener installation; it cannot start the lane. */
  whenReady(): Promise<string> {
    return this.guarded(this.listening)
      .then(() => this.register())
      .then(() => this.context);
  }
  accept(value: unknown): void {
    if (this.disposed) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.options.onError(new Error('原生编辑事件无效'));
      return;
    }
    const input = value as Record<string, unknown>;
    if (input.context !== this.context) return;
    for (const sequence of this.targets.keys())
      if (sequence <= this.lane.completedSequence) this.targets.delete(sequence);
    if (
      typeof input.action === 'string' &&
      typeof input.sequence === 'number' &&
      Number.isSafeInteger(input.sequence) &&
      input.sequence > this.lane.completedSequence &&
      !this.targets.has(input.sequence) &&
      this.targets.size < 256
    )
      this.targets.set(input.sequence, this.options.capture(input.action));
    // Lane validates fields and latches an invalid current-context event.
    this.lane.accept(value as { context: string; sequence: number; action: string });
  }
  async synchronize(): Promise<void> {
    await this.guarded(this.listening);
    await this.register();
    if (this.disposed) throw new Error('编辑窗口命令通道已关闭');
    const fence = await this.guarded(nativeEditorCommands.fence(this.context));
    if (this.disposed) throw new Error('编辑窗口命令通道已关闭');
    await this.lane.through(fence.issued);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error('编辑窗口命令通道已关闭');
    this.listeningReject(error);
    for (const cancel of [...this.cancellations]) cancel(error);
    this.lane.dispose();
    this.targets.clear();
  }
}
