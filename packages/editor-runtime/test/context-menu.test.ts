import { describe, expect, it, vi } from 'vitest';
import {
  type ContextAction,
  type ContextMenuRequest,
  clipboardContent,
  contextMenuRequest,
  externalLink,
  offeredContextActions,
} from '../src/context-menu/contracts.js';
import { HostContextMenu } from '../src/context-menu/host.js';
import type { RuntimeState } from '../src/protocol.js';

const request = (): ContextMenuRequest => ({
  requestId: 'menu-1',
  point: { x: 20, y: 30 },
  items: [{ type: 'item', actionId: 'edit.cut', label: '剪切', enabled: true }],
});
describe('context menu authority boundary', () => {
  it('copies validated values and only grants enabled nested items', () => {
    const input = request();
    input.items.push({
      type: 'submenu',
      label: 'Table',
      items: [
        { type: 'item', actionId: 'table.delete', label: 'Delete', enabled: false },
        { type: 'item', actionId: 'table.copy', label: 'Copy', enabled: true },
      ],
    });
    const copy = contextMenuRequest(input);
    input.items.length = 0;
    expect([...offeredContextActions(copy.items)]).toEqual(['edit.cut', 'table.copy']);
  });
  it.each([
    null,
    {},
    { ...request(), requestId: '../../file' },
    { ...request(), point: { x: Infinity, y: 0 } },
    {
      ...request(),
      items: [{ type: 'item', actionId: 'path.openFile', label: 'x', enabled: true }],
    },
    { ...request(), items: [request().items[0], request().items[0]] },
    {
      ...request(),
      items: [{ type: 'item', actionId: 'edit.copy', label: 'x\nrun', enabled: true }],
    },
  ])('rejects invalid or executable menu data %#', (value) => {
    expect(() => contextMenuRequest(value)).toThrow();
  });
  it('rejects unbounded trees and malformed clipboard values', () => {
    const tree = request();
    for (let n = 0; n < 5; n++)
      tree.items = [{ type: 'submenu', label: 'Nested', items: tree.items }];
    expect(() => contextMenuRequest(tree)).toThrow();
    expect(() => clipboardContent({ text: 'ok', html: 42 })).toThrow();
    expect(clipboardContent({ text: '', html: '<p>中文</p>' })).toEqual({
      text: '',
      html: '<p>中文</p>',
    });
  });
  it('opens only explicit external protocols without credentials', () => {
    expect(externalLink('https://example.test/文档')).toContain('https://example.test/');
    for (const value of [
      'javascript:alert(1)',
      'file:///tmp/x',
      'data:text/html,x',
      '../x',
      'https://user:secret@example.test',
      'https://example.test/\nx',
    ])
      expect(() => externalLink(value)).toThrow();
  });
  it('carries the bounded Markdown HTML flavor independently from ordinary HTML', () => {
    const data = {
      text: 'Bravo',
      html: '<mark>Bravo</mark>',
      markHtml: '<span md-inline="highlight">==Bravo==</span>',
    };
    expect(clipboardContent(data)).toEqual(data);
    expect(() => clipboardContent({ text: '', markHtml: 42 })).toThrow();
    expect(() =>
      clipboardContent({ text: '', markHtml: 'x'.repeat(8 * 1024 * 1024 + 1) }),
    ).toThrow();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function host() {
  let select: (action: ContextAction | null) => void = () => {};
  let operation = Promise.resolve();
  const state = {} as RuntimeState;
  const writeGate = deferred<void>();
  const readGate = deferred<{ text: string }>();
  const invoke = vi.fn(async (operation: string) =>
    operation === 'context-menu-execute'
      ? { state, effect: { type: 'clipboard', content: { text: 'chosen' }, cutToken: 'one-use' } }
      : { state },
  );
  const write = vi.fn(() => writeGate.promise);
  const report = vi.fn();
  const show = vi.fn((_value: ContextMenuRequest, callback: typeof select) => {
    select = callback;
  });
  const menu = new HostContextMenu({
    frame: {
      ownerDocument: {},
      getBoundingClientRect: () => ({ left: 40, top: 60 }),
    } as HTMLIFrameElement,
    host: { contextMenu: { show }, clipboard: { read: () => readGate.promise, write } },
    request: invoke,
    accept: vi.fn(),
    report,
    assertAvailable: () => {},
    run: (work) => {
      const result = work();
      operation = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  });
  return {
    menu,
    choose: (action: ContextAction | null) => select(action),
    oldSelect: () => select,
    invoke,
    write,
    writeGate,
    readGate,
    show,
    report,
    settle: async () => {
      await operation;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
describe('host menu and clipboard lifecycle', () => {
  it('uses host coordinates and cancellation causes no execution', async () => {
    const h = host();
    h.menu.show(request());
    expect(h.show.mock.calls[0]?.[0].point).toEqual({ x: 60, y: 90 });
    h.choose(null);
    await h.settle();
    expect(h.invoke.mock.calls.map(([name]) => name)).toEqual(['context-menu-cancel']);
    expect(h.write).not.toHaveBeenCalled();
  });
  it('only deletes after a successful clipboard write and consumes selection once', async () => {
    const h = host();
    h.menu.show(request());
    h.choose('edit.cut');
    h.choose('edit.cut');
    await Promise.resolve();
    await Promise.resolve();
    expect(h.invoke.mock.calls.map(([name]) => name)).toEqual(['context-menu-execute']);
    h.writeGate.resolve();
    await h.settle();
    expect(h.invoke.mock.calls.map(([name]) => name)).toEqual([
      'context-menu-execute',
      'context-menu-cut',
    ]);
    expect(h.write).toHaveBeenCalledTimes(1);
  });
  it('clipboard failure never invokes cut commit', async () => {
    const h = host();
    h.menu.show(request());
    h.choose('edit.cut');
    h.writeGate.reject(new Error('Clipboard unavailable'));
    await h.settle();
    expect(h.invoke.mock.calls.map(([name]) => name)).toEqual(['context-menu-execute']);
    expect(h.report).toHaveBeenCalledOnce();
  });
  it('typing during clipboard write invalidates the later cut commit', async () => {
    const h = host();
    h.menu.show(request());
    h.choose('edit.cut');
    await Promise.resolve();
    await Promise.resolve();
    h.menu.documentChanged();
    h.writeGate.resolve();
    await h.settle();
    expect(h.invoke.mock.calls.map(([name]) => name)).toEqual(['context-menu-execute']);
  });
  it('ignores replaced-menu callbacks and rejects unoffered actions', async () => {
    const h = host();
    h.menu.show(request());
    const old = h.oldSelect();
    h.menu.show({ ...request(), requestId: 'menu-2' });
    old('edit.cut');
    h.choose('table.delete');
    await h.settle();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenCalledOnce();
  });
  it('document switch while clipboard read is pending cannot paste', async () => {
    const h = host();
    const value = request();
    value.items = [{ type: 'item', actionId: 'edit.paste', label: 'Paste', enabled: true }];
    h.menu.show(value);
    h.choose('edit.paste');
    h.menu.invalidate();
    h.readGate.resolve({ text: 'late' });
    await h.settle();
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it('aborting an uncooperative clipboard reader releases the serialized operation', async () => {
    const h = host();
    const value = request();
    value.items = [{ type: 'item', actionId: 'edit.paste', label: 'Paste', enabled: true }];
    h.menu.show(value);
    h.choose('edit.paste');
    h.menu.invalidate();
    let complete = false;
    void h.settle().then(() => {
      complete = true;
    });
    await vi.waitFor(() => expect(complete).toBe(true));
    expect(h.invoke).not.toHaveBeenCalled();
    h.readGate.resolve({ text: 'ignored late result' });
    await Promise.resolve();
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
