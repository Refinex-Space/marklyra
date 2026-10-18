import { describe, expect, it, vi } from 'vitest';
import type { RuntimeState } from '../src/protocol.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeMarkdownPreferences } from '../src/runtime/markdown-preferences.js';
import { readMarkdownPolicy, writeMarkdownPolicy } from '../src/runtime/policy-options.js';
import type { RuntimeSourceTracking } from '../src/runtime/source-tracking.js';

function fixture() {
  const option = { indentSize: 2, indentByTab: false, prettyIndent: false };
  const editor = { sourceView: { inSourceMode: true } };
  const runtime = { File: { option }, editor } as unknown as LegacyGlobals;
  let snapshot = {
    canonical: 'Alpha',
    sequence: 1,
    sourceMode: true,
    composing: false,
    tracking: { checkpoint: 5, changes: [] },
    selection: { bookmark: null, text: '' },
    outline: [],
    canUndo: true,
    canRedo: true,
  } as RuntimeState;
  const projected = { checkpoint: 6, changes: [], projectionEpoch: 1 };
  const rebasePolicy = vi.fn(() => projected);
  const state = vi.fn(() => snapshot);
  const available = vi.fn(() => true);
  const service = new RuntimeMarkdownPreferences({
    runtime,
    state,
    available,
    tracking: {
      enableMarkdownProjection: vi.fn(),
      rebasePolicy,
    } as unknown as RuntimeSourceTracking,
  });
  service.initialize({});
  return {
    service,
    option,
    state,
    available,
    rebasePolicy,
    projected,
    runtime,
    change: (value: Partial<RuntimeState>) => {
      snapshot = { ...snapshot, ...value };
    },
  };
}

describe('staged Markdown preference application', () => {
  it('prepares without changing options and commits a precomputed response without a fallible post-commit read', () => {
    const f = fixture();
    const preparation = f.service.prepare({ indentSize: -1 });
    expect(f.option.indentByTab).toBe(false);
    f.state
      .mockImplementationOnce(
        () =>
          ({
            ...f.state.mock.results[0]?.value,
          }) as RuntimeState,
      )
      .mockImplementationOnce(() => {
        throw new Error('post-commit read must not run');
      });
    const response = f.service.commit({ token: preparation.token });
    expect(response.canonical).toBe('Alpha');
    expect(response.tracking).toEqual(f.projected);
    expect(f.option.indentByTab).toBe(true);
    expect(f.state).toHaveBeenCalledTimes(2);
    expect(f.rebasePolicy).toHaveBeenCalledExactlyOnceWith('Alpha');
    expect(() => f.service.commit({ token: preparation.token })).toThrow(/过期/);
  });
  it('rejects newer input and a consumed/cancelled token before changing options', () => {
    const f = fixture();
    const p = f.service.prepare({ indentSize: 5 });
    f.change({ sequence: 2, canonical: 'AlphaZ' });
    expect(() => f.service.commit({ token: p.token })).toThrow(/更改/);
    expect(f.option.indentSize).toBe(2);
    expect(f.rebasePolicy).not.toHaveBeenCalled();
    const second = f.service.prepare({ indentSize: 4 });
    f.service.cancel({ token: second.token });
    expect(() => f.service.commit({ token: second.token })).toThrow(/过期/);
    expect(f.option.indentSize).toBe(2);
  });
  it('rolls options back when projection validation fails before its commit', () => {
    const f = fixture();
    const before = Object.getOwnPropertyDescriptors(f.option);
    const p = f.service.prepare({ indentSize: -1, prettyIndent: true });
    f.rebasePolicy.mockImplementationOnce(() => {
      throw new Error('projection proof rejected');
    });
    expect(() => f.service.commit({ token: p.token })).toThrow('projection proof rejected');
    expect(Object.getOwnPropertyDescriptors(f.option)).toEqual(before);
    const retry = f.service.prepare({ prettyIndent: true });
    f.service.commit({ token: retry.token });
    expect(f.option).toEqual({
      indentSize: 2,
      indentByTab: false,
      prettyIndent: true,
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
    });
  });
  it('resolves a committed token from actual options and a fresh runtime state', () => {
    const f = fixture();
    const p = f.service.prepare({ indentSize: -1 });
    f.service.commit({ token: p.token });
    f.change({ canonical: 'Alpha!', sequence: 2 });
    expect(f.service.resolve({ token: p.token })).toMatchObject({
      token: p.token,
      committed: true,
      preferences: { indentSize: -1, prettyIndent: false },
      state: { canonical: 'Alpha!', sequence: 2 },
    });
    f.option.indentSize = 4;
    expect(() => f.service.resolve({ token: p.token })).toThrow(/实际状态/);
  });
  it('resolution cancels a prepared token before proving it uncommitted, including a late commit', () => {
    const f = fixture();
    const p = f.service.prepare({ indentSize: 4 });
    expect(f.service.resolve({ token: p.token })).toMatchObject({
      committed: false,
      preferences: { indentSize: 2, prettyIndent: false },
    });
    expect(() => f.service.commit({ token: p.token })).toThrow(/过期/);
    const newer = f.service.prepare({ indentSize: 5 });
    expect(() => f.service.resolve({ token: p.token })).toThrow(/过期/);
    f.service.commit({ token: newer.token });
    expect(f.option.indentSize).toBe(5);
  });
  it('unavailable resolution stays unknown and cannot leave a late prepared commit enabled', () => {
    const f = fixture();
    const p = f.service.prepare({ indentSize: 4 });
    f.available.mockReturnValue(false);
    expect(() => f.service.resolve({ token: p.token })).toThrow(/尚未确认/);
    f.available.mockReturnValue(true);
    expect(() => f.service.commit({ token: p.token })).toThrow(/过期/);
    expect(f.service.resolve({ token: p.token }).committed).toBe(false);
  });
});

describe('serializer option descriptor transaction', () => {
  it('restores descriptor flags and rolls back a partially failed write', () => {
    const f = fixture();
    Object.defineProperty(f.option, 'prettyIndent', {
      value: false,
      writable: true,
      configurable: false,
      enumerable: false,
    });
    const before = Object.getOwnPropertyDescriptors(f.option);
    const restore = writeMarkdownPolicy(f.runtime, {
      indentSize: 5,
      indentByTab: true,
      prettyIndent: true,
    });
    expect(readMarkdownPolicy(f.runtime)).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 5,
      indentByTab: true,
      prettyIndent: true,
    });
    restore();
    expect(Object.getOwnPropertyDescriptors(f.option)).toEqual(before);
    const option = { indentSize: 2 };
    Object.preventExtensions(option);
    const bad = { File: { option } } as unknown as LegacyGlobals;
    expect(() =>
      writeMarkdownPolicy(bad, { indentSize: 4, indentByTab: false, prettyIndent: false }),
    ).toThrow();
    expect(option).toEqual({ indentSize: 2 });
  });
  it('rejects an accessor without invoking it', () => {
    const f = fixture();
    const read = vi.fn(() => false);
    Object.defineProperty(f.option, 'prettyIndent', { get: read, configurable: true });
    expect(() =>
      writeMarkdownPolicy(f.runtime, { indentSize: 4, indentByTab: false, prettyIndent: true }),
    ).toThrow(/data properties/);
    expect(read).not.toHaveBeenCalled();
  });
});
