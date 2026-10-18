import { describe, expect, it } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import {
  historySignature,
  RuntimeSourceTracking,
  type TrackingSnapshot,
} from '../src/runtime/source-tracking.js';

describe('CodeMirror history identity snapshots', () => {
  it('records semantic text operations without traversing cyclic internal marker/line handles', () => {
    const line: { parent?: unknown } = {};
    line.parent = { lines: [line] };
    const operation = {
      from: { line: 0, ch: 0, sticky: null },
      to: { line: 1, ch: 0, sticky: null },
      text: ['same', ''],
      markedSpans: { line },
    };
    expect(historySignature([operation])).toBe(
      historySignature([{ from: { line: 0, ch: 0 }, to: { line: 1, ch: 0 }, text: ['same', ''] }]),
    );
    expect(historySignature([operation])).not.toBe(
      historySignature([{ ...operation, text: ['changed', ''] }]),
    );
  });
});

describe('Source history projection bridges', () => {
  function fixture(bridge: NonNullable<TrackingSnapshot['projectionBridges']>[number][1]) {
    let value = '    A';
    const cm = {
      doc: { history: { generation: 1, maxGeneration: 2, done: [], undone: [] } },
      on() {},
    };
    const undo = {
      index: -1,
      commandStack: [],
      undo() {
        value = '    A';
        cm.doc.history.generation = 1;
      },
      redo() {},
    };
    const editor = {
      writingArea: { ownerDocument: null },
      sourceView: { inSourceMode: true, cm },
      undo,
      getMarkdown: () => value,
    };
    const runtime = {
      editor,
      File: {
        option: {
          indentSize: 4,
          indentByTab: false,
          prettyIndent: false,
          headingStyle: 0,
          ulStyle: 0,
          olStyle: 0,
        },
      },
    } as unknown as LegacyGlobals;
    const tracking = new RuntimeSourceTracking(runtime, () => false);
    tracking.enableMarkdownProjection();
    tracking.reset(value);
    const saved = tracking.save();
    saved.projectionBridges = [[saved.checkpoint, bridge]];
    tracking.restore(saved, value);
    value = '    A!';
    cm.doc.history.generation = 2;
    tracking.capture(value);
    return { undo, tracking, saved, value: () => value };
  }
  it('uses the exact restored CM identity and compact inverse/forward replay', () => {
    const bridge = {
      forward: [{ from: 0, to: 0, insert: '  ' }],
      inverse: [{ from: 0, to: 2, insert: '' }],
    };
    const f = fixture(bridge);
    f.undo.undo();
    const last = f.tracking.capture(f.value()).changes.at(-1);
    expect(last?.historyTarget).toBe(f.saved.checkpoint);
    expect(last?.canonicalProjection).toEqual({
      baseProjectionEpoch: 0,
      baseCanonical: '  A',
      patches: bridge.forward,
    });
    expect(f.tracking.save().projectionBridges).toContainEqual([f.saved.checkpoint, bridge]);
  });
  it('rejects a bridge whose forward replay cannot reproduce the actual CM target', () => {
    const f = fixture({
      forward: [{ from: 0, to: 0, insert: 'wrong' }],
      inverse: [{ from: 0, to: 2, insert: '' }],
    });
    expect(() => f.undo.undo()).toThrow(/proven projection bridge/);
  });
  it('rejects unsafe coordinates and bounded patch or text budgets before recording history', () => {
    for (const inverse of [
      [{ from: -1, to: 0, insert: '' }],
      Array.from({ length: 16_385 }, () => ({ from: 0, to: 0, insert: '' })),
      [{ from: 0, to: 0, insert: 'x'.repeat(1_048_577) }],
    ]) {
      const f = fixture({ forward: [], inverse });
      const before = f.tracking.save().checkpoint;
      expect(() => f.undo.undo()).toThrow(/bridge/);
      expect(f.tracking.save().checkpoint).toBe(before);
    }
  });
});
