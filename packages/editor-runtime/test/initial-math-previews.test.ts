import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeInitialMathPreviews } from '../src/runtime/initial-math-previews.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';

const selector = '[mdtype="fences"].md-fences-math[cid]';
class TestElement {
  isConnected = true;
  cid = 'm';
  math = true;
  textContent = '';
  parentElement: TestElement | null = null;
  childNodes: TestElement[] = [];
  constructor(readonly role: 'area' | 'block' | 'preview' | 'wrapper' | 'svg' | 'error') {}
  append(child: TestElement) {
    if (child.parentElement)
      child.parentElement.childNodes = child.parentElement.childNodes.filter(
        (node) => node !== child,
      );
    child.parentElement = this;
    this.childNodes.push(child);
  }
  getAttribute(name: string) {
    if (name === 'cid') return this.role === 'block' ? this.cid : null;
    if (name === 'mdtype') return this.role === 'block' ? 'fences' : null;
    return null;
  }
  matches(value: string): boolean {
    if (value === selector) return this.role === 'block' && this.math;
    if (value === '[cid]') return this.role === 'block';
    if (value.includes('md-fences-adv-panel-preview')) return this.role === 'preview';
    if (value.includes('md-fences-adv-panel-error')) return this.role === 'error';
    if (value.includes('CodeMirror')) return this.role === 'wrapper';
    return this.role === 'svg' && /svg|mjx-container/.test(value);
  }
  contains(value: unknown): boolean {
    return value === this || this.childNodes.some((child) => child.contains(value));
  }
  closest(value: string): TestElement | null {
    return this.matches(value) ? this : (this.parentElement?.closest(value) ?? null);
  }
  querySelectorAll(value: string): TestElement[] {
    return this.childNodes.flatMap((child) => [
      ...(child.matches(value) ? [child] : []),
      ...child.querySelectorAll(value),
    ]);
  }
  querySelector(value: string): TestElement | null {
    return this.querySelectorAll(value)[0] ?? null;
  }
}
function fixture() {
  const area = new TestElement('area'),
    block = new TestElement('block'),
    preview = new TestElement('preview'),
    wrapper = new TestElement('wrapper');
  area.append(block);
  block.append(preview);
  block.append(wrapper);
  let source = 'x^2 + y',
    language = 'math',
    cmText = source,
    epoch = 1,
    available = true,
    ready = true;
  const makeNode = () => ({
    cid: 'm',
    get: (key: string) =>
      key === 'type' ? 'fences' : key === 'lang' ? language : key === 'text' ? source : undefined,
  });
  let node = makeNode();
  const cm = { cid: 'm', doc: {}, getValue: () => cmText, getWrapperElement: () => wrapper };
  let resolve!: (value: string) => void, reject!: (error: unknown) => void;
  const completion = new Promise<string>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const invocation: { owner: unknown; args: unknown[] }[] = [];
  const original = vi.fn(function (this: unknown, ...args: unknown[]) {
    invocation.push({ owner: this, args });
    return completion;
  });
  const update = vi.fn(),
    queue: Record<string, typeof cm | undefined> = { m: cm };
  const add = vi.fn((_cid: string) => {
    queue.m = cm;
    return cm;
  });
  const mathBlock = { renderUnder: original, updateDiagram: update, isMathJaxReady: () => ready };
  const editor = {
    writingArea: area,
    nodeMap: {},
    getNode: () => node,
    mathBlock,
    fences: { queue, addCodeBlock: add },
    sourceView: { inSourceMode: false },
    isIME: false,
  };
  const file = { option: { gitlabMath: true }, isLocked: false };
  const runtime = { editor, File: file } as unknown as LegacyGlobals;
  const controller = new RuntimeInitialMathPreviews(
    runtime,
    () => epoch,
    () => available,
  );
  return {
    controller,
    runtime,
    editor,
    file,
    area,
    block,
    preview,
    wrapper,
    cm,
    queue,
    original,
    update,
    add,
    completion,
    invocation,
    resolve,
    reject,
    setSource: (value: string) => {
      source = value;
    },
    setLanguage: (value: string) => {
      language = value;
    },
    setCMText: (value: string) => {
      cmText = value;
    },
    setAvailable: (value: boolean) => {
      available = value;
    },
    setReady: (value: boolean) => {
      ready = value;
    },
    newEpoch: () => {
      epoch++;
    },
    replaceNode: () => {
      node = makeNode();
    },
    async render(scope?: TestElement) {
      const result = editor.mathBlock.renderUnder(scope);
      resolve('native complete');
      await result;
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('HTMLElement', TestElement);
  vi.stubGlobal('Element', TestElement);
});
afterEach(() => vi.unstubAllGlobals());

describe('initial math fence fallback ownership', () => {
  it('preserves the native receiver, arguments and settlement while rendering the empty owned preview once', async () => {
    const f = fixture();
    f.controller.install();
    const receiver = f.editor.mathBlock;
    const result = Reflect.apply(f.editor.mathBlock.renderUnder, receiver, [f.area, true]);
    expect(f.invocation).toEqual([{ owner: receiver, args: [f.area, true] }]);
    expect(f.update).not.toHaveBeenCalled();
    f.resolve('native complete');
    expect(await result).toBe('native complete');
    expect(f.update).toHaveBeenCalledExactlyOnceWith('m');
    f.controller.flush();
    f.controller.flush();
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it('forwards an explicit native receiver without rebinding the original method', async () => {
    const f = fixture();
    f.controller.install();
    const receiver = {};
    const result = Reflect.apply(f.editor.mathBlock.renderUnder, receiver, [f.area, true]);
    f.resolve('native complete');
    expect(await result).toBe('native complete');
    expect(f.invocation).toEqual([{ owner: receiver, args: [f.area, true] }]);
  });
  it('holds initial loading candidates until a later available flush', async () => {
    const f = fixture();
    f.setAvailable(false);
    f.controller.install();
    await f.render();
    expect(f.update).not.toHaveBeenCalled();
    f.setAvailable(true);
    f.controller.flush();
    expect(f.update).toHaveBeenCalledExactlyOnceWith('m');
  });
  it('does not revive a queued preview after the document changed while unavailable', async () => {
    const f = fixture();
    f.setAvailable(false);
    f.controller.install();
    await f.render();
    f.newEpoch();
    f.setAvailable(true);
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('waits for MathJax readiness without creating a second native renderer', async () => {
    const f = fixture();
    f.setReady(false);
    f.controller.install();
    await f.render();
    expect(f.update).not.toHaveBeenCalled();
    f.setReady(true);
    f.controller.flush();
    expect(f.update).toHaveBeenCalledExactlyOnceWith('m');
    expect(f.original).toHaveBeenCalledOnce();
  });
  it('does not eagerly create CodeMirror and flushes only after the native registration completes', async () => {
    const f = fixture();
    delete f.queue.m;
    f.controller.install();
    await f.render();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.add).not.toHaveBeenCalled();
    expect(f.editor.fences.addCodeBlock('m')).toBe(f.cm);
    expect(f.update).toHaveBeenCalledExactlyOnceWith('m');
  });
  it('respects renderUnder scope instead of rendering an unrelated block', async () => {
    const f = fixture();
    f.controller.install();
    await f.render(new TestElement('area'));
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('retires a pending candidate when a later CodeMirror registration has different text', async () => {
    const f = fixture();
    delete f.queue.m;
    f.controller.install();
    await f.render();
    f.setCMText('different document');
    f.editor.fences.addCodeBlock('m');
    f.setCMText('x^2 + y');
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('accepts the native CRLF projection only when the same file requested it', async () => {
    const f = fixture();
    f.setSource('x\n+y');
    f.setCMText('x\r\n+y');
    Reflect.set(f.file, 'useCRLF', true);
    f.controller.install();
    await f.render();
    expect(f.update).toHaveBeenCalledExactlyOnceWith('m');
  });
  it('rejects CRLF CodeMirror content when the file is configured for LF', async () => {
    const f = fixture();
    f.setSource('x\n+y');
    f.setCMText('x\r\n+y');
    f.controller.install();
    await f.render();
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('does not normalize an unsupported CR-containing model source into a render proof', async () => {
    const f = fixture();
    f.setSource('x\r\n+y');
    f.setCMText('x\r\n+y');
    Reflect.set(f.file, 'useCRLF', true);
    f.controller.install();
    await f.render();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('leaves a native math error panel intact instead of retrying it as an empty preview', async () => {
    const f = fixture();
    const error = new TestElement('error');
    error.textContent = 'Invalid TeX';
    f.block.append(error);
    f.controller.install();
    await f.render();
    expect(f.update).not.toHaveBeenCalled();
    expect(error.textContent).toBe('Invalid TeX');
  });
  it('does not replace a real preview produced by the native render pass', async () => {
    const f = fixture();
    f.controller.install();
    const result = f.editor.mathBlock.renderUnder();
    f.preview.append(new TestElement('svg'));
    f.resolve('native complete');
    await result;
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('preserves a rejected native render promise and does not fallback after rejection', async () => {
    const f = fixture();
    f.controller.install();
    const failure = new Error('native renderer failed');
    const result = f.editor.mathBlock.renderUnder();
    const rejected = expect(result).rejects.toBe(failure);
    f.reject(failure);
    await rejected;
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('preserves synchronous native failures without leaving a fallback candidate', () => {
    const f = fixture();
    const failure = new Error('synchronous render failure');
    f.original.mockImplementation(() => {
      throw failure;
    });
    f.controller.install();
    expect(() => f.editor.mathBlock.renderUnder()).toThrow(failure);
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('installs once and restores only the wrappers it owns on destroy', async () => {
    const f = fixture();
    f.controller.install();
    const wrapped = f.editor.mathBlock.renderUnder;
    f.controller.install();
    expect(f.editor.mathBlock.renderUnder).toBe(wrapped);
    const result = f.editor.mathBlock.renderUnder();
    f.controller.destroy();
    expect(f.editor.mathBlock.renderUnder).toBe(f.original);
    expect(f.editor.fences.addCodeBlock).toBe(f.add);
    f.resolve('native complete');
    await result;
    f.controller.flush();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('does not overwrite a later renderer owner when destroyed', () => {
    const f = fixture();
    f.controller.install();
    const next = vi.fn(() => Promise.resolve('next'));
    const nextAdd = vi.fn(() => f.cm);
    Reflect.set(f.editor.mathBlock, 'renderUnder', next);
    Reflect.set(f.editor.fences, 'addCodeBlock', nextAdd);
    f.controller.destroy();
    expect(f.editor.mathBlock.renderUnder).toBe(next);
    expect(f.editor.fences.addCodeBlock).toBe(nextAdd);
  });
  for (const [name, change] of [
    ['document generation', (f: ReturnType<typeof fixture>) => f.newEpoch()],
    ['editor identity', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'editor', {})],
    ['file identity', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'File', {})],
    [
      'model map identity',
      (f: ReturnType<typeof fixture>) => {
        f.editor.nodeMap = {};
      },
    ],
    ['node identity', (f: ReturnType<typeof fixture>) => f.replaceNode()],
    ['model source', (f: ReturnType<typeof fixture>) => f.setSource('changed')],
    ['fence language', (f: ReturnType<typeof fixture>) => f.setLanguage('javascript')],
    ['file line ending', (f: ReturnType<typeof fixture>) => Reflect.set(f.file, 'useCRLF', true)],
    [
      'math renderer identity',
      (f: ReturnType<typeof fixture>) => Reflect.set(f.editor, 'mathBlock', {}),
    ],
    ['CodeMirror source', (f: ReturnType<typeof fixture>) => f.setCMText('changed')],
    [
      'missing CodeMirror document',
      (f: ReturnType<typeof fixture>) => Reflect.set(f.cm, 'doc', null),
    ],
    [
      'missing CodeMirror reader',
      (f: ReturnType<typeof fixture>) => Reflect.set(f.cm, 'getValue', null),
    ],
    ['block ownership', (f: ReturnType<typeof fixture>) => new TestElement('area').append(f.block)],
    [
      'preview ownership',
      (f: ReturnType<typeof fixture>) => new TestElement('block').append(f.preview),
    ],
    [
      'CodeMirror wrapper ownership',
      (f: ReturnType<typeof fixture>) => new TestElement('block').append(f.wrapper),
    ],
    [
      'CodeMirror identity',
      (f: ReturnType<typeof fixture>) => {
        f.queue.m = { ...f.cm };
      },
    ],
    [
      'CodeMirror document',
      (f: ReturnType<typeof fixture>) => {
        f.cm.doc = {};
      },
    ],
    [
      'CodeMirror cid',
      (f: ReturnType<typeof fixture>) => {
        f.cm.cid = 'foreign';
      },
    ],
    [
      'retired block',
      (f: ReturnType<typeof fixture>) => {
        f.block.isConnected = false;
      },
    ],
    [
      'retired preview',
      (f: ReturnType<typeof fixture>) => {
        f.preview.isConnected = false;
      },
    ],
    [
      'retired CodeMirror wrapper',
      (f: ReturnType<typeof fixture>) => {
        f.wrapper.isConnected = false;
      },
    ],
    [
      'changed block cid',
      (f: ReturnType<typeof fixture>) => {
        f.block.cid = 'foreign';
      },
    ],
    [
      'non-math block',
      (f: ReturnType<typeof fixture>) => {
        f.block.math = false;
      },
    ],
    [
      'source mode',
      (f: ReturnType<typeof fixture>) => {
        f.editor.sourceView.inSourceMode = true;
      },
    ],
    [
      'composition',
      (f: ReturnType<typeof fixture>) => {
        f.editor.isIME = true;
      },
    ],
    [
      'disabled math fences',
      (f: ReturnType<typeof fixture>) => {
        f.file.option.gitlabMath = false;
      },
    ],
  ] as const)
    it(`rejects a stale ${name} at completion`, async () => {
      const f = fixture();
      f.controller.install();
      const result = f.editor.mathBlock.renderUnder();
      change(f);
      f.resolve('native complete');
      await result;
      f.controller.flush();
      expect(f.update).not.toHaveBeenCalled();
    });
});

function observeFallback(f: ReturnType<typeof fixture>) {
  const requests: {
    accepted: boolean;
    original: { current: ReturnType<typeof vi.fn<() => boolean>> };
    observed: { current(): boolean };
  }[] = [];
  f.update.mockImplementation(() => {
    const request = {
      accepted: false,
      original: { current: vi.fn(() => false) },
      observed: undefined as unknown as { current(): boolean },
    };
    request.original.current.mockImplementation(() => request.accepted);
    request.observed = f.controller.observeTicket(f.preview, f.cm, request.original);
    requests.push(request);
  });
  return requests;
}

describe('initial math render ticket cancellation handoff', () => {
  for (const reason of ['composition', 'loading'] as const)
    it(`keeps the original false result and retries once after ${reason} ends`, async () => {
      const f = fixture(),
        requests = observeFallback(f);
      f.controller.install();
      await f.render();
      const first = requests[0];
      if (!first) throw Error('Missing initial fallback ticket');
      if (reason === 'composition') f.editor.isIME = true;
      else f.setAvailable(false);
      expect(first.observed.current()).toBe(false);
      expect(first.observed.current()).toBe(false);
      expect(first.original.current).toHaveBeenCalledTimes(2);
      f.controller.flush();
      expect(f.update).toHaveBeenCalledTimes(1);
      f.editor.isIME = false;
      f.setAvailable(true);
      f.controller.flush();
      f.controller.flush();
      expect(f.update).toHaveBeenCalledTimes(2);
      const second = requests[1];
      if (!second) throw Error('Missing resumed native ticket');
      second.accepted = true;
      expect(second.observed.current()).toBe(true);
      expect(first.observed.current()).toBe(false);
      expect(f.update).toHaveBeenCalledTimes(2);
    });
  it('does not retry a rejected ticket while the editor is available', async () => {
    const f = fixture(),
      requests = observeFallback(f);
    f.controller.install();
    await f.render();
    const first = requests[0];
    if (!first) throw Error('Missing initial fallback ticket');
    expect(first.observed.current()).toBe(false);
    f.editor.isIME = true;
    expect(first.observed.current()).toBe(false);
    f.editor.isIME = false;
    f.controller.flush();
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it('does not reinterpret an accepted result when the same ticket later becomes stale', async () => {
    const f = fixture(),
      requests = observeFallback(f);
    f.controller.install();
    await f.render();
    const first = requests[0];
    if (!first) throw Error('Missing initial fallback ticket');
    first.accepted = true;
    expect(first.observed.current()).toBe(true);
    first.accepted = false;
    f.editor.isIME = true;
    expect(first.observed.current()).toBe(false);
    f.editor.isIME = false;
    f.controller.flush();
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it('leaves unrelated tickets untouched outside its synchronous native update call', async () => {
    const f = fixture();
    const ticket = { current: vi.fn(() => false) };
    expect(f.controller.observeTicket(f.preview, f.cm, ticket)).toBe(ticket);
    f.controller.install();
    await f.render();
    const after = f.controller.observeTicket(f.preview, f.cm, ticket);
    expect(after).toBe(ticket);
    f.editor.isIME = true;
    expect(after.current()).toBe(false);
    f.editor.isIME = false;
    f.controller.flush();
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  for (const foreign of ['preview', 'CodeMirror'] as const)
    it(`leaves a different ${foreign} ticket untouched even during its native update call`, async () => {
      const f = fixture();
      const ticket = { current: vi.fn(() => false) };
      let observed: { current(): boolean } = ticket;
      f.update.mockImplementation(() => {
        observed = f.controller.observeTicket(
          foreign === 'preview' ? new TestElement('preview') : f.preview,
          foreign === 'CodeMirror' ? { ...f.cm } : f.cm,
          ticket,
        );
      });
      f.controller.install();
      await f.render();
      expect(observed).toBe(ticket);
      f.editor.isIME = true;
      expect(observed.current()).toBe(false);
      f.editor.isIME = false;
      f.controller.flush();
      expect(f.update).toHaveBeenCalledTimes(1);
    });
  for (const [name, retire] of [
    ['generation', (f: ReturnType<typeof fixture>) => f.newEpoch()],
    ['model node', (f: ReturnType<typeof fixture>) => f.replaceNode()],
    ['model source', (f: ReturnType<typeof fixture>) => f.setSource('different source')],
    ['CodeMirror source', (f: ReturnType<typeof fixture>) => f.setCMText('different source')],
    [
      'CodeMirror identity',
      (f: ReturnType<typeof fixture>) => {
        f.queue.m = { ...f.cm };
      },
    ],
    [
      'CodeMirror document',
      (f: ReturnType<typeof fixture>) => {
        f.cm.doc = {};
      },
    ],
    ['editor identity', (f: ReturnType<typeof fixture>) => Reflect.set(f.runtime, 'editor', {})],
    ['destroyed controller', (f: ReturnType<typeof fixture>) => f.controller.destroy()],
  ] as const)
    it(`does not retry after ${name} retired during an unavailable settlement`, async () => {
      const f = fixture(),
        requests = observeFallback(f);
      f.controller.install();
      await f.render();
      const first = requests[0];
      if (!first) throw Error('Missing initial fallback ticket');
      f.setAvailable(false);
      retire(f);
      expect(first.observed.current()).toBe(false);
      expect(first.original.current).toHaveBeenCalledOnce();
      f.setAvailable(true);
      f.controller.flush();
      expect(f.update).toHaveBeenCalledTimes(1);
    });
});
