import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryJournal } from '../src/features/documents/recovery-journal.js';
import type {
  DraftContent,
  RecoveryAdapter,
  RecoveryCheckpoint,
  RecoveryLease,
  RecoveryReceipt,
} from '../src/services/recovery.js';

type Request = Omit<RecoveryCheckpoint, 'version'>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const content = (text: string, savedText = ''): DraftContent => ({
  text,
  savedText,
  document: null,
  selection: null,
});
function fixture() {
  let serial = 0;
  const begin = vi.fn<RecoveryAdapter['begin']>(async () => {
    serial += 1;
    return { id: `record-${serial}`, lease: `lease-${serial}`, version: 0 };
  });
  const checkpoint = vi.fn<RecoveryAdapter['checkpoint']>(async (request) => ({
    id: request.id,
    version: request.expectedVersion + 1,
    updatedAt: request.sequence,
  }));
  const consume = vi.fn<RecoveryAdapter['consume']>(async () => {});
  const end = vi.fn<RecoveryAdapter['end']>(async () => {});
  const report = vi.fn<(error: unknown) => void>();
  const stored = vi.fn<(value: DraftContent) => void>();
  const journal = new RecoveryJournal({ begin, checkpoint, consume, end }, report, stored);
  return { journal, begin, checkpoint, consume, end, report, stored };
}
const drain = async () => {
  for (let count = 0; count < 8; count++) await Promise.resolve();
};

describe('RecoveryJournal persistence order', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not allocate recovery storage for a clean untouched document', async () => {
    const { journal, begin, checkpoint } = fixture();
    journal.update(content('saved', 'saved'));
    await journal.flush();
    await vi.advanceTimersByTimeAsync(2500);
    expect(begin).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it('accepts the body version after an image warning and retries association with a new version', async () => {
    const { journal, checkpoint, stored, report } = fixture();
    checkpoint.mockImplementationOnce(async (request) => ({
      id: request.id,
      version: request.expectedVersion + 1,
      updatedAt: 1,
      imageWarning: 'image record unavailable',
    }));
    journal.update(content('![image](file:///owned/image.png)'));
    await journal.flush();
    expect(stored).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledExactlyOnceWith('image record unavailable');
    await journal.flush();
    expect(checkpoint.mock.calls[1]?.[0]).toMatchObject({ expectedVersion: 1, sequence: 2 });
    expect(stored).toHaveBeenCalledTimes(1);
    await journal.flush();
    expect(checkpoint).toHaveBeenCalledTimes(2);
  });

  it('a failed begin is retried without guessing a lease or advancing the request sequence', async () => {
    const { journal, begin, checkpoint, consume, end } = fixture();
    begin.mockRejectedValueOnce(new Error('store locked'));
    journal.update(content('old unsent'));
    await expect(journal.flush()).rejects.toThrow('store locked');
    expect(checkpoint).not.toHaveBeenCalled();
    journal.update(content('current unsent'));
    await journal.flush();
    expect(checkpoint.mock.calls[0]?.[0]).toMatchObject({
      id: 'record-1',
      text: 'current unsent',
      sequence: 1,
      expectedVersion: 0,
    });
    expect(consume).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('a failed consumption does not release its lease or send new content to another document', async () => {
    const { journal, checkpoint, consume, end } = fixture();
    journal.update(content('old'));
    await journal.flush();
    consume.mockRejectedValueOnce(new Error('deletion unavailable'));
    await expect(journal.retire(true)).rejects.toThrow('deletion unavailable');
    expect(end).not.toHaveBeenCalled();
    journal.update(content('new'));
    await journal.flush();
    expect(checkpoint.mock.calls[1]?.[0]).toMatchObject({
      id: 'record-2',
      text: 'new',
      expectedVersion: 0,
      sequence: 1,
    });
  });

  it('debounces edits and makes a checkpoint at the maximum delay during continuous input', async () => {
    const { journal, checkpoint } = fixture();
    for (let count = 0; count < 7; count++) {
      journal.update(content(`draft ${count}`));
      await vi.advanceTimersByTimeAsync(count === 6 ? 200 : 300);
    }
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(checkpoint.mock.calls[0]?.[0]).toMatchObject({ text: 'draft 6', sequence: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(checkpoint).toHaveBeenCalledTimes(1);
  });

  it('takes an immutable copy of caller metadata and selection before asynchronous persistence', async () => {
    const { journal, checkpoint } = fixture();
    const draft: DraftContent = {
      text: '😀 raw\r\n',
      savedText: 'baseline\n',
      document: { path: '/notes/original.md', encoding: 'UTF-16LE BOM' },
      selection: { anchor: 2, head: 0 },
    };
    journal.update(draft);
    draft.text = 'changed caller';
    if (draft.document) draft.document.path = '/other.md';
    if (draft.selection) draft.selection.anchor = 999;
    await journal.flush();
    expect(checkpoint.mock.calls[0]?.[0]).toMatchObject({
      text: '😀 raw\r\n',
      document: { path: '/notes/original.md', encoding: 'UTF-16LE BOM' },
      selection: { anchor: 2, head: 0 },
    });
  });

  it('serializes concurrent flush calls and uses the acknowledged version for newer text', async () => {
    const { journal, checkpoint, begin } = fixture();
    const first = deferred<RecoveryReceipt>();
    checkpoint.mockImplementationOnce(() => first.promise);
    journal.update(content('first'));
    const one = journal.flush();
    await drain();
    journal.update(content('second'));
    const two = journal.flush();
    const three = journal.flush();
    await drain();
    expect(checkpoint).toHaveBeenCalledTimes(1);
    first.resolve({ id: 'record-1', version: 1, updatedAt: 1 });
    await Promise.all([one, two, three]);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(
      checkpoint.mock.calls.map(([value]) => [value.text, value.expectedVersion, value.sequence]),
    ).toEqual([
      ['first', 0, 1],
      ['second', 1, 2],
    ]);
  });

  it('does not consume or end a lease when a clean checkpoint is followed by newer edits', async () => {
    const { journal, checkpoint, consume, end } = fixture();
    journal.update(content('dirty'));
    await journal.flush();
    const saved = deferred<RecoveryReceipt>();
    checkpoint.mockImplementationOnce(() => saved.promise);
    journal.update(content('dirty', 'dirty'));
    const clean = journal.flush();
    await drain();
    journal.update(content('new edit', 'dirty'));
    const next = journal.flush();
    saved.resolve({ id: 'record-1', version: 2, updatedAt: 2 });
    await Promise.all([clean, next]);
    expect(
      checkpoint.mock.calls.map(([value]) => [value.text, value.savedText, value.expectedVersion]),
    ).toEqual([
      ['dirty', '', 0],
      ['dirty', 'dirty', 1],
      ['new edit', 'dirty', 2],
    ]);
    expect(consume).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('retries the identical request after commit succeeded but the IPC reply was lost', async () => {
    const { journal, checkpoint, stored } = fixture();
    let committed: Request | undefined;
    checkpoint.mockImplementationOnce(async (request) => {
      committed = structuredClone(request);
      throw new Error('IPC reply lost after commit');
    });
    journal.update(content('committed old text'));
    await expect(journal.flush()).rejects.toThrow('IPC reply lost');
    expect(stored).not.toHaveBeenCalled();
    journal.update(content('newer unsent text'));
    await journal.flush();
    expect(checkpoint).toHaveBeenCalledTimes(3);
    expect(checkpoint.mock.calls[1]?.[0]).toEqual(committed);
    expect(checkpoint.mock.calls[1]?.[0]).toBe(checkpoint.mock.calls[0]?.[0]);
    expect(checkpoint.mock.calls[2]?.[0]).toMatchObject({
      text: 'newer unsent text',
      expectedVersion: 1,
      sequence: 2,
    });
    expect(stored.mock.calls.map(([value]) => value.text)).toEqual([
      'committed old text',
      'newer unsent text',
    ]);
  });

  it.each([
    { id: 'other-record', version: 1, updatedAt: 1 },
    { id: 'record-1', version: 100, updatedAt: 1 },
  ])(
    'rejects a mismatched receipt and keeps the original request available for retry: %j',
    async (receipt) => {
      const { journal, checkpoint, stored, consume, end } = fixture();
      checkpoint.mockResolvedValueOnce(receipt);
      journal.update(content('draft'));
      await expect(journal.flush()).rejects.toThrow('不匹配的版本');
      expect(stored).not.toHaveBeenCalled();
      await journal.flush();
      expect(checkpoint.mock.calls[1]?.[0]).toBe(checkpoint.mock.calls[0]?.[0]);
      expect(consume).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
    },
  );

  it('preserves its last durable copy and does not release the lease after permanent write failure', async () => {
    const { journal, checkpoint, consume, end } = fixture();
    journal.update(content('durable first copy'));
    await journal.flush();
    checkpoint.mockRejectedValue(new Error('disk full'));
    journal.update(content('new content only in memory'));
    await expect(journal.flush()).rejects.toThrow('disk full');
    await expect(journal.retire(false)).rejects.toThrow('disk full');
    expect(consume).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(checkpoint.mock.calls[2]?.[0]).toBe(checkpoint.mock.calls[1]?.[0]);
  });

  it('reports a timer-triggered storage failure while retaining the exact pending request', async () => {
    const { journal, checkpoint, report } = fixture();
    checkpoint.mockRejectedValueOnce(new Error('storage unavailable'));
    journal.update(content('draft'));
    await vi.advanceTimersByTimeAsync(400);
    expect(report).toHaveBeenCalledTimes(1);
    await journal.flush();
    expect(checkpoint.mock.calls[1]?.[0]).toBe(checkpoint.mock.calls[0]?.[0]);
  });

  it('an explicit discard before persistence does not write the discarded text', async () => {
    const { journal, begin, checkpoint, consume, end } = fixture();
    journal.update(content('discarded in memory'));
    await journal.retire(true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(begin).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('an explicit discard consumes the existing version without writing newer unsent text', async () => {
    const { journal, checkpoint, consume, end } = fixture();
    journal.update(content('durable'));
    await journal.flush();
    journal.update(content('discard this unsent edit'));
    await journal.retire(true);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledExactlyOnceWith('record-1', 1, 'lease-1');
    expect(end).not.toHaveBeenCalled();
  });

  it('discard resolves an uncertain commit by replay before consuming its confirmed version', async () => {
    const { journal, checkpoint, consume, end } = fixture();
    checkpoint.mockRejectedValueOnce(new Error('reply lost'));
    journal.update(content('uncertain commit'));
    await expect(journal.flush()).rejects.toThrow('reply lost');
    journal.update(content('discard later unsent edit'));
    await journal.retire(true);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(checkpoint.mock.calls[1]?.[0]).toBe(checkpoint.mock.calls[0]?.[0]);
    expect(consume).toHaveBeenCalledExactlyOnceWith('record-1', 1, 'lease-1');
    expect(end).not.toHaveBeenCalled();
  });

  it('does not consume the old copy if the uncertain commit cannot be confirmed', async () => {
    const { journal, checkpoint, consume, end } = fixture();
    journal.update(content('durable first'));
    await journal.flush();
    checkpoint.mockRejectedValue(new Error('connection down'));
    journal.update(content('uncertain second'));
    await expect(journal.flush()).rejects.toThrow();
    await expect(journal.retire(true)).rejects.toThrow('connection down');
    expect(consume).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('retaining an old document writes the latest text before ending its independent lease', async () => {
    const { journal, checkpoint, end, consume } = fixture();
    journal.update(content('keep this on disk'));
    await journal.retire(false);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledExactlyOnceWith('record-1', 'lease-1');
    expect(consume).not.toHaveBeenCalled();
  });

  it('a delayed begin for a retired document cannot provide the next document lease', async () => {
    const { journal, begin, checkpoint, consume } = fixture();
    const oldBegin = deferred<RecoveryLease>();
    begin.mockImplementationOnce(() => oldBegin.promise);
    journal.update(content('old'));
    const old = journal.flush();
    await drain();
    const retired = journal.retire(true);
    journal.update(content('new'));
    await journal.flush();
    expect(checkpoint.mock.calls[0]?.[0]).toMatchObject({ id: 'record-1', text: 'new' });
    oldBegin.resolve({ id: 'retired-record', lease: 'retired-lease', version: 0 });
    await Promise.all([old, retired]);
    expect(consume).toHaveBeenCalledExactlyOnceWith('retired-record', 1, 'retired-lease');
    journal.update(content('newer'));
    await journal.flush();
    expect(checkpoint.mock.calls.at(-1)?.[0]).toMatchObject({
      id: 'record-1',
      text: 'newer',
      expectedVersion: 1,
    });
  });

  it('a retired document late receipt does not notify current-document persistence or advance its version', async () => {
    const { journal, checkpoint, stored, consume } = fixture();
    const oldReply = deferred<RecoveryReceipt>();
    checkpoint.mockImplementationOnce(() => oldReply.promise);
    journal.update(content('old'));
    const old = journal.flush();
    await drain();
    const retired = journal.retire(true);
    journal.update(content('new'));
    await journal.flush();
    expect(stored.mock.calls.map(([value]) => value.text)).toEqual(['new']);
    oldReply.resolve({ id: 'record-1', version: 1, updatedAt: 1 });
    await Promise.all([old, retired]);
    expect(consume).toHaveBeenCalledExactlyOnceWith('record-1', 1, 'lease-1');
    expect(stored.mock.calls.map(([value]) => value.text)).toEqual(['new']);
    journal.update(content('newer'));
    await journal.flush();
    expect(checkpoint.mock.calls.at(-1)?.[0]).toMatchObject({
      id: 'record-2',
      expectedVersion: 1,
      sequence: 2,
      text: 'newer',
    });
  });
});
