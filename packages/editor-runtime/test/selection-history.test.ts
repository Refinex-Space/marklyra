import { describe, expect, it } from 'vitest';
import {
  bindHistorySelection,
  type PendingHistorySelection,
} from '../src/runtime/history-selection.js';

function pending(): PendingHistorySelection {
  return {
    anchor: {
      cid: 'second',
      text: 'Second *Middle* end',
      offset: 8,
      point: { path: [1, 0], offset: 1, nodeType: 3, role: 'SPAN:em:' },
    },
    head: {
      cid: 'first',
      text: 'Alpha **Bold** tail',
      offset: 7,
      point: { path: [1, 0], offset: 1, nodeType: 3, role: 'SPAN:strong:' },
    },
    bookmark: { type: 'cursor', startId: 'first', endId: 'second', start: 7, end: 8 },
    priorEntry: undefined,
  };
}
function entry(value = pending()) {
  return {
    undo: [
      value.bookmark,
      ...[value.head, value.anchor].map((endpoint) => ({
        type: 'replace',
        id: endpoint.cid,
        json: { id: endpoint.cid, content: { type: 'paragraph', text: endpoint.text } },
      })),
    ],
  };
}
describe('identity-bound directed original history selection', () => {
  it('retains exact directed endpoints only for a new entry with matching original cursor and first model replacements', () => {
    const value = pending();
    expect(bindHistorySelection(value, entry(value))).toEqual({
      anchor: value.anchor,
      head: value.head,
      bookmark: value.bookmark,
    });
  });
  it('does not overwrite the start of an existing coalesced group', () => {
    const value = pending(),
      existing = entry(value);
    expect(bindHistorySelection({ ...value, priorEntry: existing }, existing)).toBeUndefined();
  });
  it('rejects missing, duplicate, stale and changed original cursors', () => {
    const value = pending(),
      valid = entry(value);
    for (const undo of [
      [],
      valid.undo.slice(1),
      [...valid.undo, value.bookmark],
      [{ ...value.bookmark, end: 19 }, ...valid.undo.slice(1)],
    ])
      expect(bindHistorySelection(value, { undo })).toBeUndefined();
  });
  it('does not search later matching replacements after a mismatched first state', () => {
    const value = pending(),
      valid = entry(value);
    expect(
      bindHistorySelection(value, {
        undo: [
          value.bookmark,
          {
            type: 'replace',
            id: 'first',
            json: { id: 'first', content: { type: 'paragraph', text: 'other' } },
          },
          ...valid.undo.slice(1),
        ],
      }),
    ).toBeUndefined();
  });
  it('rejects missing or mismatched cid/type/model bodies', () => {
    const value = pending();
    for (const override of [
      { id: 'other', content: { type: 'paragraph', text: value.head.text } },
      { id: 'first', content: { type: 'heading', text: value.head.text } },
      { id: 'first', content: { type: 'paragraph', text: 'other' } },
    ]) {
      const valid = entry(value);
      expect(
        bindHistorySelection(value, {
          undo: [value.bookmark, { type: 'replace', id: 'first', json: override }, valid.undo[2]],
        }),
      ).toBeUndefined();
    }
  });
  it('allows neither partial history nor a source patch to escape the proof', () => {
    const value = pending();
    expect(bindHistorySelection(value, { undo: { type: 'cursor' } })).toBeUndefined();
    const result = bindHistorySelection(value, entry(value));
    expect(result && Object.keys(result).sort()).toEqual(['anchor', 'bookmark', 'head']);
  });
  it('binds the first nested paragraph snapshot only through matching container identities', () => {
    const value = pending();
    const nested = (id: string, text: string) => ({
      type: 'replace',
      id: `item-${id}`,
      json: {
        id: `item-${id}`,
        content: { type: 'list_item' },
        children: [
          {
            id,
            content: { type: 'paragraph', text },
            relation: { parent_id: `item-${id}` },
            children: [],
          },
        ],
      },
    });
    const first = nested(value.head.cid, value.head.text),
      second = nested(value.anchor.cid, value.anchor.text);
    expect(bindHistorySelection(value, { undo: [value.bookmark, first, second] })).toBeDefined();
    expect(
      bindHistorySelection(value, {
        undo: [value.bookmark, nested(value.head.cid, 'stale'), first, second],
      }),
    ).toBeUndefined();
    const child = first.json.children[0];
    if (!child) throw Error('Missing authored child snapshot');
    child.relation.parent_id = 'other-item';
    expect(bindHistorySelection(value, { undo: [value.bookmark, first, second] })).toBeUndefined();
  });
  it('rejects cyclic and duplicate paragraph identities inside container snapshots', () => {
    const value = pending();
    const paragraph = {
      id: value.head.cid,
      content: { type: 'paragraph', text: value.head.text },
      relation: { parent_id: 'item' },
      children: [],
    };
    const root: { id: string; content: { type: string }; children: unknown[] } = {
      id: 'item',
      content: { type: 'list_item' },
      children: [paragraph, { ...paragraph }],
    };
    expect(
      bindHistorySelection(value, {
        undo: [
          value.bookmark,
          { type: 'replace', id: 'item', json: root },
          ...entry(value).undo.slice(1),
        ],
      }),
    ).toBeUndefined();
    root.children = [root];
    expect(
      bindHistorySelection(value, {
        undo: [value.bookmark, { type: 'replace', id: 'item', json: root }],
      }),
    ).toBeUndefined();
  });
});
