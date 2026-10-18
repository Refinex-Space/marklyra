export interface NativeEditorCommand {
  context: string;
  sequence: number;
  action: string;
}

interface Options {
  context: string;
  execute(action: string, sequence: number): Promise<void>;
  onError?(error: Error): void;
  timeoutMs?: number;
}
interface Receipt {
  action: string;
  state: 'pending' | 'running' | 'succeeded';
}
interface Waiter {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
const CAPACITY = 256;

/** Orders one Native context's commands by issuance, not transport arrival.
 * A disposed/failed lane cannot authorize a save. An already-called executor
 * cannot be canceled here; its late result never authorizes another command. */
export class NativeCommandLane {
  private readonly context: string;
  private readonly timeoutMs: number;
  private readonly receipts = new Map<number, Receipt>();
  private readonly waiters = new Map<number, Waiter>();
  private completed = 0;
  private running: number | null = null;
  private progressTimer: ReturnType<typeof setTimeout> | undefined;
  private failure: Error | null = null;
  private disposed = false;

  constructor(private readonly options: Options) {
    if (typeof options.context !== 'string' || !options.context || options.context.length > 128)
      throw new TypeError('Native command context is invalid');
    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
      throw new RangeError('Native command timeout is invalid');
    this.context = options.context;
    this.timeoutMs = timeoutMs;
  }

  get completedSequence(): number {
    return this.completed;
  }

  accept(command: NativeEditorCommand): void {
    if (this.disposed || this.failure) return;
    if (!command || typeof command !== 'object') {
      this.fail(new Error('Native command payload is invalid'));
      return;
    }
    // Old effects/windows cannot poison or execute in this context.
    if (command.context !== this.context) return;
    const { sequence, action } = command;
    if (
      !Number.isSafeInteger(sequence) ||
      sequence <= 0 ||
      typeof action !== 'string' ||
      !action ||
      action.length > 256 ||
      Array.from(action).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      this.fail(new Error('Native command sequence or action is invalid'));
      return;
    }
    const prior = this.receipts.get(sequence);
    if (prior) {
      if (prior.action !== action) this.fail(new Error(`Conflicting Native command ${sequence}`));
      return;
    }
    if (sequence <= this.completed) {
      this.fail(new Error(`Native command receipt ${sequence} has expired`));
      return;
    }
    if (sequence - this.completed > CAPACITY) {
      this.fail(new Error('Native command sequence exceeds its pending budget'));
      return;
    }
    if (this.receipts.size === CAPACITY) {
      let oldest: number | undefined;
      for (const [id, receipt] of this.receipts)
        if (receipt.state === 'succeeded' && (oldest === undefined || id < oldest)) oldest = id;
      if (oldest === undefined) {
        this.fail(new Error('Native command receipts exceed their pending budget'));
        return;
      }
      this.receipts.delete(oldest);
    }
    this.receipts.set(sequence, { action, state: 'pending' });
    this.startNext();
    this.watchProgress();
  }

  through(issued: number): Promise<void> {
    if (this.disposed || this.failure) return Promise.reject(this.closedError());
    if (!Number.isSafeInteger(issued) || issued < 0) {
      this.fail(new Error('Native command fence sequence is invalid'));
      return Promise.reject(this.closedError());
    }
    if (issued <= this.completed) return Promise.resolve();
    if (issued - this.completed > CAPACITY) {
      this.fail(new Error('Native command fence exceeds its pending budget'));
      return Promise.reject(this.closedError());
    }
    const old = this.waiters.get(issued);
    if (old) return old.promise;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const timer = setTimeout(() => {
      this.fail(new Error(`Native command fence timed out before ${issued}`));
    }, this.timeoutMs);
    this.waiters.set(issued, { promise, resolve, reject, timer });
    return promise;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop(new Error('Native command lane is disposed'));
  }

  private closedError(): Error {
    return this.failure ?? new Error('Native command lane is disposed');
  }

  private fail(error: Error): void {
    if (this.disposed || this.failure) return;
    this.failure = error;
    this.stop(error);
    try {
      this.options.onError?.(error);
    } catch {
      /* Reporting cannot authorize a failed fence. */
    }
  }

  private stop(error: Error): void {
    if (this.progressTimer !== undefined) clearTimeout(this.progressTimer);
    this.progressTimer = undefined;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
    this.receipts.clear();
  }

  private watchProgress(): void {
    if (this.disposed || this.failure || this.progressTimer !== undefined || !this.receipts.size)
      return;
    if (this.running === null && ![...this.receipts.keys()].some((id) => id > this.completed))
      return;
    this.progressTimer = setTimeout(() => {
      this.progressTimer = undefined;
      this.fail(
        new Error(
          this.running === null
            ? `Native command sequence ${this.completed + 1} is missing`
            : `Native command ${this.running} did not complete before timeout`,
        ),
      );
    }, this.timeoutMs);
  }

  private startNext(): void {
    if (this.disposed || this.failure || this.running !== null) return;
    const sequence = this.completed + 1;
    const receipt = this.receipts.get(sequence);
    if (!receipt || receipt.state !== 'pending') return;
    this.running = sequence;
    receipt.state = 'running';
    let execution: Promise<void>;
    try {
      execution = this.options.execute(receipt.action, sequence);
      if (!execution || typeof execution.then !== 'function')
        throw new TypeError('Native command executor must return a Promise');
    } catch (error) {
      this.executionFailed(sequence, error);
      return;
    }
    void Promise.resolve(execution).then(
      () => {
        if (this.disposed || this.failure || this.receipts.get(sequence) !== receipt) return;
        receipt.state = 'succeeded';
        this.completed = sequence;
        this.running = null;
        if (this.progressTimer !== undefined) clearTimeout(this.progressTimer);
        this.progressTimer = undefined;
        for (const [target, waiter] of this.waiters) {
          if (target > this.completed) continue;
          this.waiters.delete(target);
          clearTimeout(waiter.timer);
          waiter.resolve();
        }
        this.startNext();
        this.watchProgress();
      },
      (error: unknown) => this.executionFailed(sequence, error),
    );
  }

  private executionFailed(sequence: number, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.fail(new Error(`Native command ${sequence} failed: ${detail}`, { cause: error }));
  }
}
