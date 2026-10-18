import { describe, expect, it } from 'vitest';
import {
  captureFindSelectionCorrection,
  installFindSelectionReplacement,
} from '../src/runtime/find-replace-selection.js';

function fixture() {
  let value = 'A你好🙂B / A你好🙂B';
  const selections: unknown[] = [];
  const cm = {
    getValue: () => value,
    posFromIndex: (index: number) => index,
    doc: { setSelection: (from: unknown, to: unknown) => selections.push([from, to]) },
  };
  const first = { isCm: cm, start: 1, end: 5 },
    future = { isCm: cm, start: 10, end: 14 };
  const status = { hits: [first, future], curSelection: first };
  const panel = { searchStatus: status };
  return {
    panel,
    status,
    first,
    future,
    selections,
    write: (text: string) => {
      value = text;
    },
  };
}

describe('original CM future search hit correction', () => {
  it('corrects the native insert for a unique context match and restores the exact method', () => {
    let value = '前😀后';
    const inserted: string[] = [];
    const doc = {
      lineSeparator: () => '\n',
      replaceSelection(text: string) {
        inserted.push(text);
        value = value.slice(0, 1) + text + value.slice(3);
      },
    };
    const cm = {
      doc,
      getValue: () => value,
      getCursor: (which: string) => ({ index: which === 'anchor' ? 1 : 3 }),
      indexFromPos: (pos: { index: number }) => pos.index,
    };
    const hit = { isCm: cm, start: 1, end: 3 };
    const panel = {
      searchStatus: { useRegexp: true, regexp: /(?<=前)😀(?=后)/g, hits: [hit], curSelection: hit },
    };
    const original = doc.replaceSelection;
    const restore = installFindSelectionReplacement(panel, '$&!');
    expect(restore).toBeTypeOf('function');
    try {
      doc.replaceSelection('😀');
    } finally {
      restore?.();
    }
    expect(value).toBe('前😀!后');
    expect(inserted).toEqual(['😀!']);
    expect(doc.replaceSelection).toBe(original);
  });
  it('uses the actual expanded UTF-16 length and retains native hit identities', () => {
    const f = fixture();
    const correct = captureFindSelectionCorrection(f.panel);
    f.write('A你好🙂!B / A你好🙂B');
    f.future.start = 9;
    f.future.end = 13;
    f.status.hits.splice(0, 1);
    f.status.curSelection = f.future;
    correct?.();
    expect(f.future).toMatchObject({ start: 11, end: 15 });
    expect(f.status.hits[0]).toBe(f.future);
    expect(f.selections).toEqual([[11, 15]]);
  });

  it('leaves a correctly shifted literal replacement selection untouched', () => {
    const f = fixture();
    const correct = captureFindSelectionCorrection(f.panel);
    f.write('A你好🙂!B / A你好🙂B');
    f.future.start = 11;
    f.future.end = 15;
    f.status.curSelection = f.future;
    correct?.();
    expect(f.selections).toEqual([]);
  });

  it('refuses another document, unrelated changes and detached hit identities', () => {
    for (const change of ['state', 'outside', 'detached']) {
      const f = fixture();
      const correct = captureFindSelectionCorrection(f.panel);
      f.write(change === 'outside' ? 'A你好🙂B / changed' : 'A你好🙂!B / A你好🙂B');
      if (change === 'state') f.panel.searchStatus = { hits: [f.future], curSelection: f.future };
      if (change === 'detached') f.status.hits = [f.first];
      correct?.();
      expect(f.future).toMatchObject({ start: 10, end: 14 });
      expect(f.selections).toEqual([]);
    }
  });

  it('does not capture invalid ranges or a DOM search selection', () => {
    const f = fixture();
    f.first.end = f.first.start;
    expect(captureFindSelectionCorrection(f.panel)).toBeUndefined();
    expect(
      captureFindSelectionCorrection({ searchStatus: { hits: [], curSelection: {} } }),
    ).toBeUndefined();
  });
});
