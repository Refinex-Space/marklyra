import assert from 'node:assert/strict';
import test from 'node:test';
import { wrapPairingHistory } from './pairing-history.mjs';

const model = (text, id = 'n0') => ({
  id,
  content: { type: 'paragraph', text },
  children: [],
  relation: {},
});
const cursor = (start, end = start) => ({ type: 'cursor', id: 'n0', start, end });
function command(before, after, cursorBefore = cursor(0, 5), cursorAfter = cursor(1, 6)) {
  return {
    undo: [cursorBefore, { type: 'replace', id: before.id, json: before }],
    redo: [{ type: 'replace', id: after.id, json: after }, cursorAfter],
  };
}
function setup(change) {
  const previous = command(model('Alpha beta'), model('*Alpha* beta'));
  const last = command(model('*Alpha* beta'), model('*Alpha* beta'), cursor(1, 6), cursor(1, 6));
  Object.assign(previous, { source: null, date: null, incomplete: null });
  Object.assign(last, { source: 'n0#2' });
  const earlier = command(model('before'), model('Alpha beta'));
  const undo = {
    commandStack: [earlier],
    index: 0,
    setIndex(value) {
      this.index = value;
    },
  };
  const editor = { undo },
    owner = {};
  let result = true;
  const original = function (input, character) {
    assert.equal(this, owner);
    assert.equal(input, editor);
    assert.equal(character, '*');
    undo.commandStack.splice(undo.index + 1);
    undo.commandStack.push(previous, last);
    undo.index = undo.commandStack.length - 1;
    return result;
  };
  const run = () => wrapPairingHistory(original).call(owner, editor, '*');
  change?.({
    previous,
    last,
    earlier,
    undo,
    editor,
    setResult: (value) => {
      result = value;
    },
  });
  return { run, previous, last, earlier, undo };
}

test('only drops the equivalent trailing snapshot from this exact successful surround call', () => {
  const { run, previous, last, earlier, undo } = setup();
  const saved = JSON.stringify(previous);
  assert.equal(run(), true);
  assert.deepEqual(undo.commandStack, [earlier, previous]);
  assert.equal(undo.index, 1);
  assert.equal(JSON.stringify(previous), saved);
  assert.ok(!undo.commandStack.includes(last));
});

for (const [label, alter] of [
  [
    'pending previous snapshot',
    ({ previous }) => {
      previous.incomplete = true;
    },
  ],
  [
    'pending trailing snapshot',
    ({ last }) => {
      last.incomplete = true;
    },
  ],
  [
    'different non-empty source',
    ({ previous }) => {
      previous.source = 'n0#1';
    },
  ],
  [
    'unexpected trailing source',
    ({ last }) => {
      last.source = 'n0#1';
    },
  ],
  [
    'unproven cleared source',
    ({ previous }) => {
      delete previous.date;
    },
  ],
  [
    'non-empty model',
    ({ last }) => {
      last.redo[0].json.content.text = 'different';
    },
  ],
  [
    'different cursor',
    ({ last }) => {
      last.redo[1].end++;
    },
  ],
  [
    'unrelated node',
    ({ last }) => {
      last.redo[0].id = 'different';
    },
  ],
  [
    'no preceding real model change',
    ({ previous }) => {
      previous.undo[1].json = previous.redo[0].json;
    },
  ],
  [
    'broken model chain',
    ({ last }) => {
      last.undo[1].json.content.text = 'unrelated';
      last.redo[0].json.content.text = 'unrelated';
    },
  ],
  [
    'extra command semantics',
    ({ last }) => {
      last.tag = 'another-operation';
    },
  ],
  [
    'non-replace operation',
    ({ last }) => {
      last.undo[1].type = 'remove';
    },
  ],
  [
    'unsuccessful original',
    ({ setResult }) => {
      setResult(false);
    },
  ],
])
  test(`preserves history with ${label}`, () => {
    const { run, previous, last, earlier, undo } = setup(alter);
    run();
    assert.deepEqual(undo.commandStack, [earlier, previous, last]);
    assert.equal(undo.index, 2);
  });

test('preserves original redo truncation and untouched earlier command identities', () => {
  const obsoleteRedo = command(model('old'), model('redo'));
  const { run, previous, earlier, undo } = setup(({ undo }) => {
    undo.commandStack.push(obsoleteRedo);
  });
  run();
  assert.deepEqual(undo.commandStack, [earlier, previous]);
  assert.equal(undo.index, 1);
});

test('accepts equal known REPLACE sources without weakening the cleared-native-source gate', () => {
  const { run, previous, earlier, undo } = setup(({ previous }) => {
    previous.source = 'n0#2';
  });
  run();
  assert.deepEqual(undo.commandStack, [earlier, previous]);
});

for (const mutateIndex of [false, true])
  test(`restores history when setIndex throws (index mutated=${mutateIndex})`, () => {
    const { run, previous, last, earlier, undo } = setup(({ undo }) => {
      undo.setIndex = function (index) {
        if (mutateIndex) this.index = index;
        throw new Error('setIndex failed');
      };
    });
    assert.equal(run(), true);
    assert.deepEqual(undo.commandStack, [earlier, previous, last]);
    assert.equal(undo.index, 2);
  });

test('does not intercept original exceptions or invent history for unsupported editors', () => {
  const error = new Error('original failed');
  assert.throws(
    () =>
      wrapPairingHistory(() => {
        throw error;
      })({}),
    (actual) => actual === error,
  );
  const result = {};
  assert.equal(wrapPairingHistory(() => result)({}), result);
});
