import { describe, expect, it } from 'vitest';
import type { MarkLyraMenuState } from '../src/menu-state.js';
import { MenuStateObserver } from '../src/menu-state-observer.js';

const plain = (): MarkLyraMenuState => ({
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  canUndo: true,
  canRedo: false,
  locked: false,
  modalOpen: false,
  inlineAllowed: true,
  blockAllowed: true,
  inlineStyles: [],
  blockStyles: ['paragraph'],
});

describe('menu facts delivery independently of source transactions', () => {
  it('rejects a delayed read even when its request order ties a newer selection event', () => {
    const seen: MarkLyraMenuState[] = [];
    const observer = new MenuStateObserver(() => {});
    observer.subscribe((state) => seen.push(state));
    observer.publish(plain(), 10, 3);
    observer.publish({ ...plain(), inlineStyles: ['strong'] }, 12, 3);
    observer.publish(plain(), 11, 3);
    expect(observer.value?.inlineStyles).toEqual(['strong']);
    observer.publish({ ...plain(), sourceMode: true }, 13, 2);
    expect(observer.value?.sourceMode).toBe(false);
    expect(seen).toHaveLength(2);
  });
  it('isolates observer errors and external mutations while composition can notify identical facts', () => {
    const errors: unknown[] = [],
      seen: MarkLyraMenuState[] = [];
    const observer = new MenuStateObserver((error) => errors.push(error));
    observer.subscribe(() => {
      throw Error('observer failure');
    });
    observer.subscribe((state) => seen.push(state));
    const input = plain();
    observer.publish(input, 1, 1);
    (input.blockStyles as string[]).push('fences');
    expect(observer.value?.blockStyles).toEqual(['paragraph']);
    expect(Object.isFrozen(observer.value?.blockStyles)).toBe(true);
    observer.publish(plain(), 2, 1);
    expect(seen).toHaveLength(1);
    observer.notify();
    expect(seen).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(() => {
      if (observer.value) observer.value.canUndo = false;
    }).toThrow();
    expect(observer.value?.canUndo).toBe(true);
  });
  it('does not advance authority for malformed data and revokes destroyed subscriptions', () => {
    const errors: unknown[] = [],
      seen: MarkLyraMenuState[] = [];
    const observer = new MenuStateObserver((error) => errors.push(error));
    const stop = observer.subscribe((state) => seen.push(state));
    observer.publish({ ...plain(), inlineStyles: ['run-script'] }, 5, 2);
    expect(observer.value).toBeNull();
    expect(errors).toHaveLength(1);
    observer.publish(plain(), 5, 2);
    expect(seen).toHaveLength(1);
    stop();
    observer.notify();
    expect(seen).toHaveLength(1);
    observer.destroy();
    observer.publish(plain(), 6, 3);
    expect(observer.value).toBeNull();
    expect(seen).toHaveLength(1);
  });
});
