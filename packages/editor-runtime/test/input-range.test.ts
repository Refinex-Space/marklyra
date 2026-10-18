import { SourceMirror } from '@marklyra/editor-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  capturePlainInput,
  lastProvenRedoCursor,
  type PlainInputCandidate,
  type PlainTextEvidence,
  plainTextPatch,
  plainUndoSelection,
} from '../src/runtime/input-range.js';

function evidence(model = 'same\nsame\nsame'): PlainTextEvidence {
  const mark = model.replace(/\n/g, '\r\n');
  return {
    canonical: mark,
    block: { id: 'p', from: 0, to: mark.length, text: mark },
    model,
    raw: model,
    rawWithoutControls: model,
    mark,
    ahead: 0,
    ending: '\r\n',
    startPrefix: '',
    endPrefix: 'same\n',
    insert: '',
  };
}
describe('proven plain paragraph text ranges', () => {
  it.each([
    [0, 5, 0, 6],
    [5, 10, 6, 12],
    [9, 14, 10, 16],
  ])('maps repeated soft-line range %i..%i by actual prefixes', (start, end, from, to) => {
    const base = evidence();
    expect(
      plainTextPatch({
        ...base,
        startPrefix: base.model.slice(0, start),
        endPrefix: base.model.slice(0, end),
      }),
    ).toEqual({ from, to, insert: '' });
  });
  it('accounts for independently verified ahead, tail and following block separators', () => {
    const model = '中😀\n中😀',
      mark = `\r\n${model.replace(/\n/g, '\r\n')}\r\n`;
    const canonical = `before\r\n${mark}\r\nnext`;
    expect(
      plainTextPatch({
        ...evidence(model),
        canonical,
        mark,
        ahead: 1,
        block: { id: 'p', from: 8, to: 8 + mark.length + 2, text: `${mark}\r\n` },
        startPrefix: '中😀\n',
        endPrefix: model,
      }),
    ).toEqual({ from: 15, to: 18, insert: '' });
  });
  it('rejects model/DOM/serializer mismatches and invalid surrogate boundaries', () => {
    const base = evidence('😀\n😀');
    for (const override of [
      { raw: 'different' },
      { rawWithoutControls: 'different' },
      { mark: `**${base.mark}**` },
      { ahead: 1 },
      { startPrefix: '\ud83d', endPrefix: '😀' },
      { block: { ...base.block, text: 'stale' } },
      { endPrefix: 'not a prefix' },
    ])
      expect(plainTextPatch({ ...base, ...override })).toBeUndefined();
  });
  it('preserves the chosen surviving raw lines through actual canonical hints', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('\n', '\r\n'), { minLength: 3, maxLength: 3 }),
        fc.integer({ min: 0, max: 2 }),
        fc.constantFrom('same', '中文😀'),
        (endings, index, word) => {
          const raw = word + (endings[0] ?? '\n') + word + (endings[1] ?? '\n') + word;
          const base = evidence([word, word, word].join('\n'));
          const start = index === 2 ? 2 * word.length + 1 : index * (word.length + 1),
            end = index === 2 ? base.model.length : start + word.length + 1;
          const patch = plainTextPatch({
            ...base,
            startPrefix: base.model.slice(0, start),
            endPrefix: base.model.slice(0, end),
          });
          expect(patch).toBeDefined();
          if (!patch) throw Error('proof');
          const mirror = new SourceMirror(raw, base.canonical),
            initial = mirror.stateId;
          const next = base.canonical.slice(0, patch.from) + base.canonical.slice(patch.to);
          const expected =
            index === 0 ? word + (endings[1] ?? '\n') + word : word + (endings[0] ?? '\n') + word;
          expect(
            mirror.update(next, {
              kind: 'edit',
              baseStateId: initial,
              baseCanonical: base.canonical,
              patches: [patch],
            }).source,
          ).toBe(expected);
          expect(
            mirror.update(base.canonical, {
              kind: 'history',
              baseStateId: mirror.stateId,
              targetStateId: initial,
            }).source,
          ).toBe(raw);
        },
      ),
      { numRuns: 100 },
    );
  });
});

it('never overwrites initial reverse Undo metadata with a later coalesced before-selection', () => {
  const model = 'same\nsame\nsame';
  const undo = [
    { type: 'cursor', id: 'p', start: 5, end: 10 },
    { type: 'replace', id: 'p', json: { id: 'p', content: { text: model } } },
  ];
  const entry = { undo, redo: [] };
  const candidate: PlainInputCandidate = {
    base: model,
    next: 'same\nsame',
    patches: [{ from: 5, to: 10, insert: '' }],
    cid: 'p',
    inputType: 'deleteContentBackward',
    backward: true,
    priorEntry: undefined,
    priorRedo: undefined,
    priorSelection: { cid: 'p', anchor: 10, head: 5 },
    model,
  };
  expect(plainUndoSelection(candidate, entry)).toEqual({ cid: 'p', anchor: 10, head: 5 });
  expect(plainUndoSelection({ ...candidate, priorEntry: entry }, entry)).toBeUndefined();
  expect(plainUndoSelection({ ...candidate, model: 'different' }, entry)).toBeUndefined();
  expect(
    plainUndoSelection({ ...candidate, priorSelection: { cid: 'p', anchor: 5, head: 10 } }, entry),
  ).toBeUndefined();
  expect(
    plainUndoSelection(candidate, {
      undo: [{ type: 'cursor', id: 'other', start: 5, end: 10 }, undo[1]],
      redo: [],
    }),
  ).toBeUndefined();
});

it('declines IME, untrusted events and modified key deletion before reading a model', () => {
  const document = {};
  const editor = {
    writingArea: { ownerDocument: document, contains: () => true },
    isIME: true,
    sourceView: { inSourceMode: false },
    getNode: () => {
      throw Error('must not inspect model');
    },
  };
  const context = { editor, canonical: '', blocks: [], ending: '\n' } as unknown as Parameters<
    typeof capturePlainInput
  >[0];
  const event = {
    type: 'keydown',
    target: { ownerDocument: document },
    isTrusted: true,
    isComposing: false,
    key: 'Backspace',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as unknown as KeyboardEvent;
  expect(capturePlainInput(context, event)).toBeUndefined();
  editor.isIME = false;
  for (const override of [
    { isComposing: true },
    { isTrusted: false },
    { metaKey: true },
    { ctrlKey: true },
    { altKey: true },
    { shiftKey: true },
    { key: 'ArrowLeft' },
  ])
    expect(capturePlainInput(context, { ...event, ...override })).toBeUndefined();
});

it('proves repeated inline source prefixes without searching visible words', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        '**same**',
        '*same*',
        '[same](https://example.test/x)',
        '`same`',
        '**中👩‍💻 *文* **',
      ),
      fc.integer({ min: 0, max: 2 }),
      (word, index) => {
        const model = [word, word, word].join('\n'),
          base = evidence(model);
        const start = index === 2 ? 2 * word.length + 1 : index * (word.length + 1),
          end = index === 2 ? model.length : start + word.length + 1;
        const patch = plainTextPatch({
          ...base,
          startPrefix: model.slice(0, start),
          endPrefix: model.slice(0, end),
        });
        expect(patch).toBeDefined();
        if (!patch) throw Error('Missing verified range');
        const raw = `${word}\r\n${word}\n${word}`,
          mirror = new SourceMirror(raw, base.canonical);
        const next = base.canonical.slice(0, patch.from) + base.canonical.slice(patch.to);
        expect(
          mirror.update(next, {
            kind: 'edit',
            baseStateId: mirror.stateId,
            baseCanonical: base.canonical,
            patches: [patch],
          }).source,
        ).toBe(word + (index === 0 ? '\n' : '\r\n') + word);
        expect(
          plainTextPatch({
            ...base,
            startPrefix: model.slice(0, start),
            endPrefix: model.slice(0, end),
            rawWithoutControls: `${model}\u200b`,
          }),
        ).toBeUndefined();
      },
    ),
    { numRuns: 100 },
  );
});

it('retains proven inline endpoint affinity only for the matching new history group', () => {
  const model = '**same**',
    point = { path: [0, 1, 0, 0], offset: 0, nodeType: 3, role: 'STRONG' };
  const entry = {
    undo: [
      { type: 'cursor', id: 'p', start: 2, end: 2 },
      { type: 'replace', id: 'p', json: { id: 'p', content: { text: model } } },
    ],
  };
  const candidate: PlainInputCandidate = {
    base: model,
    next: '**Xsame**',
    patches: [{ from: 2, to: 2, insert: 'X' }],
    cid: 'p',
    inputType: 'insertText',
    backward: false,
    priorEntry: undefined,
    priorRedo: undefined,
    priorSelection: { cid: 'p', anchor: 2, head: 2, anchorPoint: point, headPoint: point },
    model,
  };
  expect(plainUndoSelection(candidate, entry)).toEqual(candidate.priorSelection);
  expect(plainUndoSelection({ ...candidate, priorEntry: entry }, entry)).toBeUndefined();
  expect(
    plainUndoSelection(
      {
        ...candidate,
        priorSelection: { cid: 'p', anchor: 3, head: 3, anchorPoint: point, headPoint: point },
      },
      entry,
    ),
  ).toBeUndefined();
});

it('selects only the final cursor of a proven same-cid replace/cursor chain', () => {
  const replace = (text: string, id = 'p') => ({
    type: 'replace',
    id,
    json: { id, content: { text } },
  });
  const cursor = (id = 'p') => ({ type: 'cursor', id, start: 0, end: 0 });
  const first = cursor(),
    last = cursor(),
    chain = [replace('intermediate'), first, replace('actual'), last];
  expect(lastProvenRedoCursor(chain, 'p', 'actual')).toBe(last);
  const selected = lastProvenRedoCursor(chain, 'p', 'actual');
  if (!selected) throw Error('Missing final cursor');
  selected.start = 6;
  selected.end = 6;
  expect(first).toEqual({ type: 'cursor', id: 'p', start: 0, end: 0 });
  expect(last).toEqual({ type: 'cursor', id: 'p', start: 6, end: 6 });
  for (const invalid of [
    [replace('intermediate', 'other'), first, replace('actual'), last],
    [replace('intermediate'), cursor('other'), replace('actual'), last],
    [replace('intermediate'), first, { type: 'unknown' }, last],
    [replace('intermediate'), replace('actual'), last],
    [replace('intermediate'), first, replace('stale'), last],
    [replace('actual'), Object.freeze(cursor())],
    [null, last],
  ])
    expect(lastProvenRedoCursor(invalid, 'p', 'actual')).toBeUndefined();
});
