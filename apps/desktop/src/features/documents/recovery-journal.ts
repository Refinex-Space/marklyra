import type {
  DraftContent,
  RecoveryAdapter,
  RecoveryCheckpoint,
  RecoveryLease,
} from '../../services/recovery.js';

type Request = Omit<RecoveryCheckpoint, 'version'>;
interface Entry {
  lease?: RecoveryLease;
  sequence: number;
  latest?: DraftContent;
  persisted?: DraftContent;
  pending?: Request;
  imagesPending?: boolean;
  queue: Promise<void>;
}
const entry = (): Entry => ({ sequence: 0, queue: Promise.resolve() });
const equal = (left: DraftContent | undefined, right: DraftContent) =>
  left?.text === right.text &&
  left.savedText === right.savedText &&
  left.document?.path === right.document?.path &&
  left.document?.encoding === right.document?.encoding &&
  left.selection?.anchor === right.selection?.anchor &&
  left.selection?.head === right.selection?.head;

/** Host persistence queue. Each logical document owns a lease and monotonically
 * ordered requests; replies from a retired document never update a new one. */
export class RecoveryJournal {
  private current = entry();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private maximum: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly host: RecoveryAdapter,
    private readonly report: (error: unknown) => void,
    private readonly stored: (content: DraftContent) => void = () => {},
    private readonly warn: (message: string) => void = (message) => report(message),
  ) {}

  update(content: DraftContent): void {
    if (equal(this.current.latest, content) && !this.current.imagesPending) return;
    this.current.latest = {
      ...content,
      document: content.document ? { ...content.document } : null,
      selection: content.selection ? { ...content.selection } : null,
    };
    if (!this.current.lease && content.text === content.savedText && !this.current.pending) return;
    if (this.timer) clearTimeout(this.timer);
    const write = () => {
      void this.flush().catch(this.report);
    };
    this.timer = setTimeout(write, 400);
    this.maximum ??= setTimeout(write, 2000);
  }
  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.maximum) clearTimeout(this.maximum);
    this.timer = undefined;
    this.maximum = undefined;
  }
  private enqueue(record: Entry, work: () => Promise<void>): Promise<void> {
    const result = record.queue.catch(() => {}).then(work);
    record.queue = result;
    return result;
  }
  private async persist(record: Entry, onlyPending = false): Promise<void> {
    if (onlyPending && !record.pending) return;
    if (
      !record.latest ||
      (!record.lease && !record.pending && record.latest.text === record.latest.savedText)
    )
      return;
    record.lease ??= await this.host.begin();
    const send = async () => {
      const request = record.pending;
      if (!request || !record.lease) return;
      // Keep this exact request after a failed/lost reply. Rust accepts only an
      // identical last-request replay, preventing a guessed version advance.
      const receipt = await this.host.checkpoint(request);
      if (receipt.id !== record.lease.id || receipt.version !== request.expectedVersion + 1)
        throw new Error('恢复副本返回了不匹配的版本');
      record.lease.version = receipt.version;
      record.persisted = request;
      delete record.pending;
      record.imagesPending = Boolean(receipt.imageWarning);
      if (record === this.current) {
        if (receipt.imageWarning) this.warn(receipt.imageWarning);
        else this.stored(request);
      }
    };
    if (record.pending) await send();
    if (onlyPending) return;
    const next = record.latest;
    if (equal(record.persisted, next) && !record.imagesPending) return;
    record.pending = {
      ...next,
      id: record.lease.id,
      lease: record.lease.lease,
      expectedVersion: record.lease.version,
      sequence: ++record.sequence,
    };
    await send();
  }
  flush(): Promise<void> {
    this.clearTimers();
    const record = this.current;
    return this.enqueue(record, () => this.persist(record));
  }
  /** Call only after a successful document switch or an explicit close decision.
   * The old queue remains ordered while new edits use a distinct lease. */
  retire(discard: boolean): Promise<void> {
    this.clearTimers();
    const old = this.current;
    this.current = entry();
    return this.enqueue(old, async () => {
      await this.persist(old, discard);
      if (!old.lease) return;
      if (discard && old.lease.version > 0) {
        await this.host.consume(old.lease.id, old.lease.version, old.lease.lease);
        return; // Consumption also revokes the lease.
      }
      await this.host.end(old.lease.id, old.lease.lease);
    });
  }
}
