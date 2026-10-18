import type { RuntimeSelection } from '../protocol.js';
import { extensionEditorCommand, extensionImageName } from './commands.js';
import type {
  MarkLyraExtension,
  MarkLyraExtensionCleanup,
  MarkLyraExtensionCommandContext,
  MarkLyraExtensionCommandHandler,
  MarkLyraExtensionContext,
  MarkLyraExtensionEditorCommand,
  MarkLyraExtensionError,
  MarkLyraExtensionRegistration,
} from './contracts.js';

interface ExtensionHost {
  ready: Promise<void>;
  getMarkdown(): string;
  getSelection(): RuntimeSelection;
  isComposing(): boolean;
  documentSignal(): AbortSignal;
  onChange(listener: (source: string) => void): () => void;
  execute(command: MarkLyraExtensionEditorCommand, guard: () => void): Promise<void>;
  insertImage(blob: Blob, name: string, guard: () => void, signal: AbortSignal): Promise<void>;
  report(error: MarkLyraExtensionError): void;
}
interface ExtensionRecord {
  id: string;
  controller: AbortController;
  subscriptions: Set<() => void>;
  commands: Map<string, MarkLyraExtensionCommandHandler>;
  cleanup?: MarkLyraExtensionCleanup;
  ready: Promise<void>;
}

function errorOf(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Reject promptly on disposal while still observing late underlying promise rejections. */
function cancellable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

/** Parent-side orchestration only; no parser, DOM, native transport or file authority. */
export class MarkLyraExtensionRegistry {
  private readonly records = new Map<string, ExtensionRecord>();
  private readonly owners = new Map<string, ExtensionRecord>();
  private disposed = false;
  constructor(private readonly host: ExtensionHost) {}

  ids(): readonly string[] {
    this.assertAlive();
    return [...this.records.keys()];
  }

  register(extension: MarkLyraExtension): MarkLyraExtensionRegistration {
    this.assertAlive();
    if (
      !extension ||
      typeof extension.id !== 'string' ||
      !/^[a-z][a-z0-9.-]{0,63}$/.test(extension.id)
    )
      throw new TypeError('Invalid extension id');
    const id = extension.id;
    if (this.records.has(id)) throw new Error(`Extension already registered: ${id}`);
    if (
      !extension.commands ||
      typeof extension.commands !== 'object' ||
      Array.isArray(extension.commands) ||
      (extension.setup !== undefined && typeof extension.setup !== 'function')
    )
      throw new TypeError('Invalid extension definition');
    const commands = new Map(Object.entries(extension.commands));
    for (const [name, handler] of commands) {
      if (
        name.length > 96 ||
        !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(name) ||
        typeof handler !== 'function'
      )
        throw new TypeError(`Invalid extension command: ${name}`);
      if (this.owners.has(name)) throw new Error(`Extension command conflict: ${name}`);
    }
    const setup = extension.setup;
    const record: ExtensionRecord = {
      id,
      controller: new AbortController(),
      subscriptions: new Set(),
      commands,
      ready: Promise.resolve(),
    };
    this.records.set(id, record);
    for (const name of commands.keys()) this.owners.set(name, record);
    const work = this.host.ready.then(async () => {
      record.controller.signal.throwIfAborted();
      const cleanup = await setup?.(
        this.context(record, record.controller.signal, record.subscriptions),
      );
      if (cleanup !== undefined && typeof cleanup !== 'function')
        throw new TypeError('Extension setup must return a cleanup function or void');
      if (record.controller.signal.aborted) {
        if (cleanup) this.cleanup(record, cleanup);
        record.controller.signal.throwIfAborted();
      }
      if (cleanup) record.cleanup = cleanup;
    });
    record.ready = cancellable(work, record.controller.signal).catch((error: unknown) => {
      if (!record.controller.signal.aborted) {
        this.report(record, 'setup', error);
        this.remove(record);
      }
      throw error;
    });
    // Errors remain observable through ready/onExtensionError even if a host ignores ready.
    void record.ready.catch(() => {});
    return Object.freeze({ id, ready: record.ready, dispose: () => this.remove(record) });
  }

  unregister(id: string): boolean {
    this.assertAlive();
    const record = this.records.get(id);
    if (!record) return false;
    this.remove(record);
    return true;
  }

  async execute(id: string, name: string, input?: unknown): Promise<void> {
    this.assertAlive();
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown extension: ${id}`);
    const handler = record.commands.get(name);
    if (!handler) throw new Error(`Unknown extension command: ${id}/${name}`);
    await record.ready;
    record.controller.signal.throwIfAborted();
    const controller = new AbortController();
    const documentSignal = this.host.documentSignal();
    const signals = [record.controller.signal, documentSignal];
    const abort = () => controller.abort(new Error(`Extension command cancelled: ${id}/${name}`));
    for (const signal of signals) {
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    }
    const signal = controller.signal;
    const subscriptions = new Set<() => void>();
    const context = this.context(record, signal, subscriptions);
    const guard = () => signal.throwIfAborted();
    const pending = new Set<Promise<void>>();
    let operationFailed = false;
    let operationError: unknown;
    const track = (work: () => Promise<void>): Promise<void> => {
      let promise: Promise<void>;
      try {
        promise = work();
      } catch (error) {
        promise = Promise.reject(error);
      }
      pending.add(promise);
      void promise.then(
        () => pending.delete(promise),
        (error: unknown) => {
          pending.delete(promise);
          operationFailed = true;
          operationError = error;
        },
      );
      return promise;
    };
    const commandContext: MarkLyraExtensionCommandContext = Object.freeze({
      signal,
      get isComposing() {
        guard();
        return context.isComposing;
      },
      getMarkdown: context.getMarkdown,
      getSelection: context.getSelection,
      onChange: context.onChange,
      execute: (value: MarkLyraExtensionEditorCommand) =>
        track(async () => {
          guard();
          const command = extensionEditorCommand(value);
          await this.host.execute(command, guard);
        }),
      insertImage: (blob: Blob, imageName = 'image.png') =>
        track(async () => {
          guard();
          if (!(blob instanceof Blob) || typeof imageName !== 'string')
            throw new TypeError('Invalid extension image input');
          await this.host.insertImage(blob, extensionImageName(imageName), guard, signal);
        }),
    });
    try {
      guard();
      await cancellable(
        Promise.resolve().then(() => {
          guard();
          return handler(commandContext, input);
        }),
        signal,
      );
      while (pending.size) await cancellable(Promise.all([...pending]), signal);
      if (operationFailed) throw operationError;
      guard();
    } catch (error) {
      if (!signal.aborted) this.report(record, 'command', error, name);
      throw error;
    } finally {
      for (const source of signals) source.removeEventListener('abort', abort);
      controller.abort(new Error(`Extension invocation has ended: ${id}/${name}`));
      for (const unsubscribe of subscriptions) unsubscribe();
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.records.values()) this.remove(record);
  }

  private context(
    record: ExtensionRecord,
    signal: AbortSignal,
    subscriptions: Set<() => void>,
  ): MarkLyraExtensionContext {
    const host = this.host;
    const guard = () => signal.throwIfAborted();
    return Object.freeze({
      signal,
      get isComposing() {
        guard();
        return host.isComposing();
      },
      getMarkdown: () => {
        guard();
        return host.getMarkdown();
      },
      getSelection: () => {
        guard();
        return structuredClone(host.getSelection());
      },
      onChange: (listener: (source: string) => void | Promise<void>) => {
        guard();
        if (typeof listener !== 'function') throw new TypeError('Invalid extension listener');
        let active = true;
        const unsubscribe = host.onChange((source) => {
          if (!active || signal.aborted) return;
          try {
            void Promise.resolve(listener(source)).catch((error: unknown) => {
              if (active && !signal.aborted) this.report(record, 'change', error);
            });
          } catch (error) {
            this.report(record, 'change', error);
          }
        });
        const remove = () => {
          if (!active) return;
          active = false;
          subscriptions.delete(remove);
          unsubscribe();
        };
        subscriptions.add(remove);
        return remove;
      },
    });
  }

  private remove(record: ExtensionRecord): void {
    if (record.controller.signal.aborted) return;
    record.controller.abort(new Error(`Extension has been disposed: ${record.id}`));
    if (this.records.get(record.id) === record) this.records.delete(record.id);
    for (const name of record.commands.keys()) {
      if (this.owners.get(name) === record) this.owners.delete(name);
    }
    for (const unsubscribe of record.subscriptions) unsubscribe();
    const cleanup = record.cleanup;
    delete record.cleanup;
    if (cleanup) this.cleanup(record, cleanup);
  }

  private cleanup(record: ExtensionRecord, cleanup: MarkLyraExtensionCleanup): void {
    try {
      void Promise.resolve(cleanup()).catch((error: unknown) =>
        this.report(record, 'dispose', error),
      );
    } catch (error) {
      this.report(record, 'dispose', error);
    }
  }

  private report(
    record: ExtensionRecord,
    phase: MarkLyraExtensionError['phase'],
    error: unknown,
    commandId?: string,
  ): void {
    try {
      this.host.report({
        extensionId: record.id,
        phase,
        error: errorOf(error),
        ...(commandId ? { commandId } : {}),
      });
    } catch {
      // A diagnostic consumer cannot turn a plugin fault into an editor fault.
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Editor has been destroyed');
  }
}
