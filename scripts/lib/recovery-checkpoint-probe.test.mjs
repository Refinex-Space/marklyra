import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  installRecoveryCheckpointProbe,
  instrumentRecoveryIndex,
  instrumentRecoveryModule,
} from './recovery-checkpoint-probe.mjs';

function fixture(store = new Map()) {
  const labels = new Map(),
    calls = [];
  const target = {
    document: {
      body: {
        append(label) {
          labels.set(label.id, label);
        },
      },
      getElementById(id) {
        return labels.get(id);
      },
      createElement() {
        return { style: {}, setAttribute() {} };
      },
    },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    __TAURI_INTERNALS__: {},
  };
  const receipt = { id: 'test-owned-record', version: 1 };
  Object.defineProperty(target.__TAURI_INTERNALS__, 'invoke', {
    value: (...args) => {
      calls.push(args);
      return Promise.resolve(receipt);
    },
  });
  return {
    target,
    calls,
    store,
    receipt,
    label: () => labels.get('checkpoint-probe')?.textContent,
  };
}
const checkpoint = { checkpoint: { text: '中文😀\r\n', savedText: '' } };
const settled = async (value) => Promise.race([value.then(() => true), Promise.resolve(false)]);

for (const phase of ['before-dispatch', 'after-commit']) {
  test(`${phase}: one owned dirty checkpoint is withheld; restart forwards exactly`, async () => {
    const first = fixture();
    installRecoveryCheckpointProbe(first.target, phase);
    const pending = first.target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(
      checkpoint.checkpoint,
      () => first.target.__TAURI_INTERNALS__.invoke('checkpoint_recovery', checkpoint),
    );
    await Promise.resolve();
    assert.equal(await settled(pending), false);
    assert.equal(first.calls.length, phase === 'before-dispatch' ? 0 : 1);
    assert.match(first.label(), /held/u);
    assert.doesNotMatch(first.label(), /中文|test-owned-record/u);
    const restarted = fixture(first.store);
    installRecoveryCheckpointProbe(restarted.target, phase);
    assert.equal(
      await restarted.target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(
        checkpoint.checkpoint,
        () => restarted.target.__TAURI_INTERNALS__.invoke('checkpoint_recovery', checkpoint),
      ),
      restarted.receipt,
    );
    assert.deepEqual(restarted.calls, [['checkpoint_recovery', checkpoint]]);
  });
}
test('unrelated IPC, clean checkpoints and arguments pass through without mutation', async () => {
  const f = fixture();
  installRecoveryCheckpointProbe(f.target, 'before-dispatch');
  const call = f.target.__TAURI_INTERNALS__.invoke;
  const clean = { checkpoint: { text: 'same', savedText: 'same' } };
  await call('save_document', { id: 'owned' }, { headers: 'opaque-test' });
  await f.target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(clean.checkpoint, () =>
    call('checkpoint_recovery', clean),
  );
  assert.deepEqual(f.calls, [
    ['save_document', { id: 'owned' }, { headers: 'opaque-test' }],
    ['checkpoint_recovery', clean],
  ]);
  assert.equal(f.store.size, 0);
});
test('native rejection is preserved and never marked as committed', async () => {
  const f = fixture(),
    error = Error('native fixture failure');
  installRecoveryCheckpointProbe(f.target, 'after-commit');
  await assert.rejects(
    f.target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(checkpoint.checkpoint, () =>
      Promise.reject(error),
    ),
    (value) => value === error,
  );
  assert.equal(f.store.size, 0);
});
for (const phase of ['before-dispatch', 'after-commit'])
  for (const failingWrite of [1, 2])
    test(`${phase}: storage failure at write${failingWrite} never withholds native protection/receipt`, async () => {
      const f = fixture();
      let count = 0;
      f.target.localStorage.setItem = (key, value) => {
        if (++count === failingWrite) throw Error('test quota');
        f.store.set(key, value);
      };
      installRecoveryCheckpointProbe(f.target, phase);
      assert.equal(
        await f.target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(checkpoint.checkpoint, () =>
          f.target.__TAURI_INTERNALS__.invoke('checkpoint_recovery', checkpoint),
        ),
        f.receipt,
      );
      assert.equal(f.calls.length, 1);
      assert.match(f.label(), /passthrough/u);
    });
test('generated bootstrap runs independently and duplicate/invalid instrumentation is refused', async () => {
  const f = fixture();
  const { html, script } = instrumentRecoveryIndex(
    '<html><head></head><body></body></html>',
    'before-dispatch',
  );
  assert.equal((html.match(/checkpoint-probe.js/gu) ?? []).length, 1);
  vm.runInNewContext(script, { window: f.target });
  assert.equal(
    await settled(
      f.target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(checkpoint.checkpoint, () =>
        f.target.__TAURI_INTERNALS__.invoke('checkpoint_recovery', checkpoint),
      ),
    ),
    false,
  );
  assert.throws(() => instrumentRecoveryIndex(html, 'before-dispatch'));
  assert.throws(() => instrumentRecoveryIndex('<head><head>', 'before-dispatch'));
  assert.throws(() => instrumentRecoveryIndex('<head>', 'wrong'));
  assert.throws(() => installRecoveryCheckpointProbe({}, 'before-dispatch'));
});

test('CLI copies a new frontend only; preserves input and rejects existing/nested destinations', async () => {
  const { mkdtemp, mkdir, readFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), 'marklyra-owned-probe-'));
  const original =
    '<html><head><script type="module" src="/main.js"></script></head><body>Own frontend</body></html>';
  const cli = new URL('../instrument-recovery-checkpoint.mjs', import.meta.url).pathname;
  try {
    const input = join(root, 'source'),
      output = join(root, 'diagnostic');
    await mkdir(input);
    await writeFile(join(input, 'index.html'), original);
    await writeFile(join(input, 'asset.txt'), 'own asset');
    await writeFile(
      join(input, 'main.js'),
      'const recovery={checkpoint:x=>invoke("checkpoint_recovery",{checkpoint:x})};',
    );
    await run(process.execPath, [cli, input, output, 'before-dispatch']);
    assert.equal(await readFile(join(input, 'index.html'), 'utf8'), original);
    assert.equal(await readFile(join(output, 'asset.txt'), 'utf8'), 'own asset');
    const generated = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(generated, /checkpoint-probe.js/u);
    await assert.rejects(run(process.execPath, [cli, input, output, 'before-dispatch']));
    assert.equal(await readFile(join(output, 'index.html'), 'utf8'), generated);
    await assert.rejects(
      run(process.execPath, [cli, input, join(input, 'nested'), 'before-dispatch']),
    );
    await assert.rejects(run(process.execPath, [cli, input, join(root, 'bad-phase'), 'invalid']));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('AST wraps the sole checkpoint dispatch without modifying protected native invoke', async () => {
  const f = fixture();
  installRecoveryCheckpointProbe(f.target, 'before-dispatch');
  const before = f.target.__TAURI_INTERNALS__.invoke;
  const native = (...args) => before(...args);
  const code =
    'const a={text:"Own",savedText:""}; window.result=native("checkpoint_recovery",{checkpoint:a});';
  const patched = instrumentRecoveryModule(code);
  vm.runInNewContext(patched, { window: f.target, native });
  assert.equal(await settled(f.target.result), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.target.__TAURI_INTERNALS__.invoke, before);
  assert.equal(
    Object.getOwnPropertyDescriptor(f.target.__TAURI_INTERNALS__, 'invoke').writable,
    false,
  );
  assert.throws(() => instrumentRecoveryModule(patched));
  assert.throws(() => instrumentRecoveryModule('native("other",{});'));
  assert.throws(() =>
    instrumentRecoveryModule(
      'native("checkpoint_recovery",{checkpoint:a});native("checkpoint_recovery",{checkpoint:a});',
    ),
  );
  assert.throws(() =>
    instrumentRecoveryModule('native("checkpoint_recovery",{checkpoint:read()});'),
  );
  assert.throws(() =>
    instrumentRecoveryModule('native("checkpoint_recovery",{checkpoint:a,other:b});'),
  );
});
