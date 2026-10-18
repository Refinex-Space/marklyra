import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeCommandLane } from '../src/app/native-command-lane.js';

const context = 'de305d54-75b4-431b-adb2-eb6b9e546014';
function command(sequence: number, action = `action:${sequence}`, owner = context) {
  return { context: owner, sequence, action };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(timeoutMs = 30_000) {
  const calls: string[] = [],
    pending: ReturnType<typeof deferred>[] = [];
  const onError = vi.fn();
  const lane = new NativeCommandLane({
    context,
    timeoutMs,
    onError,
    execute: (action) => {
      calls.push(action);
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  });
  return { lane, calls, pending, onError };
}
afterEach(() => vi.useRealTimers());

describe('Native command issuance lane', () => {
  it('passes issuance sequence to the executor and exposes only the successfully completed watermark', async () => {
    const first = deferred();
    const second = deferred();
    const execute = vi.fn((_action: string, sequence: number) =>
      sequence === 1 ? first.promise : second.promise,
    );
    const lane = new NativeCommandLane({ context, execute });
    lane.accept(command(2, 'redo'));
    expect(lane.completedSequence).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    lane.accept(command(1, 'undo'));
    expect(execute).toHaveBeenNthCalledWith(1, 'undo', 1);
    expect(lane.completedSequence).toBe(0);
    first.resolve();
    await lane.through(1);
    expect(lane.completedSequence).toBe(1);
    expect(execute).toHaveBeenNthCalledWith(2, 'redo', 2);
    second.resolve();
    await lane.through(2);
    expect(lane.completedSequence).toBe(2);
    expect(Reflect.set(lane, 'completedSequence', 0)).toBe(false);
    expect(lane.completedSequence).toBe(2);
    lane.dispose();
    expect(lane.completedSequence).toBe(2);
  });

  it('does not advance the public watermark for a failed command', async () => {
    const f = fixture();
    f.lane.accept(command(1));
    f.lane.accept(command(2));
    f.pending[0]?.resolve();
    await f.lane.through(1);
    expect(f.lane.completedSequence).toBe(1);
    const rejected = expect(f.lane.through(2)).rejects.toThrow('failed second');
    f.pending[1]?.reject(new Error('failed second'));
    await rejected;
    expect(f.lane.completedSequence).toBe(1);
    f.lane.dispose();
    expect(f.lane.completedSequence).toBe(1);
  });

  it('does not let an early save fence pass before an out-of-order Undo is really complete', async () => {
    const f = fixture();
    let saved = false;
    const save = f.lane.through(2).then(() => {
      saved = true;
    });
    f.lane.accept(command(2, 'redo'));
    expect(f.calls).toEqual([]);
    f.lane.accept(command(1, 'undo'));
    expect(f.calls).toEqual(['undo']);
    await Promise.resolve();
    expect(saved).toBe(false);
    f.pending[0]?.resolve();
    await vi.waitFor(() => expect(f.calls).toEqual(['undo', 'redo']));
    expect(saved).toBe(false);
    f.pending[1]?.resolve();
    await save;
    expect(saved).toBe(true);
    await f.lane.through(0);
    await f.lane.through(1);
    f.lane.dispose();
  });

  it('shares a same-target fence and ignores equal pending, running and completed duplicates', async () => {
    const f = fixture();
    f.lane.accept(command(2));
    f.lane.accept(command(2));
    f.lane.accept(command(1));
    f.lane.accept(command(1));
    const first = f.lane.through(2);
    expect(f.lane.through(2)).toBe(first);
    f.pending[0]?.resolve();
    await vi.waitFor(() => expect(f.calls).toHaveLength(2));
    f.pending[1]?.resolve();
    await first;
    f.lane.accept(command(1));
    f.lane.accept(command(2));
    expect(f.calls).toEqual(['action:1', 'action:2']);
    expect(f.onError).not.toHaveBeenCalled();
    f.lane.dispose();
  });

  it('ignores old-context traffic without consuming sequence one or poisoning the current fence', async () => {
    const f = fixture();
    f.lane.accept(command(1, 'old-undo', 'old-context'));
    f.lane.accept(command(Number.NaN, '', 'old-context'));
    expect(f.calls).toEqual([]);
    f.lane.accept(command(1, 'undo'));
    f.pending[0]?.resolve();
    await f.lane.through(1);
    expect(f.calls).toEqual(['undo']);
    expect(f.onError).not.toHaveBeenCalled();
    f.lane.dispose();
  });

  it.each(['pending', 'running', 'completed'] as const)(
    'latches a conflicting %s sequence and never authorizes a save',
    async (stage) => {
      const f = fixture();
      const sequence = stage === 'pending' ? 2 : 1;
      f.lane.accept(command(sequence, 'undo'));
      if (stage === 'completed') {
        f.pending[0]?.resolve();
        await f.lane.through(1);
      }
      const wait = f.lane.through(2);
      const rejected = expect(wait).rejects.toThrow('Conflicting');
      f.lane.accept(command(sequence, 'redo'));
      await rejected;
      f.pending[0]?.resolve();
      f.lane.accept(command(1, 'undo'));
      f.lane.accept(command(2, 'undo'));
      await expect(f.lane.through(0)).rejects.toThrow('Conflicting');
      expect(f.onError).toHaveBeenCalledOnce();
      expect(f.calls).toEqual(stage === 'pending' ? [] : ['undo']);
      f.lane.dispose();
    },
  );

  it('latches rejected SDK execution and blocks all later commands and fence targets', async () => {
    const f = fixture();
    f.lane.accept(command(1));
    f.lane.accept(command(2));
    const first = f.lane.through(1),
      second = f.lane.through(2);
    const rejected = Promise.all([
      expect(first).rejects.toThrow('SDK refused'),
      expect(second).rejects.toThrow('SDK refused'),
    ]);
    f.pending[0]?.reject(new Error('SDK refused'));
    await rejected;
    f.lane.accept(command(3));
    await expect(f.lane.through(3)).rejects.toThrow('SDK refused');
    expect(f.calls).toEqual(['action:1']);
    expect(f.onError).toHaveBeenCalledOnce();
    f.lane.dispose();
  });

  it('handles a synchronous executor error even if the error reporter itself throws', async () => {
    const lane = new NativeCommandLane({
      context,
      execute: () => {
        throw Error('sync failure');
      },
      onError: () => {
        throw Error('reporter failure');
      },
    });
    expect(() => lane.accept(command(1))).not.toThrow();
    await expect(lane.through(1)).rejects.toThrow('sync failure');
    lane.dispose();
  });

  it('does not mistake an unawaited/void executor for a successful SDK receipt', async () => {
    const lane = new NativeCommandLane({
      context,
      execute: (() => undefined) as unknown as (action: string) => Promise<void>,
    });
    lane.accept(command(1));
    await expect(lane.through(1)).rejects.toThrow('must return a Promise');
    lane.dispose();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid command sequence %s',
    async (sequence) => {
      const f = fixture();
      f.lane.accept(command(sequence));
      await expect(f.lane.through(0)).rejects.toThrow('invalid');
      expect(f.calls).toEqual([]);
      f.lane.dispose();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid fence target %s without running anything',
    async (target) => {
      const f = fixture();
      await expect(f.lane.through(target)).rejects.toThrow('invalid');
      f.lane.accept(command(1));
      expect(f.calls).toEqual([]);
      f.lane.dispose();
    },
  );

  it.each(['', 'undo\nredo', 'x'.repeat(257)])('rejects invalid action %j', async (action) => {
    const f = fixture();
    f.lane.accept(command(1, action));
    await expect(f.lane.through(1)).rejects.toThrow('invalid');
    expect(f.calls).toEqual([]);
    f.lane.dispose();
  });

  it('rejects disposal waiters immediately and never starts queued work after a late SDK result', async () => {
    const f = fixture();
    f.lane.accept(command(1));
    f.lane.accept(command(2));
    const waits = [f.lane.through(1), f.lane.through(2)];
    const rejected = Promise.all(waits.map((wait) => expect(wait).rejects.toThrow('disposed')));
    f.lane.dispose();
    f.lane.dispose();
    await rejected;
    f.pending[0]?.resolve();
    await Promise.resolve();
    f.lane.accept(command(3));
    await expect(f.lane.through(0)).rejects.toThrow('disposed');
    expect(f.calls).toEqual(['action:1']);
    expect(f.onError).not.toHaveBeenCalled();
  });

  it('consumes a late SDK rejection after disposal without executing or reporting new work', async () => {
    const f = fixture();
    f.lane.accept(command(1));
    f.lane.accept(command(2));
    f.lane.dispose();
    f.pending[0]?.reject(new Error('late SDK failure'));
    await Promise.resolve();
    await expect(f.lane.through(1)).rejects.toThrow('disposed');
    expect(f.calls).toEqual(['action:1']);
    expect(f.onError).not.toHaveBeenCalled();
  });

  it('does not start a reentrant arrival before the current executor Promise settles', async () => {
    const first = deferred();
    const second = deferred();
    const calls: string[] = [];
    let lane: NativeCommandLane;
    lane = new NativeCommandLane({
      context,
      execute: (action) => {
        calls.push(action);
        if (action === 'undo') {
          lane.accept(command(2, 'redo'));
          return first.promise;
        }
        return second.promise;
      },
    });
    lane.accept(command(1, 'undo'));
    expect(calls).toEqual(['undo']);
    first.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['undo', 'redo']);
    second.resolve();
    await lane.through(2);
    lane.dispose();
  });

  it('rejects a missing command after the deadline, including a fence received before every event', async () => {
    vi.useFakeTimers();
    const f = fixture(50);
    const wait = f.lane.through(2),
      rejected = expect(wait).rejects.toThrow('timed out');
    f.lane.accept(command(2));
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    f.lane.accept(command(1));
    expect(f.calls).toEqual([]);
    expect(f.onError).toHaveBeenCalledOnce();
    f.lane.dispose();
  });

  it('does not keep a missing sequence alive by duplicate arrivals', async () => {
    vi.useFakeTimers();
    const f = fixture(50);
    f.lane.accept(command(2));
    await vi.advanceTimersByTimeAsync(40);
    f.lane.accept(command(2));
    await vi.advanceTimersByTimeAsync(10);
    await expect(f.lane.through(0)).rejects.toThrow('sequence 1 is missing');
    expect(f.calls).toEqual([]);
    f.lane.dispose();
  });

  it('does not reset a save fence deadline when a preceding command makes partial progress', async () => {
    vi.useFakeTimers();
    const f = fixture(50);
    f.lane.accept(command(1));
    f.lane.accept(command(2));
    const wait = f.lane.through(2),
      rejected = expect(wait).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(40);
    f.pending[0]?.resolve();
    await Promise.resolve();
    expect(f.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    f.pending[1]?.resolve();
    await Promise.resolve();
    await expect(f.lane.through(2)).rejects.toThrow('timed out');
    f.lane.dispose();
  });

  it('times out a stuck SDK command without requiring a Save waiter', async () => {
    vi.useFakeTimers();
    const f = fixture(50);
    f.lane.accept(command(1));
    await vi.advanceTimersByTimeAsync(50);
    await expect(f.lane.through(1)).rejects.toThrow('did not complete');
    f.pending[0]?.resolve();
    await Promise.resolve();
    expect(f.onError).toHaveBeenCalledOnce();
    f.lane.dispose();
  });

  it('uses the default thirty-second fence deadline without resetting it on repeated waits', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const wait = f.lane.through(1);
    const rejected = expect(wait).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(f.lane.through(1)).toBe(wait);
    expect(f.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    f.lane.dispose();
  });

  it('bounds missing/pending work and refuses a fence outside the retained window', async () => {
    for (const input of ['event', 'fence'] as const) {
      const f = fixture();
      if (input === 'event') f.lane.accept(command(257));
      await expect(f.lane.through(input === 'fence' ? 257 : 1)).rejects.toThrow('budget');
      expect(f.calls).toEqual([]);
      f.lane.dispose();
    }
  });

  it('can run beyond 256 total commands while retaining at most 256 duplicate receipts', async () => {
    const calls: string[] = [];
    const lane = new NativeCommandLane({
      context,
      execute: async (action) => {
        calls.push(action);
      },
    });
    for (let sequence = 1; sequence <= 300; sequence++) {
      lane.accept(command(sequence));
      await lane.through(sequence);
    }
    lane.accept(command(300));
    expect(calls).toHaveLength(300);
    lane.accept(command(1));
    await expect(lane.through(300)).rejects.toThrow('has expired');
    expect(calls).toHaveLength(300);
    lane.dispose();
  });

  it('handles the full 256-command pending boundary in order without retaining an unlimited backlog', async () => {
    const calls: string[] = [];
    const lane = new NativeCommandLane({
      context,
      execute: async (action) => {
        calls.push(action);
      },
    });
    for (let sequence = 256; sequence >= 1; sequence--) lane.accept(command(sequence));
    await lane.through(256);
    expect(calls).toEqual(Array.from({ length: 256 }, (_, index) => `action:${index + 1}`));
    lane.dispose();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects invalid timeout %s',
    (timeoutMs) => {
      expect(() => new NativeCommandLane({ context, timeoutMs, execute: async () => {} })).toThrow(
        'timeout',
      );
    },
  );
});
