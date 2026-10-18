import { diffText, SourceMirror } from '@marklyra/editor-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkLyraEditor } from '../src/index.js';
import type { RuntimeChange, RuntimeState } from '../src/protocol.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeSourceTracking } from '../src/runtime/source-tracking.js';

// No shared build: parent imports must use the same new core source as this test.
vi.mock('@marklyra/editor-core', () => import('../../editor-core/src/index.js'));

// Structural providers are controlled substitutes here. These tests prove the
// protocol/lifecycle boundary, never the original editor's model semantics.
const providers = vi.hoisted(() => ({ structural: vi.fn(), narrow: vi.fn() }));
vi.mock('../src/runtime/block-indent-source.js', () => ({
  captureBlockIndent: providers.structural,
}));
vi.mock('../src/runtime/list-indent-source.js', () => ({ captureListIndent: providers.narrow }));

const before = 'Head\n  - Text\nTail\n';
const raw = '\uFEFFHead\r\n   - Text\nTail\r\n';
const primaryPatches = [
  { from: 4, to: 4, insert: '!' },
  { from: 5, to: 7, insert: '' },
];
const primary = 'Head!\n- Text\nTail\n';
const canonical = 'Head!\n\n- Text\nTail\n';
const prefixes = [{ patchIndex: 1, canonical: { from: 5, to: 7 }, role: 'indent' as const }];
const expected = '\uFEFFHead!\r\n- Text\nTail\r\n';
function structuralReceipt() {
  return {
    base: before,
    patches: primaryPatches,
    editCanonical: primary,
    canonical,
    normalizationPatches: diffText(primary, canonical),
    completePrefixes: prefixes,
  };
}
function state(text: string, change: RuntimeChange, epoch = 0): RuntimeState {
  return {
    canonical: text,
    tracking: { checkpoint: change.checkpoint, changes: [change], projectionEpoch: epoch },
    sequence: 1,
    composing: false,
    sourceMode: false,
    selection: { bookmark: null, text: '' },
    outline: [],
    canUndo: true,
    canRedo: true,
  };
}
interface Host {
  mirror: SourceMirror;
  source: string;
  checkpoint: number;
  fault: Error | null;
  accept(state: RuntimeState): void;
}
function host(source = raw, active = before) {
  const mirror = new SourceMirror(source, active),
    errors: Error[] = [];
  // Exercise the real private acceptance method without a DOM/native host.
  const editor = Object.create(MarkLyraEditor.prototype) as Host;
  Object.assign(editor, {
    mirror,
    source,
    checkpoint: 0,
    checkpointStates: new Map([[0, mirror.stateId]]),
    runtimeProjectionEpochOffset: 0,
    fault: null,
    loading: false,
    documentRevision: 0,
    options: { onError: (error: Error) => errors.push(error) },
    listeners: new Set(),
    request: vi.fn(async () => true),
    assignState: vi.fn(),
  });
  return { editor, mirror, errors };
}
function trackingFixture(initial = before) {
  let text = initial,
    suspended = false;
  let undoTarget: string | undefined;
  const node = {
    cid: 'n1',
    getFirstBrother: () => node,
    get: () => undefined,
    toMark: () => text,
  };
  const undo = {
    index: 0,
    commandStack: [{ redo: {} }],
    undo() {
      if (undoTarget !== undefined) {
        text = undoTarget;
        this.index = 0;
      }
    },
    redo() {},
  };
  const editor = {
    sourceView: { inSourceMode: false },
    writingArea: { ownerDocument: undefined },
    undo,
    nodeMap: { blocks: { sortedFirst: () => node }, toMark: () => text },
    getMarkdown: () => text,
    warpContentWithOption: (value: string) => value,
  };
  const runtime = {
    editor,
    File: {
      option: {
        indentSize: 2,
        indentByTab: false,
        prettyIndent: false,
        headingStyle: 0,
        ulStyle: 0,
        olStyle: 0,
      },
      isLocked: false,
    },
  } as unknown as LegacyGlobals;
  const tracking = new RuntimeSourceTracking(runtime, () => suspended);
  tracking.enableMarkdownProjection();
  tracking.reset(initial);
  return {
    tracking,
    editor,
    runtime,
    undoTo(value: string) {
      undoTarget = value;
      undo.undo();
    },
    change(value: string) {
      text = value;
      undo.commandStack.push({ redo: {} });
      undo.index++;
    },
    suspend() {
      suspended = true;
    },
  };
}

beforeEach(() => {
  providers.structural.mockReset();
  providers.narrow.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('structural prefix tracking handoff', () => {
  it.each(['normalized', 'original', 'wrong-body'] as const)(
    'pre-history numeral spelling bridge accepts only a complete known target: %s',
    (variant) => {
      const initial = '009. Alpha\n010. Beta\n011. Gamma\n';
      const original = '\uFEFF009. Alpha\r\n010. Beta\n011. Gamma\r\n';
      const edit = '009. Alpha\n\n   Beta\n\n011. Gamma\n';
      const actual = edit.replace('009.', '9.');
      const normalization = [{ from: 0, to: 5, insert: '9. ' }];
      const patches = [
        { from: 10, to: 10, insert: '\n' },
        { from: 11, to: 16, insert: '' },
        { from: 16, to: 16, insert: '   ' },
        { from: 20, to: 20, insert: '\n' },
      ];
      const f = trackingFixture(initial),
        parent = host(original, initial);
      const baseCheckpoint = f.tracking.save().checkpoint;
      Object.assign(parent.editor, {
        checkpoint: baseCheckpoint,
        checkpointStates: new Map([[baseCheckpoint, parent.mirror.stateId]]),
      });
      providers.structural.mockReturnValue(() => ({
        base: initial,
        patches,
        editCanonical: edit,
        canonical: actual,
        normalizationPatches: normalization,
        beforeNormalizationPatches: normalization,
        completePrefixes: [{ patchIndex: 1, canonical: { from: 11, to: 16 }, role: 'list-marker' }],
      }));
      expect(f.tracking.armStructuralIndent('join-item')).toBe(true);
      f.change(actual);
      const first = f.tracking.capture(actual);
      const firstChange = first.changes.at(-1);
      if (!firstChange) throw Error('Missing content change');
      parent.editor.accept({
        ...state(actual, firstChange, first.projectionEpoch),
        tracking: first,
      });
      expect(parent.editor.fault).toBeNull();
      const preserved = parent.editor.source;
      const restored =
        variant === 'original'
          ? initial
          : initial
              .replace('009.', '9.')
              .replace('Beta', variant === 'wrong-body' ? 'Zeta' : 'Beta');
      f.undoTo(restored);
      const last = f.tracking.capture(restored),
        change = last.changes.at(-1);
      if (!change) throw Error('Missing native history change');
      expect(change.historyTarget).toBe(baseCheckpoint);
      expect(change).not.toHaveProperty('completePrefixes');
      parent.editor.accept({ ...state(restored, change, last.projectionEpoch), tracking: last });
      if (variant === 'wrong-body') {
        expect(change.canonicalProjection).toBeUndefined();
        expect(parent.editor.fault).not.toBeNull();
        expect(parent.editor.source).toBe(preserved);
      } else {
        expect(parent.editor.fault).toBeNull();
        expect(parent.editor.source).toBe(original);
        expect(parent.mirror.canonical).toBe(restored);
        if (variant === 'normalized')
          expect(change.canonicalProjection?.baseCanonical).toBe(initial);
        else expect(change.canonicalProjection).toBeUndefined();
      }
    },
  );
  it('preserves primary patch indexes while combining separate serializer padding', () => {
    const f = trackingFixture();
    providers.structural.mockReturnValue(() => structuralReceipt());
    expect(f.tracking.armStructuralIndent('outdent')).toBe(true);
    // The new provider reads an isolated model. Do not additionally invoke the
    // legacy provider's active-root serializer after its capture has succeeded.
    expect(providers.narrow).not.toHaveBeenCalled();
    f.change(canonical);
    const change = f.tracking.capture(canonical).changes.at(-1);
    expect(change?.patches).toEqual(diffText(before, canonical));
    expect(change?.editPatches).toEqual(primaryPatches);
    expect(change?.completePrefixes).toEqual(prefixes);
    expect(change?.canonicalProjection).toEqual({
      baseProjectionEpoch: 0,
      baseCanonical: primary,
      patches: diffText(primary, canonical),
    });
    expect(change).not.toHaveProperty('normalization');
    expect(change).not.toHaveProperty('historyTarget');
    expect(change).not.toHaveProperty('externalSource');
  });
  it('does not grant complete-prefix permission when the provider rejects its after-state', () => {
    const f = trackingFixture();
    providers.structural.mockReturnValue(() => undefined);
    expect(f.tracking.armStructuralIndent('indent')).toBe(true);
    f.change(canonical);
    expect(f.tracking.capture(canonical).changes.at(-1)).not.toHaveProperty('completePrefixes');
  });
  it('expires an unused capture before a later change without reusing its permission', () => {
    vi.useFakeTimers();
    const f = trackingFixture(),
      complete = vi.fn(() => structuralReceipt());
    providers.structural.mockReturnValue(complete);
    expect(f.tracking.armStructuralIndent('quote')).toBe(true);
    vi.runOnlyPendingTimers();
    f.change(canonical);
    expect(f.tracking.capture(canonical).changes.at(-1)).not.toHaveProperty('completePrefixes');
    expect(complete).not.toHaveBeenCalled();
  });
  it.each(['reset', 'external'] as const)(
    'clears the armed permission before %s takes ownership',
    (kind) => {
      const f = trackingFixture(),
        complete = vi.fn(() => structuralReceipt());
      providers.structural.mockReturnValue(complete);
      expect(f.tracking.armStructuralIndent('indent')).toBe(true);
      f.change(canonical);
      const result =
        kind === 'reset'
          ? f.tracking.reset(canonical)
          : f.tracking.markExternalReload(canonical, expected);
      expect(result.changes.every((change) => change.completePrefixes === undefined)).toBe(true);
      if (kind === 'external') expect(result.changes.at(-1)?.externalSource).toBe(expected);
      expect(complete).not.toHaveBeenCalled();
    },
  );
  it.each(['source', 'locked', 'suspended'] as const)(
    'does not ask a provider for permission in %s state',
    (kind) => {
      const f = trackingFixture();
      if (kind === 'source') f.editor.sourceView.inSourceMode = true;
      if (kind === 'locked' && f.runtime.File) f.runtime.File.isLocked = true;
      if (kind === 'suspended') f.suspend();
      expect(f.tracking.armStructuralIndent('indent')).toBe(false);
      expect(providers.structural).not.toHaveBeenCalled();
      expect(providers.narrow).not.toHaveBeenCalled();
    },
  );
});

describe('parent structural prefix protocol acceptance', () => {
  it('passes the original primary index to core and keeps virtual padding outside raw', () => {
    const f = host(),
      update = vi.spyOn(f.mirror, 'update');
    f.editor.accept(
      state(
        canonical,
        {
          baseCheckpoint: 0,
          checkpoint: 1,
          baseProjectionEpoch: 0,
          patches: diffText(before, canonical),
          editPatches: primaryPatches,
          completePrefixes: prefixes,
          canonicalProjection: {
            baseProjectionEpoch: 0,
            baseCanonical: primary,
            patches: diffText(primary, canonical),
          },
        },
        1,
      ),
    );
    expect(f.editor.fault).toBeNull();
    expect(f.editor.source).toBe(expected);
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      kind: 'edit',
      patches: primaryPatches,
      completePrefixes: prefixes,
    });
    expect(f.errors).toEqual([]);
  });
  it.each(['normalization', 'external'] as const)(
    'rejects complete prefixes attached to %s and repeated packets stay rejected',
    (kind) => {
      const f = host();
      const change: RuntimeChange = {
        baseCheckpoint: 0,
        checkpoint: 1,
        patches: diffText(before, canonical),
        completePrefixes: prefixes,
        ...(kind === 'normalization'
          ? {
              normalization: true as const,
              canonicalProjection: {
                baseProjectionEpoch: 0,
                baseCanonical: before,
                patches: diffText(before, canonical),
              },
            }
          : { externalSource: expected }),
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        f.editor.accept(state(canonical, change));
        expect(f.editor.fault).not.toBeNull();
        expect(f.editor.source).toBe(raw);
        expect(f.editor.checkpoint).toBe(0);
      }
    },
  );
  it.each(['completePrefixes', 'editPatches'] as const)(
    'cannot launder malformed history with %s through the fault-recovery branch',
    (field) => {
      const f = host();
      const edited = before.replace('Text', 'Text!');
      f.editor.accept(
        state(edited, {
          baseCheckpoint: 0,
          checkpoint: 1,
          patches: [{ from: 13, to: 13, insert: '!' }],
        }),
      );
      expect(f.editor.fault).toBeNull();
      const preserved = f.editor.source;
      const valid: RuntimeChange = {
        baseCheckpoint: 1,
        checkpoint: 2,
        historyTarget: 0,
        patches: diffText(edited, before),
      };
      const invalid = {
        ...valid,
        [field]: field === 'completePrefixes' ? prefixes : primaryPatches,
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        f.editor.accept(state(before, invalid));
        expect(f.editor.fault).not.toBeNull();
        expect(f.editor.source).toBe(preserved);
        expect(f.editor.checkpoint).toBe(1);
      }
      f.editor.accept(state(before, valid));
      expect(f.editor.fault).toBeNull();
      expect(f.editor.source).toBe(raw);
      expect(f.editor.checkpoint).toBe(2);
    },
  );
});
