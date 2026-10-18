import { afterEach, expect, test, vi } from 'vitest';
import { beginDocumentLoad, finishDocumentLoad } from '../src/runtime/document-load.js';

afterEach(() => vi.useRealTimers());
function fixture(inSourceMode: boolean) {
  const calls: string[] = [];
  const view = {
    inSourceMode,
    hide() {
      calls.push('hide');
      this.inSourceMode = false;
    },
    show() {
      calls.push('show');
      this.inSourceMode = true;
    },
  };
  const area = { childElementCount: 1 };
  return { view, area, calls, runtime: { editor: { sourceView: view, writingArea: area } } };
}
test('WYSIWYG ordinary load does not transition modes or schedule a delay', () => {
  vi.useFakeTimers();
  const { runtime, calls } = fixture(false);
  expect(beginDocumentLoad(runtime)).toBeUndefined();
  expect(calls).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
test('source mode is synchronously left before loading and resumes after the queued native DOM write', async () => {
  vi.useFakeTimers();
  const { runtime, view, area, calls } = fixture(true);
  const resume = beginDocumentLoad(runtime);
  expect(resume?.view).toBe(view);
  expect(view.inSourceMode).toBe(false);
  area.childElementCount = 0;
  setTimeout(() => {
    area.childElementCount = 1;
    calls.push('native DOM commit');
  }, 0);
  if (!resume) throw new Error('Missing source-mode handoff');
  const completion = finishDocumentLoad(resume);
  expect(calls).toEqual(['hide']);
  await vi.runAllTimersAsync();
  await completion;
  expect(calls).toEqual(['hide', 'native DOM commit', 'show']);
  expect(view.inSourceMode).toBe(true);
});
test('original mode transition failure is propagated for the caller snapshot rollback', async () => {
  vi.useFakeTimers();
  const { runtime, view } = fixture(true);
  const resume = beginDocumentLoad(runtime);
  if (!resume) throw new Error('Missing source-mode handoff');
  view.show = () => {
    throw new Error('native mode setup failed');
  };
  const completion = finishDocumentLoad(resume);
  const rejected = expect(completion).rejects.toThrow('native mode setup failed');
  await vi.runAllTimersAsync();
  await rejected;
});

test('an already committed small document resumes source mode synchronously without a timer', async () => {
  vi.useFakeTimers();
  const { runtime, calls } = fixture(true);
  const resume = beginDocumentLoad(runtime);
  if (!resume) throw new Error('Missing source-mode handoff');
  const completion = finishDocumentLoad(resume);
  expect(calls).toEqual(['hide', 'show']);
  expect(vi.getTimerCount()).toBe(0);
  await completion;
});

test('a missing native DOM commit fails explicitly instead of showing stale source state', async () => {
  vi.useFakeTimers();
  const { runtime, area, calls } = fixture(true);
  const resume = beginDocumentLoad(runtime);
  if (!resume) throw new Error('Missing source-mode handoff');
  area.childElementCount = 0;
  const rejected = expect(finishDocumentLoad(resume)).rejects.toThrow(
    'Document DOM commit did not complete',
  );
  await vi.runAllTimersAsync();
  await rejected;
  expect(calls).toEqual(['hide']);
});
