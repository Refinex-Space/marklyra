import { describe, expect, it, vi } from 'vitest';
import {
  type NativeMenuPresentation,
  NativeMenuPublisher,
  nativeMenuCommandAllowed,
} from '../src/features/menus/native-menu-state.js';

const state = (): NativeMenuPresentation => ({
  ready: true,
  blocked: false,
  sidebar: true,
  sidebarTab: 'files',
  fileView: 'tree',
  fullscreen: false,
  statisticsOpen: false,
  editor: {
    sourceMode: false,
    focusMode: false,
    typewriterMode: false,
    canUndo: true,
    canRedo: false,
    locked: false,
    modalOpen: false,
    inlineAllowed: true,
    blockAllowed: true,
    inlineStyles: ['strong'],
    blockStyles: ['paragraph'],
  },
});
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
describe('native menu presentation lifecycle', () => {
  it('captures a copied DTO with monotonic serials even when context resolves out of order', async () => {
    const contexts: ((value: string) => void)[] = [],
      send = vi.fn(async () => {});
    const publisher = new NativeMenuPublisher(
      () => new Promise((resolve) => contexts.push(resolve)),
      vi.fn(),
      send,
    );
    const first = state();
    publisher.publish(first);
    if (!first.editor) throw new Error('Missing fixture menu');
    (first.editor.inlineStyles as string[]).push('em');
    publisher.publish({ ...state(), fullscreen: true });
    contexts[1]?.('context');
    await settle();
    contexts[0]?.('context');
    await settle();
    expect(
      send.mock.calls.map((call) => (call as unknown as [{ serial: number }])[0].serial),
    ).toEqual([2, 1]);
    expect(send.mock.calls[1]).toEqual([
      expect.objectContaining({
        serial: 1,
        editor: expect.objectContaining({ inlineStyles: ['strong'] }),
      }),
    ]);
  });
  it('disposes pending publication and reports errors without applying state', async () => {
    let complete!: (value: string) => void;
    const send = vi.fn(async () => {}),
      report = vi.fn();
    const publisher = new NativeMenuPublisher(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
      report,
      send,
    );
    publisher.publish(state());
    publisher.dispose();
    complete('context');
    await settle();
    expect(send).not.toHaveBeenCalled();
    const failed = new NativeMenuPublisher(
      async () => {
        throw new Error('registration failed');
      },
      report,
      send,
    );
    failed.publish(state());
    await settle();
    expect(report).toHaveBeenCalledOnce();
  });
  it('checks the latest original mode/history/modal before dispatch', () => {
    const current = state().editor;
    if (!current) throw new Error('Missing fixture menu');
    expect(nativeMenuCommandAllowed(current, { type: 'format', style: 'strong' })).toBe(true);
    expect(
      nativeMenuCommandAllowed(
        { ...current, sourceMode: true },
        { type: 'format', style: 'strong' },
      ),
    ).toBe(false);
    expect(
      nativeMenuCommandAllowed({ ...current, sourceMode: true }, { type: 'toggleFocus' }),
    ).toBe(true);
    expect(nativeMenuCommandAllowed(current, { type: 'redo' })).toBe(false);
    expect(nativeMenuCommandAllowed({ ...current, modalOpen: true }, { type: 'find' })).toBe(false);
    expect(nativeMenuCommandAllowed(null, { type: 'undo' })).toBe(false);
    expect(nativeMenuCommandAllowed(current, { type: 'format', style: 'strong' }, true)).toBe(
      false,
    );
    expect(nativeMenuCommandAllowed(current, { type: 'find' }, true)).toBe(true);
  });
});
